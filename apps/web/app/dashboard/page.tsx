import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const [{ count: transcriptCount }, { count: vocabCount }] = await Promise.all([
    supabase.from("transcripts").select("*", { count: "exact", head: true }),
    supabase.from("vocabulary").select("*", { count: "exact", head: true }),
  ])

  async function signOut() {
    "use server"
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect("/auth/login")
  }

  return (
    <div>
      <p className="text-body text-on-surface mb-space-6">
        Signed in as <span className="text-primary">{user.email}</span>
      </p>

      <div className="grid grid-cols-2 gap-space-4 mb-space-8">
        <Link
          href="/dashboard/transcripts"
          className="p-space-4 bg-surface border border-border rounded-md hover:border-accent transition-colors"
        >
          <p className="text-headline-md font-semibold text-primary">{transcriptCount ?? 0}</p>
          <p className="text-body-sm text-text-secondary">Saved transcripts</p>
        </Link>
        <Link
          href="/dashboard/vocabulary"
          className="p-space-4 bg-surface border border-border rounded-md hover:border-accent transition-colors"
        >
          <p className="text-headline-md font-semibold text-primary">{vocabCount ?? 0}</p>
          <p className="text-body-sm text-text-secondary">Saved words</p>
        </Link>
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="px-space-4 h-9 bg-surface border border-border rounded-sm text-button text-on-surface hover:border-accent transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
