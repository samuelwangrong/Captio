/**
 * Background Service Worker
 *
 * Handles:
 * - Calling the Captio transcription API
 * - Caching transcripts by video ID
 * - Sending caption chunks to the content script
 *
 * Note: MV3 service workers are killed after ~30s of inactivity.
 * All state is persisted to chrome.storage.local.
 */

export {}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  start: number   // seconds
  end:   number
  text:  string
}

interface CaptioMessage {
  type:     string
  videoId?: string
  time?:    number
  enabled?: boolean
  language?: string
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getCachedTranscript(videoId: string): Promise<TranscriptEntry[] | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(`transcript:${videoId}`, (result) => {
      resolve(result[`transcript:${videoId}`] ?? null)
    })
  })
}

async function setCachedTranscript(videoId: string, entries: TranscriptEntry[]) {
  chrome.storage.local.set({ [`transcript:${videoId}`]: entries })
}

// ── API call ──────────────────────────────────────────────────────────────────

async function fetchTranscript(videoId: string, language: string): Promise<TranscriptEntry[]> {
  // TODO: replace with your actual backend URL
  const res = await fetch(`https://api.captio.ai/transcribe`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ videoId, language }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: CaptioMessage, _sender, sendResponse) => {
  if (msg.type === "REQUEST_TRANSCRIPT") {
    ;(async () => {
      const { videoId, language = "en-US" } = msg

      if (!videoId) {
        sendResponse({ error: "No videoId provided" })
        return
      }

      // Serve from cache if available
      const cached = await getCachedTranscript(videoId)
      if (cached) {
        sendResponse({ transcript: cached, cached: true })
        return
      }

      try {
        const transcript = await fetchTranscript(videoId, language)
        await setCachedTranscript(videoId, transcript)
        sendResponse({ transcript, cached: false })
      } catch (err) {
        sendResponse({ error: (err as Error).message })
      }
    })()

    // Return true so the message channel stays open for the async response
    return true
  }
})
