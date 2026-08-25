/**
 * background.ts — Plasmo service worker (Manifest V3)
 *
 * Responsibilities:
 *  1. Respond to the popup toggle → get a tabCapture stream ID (only works here)
 *  2. Create / close the offscreen document that does actual audio capture
 *  3. Route messages between all three contexts:
 *       popup ↔ background ↔ offscreen doc
 *                          ↔ content script (via chrome.tabs.sendMessage)
 *
 * Message types:
 *   popup    → bg:        TOGGLE_CAPTIONS { tabId }, GET_STATE
 *   bg       → offscreen: START_CAPTURE { streamId, tabId, spokenLanguage, captionLanguage }, STOP_CAPTURE, PAUSE_CAPTURE, RESUME_CAPTURE
 *   offscreen → bg:       TRANSCRIPT { text, tabId, isFinal }, TRANSLATION { text, tabId }, UTTERANCE_END { tabId }, CAPTURE_ERROR { message }, OFFSCREEN_READY
 *   bg       → tab:       CAPTIONS_STARTED, CAPTIONS_STOPPED, TRANSCRIPT { text, isFinal }, TRANSLATION { text }, UTTERANCE_END, CAPTION_ERROR
 *   tab      → bg:        STOP_CAPTIONS, PAUSE_CAPTURE, RESUME_CAPTURE
 *
 * MV3 service worker reliability:
 *   Service workers can be killed at any time. capturedTabId is persisted to
 *   chrome.storage.local so it survives restarts. TRANSCRIPT messages include tabId
 *   from the offscreen doc as an extra safety net.
 *
 * Offscreen documents cannot access chrome.storage (only chrome.runtime) —
 * only the background service worker can. So the "Spoken language" / "Caption
 * language" picker choices (persisted to chrome.storage.local by popup.tsx)
 * are read here and forwarded to the offscreen doc as part of START_CAPTURE.
 */

import {
  DEFAULT_CAPTION_LANGUAGE,
  DEFAULT_SPOKEN_LANGUAGE,
  STORAGE_KEYS,
} from "./lib/languages"
import { getVideoId, isYouTubeWatchUrl } from "./lib/youtube-nav"
import { resolveTabId as resolveTabIdImpl } from "./lib/tab-resolver"
import { getSession, openSignInPage, setSessionFromRelay, signOut } from "./lib/auth"
import { supabase } from "./lib/supabase"

// ─── State ────────────────────────────────────────────────────────────────────

let isCapturing = false
let capturedTabId: number | null = null
let offscreenReady = false

// Guards TOGGLE_CAPTIONS against a fast double-click: the popup's toggle has
// no in-flight/disabled state (see popup.tsx's handleToggle), and
// startCapture() doesn't set isCapturing = true until after several real
// awaits (chrome.tabCapture.getMediaStreamId, chrome.storage.local.get,
// getSession()) — so a second TOGGLE_CAPTIONS arriving before the first
// resolves would otherwise see isCapturing still false and run
// startCapture() a second time concurrently (two tabCapture streams, two
// offscreen START_CAPTUREs racing). A message arriving while one is already
// in flight piggybacks on the same result instead of starting a redundant one.
let inFlightToggle: Promise<{ isCapturing: boolean; error?: string }> | null = null

// ─── Session time limit ─────────────────────────────────────────────────────
// A tab forgotten with captions running would otherwise stream to Deepgram/
// DeepL indefinitely — real, metered, per-minute/per-character cost with no
// natural end. chrome.alarms (not setTimeout) is required here: MV3 service
// workers get killed after ~30s of inactivity, and a plain timer would be
// silently lost — alarms persist across restarts and wake the worker.
const SESSION_LIMIT_ALARM = "captio-session-limit"
const MAX_SESSION_MINUTES = 240 // 4 hours — generous enough for any normal video/stream

// ─── Transcript session buffer ─────────────────────────────────────────────────
// Every is_final TRANSCRIPT/TRANSLATION for the current capture is buffered
// here and saved as one row in the `transcripts` table when the session ends
// (see stopCapture -> saveTranscriptSession), if the user is signed in.

