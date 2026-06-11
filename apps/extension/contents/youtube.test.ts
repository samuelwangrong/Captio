import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus, type MessageBus, type MessageListener } from "../test/mocks/chrome"

/**
 * contents/youtube.ts registers a `yt-navigate-finish` listener and a
 * `chrome.runtime.onMessage` listener, and kicks off an async `init()` as a
 * module-level side effect. To get a clean slate per test we stub `chrome`,
 * reset the DOM and module registry, and re-import the module.
 */
async function loadContentScript(bus: MessageBus) {
  const chromeMock = createChromeMock({ context: "content", bus })
  vi.stubGlobal("chrome", chromeMock)
  vi.resetModules()
  await import("./youtube")
  // Flush the microtask/macrotask queue so the async init() (waitForPlayer →
  // injectOverlay → attachVideoListeners) completes before assertions run.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return chromeMock
}

function getContentListener(bus: MessageBus): MessageListener {
  const listeners = bus.contexts.get("content")
  if (!listeners || listeners.size === 0) throw new Error("content script did not register an onMessage listener")
  return [...listeners][0]
}

function dispatchToContentScript(bus: MessageBus, message: any) {
  getContentListener(bus)(message, {}, () => {})
}

beforeEach(() => {
  document.body.innerHTML = '<div id="movie_player"><video class="video-stream"></video></div>'
  window.history.pushState({}, "", "/watch?v=abc123")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ""
})

describe("contents/youtube.ts", () => {
  it("injects the caption overlay into the player on init", async () => {
    await loadContentScript(createMessageBus())

    const overlay = document.getElementById("captio-overlay")
    const caption = document.getElementById("captio-caption")
    expect(overlay).toBeTruthy()
    expect(caption).toBeTruthy()
    expect(document.querySelector("#movie_player")?.contains(overlay!)).toBe(true)
    expect(document.getElementById("captio-styles")).toBeTruthy()
  })

  it("shows TRANSCRIPT text and auto-hides it after 4 seconds", async () => {
    const bus = createMessageBus()
    await loadContentScript(bus)

    // Switch to fake timers only after init() has settled (it relies on a
    // real setTimeout(0) inside loadContentScript), so the 4s auto-hide
    // timer set by showCaption below is the one we control.
    vi.useFakeTimers()
    dispatchToContentScript(bus, { type: "TRANSCRIPT", text: "hello world", isFinal: true })

    const caption = document.getElementById("captio-caption")!
    expect(caption.textContent).toBe("hello world")
    expect(caption.classList.contains("captio-visible")).toBe(true)

    vi.advanceTimersByTime(4000)
    expect(caption.classList.contains("captio-visible")).toBe(false)
  })

  it("sends PAUSE_CAPTURE / RESUME_CAPTURE on video pause/play only while captions are active", async () => {
    const bus = createMessageBus()
    const chromeMock = await loadContentScript(bus)
    const sendMessage = vi.spyOn(chromeMock.runtime, "sendMessage")

    const video = document.querySelector("video")!

    // Captions not active yet — pause/play should not message the background.
    video.dispatchEvent(new Event("pause"))
    video.dispatchEvent(new Event("play"))
    expect(sendMessage).not.toHaveBeenCalled()

    dispatchToContentScript(bus, { type: "CAPTIONS_STARTED" })

    video.dispatchEvent(new Event("pause"))
    expect(sendMessage).toHaveBeenCalledWith({ type: "PAUSE_CAPTURE" })

    video.dispatchEvent(new Event("play"))
    expect(sendMessage).toHaveBeenCalledWith({ type: "RESUME_CAPTURE" })
  })

  it("CAPTIONS_STOPPED hides the caption and stops further pause/resume messages", async () => {
    const bus = createMessageBus()
    const chromeMock = await loadContentScript(bus)
    const sendMessage = vi.spyOn(chromeMock.runtime, "sendMessage")

    dispatchToContentScript(bus, { type: "CAPTIONS_STARTED" })
    dispatchToContentScript(bus, { type: "TRANSCRIPT", text: "still talking", isFinal: false })

    const caption = document.getElementById("captio-caption")!
    expect(caption.classList.contains("captio-visible")).toBe(true)

    dispatchToContentScript(bus, { type: "CAPTIONS_STOPPED" })
    expect(caption.classList.contains("captio-visible")).toBe(false)

    const video = document.querySelector("video")!
    video.dispatchEvent(new Event("pause"))
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "PAUSE_CAPTURE" })
  })

  it("CAPTION_ERROR shows an error message and deactivates captions", async () => {
    const bus = createMessageBus()
    const chromeMock = await loadContentScript(bus)
    const sendMessage = vi.spyOn(chromeMock.runtime, "sendMessage")

    dispatchToContentScript(bus, { type: "CAPTIONS_STARTED" })
    dispatchToContentScript(bus, { type: "CAPTION_ERROR" })

    const caption = document.getElementById("captio-caption")!
    expect(caption.textContent).toBe("Connection error — try restarting captions")
    expect(caption.classList.contains("captio-visible")).toBe(true)

    // captionsActive is now false — pause should no longer message background.
    sendMessage.mockClear()
    document.querySelector("video")!.dispatchEvent(new Event("pause"))
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "PAUSE_CAPTURE" })
  })

  it("navigating to a new video while captions are active stops captions and hides the overlay", async () => {
    const bus = createMessageBus()
    const chromeMock = await loadContentScript(bus)
    const sendMessage = vi.spyOn(chromeMock.runtime, "sendMessage")

    dispatchToContentScript(bus, { type: "CAPTIONS_STARTED" })
    dispatchToContentScript(bus, { type: "TRANSCRIPT", text: "playing along", isFinal: false })

    window.history.pushState({}, "", "/watch?v=newvideo456")
    document.dispatchEvent(new Event("yt-navigate-finish"))

    expect(sendMessage).toHaveBeenCalledWith({ type: "STOP_CAPTIONS" })

    const caption = document.getElementById("captio-caption")!
    expect(caption.classList.contains("captio-visible")).toBe(false)
  })

  it("does not send STOP_CAPTIONS when yt-navigate-finish fires for the same video", async () => {
    const bus = createMessageBus()
    const chromeMock = await loadContentScript(bus)
    const sendMessage = vi.spyOn(chromeMock.runtime, "sendMessage")

    dispatchToContentScript(bus, { type: "CAPTIONS_STARTED" })

    // Same `v=abc123` as the initial location — e.g. returning from fullscreen.
    document.dispatchEvent(new Event("yt-navigate-finish"))

    expect(sendMessage).not.toHaveBeenCalledWith({ type: "STOP_CAPTIONS" })
  })
})
