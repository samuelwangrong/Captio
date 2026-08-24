import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  async function signOut() {
    "use server"
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect("/auth/login")
  }

  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center font-sans"
      style={{ background: "#0F0F0F" }}
    >
      <div className="text-center">
        <p className="text-headline-lg font-bold text-primary mb-space-4">Captio</p>
        <p className="text-body text-on-surface mb-space-2">
          Signed in as <span className="text-primary">{user.email}</span>
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-space-6 px-space-4 h-9 bg-surface border border-border rounded-sm text-button text-on-surface hover:border-accent transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