let sessionSegments: Array<{ text: string; offsetMs: number }> = []
let sessionStartedAt: number | null = null
let sessionVideoId: string | null = null
let sessionVideoTitle: string | null = null
let sessionVideoUrl: string | null = null
let sessionSpokenLanguage: string = DEFAULT_SPOKEN_LANGUAGE
let sessionCaptionLanguage: string = DEFAULT_CAPTION_LANGUAGE

function pushSegment(text: string) {
  if (sessionStartedAt === null || !text.trim()) return
  sessionSegments.push({ text, offsetMs: Date.now() - sessionStartedAt })
}

async function saveTranscriptSession() {
  if (sessionSegments.length === 0) return
  const segments = sessionSegments
  sessionSegments = []

  try {
    const session = await getSession()
    if (!session) return
    const { error } = await supabase.from("transcripts").insert({
      user_id: session.user.id,
      video_id: sessionVideoId ?? "unknown",
      video_title: sessionVideoTitle,
      video_url: sessionVideoUrl,
      spoken_language: sessionSpokenLanguage,
      caption_language: sessionCaptionLanguage,
      segments,
    })
    if (error) console.error("[captio bg] Failed to save transcript:", error.message)
  } catch (err) {
    console.error("[captio bg] Failed to save transcript:", err)
  }
}

// Queued start payload, sent once the offscreen doc signals it's ready
let pendingStart: {
  streamId: string
  tabId: number
  spokenLanguage: string
  captionLanguage: string
  accessToken?: string
} | null = null

// ─── Offscreen document ───────────────────────────────────────────────────────

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contexts.length > 0) return

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("tabs/offscreen.html"),
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture YouTube tab audio stream for transcription",
  })
}

async function closeOffscreen() {
  offscreenReady = false
  pendingStart = null
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument()
  }
}

// ─── Capture lifecycle ────────────────────────────────────────────────────────

async function startCapture(tabId: number) {
  if (isCapturing) return

  // Defense-in-depth: popup.tsx already disables the toggle off-YouTube, but
  // guard here too — without it, capture would actually start (real audio,
  // real Deepgram/DeepL cost) on ANY tab, even though contents/youtube.ts
  // only ever runs on youtube.com/watch and so nothing would ever render
  // the resulting captions. A silently broken, silently billed no-op.
  const tabResult = await chrome.tabs.get(tabId).catch(() => null)
  if (!isYouTubeWatchUrl(tabResult?.url)) {
    console.error("[captio bg] startCapture called for a non-YouTube tab — refusing to start:", tabResult?.url)
    return
  }
  const tab = tabResult

  try {
    // getMediaStreamId must be called from the service worker — only it can
    // request tab capture permission. The returned ID expires quickly, so pass
    // it to the offscreen document immediately.
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(id)
        }
      })
    })

    await ensureOffscreen()

    // Read language picker choices and auth token from storage.
    // Offscreen documents can't access chrome.storage, so everything is
    // resolved here and forwarded as part of START_CAPTURE.
    const { [STORAGE_KEYS.spokenLanguage]: spokenLanguage, [STORAGE_KEYS.captionLanguage]: captionLanguage } =
      await chrome.storage.local.get({
        [STORAGE_KEYS.spokenLanguage]: DEFAULT_SPOKEN_LANGUAGE,
        [STORAGE_KEYS.captionLanguage]: DEFAULT_CAPTION_LANGUAGE,
      })

    const session = await getSession()
    const accessToken = session?.access_token

    // Reset the transcript session buffer — see saveTranscriptSession().
    // `tab` is already known good here (the guard above returned early
    // otherwise) — no need for a second chrome.tabs.get call.
    sessionSegments = []
    sessionStartedAt = Date.now()
    sessionSpokenLanguage = spokenLanguage
    sessionCaptionLanguage = captionLanguage
    sessionVideoId = tab!.url ? getVideoId(tab!.url) : null
    sessionVideoTitle = tab!.title?.replace(/ - YouTube$/, "") ?? null
    sessionVideoUrl = tab!.url ?? null

    // Pass tabId alongside streamId so the offscreen doc can embed it in every
    // TRANSCRIPT message — this means transcripts reach the content script even
    // if this service worker is restarted and loses in-memory capturedTabId.
    if (offscreenReady) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_CAPTURE",
        streamId,
        tabId,
        spokenLanguage,
        captionLanguage,
        accessToken,
      })
    } else {
      pendingStart = { streamId, tabId, spokenLanguage, captionLanguage, accessToken }
    }

    isCapturing = true
    capturedTabId = tabId

    chrome.tabs.sendMessage(tabId, { type: "CAPTIONS_STARTED" })
    // Persist to storage — MV3 service workers can be killed at any time.
    // We restore capturedTabId from storage when we wake up for a TRANSCRIPT.
    chrome.storage.local.set({ captionsEnabled: true, capturedTabId: tabId })
    chrome.alarms.create(SESSION_LIMIT_ALARM, { delayInMinutes: MAX_SESSION_MINUTES })
  } catch (err) {
    console.error("[captio bg] startCapture failed:", err)
    if (capturedTabId) chrome.tabs.sendMessage(capturedTabId, { type: "CAPTION_ERROR" })
    await cleanup()
  }
}

