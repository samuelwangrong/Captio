import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus } from "../test/mocks/chrome"

const mockSetSession = vi.fn()
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}))

describe("lib/auth.ts", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("chrome", createChromeMock({ context: "background", bus: createMessageBus() }))
    mockSetSession.mockReset()
    mockGetSession.mockReset()
    mockSignOut.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("getSession", () => {
    it("returns the session from supabase.auth.getSession", async () => {
      const { getSession } = await import("./auth")
      const session = { access_token: "tok" }
      mockGetSession.mockResolvedValue({ data: { session } })

      expect(await getSession()).toBe(session)
    })

    it("returns null when there is no session", async () => {
      const { getSession } = await import("./auth")
      mockGetSession.mockResolvedValue({ data: { session: null } })

      expect(await getSession()).toBeNull()
    })
  })

  describe("signOut", () => {
    it("calls supabase.auth.signOut", async () => {
      const { signOut } = await import("./auth")
      mockSignOut.mockResolvedValue({ error: null })

      await signOut()

      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  describe("setSessionFromRelay", () => {
    const payload = { accessToken: "at", refreshToken: "rt", email: "sam@example.com" }

    it("stores the email and returns ok:true when setSession succeeds", async () => {
      const { setSessionFromRelay } = await import("./auth")
      mockSetSession.mockResolvedValue({ data: {}, error: null })

      const result = await setSessionFromRelay(payload)

      expect(mockSetSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" })
      expect(result).toEqual({ ok: true })
      const stored = await new Promise((resolve) => chrome.storage.local.get("userEmail", resolve))
      expect((stored as any).userEmail).toBe("sam@example.com")
    })

    it("does not store the email and returns ok:false when supabase reports an error", async () => {
      const { setSessionFromRelay } = await import("./auth")
      mockSetSession.mockResolvedValue({ data: {}, error: { message: "invalid refresh token" } })

      const result = await setSessionFromRelay(payload)

      expect(result).toEqual({ ok: false, error: "invalid refresh token" })
      const stored = await new Promise((resolve) => chrome.storage.local.get("userEmail", resolve))
      expect((stored as any).userEmail).toBeUndefined()
    })

    it("does not store the email and returns ok:false when setSession rejects outright (e.g. network failure)", async () => {
      const { setSessionFromRelay } = await import("./auth")
      mockSetSession.mockRejectedValue(new Error("fetch failed"))

      const result = await setSessionFromRelay(payload)

      expect(result).toEqual({ ok: false, error: "fetch failed" })
      const stored = await new Promise((resolve) => chrome.storage.local.get("userEmail", resolve))
      expect((stored as any).userEmail).toBeUndefined()
    })

    it("times out rather than hanging forever when setSession never settles (e.g. Supabase totally unreachable)", async () => {
      vi.useFakeTimers()
      try {
        const { setSessionFromRelay } = await import("./auth")
        mockSetSession.mockReturnValue(new Promise(() => {})) // never resolves or rejects

        const resultPromise = setSessionFromRelay(payload)
        await vi.advanceTimersByTimeAsync(8000)
        const result = await resultPromise

        expect(result).toEqual({ ok: false, error: "Timed out reaching Supabase" })
        const stored = await new Promise((resolve) => chrome.storage.local.get("userEmail", resolve))
        expect((stored as any).userEmail).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it("skips storing an email when the payload has none, but still reports success", async () => {
      const { setSessionFromRelay } = await import("./auth")
      mockSetSession.mockResolvedValue({ data: {}, error: null })

      const result = await setSessionFromRelay({ accessToken: "at", refreshToken: "rt" })

      expect(result).toEqual({ ok: true })
      const stored = await new Promise((resolve) => chrome.storage.local.get("userEmail", resolve))
      expect((stored as any).userEmail).toBeUndefined()
    })
  })

  describe("openSignInPage", () => {
    it("opens the production login URL by default", async () => {
      const { openSignInPage } = await import("./auth")
      const createTab = vi.spyOn(chrome.tabs, "create")

      openSignInPage()

      expect(createTab).toHaveBeenCalledWith({ url: "https://captio.ai/auth/login?source=extension" })
    })

    it("opens PLASMO_PUBLIC_WEB_URL when set (e.g. local dev)", async () => {
      vi.stubEnv("PLASMO_PUBLIC_WEB_URL", "http://localhost:3000")
      vi.resetModules()
      const { openSignInPage } = await import("./auth")
      const createTab = vi.spyOn(chrome.tabs, "create")

      openSignInPage()

      expect(createTab).toHaveBeenCalledWith({ url: "http://localhost:3000/auth/login?source=extension" })
    })
  })
})
