import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient, isAccountDeletionConfigured } from "@/lib/supabase/admin"
import { ChangePasswordForm } from "./ChangePasswordForm"
import { DeleteAccountSection } from "./DeleteAccountSection"

export default async function AccountPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  async function deleteAccount() {
    "use server"
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/auth/login")

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw new Error(`Failed to delete account: ${error.message}`)

    await supabase.auth.signOut()
    redirect("/")
  }

  return (
    <div>
      <h1 className="text-headline-lg font-semibold text-primary mb-space-6">Account</h1>

      <section className="mb-space-8">
        <h2 className="text-headline-md text-on-surface mb-space-4">Email</h2>
        <p className="text-body text-on-surface">{user.email}</p>
      </section>

      <section className="mb-space-8">
        <h2 className="text-headline-md text-on-surface mb-space-4">Change password</h2>
        <ChangePasswordForm />
      </section>

      <section>
        <h2 className="text-headline-md text-on-surface mb-space-4">Danger zone</h2>
        {isAccountDeletionConfigured() ? (
          <DeleteAccountSection email={user.email!} deleteAccount={deleteAccount} />
        ) : (
          <p className="text-body-sm text-text-secondary">
            Self-serve account deletion isn&apos;t set up yet — set{" "}
            <code className="text-accent">SUPABASE_SERVICE_ROLE_KEY</code> in the server environment
            to enable it (see <code className="text-accent">apps/web/.env.local.example</code>). Until
            then, contact us to have your account deleted.
          </p>
        )}
      </section>
    </div>
  )
}
