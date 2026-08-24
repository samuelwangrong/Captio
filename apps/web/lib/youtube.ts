/**
 * lib/youtube.ts — YouTube Data API v3 client for the "Explore" page
 * (dashboard/explore), which browses trending videos by region as a
 * discovery tool for language learners.
 *
 * Requires YOUTUBE_API_KEY (a Google Cloud API key with the YouTube Data
 * API v3 enabled — see apps/web/.env.local.example). Server-only: never
 * expose this key to the client, so all calls happen in Server Components.
 */

export interface YoutubeRegion {
  code: string
  label: string
  flag: string
}

// A curated subset relevant to language learners, not the full ISO 3166-1
// list — matches the spirit of the extension's SPOKEN_LANGUAGES picker.
export const YOUTUBE_REGIONS: YoutubeRegion[] = [
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "ES", label: "Spain", flag: "🇪🇸" },
  { code: "MX", label: "Mexico", flag: "🇲🇽" },
  { code: "FR", label: "France", flag: "🇫🇷" },
  { code: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "IT", label: "Italy", flag: "🇮🇹" },
  { code: "BR", label: "Brazil", flag: "🇧🇷" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "KR", label: "South Korea", flag: "🇰🇷" },
  { code: "CN", label: "China", flag: "🇨🇳" },
  { code: "RU", label: "Russia", flag: "🇷🇺" },
  { code: "IN", label: "India", flag: "🇮🇳" },
]

export const DEFAULT_REGION = "US"

export interface YoutubeVideoResult {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  url: string
}

export function isYoutubeExploreConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY
}

export class YoutubeApiError extends Error {}

/**
 * Fetches currently-popular videos for a region via videos.list?chart=mostPopular.
 * Throws YoutubeApiError on any non-OK response or missing API key — callers
 * (Server Components) should catch this and render a friendly error state
 * rather than letting the page crash.
 */
export async function fetchTrendingVideos(regionCode: string, maxResults = 12): Promise<YoutubeVideoResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new YoutubeApiError("YOUTUBE_API_KEY is not configured")

  const params = new URLSearchParams({
    part: "snippet",
    chart: "mostPopular",
    regionCode,
    maxResults: String(maxResults),
    key: apiKey,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    // Trending lists change slowly — cache for an hour to conserve API quota
    // (YouTube Data API v3 has a strict daily unit quota).
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new YoutubeApiError(`YouTube API request failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const items: any[] = data.items ?? []

  return items.map((item) => ({
    id: item.id,
    title: item.snippet?.title ?? "Untitled",
    channelTitle: item.snippet?.channelTitle ?? "Unknown channel",
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
    url: `https://www.youtube.com/watch?v=${item.id}`,
  }))
}
