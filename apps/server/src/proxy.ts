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
 *
 * Translation (Caption language picker, optional — see translate.ts):
 *   When `targetLanguage` is set, every `is_final: true` Results transcript
 *   is also translated via DeepL and forwarded as:
 *   { type: "Translation", original, translated, sourceLang, targetLang }
 *
 * Testability:
 *   `createDeepgramProxy` accepts an optional `createUpstreamSocket` factory so
 *   unit tests can inject a fake "Deepgram" socket (a plain EventEmitter) and
 *   exercise the full proxy logic without any network access. Integration tests
 *   instead point `deepgramUrl` at a local mock WebSocket server.
 */

import WebSocket from 'ws'
import type { EventEmitter } from 'node:events'
import { createDeepLTranslateFn, type TranslateFn } from './translate.js'

// Minimal shape both the client (extension) and upstream (Deepgram) sockets
// must satisfy. `ws.WebSocket` satisfies this, as does any EventEmitter-based
// fake used in tests.
export interface ProxySocket extends EventEmitter {
  readyState: number
  send(data: any): void
  close(): void
}

export type ClientSocket = ProxySocket
export type UpstreamSocket = ProxySocket

export interface DeepgramProxyOptions {
  /** Deepgram API key. Defaults to process.env.DEEPGRAM_API_KEY. */
  apiKey?: string
  /** Full Deepgram streaming URL. Defaults to buildDeepgramUrl(). */
  deepgramUrl?: string
  /**
   * Factory for creating the upstream socket. Defaults to a real `ws` connection
   * to Deepgram. Tests can inject a fake EventEmitter-based socket here to
   * exercise the proxy logic without any network access.
   */
  createUpstreamSocket?: (url: string, apiKey: string) => UpstreamSocket
  /** Delay (ms) between sending CloseStream and force-closing a socket. Defaults to 500. */
  closeFlushDelayMs?: number
  /**
   * Deepgram `language` param — a specific Deepgram language code (e.g.
   * "en", "es", "ko") from the "Spoken language" picker. Only used when
   * `deepgramUrl` isn't explicitly provided. Defaults to "en".
   */
  language?: string
  /**
   * DeepL target language code (e.g. "ES", "PT-BR") for the "Caption
   * language" picker. When set, every `is_final: true` Results transcript
   * is translated and forwarded to the client as a `Translation` message.
   * Leave undefined when the Caption language is the same as the Spoken
   * language (no translation, zero added cost) — see
   * `getDeepLTargetLang`/`isSameLanguage` in apps/extension/lib/languages.ts.
   */
  targetLanguage?: string
  /**
   * Translation function used when `targetLanguage` is set. Defaults to a
   * DeepL-backed implementation using `DEEPL_API_KEY`. Tests can inject a
   * fake here to avoid real network calls.
   */
  translateFn?: TranslateFn
}

// ---------------------------------------------------------------------------
// Deepgram connection parameters
// ---------------------------------------------------------------------------
// encoding=linear16  — raw signed 16-bit PCM (no container, no codec overhead)
// sample_rate=16000  — 16 kHz. Good balance of accuracy vs bandwidth.
//                      Human speech tops out around 8 kHz so 16 kHz captures it fully.
// channels=1         — mono. Tab audio is stereo but we downmix in the AudioWorklet.
// model              — always nova-3, Deepgram's highest-accuracy general-purpose
//                      streaming model. Every Spoken language offered by the
//                      extension (apps/extension/lib/languages.ts) is supported
//                      monolingually by nova-3, so no per-language model lookup
//                      is needed.
// punctuate=true     — adds commas, periods, question marks
// smart_format=true  — formats numbers, currency, dates ("twenty dollars" → "$20")
// interim_results=true — send partial transcripts as words arrive (faster perceived latency)
// endpointing=100    — trigger a final transcript after 100ms of silence
// utterance_end_ms=1000 — emit UtteranceEnd event after 1s of silence; clears caption box
// vad_events=true    — emit SpeechStarted/UtteranceEnd events (lets us pause sending on silence)
// language            — "en" by default. The "Spoken language" picker always sends a
//                       specific Deepgram language code (e.g. "es", "fr", "ja", "ko").

export interface BuildDeepgramUrlOptions {
  /** Deepgram `language` param. Defaults to "en". */
  language?: string
}

export function buildDeepgramUrl(options: BuildDeepgramUrlOptions = {}): string {
  const language = options.language ?? 'en'

  const params = new URLSearchParams({
    model: 'nova-3',
    // Raw 16-bit PCM — the only format Deepgram streaming reliably accepts.
    // webm-opus is batch-only; streaming requires a raw format.
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    language,
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    no_delay: 'true',
    endpointing: '100',
    utterance_end_ms: '1000',
    vad_events: 'true',
  })
  return `wss://api.deepgram.com/v1/listen?${params}`
}

