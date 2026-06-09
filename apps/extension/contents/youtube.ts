/**
 * contents/youtube.ts — Plasmo content script, injected on https://www.youtube.com/*
 *
 * Responsibilities:
 *  1. Inject a Netflix-style caption overlay into the YouTube player
 *  2. Display final transcripts received from the service worker
 *  3. Pause/resume the capture pipeline when the video is paused/played
 *  4. Stop captions and clean up when the user navigates to a new video
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*"],
  run_at: "document_idle",
}

// ─── State ─────────────────────────────────────────────────────────────────────

let overlayEl: HTMLElement | null = null
let captionEl: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let captionsActive = false
let currentVideoId: string | null = null
let videoListenersAttached = false

// ─── Overlay ───────────────────────────────────────────────────────────────────

const CAPTION_STYLES = `
  #captio-overlay {
    position: absolute;
    bottom: 12%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    pointer-events: none;
    text-align: center;
    width: 80%;
    max-width: 80%;
  }

  #captio-caption {
    display: inline-block;
    background: rgba(8, 8, 8, 0.85);
    color: #ffffff;
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.01em;
    padding: 8px 20px;
    border-radius: 4px;
    max-width: 100%;
    opacity: 0;
    transition: opacity 0.15s ease;
    white-space: normal;
    word-break: break-word;
  }

  #captio-caption.captio-visible {
    opacity: 1;
  }
`

function injectOverlay(player: HTMLElement) {
  if (overlayEl) return

  // Styles
  const styleEl = document.createElement("style")
  styleEl.id = "captio-styles"
  styleEl.textContent = CAPTION_STYLES
  document.head.appendChild(styleEl)

  // Overlay container
  overlayEl = document.createElement("div")
  overlayEl.id = "captio-overlay"

  // Caption pill
  captionEl = document.createElement("div")
  captionEl.id = "captio-caption"

  overlayEl.appendChild(captionEl)
  player.appendChild(overlayEl)
}

function removeOverlay() {
  overlayEl?.remove()
  document.getElementById("captio-styles")?.remove()
  overlayEl = null
  captionEl = null
}

// ─── Caption display ───────────────────────────────────────────────────────────

function showCaption(text: string) {
  if (!captionEl) return

  if (hideTimer) clearTimeout(hideTimer)

  captionEl.textContent = text
  captionEl.classList.add("captio-visible")

  // Auto-hide 4s after last caption — gives the sentence time to be read
  hideTimer = setTimeout(() => {
    captionEl?.classList.remove("captio-visible")
  }, 4000)
}

function hideCaption() {
  if (hideTimer) clearTimeout(hideTimer)
  captionEl?.classList.remove("captio-visible")
}

// ─── Player discovery ──────────────────────────────────────────────────────────

function getPlayer(): HTMLElement | null {
  // YouTube uses #movie_player as the main player container
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

// ─── Video element events (pause / play → pause / resume captions) ─────────────

function attachVideoListeners() {
  if (videoListenersAttached) return
  const video = document.querySelector<HTMLVideoElement>("video.video-stream, video")
  if (!video) return

  video.addEventListener("pause", () => {
    if (captionsActive) chrome.runtime.sendMessage({ type: "PAUSE_CAPTURE" })
  })

  video.addEventListener("play", () => {
    if (captionsActive) chrome.runtime.sendMessage({ type: "RESUME_CAPTURE" })
  })

  videoListenersAttached = true
}

// ─── YouTube SPA navigation ────────────────────────────────────────────────────
// YouTube never fully reloads the page between videos. We detect navigation via
// the `yt-navigate-finish` event that YouTube dispatches on every page transition,
// then check if the video ID has changed.

function onVideoChange() {
  const newVideoId = new URLSearchParams(location.search).get("v")

  // Same video (e.g. returning from fullscreen) — do nothing
  if (newVideoId === currentVideoId) return
  currentVideoId = newVideoId

  if (captionsActive) {
    // User navigated to a new video — stop captions.
    // They need to re-enable manually (by design — avoids surprising auto-start).
    captionsActive = false
    hideCaption()
    chrome.runtime.sendMessage({ type: "STOP_CAPTIONS" })
  }

  // Re-attach video listeners for the new player instance
  videoListenersAttached = false
  setTimeout(attachVideoListeners, 1000)
}

document.addEventListener("yt-navigate-finish", onVideoChange)

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TRANSCRIPT") {
    showCaption(msg.text)
  }

  if (msg.type === "CAPTIONS_STARTED") {
    captionsActive = true
  }

  if (msg.type === "CAPTIONS_STOPPED") {
    captionsActive = false
    hideCaption()
  }

  if (msg.type === "CAPTION_ERROR") {
    // Show a brief error state in the overlay
    if (captionEl) {
      captionEl.textContent = "Connection error — try restarting captions"
      captionEl.classList.add("captio-visible")
      setTimeout(() => captionEl?.classList.remove("captio-visible"), 4000)
    }
    captionsActive = false
  }
})

// ─── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  currentVideoId = new URLSearchParams(location.search).get("v")
  const player = await waitForPlayer()
  injectOverlay(player)
  attachVideoListeners()
}

init()
