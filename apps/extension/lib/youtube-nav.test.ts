import { describe, expect, it } from "vitest"
import { getVideoId, isNewVideo } from "./youtube-nav"

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
