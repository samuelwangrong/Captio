import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus, type MessageBus } from "../mocks/chrome"

/**
 * Cross-context integration tests: the REAL background.ts (service worker)
 * and the REAL content script (contents/youtube.ts) wired together through a
 * shared MessageBus. The popup and the offscreen document are simulated with
 * separate chrome mocks — their own internals are unit-tested in
 * background.test.ts and tabs/offscreen.test.tsx.
 *
 * Both real modules reference the GLOBAL `chrome` object, so `fromContext`
 * for chrome.runtime.sendMessage depends on whichever mock is currently
 * stubbed as `globalThis.chrome`. We load the content script first (global
 * chrome = content mock) and background.ts last (global chrome = background
 * mock, left in place for the rest of the test). The content-script code
 * paths exercised here (the onMessage listener: TRANSCRIPT,
 * CAPTIONS_STARTED, CAPTIONS_STOPPED) never call chrome.* themselves, so this
 * ordering doesn't affect them.
 */

async function loadContentScript(bus: MessageBus) {
  const contentChrome = createChromeMock({ context: "content", bus, tabId: 5 })
  vi.stubGlobal("chrome", contentChrome)
  await import("../../contents/youtube")
  // Let the async init() (waitForPlayer -> injectOverlay -> attachVideoListeners) settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return contentChrome
}

async function loadBackground(bus: MessageBus) {
  const backgroundChrome = createChromeMock({ context: "background", bus, tabId: 5 })
  vi.stubGlobal("chrome", backgroundChrome)
  await import("../../background")
  return backgroundChrome
}

function getCaptionEl(): HTMLElement {
  const el = document.getElementById("captio-caption")
  if (!el) throw new Error("content script did not inject #captio-caption")
  return el
}

describe("cross-context integration: popup -> background -> offscreen -> content", () => {
  let bus: MessageBus
  let popup: ReturnType<typeof createChromeMock>
  let offscreen: ReturnType<typeof createChromeMock>
  let onOffscreenMessage: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    document.body.innerHTML = '<div id="movie_player"><video class="video-stream"></video></div>'
    window.history.pushState({}, "", "/watch?v=abc123")

    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.resetModules()

    bus = createMessageBus()
    await loadContentScript(bus)
    await loadBackground(bus)

    popup = createChromeMock({ context: "popup", bus })
    offscreen = createChromeMock({ context: "offscreen", bus })
    onOffscreenMessage = vi.fn()
    offscreen.runtime.onMessage.addListener(onOffscreenMessage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("toggling captions on from the popup queues a START_CAPTURE for the offscreen doc once it's ready", async () => {
    const response = await new Promise((resolve) =>
      popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve)
    )
    expect(response).toEqual({ isCapturing: true })
    expect(bus.storage.get("capturedTabId")).toBe(5)
    expect(bus.offscreenOpen).toBe(true)

    // Offscreen doc announces readiness -> background flushes the queued START_CAPTURE.
    offscreen.runtime.sendMessage({ type: "OFFSCREEN_READY" })

    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "START_CAPTURE", tabId: 5 }),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("a TRANSCRIPT from the offscreen doc is routed through background to the content script's caption overlay", async () => {
    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

    offscreen.runtime.sendMessage({ type: "TRANSCRIPT", text: "hello from deepgram", tabId: 5, isFinal: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const caption = getCaptionEl()
    expect(caption.textContent).toBe("hello from deepgram")
    expect(caption.classList.contains("captio-active")).toBe(true)
  })

  it("survives a service-worker restart: TRANSCRIPT is still routed to the content script via persisted storage", async () => {
    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    expect(bus.storage.get("capturedTabId")).toBe(5)

    // Simulate the MV3 service worker being killed and restarted: drop the
    // old background listener (and its in-memory state) and reload the
    // module fresh. chrome.storage.local (the bus's storage Map) survives.
    bus.contexts.delete("background")
    vi.resetModules()
    await loadBackground(bus)

    offscreen.runtime.sendMessage({ type: "TRANSCRIPT", text: "after restart", tabId: 5, isFinal: false })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const caption = getCaptionEl()
    expect(caption.textContent).toBe("after restart")
    expect(caption.classList.contains("captio-active")).toBe(true)
  })

  it("the content script stopping captions tells background to stop, which hides the overlay and stops the offscreen doc", async () => {
    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

    offscreen.runtime.sendMessage({ type: "TRANSCRIPT", text: "still going", tabId: 5, isFinal: false })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getCaptionEl().classList.contains("captio-active")).toBe(true)

    // Simulate the content script (a context distinct from "background")
    // sending STOP_CAPTIONS, e.g. in response to the user navigating away.
    const contentSender = createChromeMock({ context: "content", bus, tabId: 5 })
    contentSender.runtime.sendMessage({ type: "STOP_CAPTIONS" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getCaptionEl().classList.contains("captio-active")).toBe(false)
    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "STOP_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )
    expect(bus.storage.get("captionsEnabled")).toBe(false)
  })
})
