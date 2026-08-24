import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// The extension content script (contents/auth-relay.ts) is injected on this URL.
// It reads the embedded JSON, stores the session in chrome.storage, and closes the tab.
export default async function ExtensionRelayPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login?source=extension")
  }

  const authData = {
    accessToken:  session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:    session.expires_at,
    email:        session.user.email,
  }

  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center font-sans"
      style={{ background: "#0F0F0F" }}
    >
      {/* Auth payload — read by the extension content script, never shown to users */}
      <script
        id="auth-data"
        type="application/json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled server-side JSON
        dangerouslySetInnerHTML={{ __html: JSON.stringify(authData) }}
      />

      <div className="text-center">
        <p className="text-headline-md text-on-surface mb-space-2">You&apos;re signed in</p>
        <p className="text-body-sm text-text-secondary">
          This tab will close automatically. Return to YouTube to use Captio.
        </p>
      </div>
    </div>
  )
}
