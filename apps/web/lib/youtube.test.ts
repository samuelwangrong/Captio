import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchTrendingVideos, isYoutubeExploreConfigured, YoutubeApiError } from "./youtube"

describe("isYoutubeExploreConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is false when YOUTUBE_API_KEY is unset", () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    expect(isYoutubeExploreConfigured()).toBe(false)
  })

  it("is true when YOUTUBE_API_KEY is set", () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    expect(isYoutubeExploreConfigured()).toBe(true)
  })
})

describe("fetchTrendingVideos", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("throws YoutubeApiError immediately when no API key is configured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    await expect(fetchTrendingVideos("US")).rejects.toThrow(YoutubeApiError)
  })

  it("maps the YouTube API response into YoutubeVideoResult[]", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "abc123",
            snippet: {
              title: "A great video",
              channelTitle: "Cool Channel",
              thumbnails: { medium: { url: "https://img.example/abc123.jpg" } },
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const results = await fetchTrendingVideos("JP")

    expect(results).toEqual([
      {
        id: "abc123",
        title: "A great video",
        channelTitle: "Cool Channel",
        thumbnailUrl: "https://img.example/abc123.jpg",
        url: "https://www.youtube.com/watch?v=abc123",
      },
    ])
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("regionCode=JP")
    expect(url).toContain("chart=mostPopular")
  })

  it("throws YoutubeApiError when the API responds with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "quota exceeded" })
    )
    await expect(fetchTrendingVideos("US")).rejects.toThrow(YoutubeApiError)
  })

  it("falls back to an empty thumbnail and default title/channel when snippet fields are missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: "xyz789", snippet: {} }] }),
    }))

    const [video] = await fetchTrendingVideos("US")
    expect(video.title).toBe("Untitled")
    expect(video.channelTitle).toBe("Unknown channel")
    expect(video.thumbnailUrl).toBe("")
  })
})
