export interface TranscriptSegment {
  text: string
  offsetMs: number
}

export function toPlainText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ")
}

function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)
  const millis = clamped % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, "0")
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

/**
 * Renders segments as an SRT subtitle file. We only have each segment's
 * start offset (not a real end time), so each cue's end is approximated as
 * the next segment's start, or +3s for the last one.
 */
export function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, i) => {
      const start = segment.offsetMs
      const next = segments[i + 1]
      const end = next ? next.offsetMs : segment.offsetMs + 3000
      return `${i + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${segment.text}\n`
    })
    .join("\n")
}
