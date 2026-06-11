/**
 * offscreen.js — runs in an offscreen document (DOM-enabled, long-lived).
 *
 * This is the audio capture engine. It:
 *  1. Receives the tabCapture stream ID from the service worker
 *  2. Opens that stream with getUserMedia (requires a DOM context — can't run in service worker)
 *  3. Reconnects the audio to speakers so the tab doesn't go silent
 *  4. Feeds audio to MediaRecorder in WebM/Opus chunks
 *  5. Streams those chunks over WebSocket to the Captio proxy server
 *  6. Receives Deepgram transcript events and forwards finals to the service worker
 *  7. Handles pause/resume (MediaRecorder + KeepAlive to keep Deepgram alive)
 */

const SERVER_URL = "ws://localhost:3001/transcribe"
const CHUNK_INTERVAL_MS = 250 // send audio every 250ms
const KEEPALIVE_INTERVAL_MS = 5000 // heartbeat to Deepgram when paused

/** @type {MediaRecorder|null} */
let recorder = null
/** @type {WebSocket|null} */
let ws = null
/** @type {AudioContext|null} */
let audioCtx = null
/** @type {ReturnType<typeof setInterval>|null} */
let keepAliveTimer = null

// ─── Ready signal ─────────────────────────────────────────────────────────────
// Tell the service worker this document is live and ready to receive START_CAPTURE.
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" })

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  // Ignore messages not intended for the offscreen document
  if (msg.target !== "offscreen") return

  if (msg.type === "START_CAPTURE") startCapture(msg.streamId)
  if (msg.type === "STOP_CAPTURE") stopCapture()
  if (msg.type === "PAUSE_CAPTURE") pauseCapture()
  if (msg.type === "RESUME_CAPTURE") resumeCapture()
})

// ─── Start ────────────────────────────────────────────────────────────────────
async function startCapture(streamId) {
  try {
    // Exchange the stream ID for the actual MediaStream.
    // This getUserMedia variant is Chrome-specific and only works when given
    // a valid tabCapture stream ID issued moments ago by the service worker.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    })

    // CRITICAL: tabCapture mutes the tab by default. We have to manually route
    // the captured stream back to the speakers or the user hears nothing.
    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(audioCtx.destination)

    // Open the WebSocket connection to our proxy server
    ws = new WebSocket(SERVER_URL)
    ws.binaryType = "blob"

    ws.onopen = () => {
      console.log("[captio offscreen] WebSocket open — starting MediaRecorder")
      startRecorder(stream)
    }

    ws.onmessage = (event) => {
      handleDeepgramEvent(event.data)
    }

    ws.onerror = (err) => {
      console.error("[captio offscreen] WebSocket error", err)
      chrome.runtime.sendMessage({ type: "CAPTURE_ERROR", message: "WebSocket error" })
      stopCapture()
    }

    ws.onclose = () => {
      console.log("[captio offscreen] WebSocket closed")
    }
  } catch (err) {
    console.error("[captio offscreen] startCapture error:", err)
    chrome.runtime.sendMessage({ type: "CAPTURE_ERROR", message: err.message })
  }
}

// ─── MediaRecorder ────────────────────────────────────────────────────────────
function startRecorder(stream) {
  const mimeType = "audio/webm;codecs=opus"

  if (!MediaRecorder.isTypeSupported(mimeType)) {
    chrome.runtime.sendMessage({
      type: "CAPTURE_ERROR",
      message: "audio/webm;codecs=opus not supported in this browser",
    })
    return
  }

  recorder = new MediaRecorder(stream, { mimeType })

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
      ws.send(event.data)
    }
  }

  recorder.onerror = (event) => {
    console.error("[captio offscreen] MediaRecorder error:", event.error)
    chrome.runtime.sendMessage({ type: "CAPTURE_ERROR", message: event.error?.message })
  }

  recorder.start(CHUNK_INTERVAL_MS)
}

// ─── Deepgram response handler ────────────────────────────────────────────────
function handleDeepgramEvent(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return
  }

  if (data.type === "Results" && data.is_final) {
    const text = data.channel?.alternatives?.[0]?.transcript?.trim()
    // Deepgram sometimes sends empty final results (silence). Skip those.
    if (text) {
      chrome.runtime.sendMessage({ type: "TRANSCRIPT", text })
    }
  }

  // Log errors from Deepgram (e.g. auth failure, bad encoding)
  if (data.type === "Error") {
    console.error("[captio offscreen] Deepgram error:", data)
    chrome.runtime.sendMessage({ type: "CAPTURE_ERROR", message: data.description ?? "Deepgram error" })
  }
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────
function pauseCapture() {
  if (recorder?.state === "recording") {
    recorder.pause()
  }
  // Keep the Deepgram WebSocket alive with periodic heartbeats.
  // Without this, Deepgram closes the connection after ~10s of silence.
  if (!keepAliveTimer) {
    keepAliveTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "KeepAlive" }))
      }
    }, KEEPALIVE_INTERVAL_MS)
  }
}

function resumeCapture() {
  if (recorder?.state === "paused") {
    recorder.resume()
  }
  // Stop heartbeats — we're sending real audio again
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
function stopCapture() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }

  if (recorder && recorder.state !== "inactive") {
    recorder.stop()
  }
  recorder = null

  if (ws && ws.readyState === WebSocket.OPEN) {
    // Tell Deepgram to finalize any in-progress transcript before closing
    ws.send(JSON.stringify({ type: "CloseStream" }))
    setTimeout(() => ws?.close(), 500)
  }
  ws = null

  audioCtx?.close()
  audioCtx = null
}
