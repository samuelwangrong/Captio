import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus } from "./test/mocks/chrome"
import { STORAGE_KEYS } from "./lib/languages"

interface LoadPopupOptions {
  storage?: Record<string, any>
  tabTitle?: string
  tabId?: number
  sendMessageImpl?: (message: any, callback?: (response?: any) => void) => void
}

async function loadPopup(options: LoadPopupOptions = {}) {
  const bus = createMessageBus()
  for (const [k, v] of Object.entries(options.storage ?? {})) bus.storage.set(k, v)

  const chromeMock = createChromeMock({
    context: "popup",
    bus,
    tabId: options.tabId ?? 1,
    tabTitle: options.tabTitle ?? "Test Video - YouTube",
  })

  const defaultSendMessage = (message: any, callback?: (response?: any) => void) => {
    if (message.type === "GET_STATE") callback?.({ isCapturing: false })
  }
  chromeMock.runtime.sendMessage = vi.fn(options.sendMessageImpl ?? defaultSendMessage) as any

  vi.stubGlobal("chrome", chromeMock)
  vi.resetModules()
  const { default: Popup } = await import("./popup")

  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<Popup />)
  })

  return { ...result, chromeMock, bus }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("popup.tsx", () => {
  it("shows the active tab's title with the ' - YouTube' suffix stripped", async () => {
    await loadPopup({ tabTitle: "Some Cool Video - YouTube" })
    expect(screen.getByText("Some Cool Video")).toBeInTheDocument()
  })

  it("shows a sign-in link when no user email is stored", async () => {
    await loadPopup({})
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument()
  })

  it("shows the account email when one is stored in chrome.storage.local", async () => {
    await loadPopup({ storage: { userEmail: "sam@example.com" } })
    expect(await screen.findByText("sam@example.com")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument()
  })

  it("reflects an active capture from the background's GET_STATE response", async () => {
    await loadPopup({
      sendMessageImpl: (message, callback) => {
        if (message.type === "GET_STATE") callback?.({ isCapturing: true })
      },
    })

    expect(await screen.findByText("Transcribing…")).toBeInTheDocument()
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("shows Idle when the background reports no active capture", async () => {
    await loadPopup({
      sendMessageImpl: (message, callback) => {
        if (message.type === "GET_STATE") callback?.({ isCapturing: false })
      },
    })

    expect(await screen.findByText("Idle")).toBeInTheDocument()
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })

  it("clicking the toggle sends TOGGLE_CAPTIONS with the active tab id and updates state from the response", async () => {
    const { chromeMock } = await loadPopup({
      tabId: 42,
      sendMessageImpl: (message, callback) => {
        if (message.type === "GET_STATE") callback?.({ isCapturing: false })
        if (message.type === "TOGGLE_CAPTIONS") callback?.({ isCapturing: true })
      },
    })

    const toggle = await screen.findByRole("switch")
    expect(toggle).toHaveAttribute("aria-checked", "false")

    await act(async () => {
      await userEvent.click(toggle)
    })

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "TOGGLE_CAPTIONS", tabId: 42 }),
      expect.any(Function)
    )
    expect(toggle).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("Transcribing…")).toBeInTheDocument()
  })

  it("clicking the settings button opens the extension options page", async () => {
    const { chromeMock } = await loadPopup({})
    const openOptionsPage = vi.spyOn(chromeMock.runtime, "openOptionsPage")

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /open settings/i }))
    })

    expect(openOptionsPage).toHaveBeenCalled()
  })

  describe("language pickers", () => {
    it("defaults to English spoken language and English (US) caption language", async () => {
      await loadPopup({})

      const spokenSelect = screen.getByLabelText("Spoken language") as HTMLSelectElement
      const captionSelect = screen.getByLabelText("Caption language") as HTMLSelectElement

      expect(spokenSelect.value).toBe("en")
      expect(captionSelect.value).toBe("EN-US")
    })

    it("restores stored Spoken language and Caption language choices", async () => {
      await loadPopup({
        storage: {
          [STORAGE_KEYS.spokenLanguage]: "es",
          [STORAGE_KEYS.captionLanguage]: "EN-US",
        },
      })

      const spokenSelect = screen.getByLabelText("Spoken language") as HTMLSelectElement
      const captionSelect = screen.getByLabelText("Caption language") as HTMLSelectElement

      expect(spokenSelect.value).toBe("es")
      expect(captionSelect.value).toBe("EN-US")
    })

    it("changing the Spoken language picker persists the choice to chrome.storage.local", async () => {
      const { bus } = await loadPopup({})

      const spokenSelect = screen.getByLabelText("Spoken language") as HTMLSelectElement
      await act(async () => {
        await userEvent.selectOptions(spokenSelect, "es")
      })

      expect(spokenSelect.value).toBe("es")
      expect(bus.storage.get(STORAGE_KEYS.spokenLanguage)).toBe("es")
    })

    it("changing the Caption language picker persists the choice to chrome.storage.local", async () => {
      const { bus } = await loadPopup({})

      const captionSelect = screen.getByLabelText("Caption language") as HTMLSelectElement
      await act(async () => {
        await userEvent.selectOptions(captionSelect, "ES")
      })

      expect(captionSelect.value).toBe("ES")
      expect(bus.storage.get(STORAGE_KEYS.captionLanguage)).toBe("ES")
    })
  })
})
