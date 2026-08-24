/**
 * contents/youtube.ts — Plasmo content script, injected on https://www.youtube.com/*
 *
 * Caption display (2-row, fill-first layout):
 *   Bottom row (live, bright) — text accumulates left→right. Multiple short
 *     sentences/translations pile onto the same line until it's near full,
 *     then the line rolls up to the top row.
 *   Top row (committed, dim) — holds the previous full line.
 *
 * English mode accumulation:
 *   Each is_final phrase is independent → `appendToLive` accumulates and
 *   rolls up when the line fills.
 *   Interim results are cumulative within an utterance (each one is the full
 *   phrase so far) → shown as `liveAccum + " " + interimText` without
 *   touching liveAccum.
 *
 * Translation mode accumulation:
 *   Debounced interim translations are also cumulative (each is the full
 *   translation so far) → `setPartialTranslation` REPLACES the current
 *   utterance's slot in the live row without touching liveAccum.
 *   is_final translations → `commitTranslation` appends to liveAccum and
 *   triggers roll-up when the line fills.
 *   Both use `currentPartial` to track the current utterance's slot.
 */

import type { PlasmoCSConfig } from "plasmo"
import { getVideoId, isNewVideo } from "../lib/youtube-nav"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*"],
  run_at: "document_idle",
}

// ─── State ─────────────────────────────────────────────────────────────────────

let overlayEl: HTMLElement | null = null
let captionEl: HTMLElement | null = null
let committedEl: HTMLElement | null = null
let liveEl: HTMLElement | null = null
let clearTimer: ReturnType<typeof setTimeout> | null = null
let captionsActive = false
let currentVideoId: string | null = null
let videoListenersAttached = false

// Accumulated text from COMPLETED utterances/translations on the current
// display line. Rolls up to committedEl when a new addition would wrap.
let liveAccum = ""

// Current utterance's latest partial translation (REPLACE semantics — each
// debounced translation replaces this, it is never appended).
let currentPartial = ""

// Set to true when commitTranslation fires so stale debounce partials that
// arrive after the final translation are silently dropped. Reset on
// UtteranceEnd (clearRows) and hideBox so the next utterance works normally.
let utteranceFinalized = false

// ─── Overlay ───────────────────────────────────────────────────────────────────

const CAPTION_STYLES = `
  #captio-overlay {
    position: absolute;
    bottom: 8%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    pointer-events: none;
    width: 82%;
    max-width: 900px;
  }

  #captio-caption {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.75);
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: clamp(16px, 2vw, 22px);
    font-weight: normal;
    line-height: 1.6;
    letter-spacing: 0.01em;
    border-radius: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  #captio-caption.captio-active {
    opacity: 1;
  }

  #captio-committed {
    display: block;
    padding: 0.25em 0.7em 0.1em;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 1.6em;
    text-align: left;
    pointer-events: auto;
  }

  #captio-committed .captio-word {
    cursor: pointer;
    border-radius: 3px;
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  #captio-committed .captio-word:hover {
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.12);
  }

  #captio-committed .captio-word.captio-saved {
    color: #5B6EF5;
  }

  #captio-live {
    display: block;
    padding: 0.1em 0.7em 0.25em;
    color: #ffffff;
    overflow-wrap: break-word;
    min-height: 1.6em;
    text-align: left;
  }
`

function injectOverlay(player: HTMLElement) {
  if (overlayEl) return

  const styleEl = document.createElement("style")
  styleEl.id = "captio-styles"
  styleEl.textContent = CAPTION_STYLES
  document.head.appendChild(styleEl)

  overlayEl = document.createElement("div")
  overlayEl.id = "captio-overlay"

  captionEl = document.createElement("div")
  captionEl.id = "captio-caption"

  committedEl = document.createElement("div")
  committedEl.id = "captio-committed"

  liveEl = document.createElement("div")
  liveEl.id = "captio-live"

  captionEl.appendChild(committedEl)
  captionEl.appendChild(liveEl)
  overlayEl.appendChild(captionEl)
  player.appendChild(overlayEl)
}

