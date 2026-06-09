/**
 * proxy.ts — bidirectional WebSocket pipe between the Chrome extension and Deepgram.
 *
 * Flow:
 *   Extension (offscreen.js)
 *     --[binary audio chunks]--> this server --[binary audio chunks]--> Deepgram
 *     <--[JSON transcript events]-- this server <--[JSON transcript events]-- Deepgram
 *
 * Audio format:
 *   The extension sends raw 16-bit PCM audio at 16 kHz mono (linear16).
 *   This is extracted from the tab's MediaStream via an AudioWorklet processor.
 *   We tell Deepgram to expect this format via URL query params.
 *
 * Control messages (JSON text frames from extension):
 *   { type: "KeepAlive" }    — forwarded to Deepgram to prevent idle timeout
 *   { type: "CloseStream" }  — tells Deepgram to finalize, then both sides close
 *
 * Deepgram events (JSON text frames forwarded to extension):
 *   { type: "Results", ... }       — transcript, interim or final
 *   { type: "Metadata", ... }      — connection info (sent once on open)
 *   { type: "SpeechStarted", ... } — VAD: speech detected
 *   { type: "UtteranceEnd", ... }  — VAD: speech ended
 *   { type: "Error", ... }         — error from Deepgram
 */

import WebSocket from 'ws'

// The WebSocket type Fastify exposes from @fastify/websocket is the underlying ws socket.
type ClientSocket = WebSocket

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!

// ---------------------------------------------------------------------------
// Deepgram connection parameters
// ---------------------------------------------------------------------------
// encoding=linear16  — raw signed 16-bit PCM (no container, no codec overhead)
// sample_rate=16000  — 16 kHz. Good balance of accuracy vs bandwidth.
//                      Human speech tops out around 8 kHz so 16 kHz captures it fully.
// channels=1         — mono. Tab audio is stereo but we downmix in the AudioWorklet.
// model=nova-3       — Deepgram's most accurate model
// punctuate=true     — adds commas, periods, question marks
// smart_format=true  — formats numbers, currency, dates ("twenty dollars" → "$20")
// interim_results=true — send partial transcripts as words arrive (faster perceived latency)
// endpointing=300    — trigger a final transcript after 300ms of silence
// utterance_end_ms=1000 — emit UtteranceEnd event after 1s of silence (useful for flushing)
// vad_events=true    — emit SpeechStarted/UtteranceEnd events (lets us pause sending on silence)
// language=en        — default to English; will be made configurable later

function buildDeepgramUrl(): string {
  const params = new URLSearchParams({
    model: 'nova-2-general',
    // Raw 16-bit PCM — the only format Deepgram streaming reliably accepts.
    // webm-opus is batch-only; streaming requires a raw format.
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    language: 'en',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
  })
  return `wss://api.deepgram.com/v1/listen?${params}`
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export function createDeepgramProxy(client: ClientSocket) {
  let isClosed = false

  const dg = new WebSocket(buildDeepgramUrl(), {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
  })

  // --- Deepgram → client ------------------------------------------------

  dg.on('open', () => {
    console.log('[proxy] Deepgram connection opened')
    // Let the extension know the pipeline is ready to accept audio
    safeSend(client, JSON.stringify({ type: 'Ready' }))
  })

  dg.on('message', (data) => {
    const text = data.toString()
    // Log everything from Deepgram during development so we can see errors clearly
    try {
      const parsed = JSON.parse(text)
      // Log everything temporarily to debug — remove once captions are working
      console.log('[deepgram]', parsed.type, parsed.type === 'Results' ? parsed.channel?.alternatives?.[0]?.transcript : '')
    } catch {}
    safeSend(client, text)
  })

  dg.on('close', (code, reason) => {
    console.log(`[proxy] Deepgram closed — code=${code} reason=${reason.toString()}`)
    closeClient(client)
  })

  dg.on('error', (err) => {
    console.error('[proxy] Deepgram error:', err.message)
    safeSend(client, JSON.stringify({ type: 'Error', message: err.message }))
    closeClient(client)
  })

  // --- client → Deepgram ------------------------------------------------

  client.on('message', (msg, isBinary) => {
    if (dg.readyState !== WebSocket.OPEN) return

    if (isBinary) {
      // Raw audio bytes — forward directly to Deepgram
      dg.send(msg)
    } else {
      // Text control messages — forward to Deepgram as-is.
      // Deepgram understands: { type: "KeepAlive" } and { type: "CloseStream" }
      dg.send(msg.toString())
    }
  })

  client.on('close', () => {
    console.log('[proxy] Extension disconnected')
    closeDg(dg)
  })

  client.on('error', (err) => {
    console.error('[proxy] Client error:', err.message)
    closeDg(dg)
  })

  // --- helpers -----------------------------------------------------------

  function safeSend(socket: WebSocket, data: string) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }

  function closeClient(socket: WebSocket) {
    if (!isClosed && socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
  }

  function closeDg(socket: WebSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      // Tell Deepgram to finalize any in-progress transcript before closing
      socket.send(JSON.stringify({ type: 'CloseStream' }))
      // Give it a moment to flush the final transcript, then close
      setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) socket.close()
        isClosed = true
      }, 500)
    }
  }
}
