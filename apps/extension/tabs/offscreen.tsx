/**
 * tabs/offscreen.tsx — Plasmo tab page used as an offscreen document.
 *
 * Audio pipeline (two separate AudioContexts to avoid muffling):
 *
 *   passCtx  (native sample rate — 44.1 / 48 kHz):
 *     stream → MediaStreamSource → destination  (speakers, full quality)
 *
 *   captureCtx (16 kHz — Deepgram linear16 requirement):
 *     stream → MediaStreamSource → ScriptProcessorNode → GainNode(0) → destination
 *                                        │
 *                                   onaudioprocess: Float32→Int16 → WebSocket
 *
 *   Why two contexts?
 *   A single 16 kHz AudioContext for both capture and playback caused the
 *   muffling bug — Chrome downsampled speaker output to 16 kHz, cutting all
 *   audio above 8 kHz. Separating them keeps speakers at native quality.
 *   The silent GainNode(0) is required: ScriptProcessorNode only fires
 *   onaudioprocess when it is part of an active graph connected to a destination.
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
import { float32ToInt16 } from "../lib/audio"
import {
  DEFAULT_CAPTION_LANGUAGE,
  DEFAULT_SPOKEN_LANGUAGE,
  getDeepLTargetLang,
} from "../lib/languages"

const SERVER_URL = "ws://localhost:3001/transcribe"
const KEEPALIVE_INTERVAL_MS = 5000

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const wsRef         = useRef<WebSocket | null>(null)
  const passCtxRef    = useRef<AudioContext | null>(null)  // native rate → speakers
  const captureCtxRef = useRef<AudioContext | null>(null)  // 16 kHz → Deepgram
  const processorRef  = useRef<ScriptProcessorNode | null>(null)
  const keepAliveRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPausedRef   = useRef(false)
  // tabId from START_CAPTURE is embedded in every TRANSCRIPT message so
  // the background can deliver it even after a service-worker restart.
  const tabIdRef      = useRef<number | null>(null)

  useEffect(() => {
    trySend({ type: "OFFSCREEN_READY" })

    const onMessage = (msg: any) => {
      if (msg.target !== "offscreen") return
      if (msg.type === "START_CAPTURE")  startCapture(msg.streamId, msg.tabId, msg.spokenLanguage, msg.captionLanguage, msg.accessToken)
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

  async function startCapture(streamId: string, tabId?: number, spokenLanguage?: string, captionLanguage?: string, accessToken?: string) {
    tabIdRef.current = tabId ?? null
    isPausedRef.current = false
    try {
      // 0. Resolve language picker choices into Deepgram/DeepL query params.
      const resolvedSpokenLanguage = spokenLanguage ?? DEFAULT_SPOKEN_LANGUAGE
      const resolvedCaptionLanguage = captionLanguage ?? DEFAULT_CAPTION_LANGUAGE
      const targetLang = getDeepLTargetLang(resolvedSpokenLanguage, resolvedCaptionLanguage)
      const translationEnabled = !!targetLang

      const wsUrl = new URL(SERVER_URL)
      wsUrl.searchParams.set("language", resolvedSpokenLanguage)
      if (targetLang) wsUrl.searchParams.set("targetLang", targetLang)
      if (accessToken) wsUrl.searchParams.set("token", accessToken)

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

      // 2a. Passthrough context at the browser's native sample rate.
      //     This is what the user hears — must stay full quality (44.1/48 kHz).
      const passCtx = new AudioContext()
      passCtxRef.current = passCtx
      passCtx.createMediaStreamSource(stream).connect(passCtx.destination)

      // 2b. Capture context at 16 kHz for Deepgram (linear16).
      //     Chrome resamples the stream from native → 16 kHz automatically.
      const captureCtx = new AudioContext({ sampleRate: 16000 })
      captureCtxRef.current = captureCtx

      const captureSource = captureCtx.createMediaStreamSource(stream)

      // 3. ScriptProcessorNode: 256-sample chunks (16 ms at 16 kHz).
      const processor = captureCtx.createScriptProcessor(256, 1, 1)
      processorRef.current = processor

      // 4. Wire capture graph: source → processor → silentGain → destination.
      //    GainNode at 0 is required — ScriptProcessorNode only fires
      //    onaudioprocess when the node is connected into an active graph.
      //    Gain 0 ensures the 16 kHz audio never reaches the speakers.
      const silentGain = captureCtx.createGain()
      silentGain.gain.value = 0
      captureSource.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(captureCtx.destination)

      // 5. Open WebSocket before onaudioprocess so wsRef is ready.
      const ws = new WebSocket(wsUrl.toString())
      wsRef.current = ws

      // 6. onaudioprocess: forward Int16 PCM to Deepgram when not paused.
      //    Speaker passthrough is handled entirely by passCtx (step 2a).
      processor.onaudioprocess = (e) => {
        if (isPausedRef.current) return
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(float32ToInt16(e.inputBuffer.getChannelData(0)))
        }
      }

      ws.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data)
          if (event.type === "Results" && !translationEnabled) {
            // Translation mode suppresses raw results entirely — only the
            // translated text (from the Translation event below) is shown.
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
          if (event.type === "Translation") {
            const text = event.translated?.trim()
            if (text) {
              // TRANSLATION (not TRANSCRIPT) triggers a roll-up in the content
              // script: previous live row → committed (dim top), new text → live.
              trySend({ type: "TRANSLATION", text, tabId: tabIdRef.current, isFinal: !!event.isFinal })
            }
          }
          if (event.type === "UtteranceEnd") {
            trySend({ type: "UTTERANCE_END", tabId: tabIdRef.current })
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

      ws.onclose = (event) => {
        // Only report an error if we didn't call stopCapture ourselves.
        // wsRef is nulled in stopCapture() before the close fires, so if it's
        // still pointing at this socket the close was unexpected.
        if (wsRef.current === ws) {
          trySend({ type: "CAPTURE_ERROR", message: "Connection lost — try restarting captions" })
          stopCapture()
        }
      }
    } catch (err: any) {
      console.error("[captio offscreen] startCapture error:", err)
      trySend({ type: "CAPTURE_ERROR", message: err.message ?? String(err) })
    }
  }

  // ─── Pause / Resume ─────────────────────────────────────────────────────────

  function pauseCapture() {
    // Stop sending audio to Deepgram. Speaker passthrough (passCtx) is
    // unaffected — the tab keeps playing at full quality while paused.
    isPausedRef.current = true
    if (!keepAliveRef.current) {
      keepAliveRef.current = setInterval(() => {
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }))
      }, KEEPALIVE_INTERVAL_MS)
    }
  }

  function resumeCapture() {
    isPausedRef.current = false
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
      ws.send(JSON.stringify({ type: "CloseStream" }))
      setTimeout(() => ws.close(), 500)
    }
    wsRef.current = null
    passCtxRef.current?.close()
    passCtxRef.current = null
    captureCtxRef.current?.close()
    captureCtxRef.current = null
  }

  return null
}
