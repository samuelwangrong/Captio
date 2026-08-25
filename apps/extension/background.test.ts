import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { STORAGE_KEYS } from "./lib/languages"
import { createChromeMock, createMessageBus, fireAlarm, fireTabRemoved, type MessageBus } from "./test/mocks/chrome"

/**
 * background.ts registers its `chrome.runtime.onMessage` listener as a
 * module-level side effect, and keeps capture state (isCapturing,
 * capturedTabId, offscreenReady, pendingStart) in module-level variables.
 * To get a clean slate per test we stub `chrome` with a fresh mock backed by
 * a fresh MessageBus, reset the module registry, and re-import the module.
 */
async function loadBackground(bus: MessageBus, options: { tabUrl?: string } = {}) {
  const background = createChromeMock({ context: "background", bus, tabId: 5, tabUrl: options.tabUrl })
  vi.stubGlobal("chrome", background)
  vi.resetModules()
  await import("./background")
  return background
}

describe("background.ts message router", () => {
  let bus: MessageBus
  let popup: ReturnType<typeof createChromeMock>
  let content: ReturnType<typeof createChromeMock>
  let offscreen: ReturnType<typeof createChromeMock>
  let background: ReturnType<typeof createChromeMock>

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    bus = createMessageBus()
    popup = createChromeMock({ context: "popup", bus })
    content = createChromeMock({ context: "content", bus })
    offscreen = createChromeMock({ context: "offscreen", bus })
    background = await loadBackground(bus)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("GET_STATE reports isCapturing: false before any capture starts", async () => {
    const response = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(response).toEqual({ isCapturing: false })
  })

  it("startCapture refuses to start on a non-YouTube tab (defense-in-depth for the popup's own toggle guard)", async () => {
    // Reload background.ts against a non-YouTube tab. Mirrors the SW-restart
    // test's pattern below: bus.contexts.delete("background") first, so the
    // fresh listener doesn't end up registered alongside the beforeEach one.
    bus.contexts.delete("background")
    await loadBackground(bus, { tabUrl: "https://example.com/some-page" })

    const onContentMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

    // Capture never actually started: no CAPTIONS_STARTED sent, no offscreen
    // doc created, GET_STATE still reports idle.
    expect(onContentMessage).not.toHaveBeenCalledWith(
      { type: "CAPTIONS_STARTED" },
      expect.any(Object),
      expect.any(Function)
    )
    expect(bus.offscreenOpen).toBe(false)

    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: false })
  })

  it("TOGGLE_CAPTIONS without a tabId responds with an error and does not start capture", async () => {
    const response = await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS" }, resolve))
    expect(response).toEqual({ isCapturing: false, error: "No active tab" })

    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: false })
  })

  it("TOGGLE_CAPTIONS with a tabId starts capture, notifies the tab, and persists state", async () => {
    const onContentMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)

    const response = await new Promise((resolve) =>
      popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve)
    )
    expect(response).toEqual({ isCapturing: true })

    // Content script was notified that captions started.
    expect(onContentMessage).toHaveBeenCalledWith(
      { type: "CAPTIONS_STARTED" },
      expect.any(Object),
      expect.any(Function)
    )

    // GET_STATE now reflects the active capture.
    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: true })

    // Persisted so the service worker can recover after a restart.
    expect(bus.storage.get("captionsEnabled")).toBe(true)
    expect(bus.storage.get("capturedTabId")).toBe(5)

    // The offscreen document was created (no offscreen context existed yet).
    expect(bus.offscreenOpen).toBe(true)
  })

  it("a queued START_CAPTURE is sent to the offscreen doc once it signals OFFSCREEN_READY", async () => {
    const onOffscreenMessage = vi.fn()
    offscreen.runtime.onMessage.addListener(onOffscreenMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

    // The offscreen context's onMessage listener also observes the original
    // TOGGLE_CAPTIONS broadcast (chrome.runtime.sendMessage delivers to every
    // context, not just background) — but START_CAPTURE specifically hasn't
    // been sent yet, since the offscreen doc hasn't announced readiness.
    expect(onOffscreenMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "START_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )

    offscreen.runtime.sendMessage({ type: "OFFSCREEN_READY" })

    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "offscreen",
        type: "START_CAPTURE",
        streamId: "fake-stream-id",
        tabId: 5,
        spokenLanguage: "en",
        captionLanguage: "EN-US",
      }),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("double-clicking the toggle fast (two TOGGLE_CAPTIONS before the first's async chain resolves) does not run startCapture() twice", async () => {
    // startCapture() sets isCapturing = true only after several real awaits
    // (chrome.tabCapture.getMediaStreamId, chrome.storage.local.get,
    // getSession()) — the popup's toggle has no in-flight guard (see
    // popup.tsx's handleToggle), so a fast double-click sends a second
    // TOGGLE_CAPTIONS while the first is still mid-flight and isCapturing is
    // still false. Fire both without awaiting between them, matching that.
    //
    // Spies on getMediaStreamId (called once per startCapture() invocation,
    // before anything overwritable like pendingStart/bus.alarms comes into
    // play) rather than counting START_CAPTURE messages to the offscreen doc
    // — pendingStart is a single scalar a second concurrent call would just
    // overwrite, so counting messages sent could show "1" even if
    // startCapture() genuinely ran twice.
    const getMediaStreamId = vi.spyOn(background.tabCapture, "getMediaStreamId")

    const first = new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    const second = new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    await Promise.all([first, second])

    expect(getMediaStreamId).toHaveBeenCalledTimes(1)
  })

  it("TOGGLE_CAPTIONS while capturing stops capture, notifies the tab, and clears persisted state", async () => {
    const onContentMessage = vi.fn()
    const onOffscreenMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)
    offscreen.runtime.onMessage.addListener(onOffscreenMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    onContentMessage.mockClear()
    onOffscreenMessage.mockClear()

    const response = await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS" }, resolve))
    expect(response).toEqual({ isCapturing: false })

    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "STOP_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )
    expect(onContentMessage).toHaveBeenCalledWith(
      { type: "CAPTIONS_STOPPED" },
      expect.any(Object),
      expect.any(Function)
    )

    expect(bus.storage.get("captionsEnabled")).toBe(false)
    expect(bus.storage.get("capturedTabId")).toBeNull()
    expect(bus.offscreenOpen).toBe(false)
  })

  it("forwards a TRANSCRIPT message from the offscreen doc to the captured tab", async () => {
    const onContentMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    onContentMessage.mockClear()

    offscreen.runtime.sendMessage({ type: "TRANSCRIPT", text: "hello world", tabId: 5, isFinal: true })

    // Resolution is async (resolveTabId returns a Promise) — flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onContentMessage).toHaveBeenCalledWith(
      { type: "TRANSCRIPT", text: "hello world", isFinal: true },
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("TRANSCRIPT falls back to the tabId embedded in the message after a service-worker restart", async () => {
    // Simulate the SW having restarted: capturedTabId is gone from memory,
    // but was persisted to storage before the restart.
    bus.storage.set("capturedTabId", 5)

    const onContentMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)

    offscreen.runtime.sendMessage({ type: "TRANSCRIPT", text: "after restart", tabId: 5, isFinal: false })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onContentMessage).toHaveBeenCalledWith(
      { type: "TRANSCRIPT", text: "after restart", isFinal: false },
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("CAPTURE_ERROR notifies the tab and tears down capture state", async () => {
    const onContentMessage = vi.fn()
    content.runtime.onMessage.addListener(onContentMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    onContentMessage.mockClear()

    offscreen.runtime.sendMessage({ type: "CAPTURE_ERROR", message: "Deepgram exploded" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onContentMessage).toHaveBeenCalledWith({ type: "CAPTION_ERROR" }, expect.any(Object), expect.any(Function))

    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: false })
  })

  it("STOP_CAPTIONS from the content script stops capture", async () => {
    const onOffscreenMessage = vi.fn()
    offscreen.runtime.onMessage.addListener(onOffscreenMessage)

    await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
    onOffscreenMessage.mockClear()

    content.runtime.sendMessage({ type: "STOP_CAPTIONS" })
    // stopCapture() now awaits saveTranscriptSession() (a no-op here, since no
    // segments were captured) before cleanup() — flush that microtask hop.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: false })
    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "STOP_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("forwards PAUSE_CAPTURE and RESUME_CAPTURE from the content script to the offscreen doc", async () => {
    const onOffscreenMessage = vi.fn()
    offscreen.runtime.onMessage.addListener(onOffscreenMessage)

    content.runtime.sendMessage({ type: "PAUSE_CAPTURE" })
    content.runtime.sendMessage({ type: "RESUME_CAPTURE" })

    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "PAUSE_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )
    expect(onOffscreenMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "offscreen", type: "RESUME_CAPTURE" }),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it("TOGGLE_CAPTIONS reports the real outcome when startCapture fails internally, instead of assuming success", async () => {
    // chrome.tabCapture.getMediaStreamId reports lastError -> startCapture's
    // own catch block runs cleanup() (isCapturing -> false) without
    // rethrowing, so the message router must check the actual isCapturing
    // state afterward rather than assume the call it just awaited succeeded.
    bus.tabCaptureError = "Tab capture permission denied"

    const response = await new Promise((resolve) =>
      popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve)
    )
    expect(response).toEqual({ isCapturing: false, error: "Failed to start capture" })

    const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
    expect(state).toEqual({ isCapturing: false })
  })

  describe("session time limit (chrome.alarms, not setTimeout — must survive a service-worker restart)", () => {
    it("starting a capture creates the session-limit alarm for 4 hours", async () => {
      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      expect(bus.alarms.get("captio-session-limit")).toEqual({ delayInMinutes: 240 })
    })

    it("stopping a capture clears the session-limit alarm", async () => {
      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      expect(bus.alarms.has("captio-session-limit")).toBe(true)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS" }, resolve))
      expect(bus.alarms.has("captio-session-limit")).toBe(false)
    })

    it("the alarm firing notifies the tab and tears down capture state, without a CAPTIONS_STOPPED wiping the message", async () => {
      const onContentMessage = vi.fn()
      content.runtime.onMessage.addListener(onContentMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      onContentMessage.mockClear()

      fireAlarm(bus, "captio-session-limit")
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onContentMessage).toHaveBeenCalledWith(
        { type: "SESSION_TIME_LIMIT" },
        expect.any(Object),
        expect.any(Function)
      )
      // Unlike stopCapture()'s STOP_CAPTIONS/TOGGLE_CAPTIONS path, this teardown
      // must NOT also send CAPTIONS_STOPPED — that would hide the message
      // (content script's hideBox()) before the user ever sees it.
      expect(onContentMessage).not.toHaveBeenCalledWith(
        { type: "CAPTIONS_STOPPED" },
        expect.any(Object),
        expect.any(Function)
      )

      const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
      expect(state).toEqual({ isCapturing: false })
      expect(bus.offscreenOpen).toBe(false)
    })

    it("a stale/late alarm firing after capture already stopped is a no-op", async () => {
      const onContentMessage = vi.fn()
      content.runtime.onMessage.addListener(onContentMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS" }, resolve))
      onContentMessage.mockClear()

      fireAlarm(bus, "captio-session-limit")
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onContentMessage).not.toHaveBeenCalled()
    })

    it("an unrelated alarm name is ignored", async () => {
      const onContentMessage = vi.fn()
      content.runtime.onMessage.addListener(onContentMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      onContentMessage.mockClear()

      fireAlarm(bus, "some-other-alarm")
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onContentMessage).not.toHaveBeenCalled()
      const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
      expect(state).toEqual({ isCapturing: true })
    })
  })

  describe("captured tab closed (chrome.tabs.onRemoved)", () => {
    it("closing the captured tab stops capture: tears down the offscreen doc and clears state", async () => {
      const onOffscreenMessage = vi.fn()
      offscreen.runtime.onMessage.addListener(onOffscreenMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))
      expect(bus.offscreenOpen).toBe(true)

      fireTabRemoved(bus, 5)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onOffscreenMessage).toHaveBeenCalledWith(
        expect.objectContaining({ target: "offscreen", type: "STOP_CAPTURE" }),
        expect.any(Object),
        expect.any(Function)
      )
      const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
      expect(state).toEqual({ isCapturing: false })
      expect(bus.offscreenOpen).toBe(false)
      expect(bus.alarms.has("captio-session-limit")).toBe(false)
    })

    it("closing a different tab while capturing is a no-op", async () => {
      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

      fireTabRemoved(bus, 999)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
      expect(state).toEqual({ isCapturing: true })
      expect(bus.offscreenOpen).toBe(true)
    })

    it("closing any tab while not capturing is a no-op (no crash)", async () => {
      expect(() => fireTabRemoved(bus, 5)).not.toThrow()
      const state = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_STATE" }, resolve))
      expect(state).toEqual({ isCapturing: false })
    })
  })

  it("SAVE_VOCAB responds not_signed_in when there's no active Supabase session", async () => {
    const response = await new Promise((resolve) =>
      content.runtime.sendMessage(
        { type: "SAVE_VOCAB", word: "hola", context: "hola mundo", videoId: "abc123", videoTitle: "Test Video" },
        resolve
      )
    )
    expect(response).toEqual({ ok: false, error: "not_signed_in" })
  })

  describe("language settings (Spoken language / Caption language pickers)", () => {
    // Offscreen documents can't access chrome.storage — background.ts must
    // read the picker choices itself and forward them in START_CAPTURE.

    it("forwards default Spoken/Caption language settings when nothing is stored", async () => {
      const onOffscreenMessage = vi.fn()
      offscreen.runtime.onMessage.addListener(onOffscreenMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

      // START_CAPTURE is queued until the offscreen doc signals readiness.
      offscreen.runtime.sendMessage({ type: "OFFSCREEN_READY" })

      expect(onOffscreenMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "offscreen",
          type: "START_CAPTURE",
          spokenLanguage: "en",
          captionLanguage: "EN-US",
        }),
        expect.any(Object),
        expect.any(Function)
      )
    })

    it("forwards stored Spoken/Caption language settings", async () => {
      bus.storage.set(STORAGE_KEYS.spokenLanguage, "es")
      bus.storage.set(STORAGE_KEYS.captionLanguage, "EN-US")

      const onOffscreenMessage = vi.fn()
      offscreen.runtime.onMessage.addListener(onOffscreenMessage)

      await new Promise((resolve) => popup.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId: 5 }, resolve))

      // START_CAPTURE is queued until the offscreen doc signals readiness.
      offscreen.runtime.sendMessage({ type: "OFFSCREEN_READY" })

      expect(onOffscreenMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "offscreen",
          type: "START_CAPTURE",
          spokenLanguage: "es",
          captionLanguage: "EN-US",
        }),
        expect.any(Object),
        expect.any(Function)
      )
    })
  })

  describe("auth message routing", () => {
    // These spy on lib/auth.ts's real exports rather than mocking the whole
    // module, so background.ts's own destructured imports (which resolve to
    // the same live module bindings) pick up the override too. lib/auth.ts's
    // own internal behavior (e.g. setSessionFromRelay's error handling) has
    // its own dedicated coverage in lib/auth.test.ts — this only checks that
    // background.ts's message router forwards results/failures correctly.
    async function loadBackgroundWithAuthSpy() {
      bus.contexts.delete("background")
      vi.resetModules()
      const authLib = await import("./lib/auth")
      const background = createChromeMock({ context: "background", bus, tabId: 5 })
      vi.stubGlobal("chrome", background)
      await import("./background")
      return authLib
    }

    it("AUTH_SESSION_RELAY forwards setSessionFromRelay's result to the caller, including on failure", async () => {
      const authLib = await loadBackgroundWithAuthSpy()
      vi.spyOn(authLib, "setSessionFromRelay").mockResolvedValue({ ok: false, error: "invalid refresh token" })

      const response = await new Promise((resolve) =>
        content.runtime.sendMessage(
          { type: "AUTH_SESSION_RELAY", accessToken: "at", refreshToken: "rt", email: "sam@example.com" },
          resolve
        )
      )

      expect(response).toEqual({ ok: false, error: "invalid refresh token" })
    })

    it("AUTH_SESSION_RELAY forwards a success result", async () => {
      const authLib = await loadBackgroundWithAuthSpy()
      vi.spyOn(authLib, "setSessionFromRelay").mockResolvedValue({ ok: true })

      const response = await new Promise((resolve) =>
        content.runtime.sendMessage(
          { type: "AUTH_SESSION_RELAY", accessToken: "at", refreshToken: "rt" },
          resolve
        )
      )

      expect(response).toEqual({ ok: true })
    })

    it("SIGN_OUT still clears local state and responds ok:true even when signOut() throws", async () => {
      const authLib = await loadBackgroundWithAuthSpy()
      vi.spyOn(authLib, "signOut").mockRejectedValue(new Error("network down"))
      bus.storage.set("userEmail", "sam@example.com")

      const response = await new Promise((resolve) => popup.runtime.sendMessage({ type: "SIGN_OUT" }, resolve))

      expect(response).toEqual({ ok: true })
      expect(bus.storage.get("userEmail")).toBeUndefined()
    })

    it("GET_AUTH_SESSION returns whatever getSession() resolves to", async () => {
      const authLib = await loadBackgroundWithAuthSpy()
      const session = { access_token: "at", user: { email: "sam@example.com" } }
      vi.spyOn(authLib, "getSession").mockResolvedValue(session as any)

      const response = await new Promise((resolve) => popup.runtime.sendMessage({ type: "GET_AUTH_SESSION" }, resolve))

      expect(response).toEqual({ session })
    })

    it("OPEN_SIGN_IN calls openSignInPage()", async () => {
      const authLib = await loadBackgroundWithAuthSpy()
      const openSignInPage = vi.spyOn(authLib, "openSignInPage").mockImplementation(() => {})

      popup.runtime.sendMessage({ type: "OPEN_SIGN_IN" })

      expect(openSignInPage).toHaveBeenCalled()
    })
  })
})
