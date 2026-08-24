import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Admin client using the service role key — bypasses RLS entirely. Only for
 * operations the anon key genuinely can't do (e.g. deleting a user's own
 * auth.users row, which cascades to profiles/transcripts/vocabulary per
 * their `on delete cascade` foreign keys).
 *
 * Server-only: SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so
 * Next.js never inlines it into a client bundle — but never import this
 * file from a "use client" component regardless, and never pass this
 * client (or its results beyond what's needed) back to the browser.
 */
export function isAccountDeletionConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error("createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
