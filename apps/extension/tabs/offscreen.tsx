/**
 * tabs/offscreen.tsx — Plasmo tab page used as an offscreen document.
 *
 * Audio pipeline:
 *   getUserMedia (tabCapture stream)
 *     → AudioContext (16 kHz, downmixed to mono)
 *       → ScriptProcessorNode
 *           onaudioprocess: copies input → output  (keeps tab audible — fixes muting)
 *                           converts Float32 → Int16 and sends to WebSocket
 *         → AudioContext.destination (speakers)
 *
 * Why ScriptProcessorNode instead of AudioWorkletNode:
 *   Chrome extension offscreen documents have a CSP/context restriction that
 *   prevents audioWorklet.addModule() from loading external scripts reliably.
 *   ScriptProcessorNode is deprecated but fully functional and simpler here.
 *
 * MV3 reliability:
 *   All chrome.runtime.sendMessage calls are wrapped in trySend() so a
 *   Plasmo hot-reload that invalidates the extension context doesn't crash.
 *   The tabId passed in START_CAPTURE is embedded in every TRANSCRIPT message
 *   so the background can forward it even after a service-worker restart.
 */

import { useEffect, useRef } from "react"

const SERVER_URL = "ws://localhost:3001/transcribe"
const KEEPALIVE_INTERVAL_MS = 5000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16.buffer
}

/**
 * Safely send a message to the service worker.
 * chrome.runtime.sendMessage throws "Extension context invalidated" when
 * Plasmo hot-reloads — wrapping it prevents a crash that kills the page.
 */
function trySend(msg: object) {
  try {
    chrome.runtime.sendMessage(msg)
  } catch (e) {
    console.warn("[captio offscreen] sendMessage failed (context invalidated?):", e)
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OffscreenPage() {
  const wsRef        = useRef<WebSocket | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // tabId from START_CAPTURE is embedded in every TRANSCRIPT message so
  // the background can deliver it even after a service-worker restart.
  const tabIdRef     = useRef<number | null>(null)

  useEffect(() => {
    trySend({ type: "OFFSCREEN_READY" })

    const onMessage = (msg: any) => {
      if (msg.target !== "offscreen") return
      if (msg.type === "START_CAPTURE")  startCapture(msg.streamId, msg.tabId)
      if (msg.type === "STOP_CAPTURE")   stopCapture()
      if (msg.type === "PAUSE_CAPTURE")  pauseCapture()
      if (msg.type === "RESUME_CAPTURE") resumeCapture()
    }

    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      stopCapture()
    }
  }, [])

  // ─── Capture ────────────────────────────────────────────────────────────────

  async function startCapture(streamId: string, tabId?: number) {
    tabIdRef.current = tabId ?? null
    try {
      // 1. Get the tab's MediaStream via the tabCapture stream ID.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-ignore — Chrome-specific tabCapture constraint
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      })

      // 2. AudioContext at 16 kHz (Deepgram linear16 requirement).
      //    Chrome resamples the tab's native sample rate automatically.
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)

      // 3. ScriptProcessorNode: 4096-sample chunks (256ms at 16kHz).
      //    1 input channel (Chrome downmixes stereo → mono for us).
      //    1 output channel.
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // 4. Wire the audio graph IMMEDIATELY so the tab never goes silent:
      //      source → processor → destination
      //
      //    KEY FIX: the processor copies input → output in onaudioprocess.
      //    Without this copy, ScriptProcessorNode outputs silence even when
      //    connected to the destination — that was the muting bug.
      source.connect(processor)
      processor.connect(ctx.destination)

      // 5. Open WebSocket before setting up onaudioprocess so wsRef is
      //    available for the send check. Passthrough works immediately
      //    (keeps tab audible during the WebSocket connection handshake).
      const ws = new WebSocket(SERVER_URL)
      wsRef.current = ws

      // 6. onaudioprocess fires ~every 256ms.
      //    - Copies input → output (passthrough; tab stays audible)
      //    - Forwards Int16 PCM to Deepgram once the WebSocket is open
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        // Passthrough — without this the tab goes silent
        e.outputBuffer.getChannelData(0).set(input)
        // Forward to Deepgram
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(float32ToInt16(input))
        }
      }

      ws.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data)
          if (event.type === "Results") {
            // Send ALL Results (interim + final) so captions update in real time.
            // With continuous speech, is_final only fires during pauses — waiting
            // for it means long stretches of no captions.
            const text = event.channel?.alternatives?.[0]?.transcript?.trim()
            if (text) {
              trySend({
                type: "TRANSCRIPT",
                text,
                tabId: tabIdRef.current,
                isFinal: !!event.is_final,
              })
            }
          }
          if (event.type === "Error") {
            console.error("[captio offscreen] Deepgram error:", event)
            trySend({ type: "CAPTURE_ERROR", message: event.description ?? "Deepgram error" })
          }
        } catch {}
      }

      ws.onerror = () => {
        trySend({ type: "CAPTURE_ERROR", message: "WebSocket connection failed. Is the server running?" })
        stopCapture()
      }
    } catch (err: any) {
      console.error("[captio offscreen] startCapture error:", err)
      trySend({ type: "CAPTURE_ERROR", message: err.message ?? String(err) })
    }
  }

  // ─── Pause / Resume ─────────────────────────────────────────────────────────

  function pauseCapture() {
    // Switch onaudioprocess to passthrough-only (no WebSocket send).
    // Tab audio keeps playing; Deepgram gets silence/keepalive.
    const processor = processorRef.current
    if (processor) {
      processor.onaudioprocess = (e) => {
        e.outputBuffer.getChannelData(0).set(e.inputBuffer.getChannelData(0))
      }
    }
    // Keep the WebSocket alive so Deepgram doesn't time out
    if (!keepAliveRef.current) {
      keepAliveRef.current = setInterval(() => {
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }))
      }, KEEPALIVE_INTERVAL_MS)
    }
  }

  function resumeCapture() {
    const processor = processorRef.current
    if (processor) {
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        e.outputBuffer.getChannelData(0).set(input)
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) ws.send(float32ToInt16(input))
      }
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }

  // ─── Stop ───────────────────────────────────────────────────────────────────

  function stopCapture() {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null }
    processorRef.current?.disconnect()
    processorRef.current = null
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      // Tell Deepgram to flush any in-progress transcript before closing
      ws.send(JSON.stringify({ type: "CloseStream" }))
      setTimeout(() => ws.close(), 500)
    }
    wsRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
  }

  return null
}
