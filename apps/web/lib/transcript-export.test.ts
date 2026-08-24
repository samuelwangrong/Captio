import { describe, expect, it } from "vitest"
import { toPlainText, toSrt, type TranscriptSegment } from "./transcript-export"

const segments: TranscriptSegment[] = [
  { text: "Hello there", offsetMs: 0 },
  { text: "how are you", offsetMs: 1500 },
  { text: "doing today", offsetMs: 4200 },
]

describe("toPlainText", () => {
  it("joins segment text with spaces", () => {
    expect(toPlainText(segments)).toBe("Hello there how are you doing today")
  })

  it("returns an empty string for no segments", () => {
    expect(toPlainText([])).toBe("")
  })
})

describe("toSrt", () => {
  it("numbers cues sequentially starting at 1", () => {
    const srt = toSrt(segments)
    expect(srt).toContain("1\n")
    expect(srt).toContain("2\n")
    expect(srt).toContain("3\n")
  })

  it("formats timestamps as HH:MM:SS,mmm and uses the next segment's offset as the end time", () => {
    const srt = toSrt(segments)
    expect(srt).toContain("00:00:00,000 --> 00:00:01,500")
    expect(srt).toContain("00:00:01,500 --> 00:00:04,200")
  })

  it("gives the last cue a +3s fallback end time (no next segment to bound it)", () => {
    const srt = toSrt(segments)
    expect(srt).toContain("00:00:04,200 --> 00:00:07,200")
  })

  it("includes each segment's text under its cue", () => {
    const srt = toSrt(segments)
    expect(srt).toContain("Hello there")
    expect(srt).toContain("how are you")
    expect(srt).toContain("doing today")
  })

  it("rolls over hours/minutes correctly for large offsets", () => {
    const longSegments: TranscriptSegment[] = [
      { text: "start", offsetMs: 0 },
      { text: "an hour and a bit later", offsetMs: 3_725_250 }, // 1h 2m 5.25s
    ]
    const srt = toSrt(longSegments)
    expect(srt).toContain("01:02:05,250")
  })

  it("returns an empty string for no segments", () => {
    expect(toSrt([])).toBe("")
  })
})
