import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus, type MessageBus, type MessageListener } from "../test/mocks/chrome"
import {
  FakeAudioContext,
  FakeWebSocket,
  createdAudioContexts,
  createdWebSockets,
  resetFakeWebAudio,
} from "../test/helpers/fake-web-audio"

const SERVER_URL = "ws://localhost:3001/transcribe"

function getOffscreenListener(bus: MessageBus): MessageListener {
  const listeners = bus.contexts.get("offscreen")
  if (!listeners || listeners.size === 0) throw new Error("offscreen page did not register an onMessage listener")
  return [...listeners][0]
}

async function loadOffscreenPage(bus: MessageBus, getUserMedia = vi.fn().mockResolvedValue({})) {
  const chromeMock = createChromeMock({ context: "offscreen", bus })
  vi.stubGlobal("chrome", chromeMock)
  vi.stubGlobal("AudioContext", FakeAudioContext)
  vi.stubGlobal("WebSocket", FakeWebSocket)
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  })

  vi.resetModules()
  const { default: OffscreenPage } = await import("./offscreen")

  await act(async () => {
    render(<OffscreenPage />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return { chromeMock, getUserMedia }
}

/** Dispatch START_CAPTURE to the offscreen page's onMessage listener and let its async setup settle. */
async function startCapture(
  bus: MessageBus,
  tabId = 5,
  streamId = "stream-1",
  spokenLanguage?: string,
  captionLanguage?: string
) {
  const listener = getOffscreenListener(bus)
  await act(async () => {
    listener({ target: "offscreen", type: "START_CAPTURE", streamId, tabId, spokenLanguage, captionLanguage }, {}, () => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("tabs/offscreen.tsx", () => {
  let bus: MessageBus
  let background: ReturnType<typeof createChromeMock>
  let onBackgroundMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetFakeWebAudio()
    bus = createMessageBus()
    background = createChromeMock({ context: "background", bus })
    onBackgroundMessage = vi.fn()
    background.runtime.onMessage.addListener(onBackgroundMessage)
  })

  afterEach(() => {
    // Unmount BEFORE unstubbing globals: the component's effect cleanup
    // calls chrome.runtime.onMessage.removeListener() and stopCapture()
    // (which touches WebSocket/AudioContext), all of which must still be
    // stubbed when that cleanup runs.
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("announces OFFSCREEN_READY on mount", async () => {
    await loadOffscreenPage(bus)

    expect(onBackgroundMessage).toHaveBeenCalledWith(
      { type: "OFFSCREEN_READY" },
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("START_CAPTURE requests the tab's audio via getUserMedia and wires source -> processor -> destination at 16kHz", async () => {
    const { getUserMedia } = await loadOffscreenPage(bus)

    await startCapture(bus, 5, "stream-1")

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
      video: false,
    })

    // Two AudioContexts are created: passCtx (native rate, passthrough to
    // speakers) followed by captureCtx (16kHz, the Deepgram capture graph).
    expect(createdAudioContexts).toHaveLength(2)

    const passCtx = createdAudioContexts[0]
    expect(passCtx.sampleRate).not.toBe(16000)
    expect(passCtx.lastSource!.connect).toHaveBeenCalledWith(passCtx.destination)

    const ctx = createdAudioContexts[1]
    expect(ctx.sampleRate).toBe(16000)

    const processor = ctx.lastProcessor!
    const silentGain = ctx.lastGain!
    expect(ctx.lastSource!.connect).toHaveBeenCalledWith(processor)
    // processor -> silentGain(0) -> destination, so the 16kHz capture graph
    // never reaches the speakers (only passCtx does).
    expect(processor.connect).toHaveBeenCalledWith(silentGain)
    expect(silentGain.gain.value).toBe(0)
    expect(silentGain.connect).toHaveBeenCalledWith(ctx.destination)

    expect(createdWebSockets).toHaveLength(1)
    // Defaults: Spoken language "en", Caption language "EN-US" — same
    // language, so no targetLang (no translation step).
    expect(createdWebSockets[0].url).toBe(`${SERVER_URL}?language=en`)
  })

  it("the capture processor forwards Int16 audio to Deepgram only once the socket is open", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus)

    // Speaker passthrough is handled entirely by the separate passCtx graph
    // (verified in the wiring test above) — it doesn't depend on the
    // WebSocket at all. This capture processor's only job is forwarding
    // Int16 PCM to Deepgram once the socket is open.
    const processor = createdAudioContexts[1].lastProcessor!
    const ws = createdWebSockets[0]
    const input = new Float32Array([0.1, -0.2, 0.3, -0.4])

    // Before the socket opens: nothing is sent.
    processor.process(input)
    expect(ws.sent).toHaveLength(0)

    // After the socket opens: audio is forwarded.
    ws.simulateOpen()
    processor.process(input)
    expect(ws.sent).toHaveLength(1)
    expect(ws.sent[0]).toBeInstanceOf(ArrayBuffer)
  })

  it("forwards Deepgram Results as TRANSCRIPT messages tagged with the captured tabId", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const ws = createdWebSockets[0]
    onBackgroundMessage.mockClear()

    await act(async () => {
      ws.simulateMessage({
        type: "Results",
        is_final: true,
        channel: { alternatives: [{ transcript: "  hello world  " }] },
      })
    })

    expect(onBackgroundMessage).toHaveBeenCalledWith(
      { type: "TRANSCRIPT", text: "hello world", tabId: 5, isFinal: true },
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("ignores Results events with an empty/whitespace-only transcript", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const ws = createdWebSockets[0]
    onBackgroundMessage.mockClear()

    await act(async () => {
      ws.simulateMessage({
        type: "Results",
        is_final: false,
        channel: { alternatives: [{ transcript: "   " }] },
      })
    })

    expect(onBackgroundMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "TRANSCRIPT" }),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("forwards Deepgram Error events as CAPTURE_ERROR", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const ws = createdWebSockets[0]
    onBackgroundMessage.mockClear()

    await act(async () => {
      ws.simulateMessage({ type: "Error", description: "deepgram exploded" })
    })

    expect(onBackgroundMessage).toHaveBeenCalledWith(
      { type: "CAPTURE_ERROR", message: "deepgram exploded" },
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("a WebSocket error reports CAPTURE_ERROR and tears down the pipeline", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const passCtx = createdAudioContexts[0]
    const ctx = createdAudioContexts[1]
    const processor = ctx.lastProcessor!
    const ws = createdWebSockets[0]
    onBackgroundMessage.mockClear()

    await act(async () => {
      ws.simulateError()
    })

    expect(onBackgroundMessage).toHaveBeenCalledWith(
      { type: "CAPTURE_ERROR", message: "WebSocket connection failed. Is the server running?" },
      expect.any(Object),
      expect.any(Function)
    )
    expect(processor.disconnect).toHaveBeenCalled()
    // stopCapture() tears down both AudioContexts, not just the capture one.
    expect(ctx.close).toHaveBeenCalled()
    expect(passCtx.close).toHaveBeenCalled()
  })

  it("PAUSE_CAPTURE stops audio forwarding and sends periodic KeepAlive while paused; RESUME_CAPTURE restores forwarding", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const ws = createdWebSockets[0]
    ws.simulateOpen()
    const processor = createdAudioContexts[1].lastProcessor!
    const input = new Float32Array([0.5, -0.5])
    const listener = getOffscreenListener(bus)

    vi.useFakeTimers()

    act(() => {
      listener({ target: "offscreen", type: "PAUSE_CAPTURE" }, {}, () => {})
    })

    // Speaker passthrough (via the separate passCtx) is unaffected by pause —
    // only forwarding to Deepgram through this capture processor stops.
    processor.process(input)
    expect(ws.sent).toHaveLength(0)

    // KeepAlive fires every 5s while paused (so Deepgram doesn't time out).
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(ws.sentJson()).toEqual([{ type: "KeepAlive" }])

    act(() => {
      listener({ target: "offscreen", type: "RESUME_CAPTURE" }, {}, () => {})
    })

    // Forwarding resumes...
    processor.process(input)
    expect(ws.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(1)

    // ...and the KeepAlive interval has been cleared.
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(ws.sentJson()).toEqual([{ type: "KeepAlive" }])
  })

  it("STOP_CAPTURE flushes Deepgram with CloseStream, closes the audio context immediately, and closes the socket after a delay", async () => {
    await loadOffscreenPage(bus)
    await startCapture(bus, 5)

    const passCtx = createdAudioContexts[0]
    const ctx = createdAudioContexts[1]
    const processor = ctx.lastProcessor!
    const ws = createdWebSockets[0]
    ws.simulateOpen()
    const listener = getOffscreenListener(bus)

    vi.useFakeTimers()

    act(() => {
      listener({ target: "offscreen", type: "STOP_CAPTURE" }, {}, () => {})
    })

    expect(processor.disconnect).toHaveBeenCalled()
    expect(ws.sentJson()).toEqual([{ type: "CloseStream" }])
    // Both AudioContexts (passthrough and capture) close immediately.
    expect(ctx.close).toHaveBeenCalled()
    expect(passCtx.close).toHaveBeenCalled()
    expect(ws.readyState).not.toBe(FakeWebSocket.CLOSED)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED)
  })

  it("reports CAPTURE_ERROR when getUserMedia rejects (e.g. permission denied)", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("Permission denied"))
    await loadOffscreenPage(bus, getUserMedia)

    onBackgroundMessage.mockClear()
    await startCapture(bus, 5)

    expect(onBackgroundMessage).toHaveBeenCalledWith(
      { type: "CAPTURE_ERROR", message: "Permission denied" },
      expect.any(Object),
      expect.any(Function)
    )
    expect(createdAudioContexts).toHaveLength(0)
  })

  it("ignores a second START_CAPTURE that arrives while the first is still mid-setup", async () => {
    // getUserMedia below has several real awaits before the first call
    // finishes (matching the real implementation's own multi-step async
    // setup) — dispatch two START_CAPTURE messages back-to-back, without
    // awaiting between them, so the second genuinely lands before the first
    // resolves. Without isCapturingRef's guard, this would open two real
    // tabCapture streams and two pairs of AudioContexts concurrently.
    let resolveGetUserMedia: (stream: any) => void
    const getUserMedia = vi.fn(() => new Promise((resolve) => { resolveGetUserMedia = resolve }))
    await loadOffscreenPage(bus, getUserMedia as any)

    const listener = getOffscreenListener(bus)
    await act(async () => {
      listener({ target: "offscreen", type: "START_CAPTURE", streamId: "stream-1", tabId: 5 }, {}, () => {})
      listener({ target: "offscreen", type: "START_CAPTURE", streamId: "stream-2", tabId: 6 }, {}, () => {})
      resolveGetUserMedia!({})
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
      video: false,
    })
    expect(createdAudioContexts).toHaveLength(2) // passCtx + captureCtx from the one accepted call
  })

  describe("language settings (Spoken language / Caption language pickers)", () => {
    // background.ts resolves the stored Spoken/Caption language picker
    // choices (offscreen documents can't access chrome.storage) and forwards
    // them as part of START_CAPTURE.

    it("builds the WebSocket URL from the Spoken language and Caption language passed in START_CAPTURE", async () => {
      await loadOffscreenPage(bus)
      await startCapture(bus, 5, "stream-1", "es", "EN-US")

      expect(createdWebSockets[0].url).toBe(`${SERVER_URL}?language=es&targetLang=EN-US`)
    })

    it("omits targetLang when Caption language is the same language as Spoken language", async () => {
      await loadOffscreenPage(bus)
      await startCapture(bus, 5, "stream-1", "fr", "FR")

      expect(createdWebSockets[0].url).toBe(`${SERVER_URL}?language=fr`)
    })

    it("when a Caption language is set, suppresses raw Results and forwards only the translated text", async () => {
      await loadOffscreenPage(bus)
      await startCapture(bus, 5, "stream-1", "en", "ES")

      const ws = createdWebSockets[0]
      onBackgroundMessage.mockClear()

      await act(async () => {
        ws.simulateMessage({
          type: "Results",
          is_final: true,
          channel: { alternatives: [{ transcript: "hello world" }] },
        })
      })

      expect(onBackgroundMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "TRANSCRIPT" }),
        expect.any(Object),
        expect.any(Function)
      )

      await act(async () => {
        ws.simulateMessage({
          type: "Translation",
          original: "hello world",
          translated: "Hola mundo",
          sourceLang: "EN",
          targetLang: "ES",
          isFinal: true,
        })
      })

      // Translation events forward as TRANSLATION (not TRANSCRIPT) — the
      // content script uses the distinct type to roll up the previous live
      // row into a committed one before showing the new translated text.
      expect(onBackgroundMessage).toHaveBeenCalledWith(
        { type: "TRANSLATION", text: "Hola mundo", tabId: 5, isFinal: true },
        expect.any(Object),
        expect.any(Function)
      )
    })

    it("when Caption language is the same language as Spoken language, forwards Results normally", async () => {
      // No spokenLanguage/captionLanguage passed in START_CAPTURE -> defaults
      // to en/EN-US, which are the same language -> no translation.
      await loadOffscreenPage(bus)
      await startCapture(bus, 5)

      const ws = createdWebSockets[0]
      onBackgroundMessage.mockClear()

      await act(async () => {
        ws.simulateMessage({
          type: "Results",
          is_final: true,
          channel: { alternatives: [{ transcript: "hello world" }] },
        })
      })

      expect(onBackgroundMessage).toHaveBeenCalledWith(
        { type: "TRANSCRIPT", text: "hello world", tabId: 5, isFinal: true },
        expect.any(Object),
        expect.any(Function)
      )
    })
  })
})
