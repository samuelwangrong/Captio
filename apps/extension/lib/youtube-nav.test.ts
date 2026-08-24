import { describe, expect, it } from "vitest"
import { getVideoId, isNewVideo, isYouTubeWatchUrl } from "./youtube-nav"

describe("getVideoId", () => {
  it("extracts the v= param from a full YouTube watch URL", () => {
    expect(getVideoId("https://www.youtube.com/watch?v=abc123&t=10s")).toBe("abc123")
  })

  it("extracts the v= param from a bare query string (location.search)", () => {
    expect(getVideoId("?v=xyz789")).toBe("xyz789")
  })

  it("extracts the v= param from a query string without a leading '?'", () => {
    expect(getVideoId("v=noQuestionMark")).toBe("noQuestionMark")
  })

  it("returns null when there is no v= param", () => {
    expect(getVideoId("?t=10s")).toBeNull()
  })

  it("returns null for an empty string", () => {
    expect(getVideoId("")).toBeNull()
  })

  it("handles a full URL with no query string", () => {
    expect(getVideoId("https://www.youtube.com/watch")).toBeNull()
  })
})

describe("isNewVideo", () => {
  it("returns false when both ids are null", () => {
    expect(isNewVideo(null, null)).toBe(false)
  })

  it("returns false when the id is unchanged", () => {
    expect(isNewVideo("abc123", "abc123")).toBe(false)
  })

  it("returns true when navigating from no video to a video", () => {
    expect(isNewVideo(null, "abc123")).toBe(true)
  })

  it("returns true when the video id changes", () => {
    expect(isNewVideo("abc123", "xyz789")).toBe(true)
  })

  it("returns true when navigating away from a video to none", () => {
    expect(isNewVideo("abc123", null)).toBe(true)
  })
})

describe("isYouTubeWatchUrl", () => {
  it("returns true for a youtube.com/watch URL with a video id", () => {
    expect(isYouTubeWatchUrl("https://www.youtube.com/watch?v=abc123")).toBe(true)
  })

  it("returns true for the bare youtube.com host (no www)", () => {
    expect(isYouTubeWatchUrl("https://youtube.com/watch?v=abc123")).toBe(true)
  })

  it("returns false for the YouTube homepage (no video id)", () => {
    expect(isYouTubeWatchUrl("https://www.youtube.com/")).toBe(false)
  })

  it("returns false for a youtube.com page that isn't /watch", () => {
    expect(isYouTubeWatchUrl("https://www.youtube.com/results?search_query=cats")).toBe(false)
  })

  it("returns false for a non-YouTube site, even one that happens to have a v= param", () => {
    expect(isYouTubeWatchUrl("https://example.com/watch?v=abc123")).toBe(false)
  })

  it("returns false for a lookalike hostname (not an actual youtube.com subdomain)", () => {
    expect(isYouTubeWatchUrl("https://notyoutube.com.evil.com/watch?v=abc123")).toBe(false)
  })

  it("returns false for null/undefined/empty input", () => {
    expect(isYouTubeWatchUrl(null)).toBe(false)
    expect(isYouTubeWatchUrl(undefined)).toBe(false)
    expect(isYouTubeWatchUrl("")).toBe(false)
  })

  it("returns false for an unparseable URL", () => {
    expect(isYouTubeWatchUrl("not a url")).toBe(false)
  })
})
