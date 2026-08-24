/**
 * Unit tests for proxy.ts.
 *
 * These tests exercise `createDeepgramProxy`'s message-routing logic with
 * fully fake, in-process sockets (see test/helpers/fake-socket.ts) — no real
 * network connections are made, and no real Deepgram credentials are needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildDeepgramUrl, createDeepgramProxy } from "./proxy.js"
import { FakeSocket, READY_STATE } from "./test/helpers/fake-socket.js"

describe("buildDeepgramUrl", () => {
  it("targets the Deepgram streaming endpoint over wss", () => {
    const url = new URL(buildDeepgramUrl())
    expect(url.protocol).toBe("wss:")
    expect(url.host).toBe("api.deepgram.com")
    expect(url.pathname).toBe("/v1/listen")
  })

  it("requests linear16 PCM at 16kHz mono, matching the extension's audio format", () => {
    const params = new URL(buildDeepgramUrl()).searchParams
    expect(params.get("encoding")).toBe("linear16")
    expect(params.get("sample_rate")).toBe("16000")
    expect(params.get("channels")).toBe("1")
  })

  it("enables formatting, interim results, and VAD events", () => {
    const params = new URL(buildDeepgramUrl()).searchParams
    expect(params.get("model")).toBe("nova-3")
    expect(params.get("language")).toBe("en")
    expect(params.get("punctuate")).toBe("true")
    expect(params.get("smart_format")).toBe("true")
    expect(params.get("interim_results")).toBe("true")
    expect(params.get("endpointing")).toBe("100")
    expect(params.get("utterance_end_ms")).toBe("1000")
    expect(params.get("vad_events")).toBe("true")
  })

  it("defaults to language=en when no language is given", () => {
    const params = new URL(buildDeepgramUrl({})).searchParams
    expect(params.get("language")).toBe("en")
  })

  it("passes through a specific Spoken language code", () => {
    const params = new URL(buildDeepgramUrl({ language: "es" })).searchParams
    expect(params.get("language")).toBe("es")
  })

  it("always uses model=nova-3, regardless of the Spoken language", () => {
    expect(new URL(buildDeepgramUrl({ language: "en" })).searchParams.get("model")).toBe("nova-3")
    expect(new URL(buildDeepgramUrl({ language: "ko" })).searchParams.get("model")).toBe("nova-3")
  })
})

describe("createDeepgramProxy", () => {
  let client: FakeSocket
  let dg: FakeSocket

  beforeEach(() => {
    client = new FakeSocket()
    client.readyState = READY_STATE.OPEN
    dg = new FakeSocket()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function wire(extra: Parameters<typeof createDeepgramProxy>[1] = {}) {
    return createDeepgramProxy(client, {
      apiKey: "test-key",
      deepgramUrl: "wss://fake.deepgram.test/listen",
      createUpstreamSocket: () => dg,
      ...extra,
    })
  }

  it("creates the upstream socket using the configured URL and API key", () => {
    let seenUrl = ""
    let seenKey = ""
    createDeepgramProxy(client, {
      apiKey: "abc123",
      deepgramUrl: "wss://example.test/listen",
      createUpstreamSocket: (url, apiKey) => {
        seenUrl = url
        seenKey = apiKey
        return dg
      },
    })
    expect(seenUrl).toBe("wss://example.test/listen")
    expect(seenKey).toBe("abc123")
  })

  it("builds the Deepgram URL with the configured Spoken language when no deepgramUrl override is given", () => {
    let seenUrl = ""
    createDeepgramProxy(client, {
      apiKey: "test-key",
      language: "ko",
      createUpstreamSocket: (url) => {
        seenUrl = url
        return dg
      },
    })
    expect(seenUrl).toBe(buildDeepgramUrl({ language: "ko" }))
    expect(new URL(seenUrl).searchParams.get("language")).toBe("ko")
  })

  it("falls back to buildDeepgramUrl() and DEEPGRAM_API_KEY when no overrides are given", () => {
    const prevKey = process.env.DEEPGRAM_API_KEY
    process.env.DEEPGRAM_API_KEY = "env-key"
    try {
      let seenUrl = ""
      let seenKey = ""
      createDeepgramProxy(client, {
        createUpstreamSocket: (url, apiKey) => {
          seenUrl = url
          seenKey = apiKey
          return dg
        },
      })
      expect(seenUrl).toBe(buildDeepgramUrl())
      expect(seenKey).toBe("env-key")
    } finally {
      process.env.DEEPGRAM_API_KEY = prevKey
    }
  })

  it('sends a "Ready" message to the client once Deepgram connects', () => {
    wire()
    dg.open()
    expect(client.sentJson()).toContainEqual({ type: "Ready" })
  })

  it("forwards Deepgram Results messages to the client verbatim", () => {
    wire()
    dg.open()
    const results = JSON.stringify({
      type: "Results",
      is_final: true,
      channel: { alternatives: [{ transcript: "hello world" }] },
    })
    dg.message(results)
    expect(client.sent.map(String)).toContain(results)
  })

  it("forwards non-JSON Deepgram messages without throwing", () => {
    wire()
    dg.open()
    expect(() => dg.message("not-json")).not.toThrow()
    expect(client.sent.map(String)).toContain("not-json")
  })

  it("forwards binary audio from the client to Deepgram once Deepgram is open", () => {
    wire()
    dg.open() // readyState -> OPEN
    const audioChunk = Buffer.from([1, 2, 3, 4])
    client.message(audioChunk, true)
    expect(dg.sent).toContainEqual(audioChunk)
  })

  it("does not forward audio to Deepgram before the Deepgram connection is open", () => {
    wire()
    // dg is still CONNECTING — never called dg.open()
    client.message(Buffer.from([1, 2, 3]), true)
    expect(dg.sent).toHaveLength(0)
  })

  it("buffers audio sent before Deepgram is open and flushes it once Deepgram connects", () => {
    wire()
    const audioChunk = Buffer.from([1, 2, 3])

    // dg is still CONNECTING — message is queued, not dropped.
    client.message(audioChunk, true)
    expect(dg.sent).toHaveLength(0)

    dg.open()
    expect(dg.sent).toContainEqual(audioChunk)
  })

  it("buffers text control messages sent before Deepgram is open and flushes them in order on connect", () => {
    wire()
    const audioChunk = Buffer.from([4, 5, 6])
    const keepAlive = JSON.stringify({ type: "KeepAlive" })

    client.message(audioChunk, true)
    client.message(keepAlive, false)
    expect(dg.sent).toHaveLength(0)

    dg.open()

    // Flushed in the order they were received (binary as a Buffer, text as a
    // string — matching the live forwarding path), and "Ready" still fires.
    expect(dg.sent).toEqual([audioChunk, keepAlive])
    expect(client.sentJson()).toContainEqual({ type: "Ready" })
  })

  it("aborts the upstream connection if the client disconnects before Deepgram is open", () => {
    wire()
    // dg is still CONNECTING.
    client.serverClose()
    expect(dg.closed).toBe(true)
  })

  it("forwards text control messages (KeepAlive) from the client to Deepgram", () => {
    wire()
    dg.open()
    const keepAlive = JSON.stringify({ type: "KeepAlive" })
    client.message(keepAlive, false)
    expect(dg.sent.map(String)).toContain(keepAlive)
  })

  it("on client disconnect, sends CloseStream to Deepgram and closes it after the flush delay", () => {
    vi.useFakeTimers()
    wire({ closeFlushDelayMs: 500 })
    dg.open()

    client.serverClose()

    expect(dg.sent.map(String)).toContain(JSON.stringify({ type: "CloseStream" }))
    expect(dg.closed).toBe(false)

    vi.advanceTimersByTime(500)
    expect(dg.closed).toBe(true)
  })

  it("closes the client when Deepgram closes the connection", () => {
    wire()
    dg.open()
    dg.serverClose()
    expect(client.closed).toBe(true)
  })

  it("forwards a Deepgram error to the client and closes it", () => {
    wire()
    dg.open()
    dg.serverError(new Error("deepgram boom"))
    expect(client.sentJson()).toContainEqual({ type: "Error", message: "deepgram boom" })
    expect(client.closed).toBe(true)
  })

  it("on client error, sends CloseStream to Deepgram and closes it after the flush delay", () => {
    vi.useFakeTimers()
    wire({ closeFlushDelayMs: 250 })
    dg.open()

    client.serverError(new Error("client boom"))

    expect(dg.sent.map(String)).toContain(JSON.stringify({ type: "CloseStream" }))
    vi.advanceTimersByTime(250)
    expect(dg.closed).toBe(true)
  })
})

describe("createDeepgramProxy — translation (Caption language picker)", () => {
  let client: FakeSocket
  let dg: FakeSocket

  beforeEach(() => {
    client = new FakeSocket()
    client.readyState = READY_STATE.OPEN
    dg = new FakeSocket()
  })

  function wire(extra: Parameters<typeof createDeepgramProxy>[1] = {}) {
    return createDeepgramProxy(client, {
      apiKey: "test-key",
      deepgramUrl: "wss://fake.deepgram.test/listen",
      createUpstreamSocket: () => dg,
      ...extra,
    })
  }

  function finalResult(transcript: string) {
    return JSON.stringify({
      type: "Results",
      is_final: true,
      channel: { alternatives: [{ transcript }] },
    })
  }

  function interimResult(transcript: string) {
    return JSON.stringify({
      type: "Results",
      is_final: false,
      channel: { alternatives: [{ transcript }] },
    })
  }

  it("translates is_final transcripts and forwards a Translation message alongside Results", async () => {
    const translateFn = vi.fn().mockResolvedValue({ translatedText: "Hola mundo", detectedSourceLang: "EN" })
    wire({ targetLanguage: "ES", translateFn })
    dg.open()

    dg.message(finalResult("hello world"))
    expect(translateFn).toHaveBeenCalledWith("hello world", "ES")

    // Translation resolves asynchronously
    await vi.waitFor(() => {
      expect(client.sentJson()).toContainEqual({
        type: "Translation",
        original: "hello world",
        translated: "Hola mundo",
        sourceLang: "EN",
        targetLang: "ES",
        isFinal: true,
      })
    })

    // The original Results message is still forwarded verbatim
    expect(client.sent.map(String)).toContain(finalResult("hello world"))
  })

  it("does not translate interim (non-final) results", () => {
    const translateFn = vi.fn().mockResolvedValue({ translatedText: "Hola", detectedSourceLang: "EN" })
    wire({ targetLanguage: "ES", translateFn })
    dg.open()

    dg.message(interimResult("hello"))
    expect(translateFn).not.toHaveBeenCalled()
  })

  it("does not translate empty final transcripts", () => {
    const translateFn = vi.fn().mockResolvedValue({ translatedText: "", detectedSourceLang: "EN" })
    wire({ targetLanguage: "ES", translateFn })
    dg.open()

    dg.message(finalResult(""))
    expect(translateFn).not.toHaveBeenCalled()
  })

  it("skips translation entirely when targetLanguage is not set (Caption language matches Spoken language)", () => {
    const translateFn = vi.fn().mockResolvedValue({ translatedText: "Hola mundo", detectedSourceLang: "EN" })
    wire({ translateFn })
    dg.open()

    dg.message(finalResult("hello world"))
    expect(translateFn).not.toHaveBeenCalled()
    expect(client.sentJson()).not.toContainEqual(expect.objectContaining({ type: "Translation" }))
  })

  it("falls back to sending the original text as the translation, without throwing, when translation fails", async () => {
    const translateFn = vi.fn().mockResolvedValue(null)
    wire({ targetLanguage: "ES", translateFn })
    dg.open()

    expect(() => dg.message(finalResult("hello world"))).not.toThrow()
    await vi.waitFor(() => {
      expect(client.sentJson()).toContainEqual({
        type: "Translation",
        original: "hello world",
        translated: "hello world",
        sourceLang: undefined,
        targetLang: "ES",
        isFinal: true,
      })
    })
  })
})
