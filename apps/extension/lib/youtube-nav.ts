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
