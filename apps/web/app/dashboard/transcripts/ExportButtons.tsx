"use client"

import { toPlainText, toSrt, type TranscriptSegment } from "@/lib/transcript-export"

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportButtons({
  segments,
  videoTitle,
}: {
  segments: TranscriptSegment[]
  videoTitle: string
}) {
  const baseName = videoTitle.replace(/[^\w\-() ]+/g, "").trim() || "transcript"

  return (
    <div className="flex items-center gap-space-2">
      <button
        onClick={() => download(`${baseName}.txt`, toPlainText(segments), "text/plain")}
        className="px-space-3 h-8 bg-surface-raised border border-border rounded-sm text-label text-on-surface hover:border-accent transition-colors"
      >
        Export .txt
      </button>
      <button
        onClick={() => download(`${baseName}.srt`, toSrt(segments), "application/x-subrip")}
        className="px-space-3 h-8 bg-surface-raised border border-border rounded-sm text-label text-on-surface hover:border-accent transition-colors"
      >
        Export .srt
      </button>
    </div>
  )
}
