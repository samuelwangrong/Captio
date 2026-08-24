import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { toPlainText, type TranscriptSegment } from "@/lib/transcript-export"
import { ExportButtons } from "./ExportButtons"

interface TranscriptRow {
  id: string
  video_title: string | null
  video_url: string | null
  spoken_language: string
  caption_language: string | null
  segments: TranscriptSegment[]
  created_at: string
}

export default async function TranscriptsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id, video_title, video_url, spoken_language, caption_language, segments, created_at")
    .order("created_at", { ascending: false })
    .returns<TranscriptRow[]>()

  async function deleteTranscript(formData: FormData) {
    "use server"
    const id = formData.get("id") as string
    const supabase = createClient()
    await supabase.from("transcripts").delete().eq("id", id)
    redirect("/dashboard/transcripts")
  }

  return (
    <div>
      <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Transcripts</h1>

      {!transcripts || transcripts.length === 0 ? (
        <p className="text-body text-text-secondary">
          Nothing saved yet — transcripts are saved automatically when you stop captions on a video
          while signed in.
        </p>
      ) : (
        <ul className="flex flex-col gap-space-3">
          {transcripts.map((t) => {
            const preview = toPlainText(t.segments).slice(0, 220)
            return (
              <li key={t.id} className="p-space-4 bg-surface border border-border rounded-md">
                <div className="flex items-start justify-between gap-space-4 mb-space-2">
                  <div className="min-w-0">
                    {t.video_url ? (
                      <a
                        href={t.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-body font-semibold text-primary hover:underline truncate block"
                      >
                        {t.video_title || "Untitled video"}
                      </a>
                    ) : (
                      <p className="text-body font-semibold text-primary truncate">
                        {t.video_title || "Untitled video"}
                      </p>
                    )}
                    <p className="text-body-sm text-text-secondary">
                      {new Date(t.created_at).toLocaleString()} · {t.spoken_language}
                      {t.caption_language ? ` → ${t.caption_language}` : ""} · {t.segments.length} segments
                    </p>
                  </div>
                  <form action={deleteTranscript}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="text-label text-text-secondary hover:text-error transition-colors shrink-0"
                    >
                      Delete
                    </button>
                  </form>
                </div>
                <p className="text-body-sm text-on-surface mb-space-3">
                  {preview}
                  {preview.length === 220 ? "…" : ""}
                </p>
                <ExportButtons segments={t.segments} videoTitle={t.video_title || "transcript"} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
