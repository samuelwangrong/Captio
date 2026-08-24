import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { toPlainText, type TranscriptSegment } from "@/lib/transcript-export"
import { ExportButtons } from "./ExportButtons"
import { Pagination } from "../Pagination"

interface TranscriptRow {
  id: string
  video_title: string | null
  video_url: string | null
  spoken_language: string
  caption_language: string | null
  segments: TranscriptSegment[]
  created_at: string
}

const PAGE_SIZE = 20

export default async function TranscriptsPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: transcripts, count } = await supabase
    .from("transcripts")
    .select("id, video_title, video_url, spoken_language, caption_language, segments, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<TranscriptRow[]>()

  const hasNext = count !== null && to < count - 1

  async function deleteTranscript(formData: FormData) {
    "use server"
    const id = formData.get("id") as string
    const returnPage = formData.get("page") as string
    const supabase = createClient()
    await supabase.from("transcripts").delete().eq("id", id)
    redirect(`/dashboard/transcripts?page=${returnPage}`)
  }

  return (
    <div>
      <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Transcripts</h1>

      {!transcripts || transcripts.length === 0 ? (
        <p className="text-body text-text-secondary">
          {page > 1
            ? "No more transcripts on this page."
            : "Nothing saved yet — transcripts are saved automatically when you stop captions on a video while signed in."}
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
                    <input type="hidden" name="page" value={page} />
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

      <Pagination basePath="/dashboard/transcripts" page={page} hasNext={hasNext} />
    </div>
  )
}