function removeOverlay() {
  overlayEl?.remove()
  document.getElementById("captio-styles")?.remove()
  overlayEl = null
  captionEl = null
  committedEl = null
  liveEl = null
}

// ─── Vocabulary saving (click a word in the committed row) ─────────────────────
// The committed row (dim, top line) holds the previous fully-settled line —
// stable enough to click, unlike the live row which is still being written to.
// Clicking a word saves it (with the full line as context) to the
// `vocabulary` table via background.ts's SAVE_VOCAB handler.

function saveVocabWord(word: string, context: string, target: HTMLElement) {
  const cleaned = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
  if (!cleaned) return

  trySend({
    type: "SAVE_VOCAB",
    word: cleaned,
    context,
    videoId: currentVideoId,
    videoTitle: document.title.replace(/ - YouTube$/, ""),
  })

  target.classList.add("captio-saved")
  setTimeout(() => target.classList.remove("captio-saved"), 800)
}

/** Render `text` into `committedEl` as per-word spans so each word is clickable. */
function setCommitted(text: string) {
  if (!committedEl) return
  committedEl.replaceChildren()
  const words = text.split(/(\s+)/)
  for (const chunk of words) {
    if (/^\s+$/.test(chunk) || chunk === "") {
      committedEl.appendChild(document.createTextNode(chunk))
      continue
    }
    const span = document.createElement("span")
    span.className = "captio-word"
    span.textContent = chunk
    span.addEventListener("click", () => saveVocabWord(chunk, text, span))
    committedEl.appendChild(span)
  }
}

// ─── Caption display ───────────────────────────────────────────────────────────

// Returns the expected single-line clientHeight for liveEl (line-height + padding).
// Used to detect when text has wrapped past one line.
function singleLineHeight(): number {
  if (!liveEl) return 40
  const cs = getComputedStyle(liveEl)
  return parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
}

function rollUpIfWrapped() {
  if (!committedEl || !liveEl) return
  if (liveEl.clientHeight > singleLineHeight() * 1.3) {
    setCommitted(liveAccum)
    liveAccum = currentPartial
    liveEl.textContent = currentPartial
  }
}

/**
 * English mode: append a finalized phrase to the live line.
 * Accumulates across multiple is_final phrases; rolls up when the line fills.
 */
function appendToLive(text: string) {
  if (!committedEl || !liveEl) return
  const candidate = liveAccum ? `${liveAccum} ${text}` : text
  liveEl.textContent = candidate
  if (liveEl.clientHeight > singleLineHeight() * 1.3) {
    setCommitted(liveAccum)
    liveAccum = text
    liveEl.textContent = text
  } else {
    liveAccum = candidate
  }
}

/**
 * Translation mode (debounced interim): replace the current utterance's slot.
 * Does NOT append to liveAccum — each debounce sends the full sentence so far,
 * so appending would duplicate text.
 * Ignored if a final translation for this utterance already committed.
 */
function setPartialTranslation(text: string) {
  if (!committedEl || !liveEl) return
  if (utteranceFinalized) return  // stale debounce arrived after is_final — drop it
  currentPartial = text
  liveEl.textContent = liveAccum ? `${liveAccum} ${text}` : text
  rollUpIfWrapped()
}

/**
 * Translation mode (is_final): commit the final translation to liveAccum.
 * Clears currentPartial, marks utterance finalized so late-arriving debounce
 * partials are ignored, then accumulates and rolls up when the line fills.
 */
function commitTranslation(text: string) {
  if (!committedEl || !liveEl) return
  currentPartial = ""
  utteranceFinalized = true
  const candidate = liveAccum ? `${liveAccum} ${text}` : text
  liveEl.textContent = candidate
  if (liveEl.clientHeight > singleLineHeight() * 1.3) {
    setCommitted(liveAccum)
    liveAccum = text
    liveEl.textContent = text
  } else {
    liveAccum = candidate
  }
}

