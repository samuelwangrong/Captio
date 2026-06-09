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
 *   bg       → offscreen: START_CAPTURE { streamId, tabId }, STOP_CAPTURE, PAUSE_CAPTURE, RESUME_CAPTURE
 *   offscreen → bg:       TRANSCRIPT { text, tabId, isFinal }, CAPTURE_ERROR { message }, OFFSCREEN_READY
 *   bg       → tab:       CAPTIONS_STARTED, CAPTIONS_STOPPED, TRANSCRIPT { text, isFinal }, CAPTION_ERROR
 *   tab      → bg:        STOP_CAPTIONS, PAUSE_CAPTURE, RESUME_CAPTURE
 *
 * MV3 service worker reliability:
 *   Service workers can be killed at any time. capturedTabId is persisted to
 *   chrome.storage.local so it survives restarts. TRANSCRIPT messages include tabId
 *   from the offscreen doc as an extra safety net.
 */

// ─── State ────────────────────────────────────────────────────────────────────

let isCapturing = false
let capturedTabId: number | null = null
let offscreenReady = false

// Queued start payload, sent once the offscreen doc signals it's ready
let pendingStart: { streamId: string; tabId: number } | null = null

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

    // Pass tabId alongside streamId so the offscreen doc can embed it in every
    // TRANSCRIPT message — this means transcripts reach the content script even
    // if this service worker is restarted and loses in-memory capturedTabId.
    if (offscreenReady) {
      chrome.runtime.sendMessage({ target: "offscreen", type: "START_CAPTURE", streamId, tabId })
    } else {
      pendingStart = { streamId, tabId }
    }

    isCapturing = true
    capturedTabId = tabId

    chrome.tabs.sendMessage(tabId, { type: "CAPTIONS_STARTED" })
    // Persist to storage — MV3 service workers can be killed at any time.
    // We restore capturedTabId from storage when we wake up for a TRANSCRIPT.
    chrome.storage.local.set({ captionsEnabled: true, capturedTabId: tabId })
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
  await cleanup()
}

async function cleanup() {
  isCapturing = false
  capturedTabId = null
  chrome.storage.local.set({ captionsEnabled: false, capturedTabId: null })
  await closeOffscreen()
}

// ─── Resolve the tab to forward transcripts to ────────────────────────────────
// Prefer in-memory capturedTabId (fast), fall back to storage (if SW was restarted),
// fall back to msg.tabId forwarded from the offscreen doc (most reliable).

async function resolveTabId(msgTabId?: number | null): Promise<number | null> {
  if (capturedTabId) return capturedTabId
  const stored = await chrome.storage.local.get("capturedTabId")
  if (stored.capturedTabId) {
    capturedTabId = stored.capturedTabId // restore in-memory state
    return capturedTabId
  }
  return msgTabId ?? null
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ── From popup ──
  if (msg.type === "TOGGLE_CAPTIONS") {
    ;(async () => {
      if (isCapturing) {
        await stopCapture()
        sendResponse({ isCapturing: false })
      } else {
        const tabId = msg.tabId
        if (tabId) {
          await startCapture(tabId)
          sendResponse({ isCapturing: true })
        } else {
          sendResponse({ isCapturing: false, error: "No active tab" })
        }
      }
    })()
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
      })
      pendingStart = null
    }
  }

  if (msg.type === "TRANSCRIPT") {
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

  if (msg.type === "CAPTURE_ERROR") {
    console.error("[captio bg] Capture error:", msg.message)
    resolveTabId().then((tabId) => {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: "CAPTION_ERROR" })
    })
    cleanup()
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
