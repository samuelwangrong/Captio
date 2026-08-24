import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExportButtons } from "./ExportButtons"
import type { TranscriptSegment } from "@/lib/transcript-export"

const segments: TranscriptSegment[] = [
  { text: "Hello there", offsetMs: 0 },
  { text: "how are you", offsetMs: 1500 },
]

describe("ExportButtons", () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock-url")
    revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("renders both export buttons", () => {
    render(<ExportButtons segments={segments} videoTitle="My Video" />)
    expect(screen.getByRole("button", { name: /export \.txt/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /export \.srt/i })).toBeInTheDocument()
  })

  it("clicking Export .txt creates a text/plain blob and triggers a download", async () => {
    const user = userEvent.setup()
    render(<ExportButtons segments={segments} videoTitle="My Video" />)

    await user.click(screen.getByRole("button", { name: /export \.txt/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe("text/plain")
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })

  it("clicking Export .srt creates an application/x-subrip blob", async () => {
    const user = userEvent.setup()
    render(<ExportButtons segments={segments} videoTitle="My Video" />)

    await user.click(screen.getByRole("button", { name: /export \.srt/i }))

    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe("application/x-subrip")
  })

  it("falls back to 'transcript' as the filename base when the title sanitizes to empty", async () => {
    const user = userEvent.setup()
    render(<ExportButtons segments={segments} videoTitle="!!!" />)

    // Capture the filename via the anchor's `download` attribute at click time.
    let downloadName = ""
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download
    })

    await user.click(screen.getByRole("button", { name: /export \.txt/i }))
    expect(downloadName).toBe("transcript.txt")
  })
})
