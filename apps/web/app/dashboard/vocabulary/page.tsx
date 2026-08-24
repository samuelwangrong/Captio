import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ReviewMode } from "./ReviewMode"

interface VocabRow {
  id: string
  word: string
  context: string | null
  language: string | null
  video_title: string | null
  created_at: string
}

export default async function VocabularyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: words } = await supabase
    .from("vocabulary")
    .select("id, word, context, language, video_title, created_at")
    .order("created_at", { ascending: false })
    .returns<VocabRow[]>()

  async function deleteWord(formData: FormData) {
    "use server"
    const id = formData.get("id") as string
    const supabase = createClient()
    await supabase.from("vocabulary").delete().eq("id", id)
    redirect("/dashboard/vocabulary")
  }

  return (
    <div>
      <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Vocabulary</h1>

      {!words || words.length === 0 ? (
        <p className="text-body text-text-secondary">
          Nothing saved yet — click any word in the caption overlay while signed in to save it here.
        </p>
      ) : (
        <>
          <ReviewMode
            cards={words.map((w) => ({ id: w.id, word: w.word, context: w.context, video_title: w.video_title }))}
          />

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
        </>
      )}
    </div>
  )
}