async function stopCapture() {
  if (!isCapturing) return
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_CAPTURE" })
  if (capturedTabId) chrome.tabs.sendMessage(capturedTabId, { type: "CAPTIONS_STOPPED" })
  await saveTranscriptSession()
  await cleanup()
}

async function cleanup() {
  isCapturing = false
  capturedTabId = null
  chrome.storage.local.set({ captionsEnabled: false, capturedTabId: null })
  chrome.alarms.clear(SESSION_LIMIT_ALARM)
  await closeOffscreen()
}

// ─── Resolve the tab to forward transcripts to ────────────────────────────────
// Prefer in-memory capturedTabId (fast), fall back to storage (if SW was restarted),
// fall back to msg.tabId forwarded from the offscreen doc (most reliable).
// The actual policy lives in lib/tab-resolver.ts so it can be unit tested
// without chrome API mocks.

async function resolveTabId(msgTabId?: number | null): Promise<number | null> {
  return resolveTabIdImpl(msgTabId, {
    getInMemoryTabId: () => capturedTabId,
    setInMemoryTabId: (tabId) => {
      capturedTabId = tabId
    },
    getStoredTabId: async () => {
      const stored = await chrome.storage.local.get("capturedTabId")
      return stored.capturedTabId ?? null
    },
  })
}

// ─── Session time limit ─────────────────────────────────────────────────────
// Notify the tab BEFORE tearing down — cleanup() itself doesn't message the
// tab, so unlike stopCapture() (which sends CAPTIONS_STOPPED and would wipe
// this message out immediately via hideBox()), this ordering lets the
// SESSION_TIME_LIMIT message actually stay visible. Mirrors how CAPTURE_ERROR
// below also calls cleanup() directly rather than stopCapture() for the same
// reason.

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SESSION_LIMIT_ALARM || !isCapturing) return
  if (capturedTabId) chrome.tabs.sendMessage(capturedTabId, { type: "SESSION_TIME_LIMIT" })
  saveTranscriptSession()
  cleanup()
})