function defaultCreateUpstreamSocket(url: string, apiKey: string): UpstreamSocket {
  return new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  }) as unknown as UpstreamSocket
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export function createDeepgramProxy(client: ClientSocket, options: DeepgramProxyOptions = {}) {
  let isClosed = false

  const apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY ?? ''
  const url = options.deepgramUrl ?? buildDeepgramUrl({ language: options.language })
  const createUpstreamSocket = options.createUpstreamSocket ?? defaultCreateUpstreamSocket
  const closeFlushDelayMs = options.closeFlushDelayMs ?? 500

  // Translation ("Caption language" picker). Undefined targetLanguage means
  // the Caption language matches the Spoken language — no translation step,
  // zero added cost/latency.
  const targetLanguage = options.targetLanguage
  const translateFn = options.translateFn ?? createDeepLTranslateFn()

  const dg = createUpstreamSocket(url, apiKey)

  // The client<->proxy WebSocket is local and opens almost instantly, while
  // proxy<->Deepgram involves a real handshake (and, for the real Deepgram
  // endpoint, a network round trip). The extension may start sending audio
  // the moment its socket opens, before `dg` reaches OPEN — buffer those
  // messages here and flush them once Deepgram connects so the first chunks
  // aren't silently dropped.
  const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = []

  // --- Translation debounce state ----------------------------------------
  // Instead of waiting for is_final (which can be seconds into continuous
  // speech), we debounce interim transcripts: if the text hasn't changed for
  // INTERIM_DEBOUNCE_MS, we translate it immediately. is_final cancels the
  // debounce and translates right away. lastTranslated deduplicates so the
  // same text is never sent to DeepL twice.
  let translateDebounce: ReturnType<typeof setTimeout> | null = null
  let lastTranslated = ''
  const INTERIM_DEBOUNCE_MS = 200

  // --- Translation helper ------------------------------------------------

  function translateAndForward(transcript: string, isFinal: boolean) {
    if (transcript === lastTranslated) return  // deduplicate
    lastTranslated = transcript
    translateFn(transcript, targetLanguage!)
      .then((result) => {
        safeSend(client, JSON.stringify({
          type: 'Translation',
          original: transcript,
          translated: result?.translatedText ?? transcript,
          sourceLang: result?.detectedSourceLang,
          targetLang: targetLanguage,
          isFinal,
        }))
      })
      .catch((err) => {
        console.error('[proxy] Translation failed:', (err as Error).message)
        safeSend(client, JSON.stringify({
          type: 'Translation',
          original: transcript,
          translated: transcript,
          targetLang: targetLanguage,
          isFinal,
        }))
      })
  }

  // --- Deepgram → client ------------------------------------------------

  dg.on('open', () => {
    console.log('[proxy] Deepgram connection opened')
    // Let the extension know the pipeline is ready to accept audio
    safeSend(client, JSON.stringify({ type: 'Ready' }))

    // Flush anything the client sent while we were still connecting, in order.
    for (const { data, isBinary } of pending) {
      dg.send(isBinary ? data : data.toString())
    }
    pending.length = 0
  })

  dg.on('message', (data: WebSocket.RawData) => {
    const text = data.toString()
    // Log everything from Deepgram during development so we can see errors clearly
    let parsed: any
    try {
      parsed = JSON.parse(text)
      // Log everything temporarily to debug — remove once captions are working
      console.log('[deepgram]', parsed.type, parsed.type === 'Results' ? parsed.channel?.alternatives?.[0]?.transcript : '')
    } catch {}
    safeSend(client, text)

    // --- Translation step (Caption language picker) ---------------------
    if (targetLanguage && parsed?.type === 'Results') {
      const transcript: string | undefined = parsed.channel?.alternatives?.[0]?.transcript
      const trimmed = transcript?.trim()
      if (trimmed) {
        if (parsed.is_final) {
          // Final: cancel any pending interim debounce and translate immediately.
          if (translateDebounce) { clearTimeout(translateDebounce); translateDebounce = null }
          translateAndForward(trimmed, true)
        } else {
          // Interim: debounce — translate only if the text is stable for
          // INTERIM_DEBOUNCE_MS. Catches phrases spoken during a long sentence
          // without waiting for a natural endpoint.
          if (translateDebounce) clearTimeout(translateDebounce)
          translateDebounce = setTimeout(() => {
            translateDebounce = null
            translateAndForward(trimmed, false)
          }, INTERIM_DEBOUNCE_MS)
        }
      }
    }
  })

  dg.on('close', (code: number, reason: Buffer) => {
    console.log(`[proxy] Deepgram closed — code=${code} reason=${reason?.toString?.() ?? ''}`)
    closeClient(client)
  })

  dg.on('error', (err: Error) => {
    console.error('[proxy] Deepgram error:', err.message)
    safeSend(client, JSON.stringify({ type: 'Error', message: err.message }))
    closeClient(client)
  })

  // --- client → Deepgram ------------------------------------------------

  client.on('message', (msg: WebSocket.RawData, isBinary: boolean) => {
    if (dg.readyState === WebSocket.CONNECTING) {
      // Deepgram isn't ready yet — queue this message and send it once
      // dg.on('open') fires (see flush above).
      pending.push({ data: msg, isBinary })
      return
    }

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

  client.on('error', (err: Error) => {
    console.error('[proxy] Client error:', err.message)
    closeDg(dg)
  })

  // --- helpers -----------------------------------------------------------

  function safeSend(socket: ProxySocket, data: string) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }

  function closeClient(socket: ProxySocket) {
    if (!isClosed && socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
  }

  function closeDg(socket: ProxySocket) {
    if (socket.readyState === WebSocket.OPEN) {
      // Tell Deepgram to finalize any in-progress transcript before closing
      socket.send(JSON.stringify({ type: 'CloseStream' }))
      // Give it a moment to flush the final transcript, then close
      setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) socket.close()
        isClosed = true
      }, closeFlushDelayMs)
    } else if (socket.readyState === WebSocket.CONNECTING) {
      // The client is already gone — abort the in-progress handshake rather
      // than leaking a connection to Deepgram that nothing will ever use.
      socket.close()
    }
  }
}
