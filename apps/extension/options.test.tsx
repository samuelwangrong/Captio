import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createChromeMock, createMessageBus } from "./test/mocks/chrome"

async function loadOptions(
  storage: Record<string, any> = {},
  sendMessageImpl?: (message: any, callback?: (response?: any) => void) => void
) {
  const bus = createMessageBus()
  for (const [k, v] of Object.entries(storage)) bus.storage.set(k, v)

  const chromeMock = createChromeMock({ context: "popup", bus })
  if (sendMessageImpl) chromeMock.runtime.sendMessage = vi.fn(sendMessageImpl) as any
  vi.stubGlobal("chrome", chromeMock)
  vi.resetModules()
  const { default: Options } = await import("./options")

  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<Options />)
  })

  return { ...result, chromeMock, bus }
}

/** The font size and background opacity sliders are the only two `<input type="range">` elements, in that order. */
function getFontSizeSlider(): HTMLInputElement {
  return screen.getAllByRole("slider")[0] as HTMLInputElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("options.tsx", () => {
  it("renders default caption settings when nothing is stored", async () => {
    await loadOptions()

    expect(screen.getByText("18px")).toBeInTheDocument()
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign in to captio/i })).toBeInTheDocument()
  })

  it("loads stored caption settings and account info from chrome.storage.local", async () => {
    await loadOptions({ fontSize: 24, textColor: "#00FF00", bgOpacity: 50, userEmail: "sam@example.com" })

    expect(await screen.findByText("24px")).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("sam@example.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument()
  })

  it("updates the live preview font size when the font size slider changes", async () => {
    await loadOptions()

    fireEvent.change(getFontSizeSlider(), { target: { value: "24" } })

    expect(screen.getByText("24px")).toBeInTheDocument()
    const preview = screen.getByText("Preview caption text")
    expect(preview).toHaveStyle({ fontSize: "24px" })
  })

  it("Save settings persists font size, text color, and background opacity, then reverts the label after 2s", async () => {
    const { bus } = await loadOptions()

    fireEvent.change(getFontSizeSlider(), { target: { value: "22" } })

    vi.useFakeTimers()

    const saveButton = screen.getByRole("button", { name: /save settings/i })
    act(() => {
      fireEvent.click(saveButton)
    })

    expect(bus.storage.get("fontSize")).toBe(22)
    expect(bus.storage.get("textColor")).toBe("#FFFFFF")
    expect(bus.storage.get("bgOpacity")).toBe(75)
    expect(screen.getByRole("button", { name: /saved/i })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole("button", { name: /^save settings$/i })).toBeInTheDocument()
  })

  it("Log out sends SIGN_OUT to the background and shows the sign-in button again", async () => {
    // Simulate background.ts's SIGN_OUT handler: clears the cached email and
    // responds ok (see background.ts's own listener for the real
    // implementation — this test only exercises options.tsx's side).
    const { bus } = await loadOptions(
      { userEmail: "sam@example.com" },
      (message, callback) => {
        if (message.type === "SIGN_OUT") {
          bus.storage.delete("userEmail")
          callback?.({ ok: true })
        }
      }
    )

    const logoutButton = await screen.findByRole("button", { name: /log out/i })
    fireEvent.click(logoutButton)

    expect(await screen.findByRole("button", { name: /sign in to captio/i })).toBeInTheDocument()
    expect(bus.storage.has("userEmail")).toBe(false)
  })

  it("changing the Spoken/Caption language selects persists them to chrome.storage.local", async () => {
    const { bus } = await loadOptions()

    fireEvent.change(screen.getByLabelText(/spoken language/i), { target: { value: "es" } })
    fireEvent.change(screen.getByLabelText(/caption language/i), { target: { value: "FR" } })

    expect(bus.storage.get("spokenLanguage")).toBe("es")
    expect(bus.storage.get("captionLanguage")).toBe("FR")
  })

  it("Clear cache only removes keys prefixed with 'transcript:'", async () => {
    const { bus } = await loadOptions()
    bus.storage.set("transcript:abc123", "cached transcript")
    bus.storage.set("transcript:xyz789", "another cached transcript")
    bus.storage.set("fontSize", 18)

    fireEvent.click(screen.getByRole("button", { name: /clear cache/i }))

    expect(bus.storage.has("transcript:abc123")).toBe(false)
    expect(bus.storage.has("transcript:xyz789")).toBe(false)
    expect(bus.storage.has("fontSize")).toBe(true)
  })
})