// ─── Captured tab closed ────────────────────────────────────────────────────
// Nothing else here listens for the source tab closing — without this, closing
// a YouTube tab mid-capture wouldn't stop audio capture or the /transcribe
// connection at all (the offscreen doc has no way to detect it either; the
// stream just goes silent). That would silently keep streaming to
// Deepgram/DeepL until the 4-hour session limit above eventually caught it —
// real, metered cost for a tab that no longer exists, with no user-visible
// sign anything was still running. stopCapture() (not cleanup() directly)
// so whatever was already captured still gets saved.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (isCapturing && tabId === capturedTabId) {
    stopCapture()
  }
})

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ── From popup ──
  if (msg.type === "TOGGLE_CAPTIONS") {
    if (inFlightToggle) {
      // Already toggling (see inFlightToggle's declaration) — piggyback on
      // that result instead of starting a second, overlapping operation.
      inFlightToggle.then(sendResponse)
      return true
    }

    inFlightToggle = (async () => {
      let result: { isCapturing: boolean; error?: string }
      if (isCapturing) {
        await stopCapture()
        result = { isCapturing: false }
      } else {
        const tabId = msg.tabId
        if (tabId) {
          await startCapture(tabId)
          // Reflect the real outcome, not an assumed one — startCapture()
          // catches its own errors internally (tabCapture permission denied,
          // non-YouTube tab, etc.) and rolls back to isCapturing: false via
          // cleanup() without rethrowing, so a blind `{isCapturing: true}`
          // here would tell the popup capture started when it didn't.
          result = isCapturing ? { isCapturing: true } : { isCapturing: false, error: "Failed to start capture" }
        } else {
          result = { isCapturing: false, error: "No active tab" }
        }
      }
      inFlightToggle = null
      return result
    })()
    inFlightToggle.then(sendResponse)
    return true
  }

  if (msg.type === "GET_STATE") {
    sendResponse({ isCapturing })
    return true
  }

  // ── From offscreen document ──
  if (msg.type === "OFFSCREEN_READY") {
    offscreenReady = true
    if (pendingStart) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_CAPTURE",
        streamId: pendingStart.streamId,
        tabId: pendingStart.tabId,
        spokenLanguage: pendingStart.spokenLanguage,
        captionLanguage: pendingStart.captionLanguage,
        accessToken: pendingStart.accessToken,
      })
      pendingStart = null
    }
  }

  if (msg.type === "TRANSCRIPT") {
    if (msg.isFinal) pushSegment(msg.text)
    // Resolve the target tab asynchronously (handles SW restart case)
    resolveTabId(msg.tabId).then((tabId) => {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: "TRANSCRIPT",
          text: msg.text,
          isFinal: msg.isFinal,
        })
      }
    })
  }

  if (msg.type === "TRANSLATION") {
    if (msg.isFinal) pushSegment(msg.text)
    resolveTabId(msg.tabId).then((tabId) => {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: "TRANSLATION", text: msg.text, isFinal: !!msg.isFinal })
    })
  }

  if (msg.type === "UTTERANCE_END") {
    resolveTabId(msg.tabId).then((tabId) => {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: "UTTERANCE_END" })
    })
  }

  if (msg.type === "CAPTURE_ERROR") {
    console.error("[captio bg] Capture error:", msg.message)
    resolveTabId().then((tabId) => {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: "CAPTION_ERROR" })
    })
    saveTranscriptSession()
    cleanup()
  }

  // ── Vocabulary saving (word clicked in the caption overlay) ──
  if (msg.type === "SAVE_VOCAB") {
    ;(async () => {
      const session = await getSession()
      if (!session) {
        sendResponse({ ok: false, error: "not_signed_in" })
        return
      }
      const { error } = await supabase.from("vocabulary").insert({
        user_id: session.user.id,
        word: msg.word,
        context: msg.context ?? null,
        language: msg.language ?? sessionSpokenLanguage,
        video_id: msg.videoId ?? null,
        video_title: msg.videoTitle ?? null,
      })
      if (error) {
        console.error("[captio bg] Failed to save vocabulary:", error.message)
        sendResponse({ ok: false, error: error.message })
      } else {
        sendResponse({ ok: true })
      }
    })()
    return true
  }

  // ── Auth messages ──
  if (msg.type === "AUTH_SESSION_RELAY") {
    ;(async () => {
      const result = await setSessionFromRelay(msg)
      sendResponse(result)
    })()
    return true
  }

  if (msg.type === "GET_AUTH_SESSION") {
    ;(async () => {
      const session = await getSession()
      sendResponse({ session })
    })()
    return true
  }

  if (msg.type === "SIGN_OUT") {
    ;(async () => {
      try {
        await signOut()
      } catch (err) {
        // Still clear local state even if telling Supabase failed (e.g. offline)
        // — the user asked to sign out, and getting stuck "still signed in"
        // locally because of a network blip would be worse than a session
        // that lingers server-side until it naturally expires.
        console.error("[captio bg] signOut failed (clearing local session anyway):", err)
      }
      chrome.storage.local.remove("userEmail")
      sendResponse({ ok: true })
    })()
    return true
  }

  if (msg.type === "OPEN_SIGN_IN") {
    openSignInPage()
    return false
  }

  // ── From content script ──
  if (msg.type === "STOP_CAPTIONS") {
    stopCapture()
  }

  if (msg.type === "PAUSE_CAPTURE") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "PAUSE_CAPTURE" })
  }

  if (msg.type === "RESUME_CAPTURE") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "RESUME_CAPTURE" })
  }
})
