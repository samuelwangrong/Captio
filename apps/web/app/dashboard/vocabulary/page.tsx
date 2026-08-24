import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ReviewMode } from "./ReviewMode"
import { Pagination } from "../Pagination"

interface VocabRow {
  id: string
  word: string
  context: string | null
  language: string | null
  video_title: string | null
  created_at: string
}

const PAGE_SIZE = 20
// Review mode cycles through recent words independent of the list's page —
// capped so a heavy user's flashcard deck doesn't pull in the entire table.
const REVIEW_LIMIT = 200

export default async function VocabularyPage({
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

  const [{ data: words, count }, { data: reviewWords }] = await Promise.all([
    supabase
      .from("vocabulary")
      .select("id, word, context, language, video_title, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<VocabRow[]>(),
    supabase
      .from("vocabulary")
      .select("id, word, context, video_title")
      .order("created_at", { ascending: false })
      .limit(REVIEW_LIMIT)
      .returns<Pick<VocabRow, "id" | "word" | "context" | "video_title">[]>(),
  ])

  const hasNext = count !== null && to < count - 1

  async function deleteWord(formData: FormData) {
    "use server"
    const id = formData.get("id") as string
    const returnPage = formData.get("page") as string
    const supabase = createClient()
    await supabase.from("vocabulary").delete().eq("id", id)
    redirect(`/dashboard/vocabulary?page=${returnPage}`)
  }

  return (
    <div>
      <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Vocabulary</h1>

      {!words || words.length === 0 ? (
        <p className="text-body text-text-secondary">
          {page > 1
            ? "No more words on this page."
            : "Nothing saved yet — click any word in the caption overlay while signed in to save it here."}
        </p>
      ) : (
        <>
          {reviewWords && reviewWords.length > 0 && <ReviewMode cards={reviewWords} />}

          <ul className="flex flex-col gap-space-2">
            {words.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-space-4 p-space-3 bg-surface border border-border rounded-md"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold text-primary">{w.word}</p>
                  {w.context && <p className="text-body-sm text-text-secondary truncate">{w.context}</p>}
                </div>
                <form action={deleteWord} className="shrink-0">
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="page" value={page} />
                  <button
                    type="submit"
                    className="text-label text-text-secondary hover:text-error transition-colors"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <Pagination basePath="/dashboard/vocabulary" page={page} hasNext={hasNext} />
        </>
      )}
    </div>
  )
}
