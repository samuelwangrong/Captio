/**
 * lib/youtube-nav.ts — pure helpers for detecting YouTube SPA navigation
 * between videos. YouTube never fully reloads the page between videos, so
 * the content script watches for `yt-navigate-finish` and compares video IDs
 * to decide whether captions should stop.
 */

/**
 * Extract the `v` query parameter (the video ID) from either a full URL
 * or a query/search string (e.g. `location.search`).
 *
 * Returns `null` if there is no `v` parameter (e.g. on the YouTube homepage).
 */
export function getVideoId(input: string): string | null {
  let search = input
  try {
    // If given a full URL, use its search portion.
    search = new URL(input).search
  } catch {
    // Not a full URL — assume `input` is already a search/query string.
  }
  return new URLSearchParams(search).get("v")
}

/**
 * True if navigating from `previousVideoId` to `nextVideoId` represents a
 * different video (and so in-progress captions should be stopped).
 *
 * Returns `false` when the IDs are equal — e.g. returning from fullscreen,
 * where YouTube re-fires `yt-navigate-finish` for the same video.
 */
export function isNewVideo(previousVideoId: string | null, nextVideoId: string | null): boolean {
  return nextVideoId !== previousVideoId
}

/**
 * True if `url` is a youtube.com/watch page with a video id — the only kind
 * of tab contents/youtube.ts's content script actually runs on. Used to
 * disable "Enable on this video" on any other tab: without this guard,
 * toggling it there still captures real tab audio and streams it to
 * Deepgram/DeepL (real, metered cost), but there's no content script
 * anywhere to inject the resulting captions into — a silently broken,
 * silently billed no-op from the user's perspective.
 */
export function isYouTubeWatchUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return /(^|\.)youtube\.com$/.test(parsed.hostname) && parsed.pathname === "/watch" && getVideoId(url) !== null
}