function showCaption(text: string, isFinal: boolean) {
  if (!committedEl || !liveEl) return
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null }

  if (isFinal) {
    appendToLive(text)
  } else {
    // Interim (English): overlay current words on the accumulator without
    // changing liveAccum. Each interim is the full utterance so far.
    liveEl.textContent = liveAccum ? `${liveAccum} ${text}` : text
  }
}

function clearRows(delayMs = 0) {
  if (clearTimer) clearTimeout(clearTimer)
  // Reset utteranceFinalized immediately (not after the delay) so that
  // a new utterance starting during the fade-out window isn't silently dropped.
  utteranceFinalized = false
  clearTimer = setTimeout(() => {
    clearTimer = null
    liveAccum = ""
    currentPartial = ""
    if (committedEl) committedEl.textContent = ""
    if (liveEl) liveEl.textContent = ""
  }, delayMs)
}

function showBox() {
  captionEl?.classList.add("captio-active")
}

function hideBox() {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null }
  liveAccum = ""
  currentPartial = ""
  utteranceFinalized = false
  if (committedEl) committedEl.textContent = ""
  if (liveEl) liveEl.textContent = ""
  captionEl?.classList.remove("captio-active")
}

// ─── Player discovery ──────────────────────────────────────────────────────────

function getPlayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#movie_player")
}

function waitForPlayer(): Promise<HTMLElement> {
  return new Promise((resolve) => {
    const existing = getPlayer()
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const player = getPlayer()
      if (player) {
        observer.disconnect()
        resolve(player)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function trySend(msg: object) {
  try {
    chrome.runtime.sendMessage(msg)
  } catch {
    // Extension context invalidated on hot-reload — ignore
  }
}

// ─── Video element events ──────────────────────────────────────────────────────

function attachVideoListeners() {
  if (videoListenersAttached) return
  const video = document.querySelector<HTMLVideoElement>("video.video-stream, video")
  if (!video) return

  video.addEventListener("pause", () => {
    if (captionsActive) trySend({ type: "PAUSE_CAPTURE" })
  })

  video.addEventListener("play", () => {
    if (captionsActive) trySend({ type: "RESUME_CAPTURE" })
  })

  videoListenersAttached = true
}

// ─── YouTube SPA navigation ────────────────────────────────────────────────────

function onVideoChange() {
  const newVideoId = getVideoId(location.search)
  if (!isNewVideo(currentVideoId, newVideoId)) return
  currentVideoId = newVideoId

  if (captionsActive) {
    captionsActive = false
    hideBox()
    trySend({ type: "STOP_CAPTIONS" })
  }

  videoListenersAttached = false
  setTimeout(attachVideoListeners, 1000)
}

document.addEventListener("yt-navigate-finish", onVideoChange)

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TRANSCRIPT") {
    showCaption(msg.text, !!msg.isFinal)
  }

  if (msg.type === "TRANSLATION") {
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null }
    if (msg.isFinal) {
      // is_final: commit this translation, accumulate, roll up if line is full.
      commitTranslation(msg.text)
      // Safety-net clear: if this translation arrived after UtteranceEnd (cancelling
      // that clear timer), schedule a new one so the caption doesn't linger forever.
      clearRows(1500)
    } else {
      // Debounced interim: same utterance with more words — replace, don't append.
      setPartialTranslation(msg.text)
    }
  }

  if (msg.type === "UTTERANCE_END") {
    clearRows(1500)
  }

  if (msg.type === "CAPTIONS_STARTED") {
    captionsActive = true
    showBox()
  }

  if (msg.type === "CAPTIONS_STOPPED") {
    captionsActive = false
    hideBox()
  }

  if (msg.type === "CAPTION_ERROR") {
    if (liveEl) liveEl.textContent = "Connection error — try restarting captions"
    if (committedEl) committedEl.textContent = ""
    setTimeout(() => { if (liveEl) liveEl.textContent = "" }, 4000)
    captionsActive = false
  }
})

// ─── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  currentVideoId = getVideoId(location.search)
  const player = await waitForPlayer()
  injectOverlay(player)
  attachVideoListeners()
}

init()
