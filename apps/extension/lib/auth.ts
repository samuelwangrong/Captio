import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function setSessionFromRelay(payload: {
  accessToken: string
  refreshToken: string
  expiresAt?: number
  email?: string
}): Promise<void> {
  await supabase.auth.setSession({
    access_token:  payload.accessToken,
    refresh_token: payload.refreshToken,
  })
  if (payload.email) {
    await chrome.storage.local.set({ userEmail: payload.email })
  }
}

// Falls back to the local web app for dev. Note this only gets you to the
// login page locally — the round trip back isn't fully testable locally,
// since contents/auth-relay.ts's `matches` pattern (and the manifest's
// host_permissions) are static values Plasmo resolves at manifest-generation
// time, not runtime, so they can't read this same env var and stay hardcoded
// to the production domain. See contents/auth-relay.ts for details.
const WEB_URL = process.env.PLASMO_PUBLIC_WEB_URL || "https://captio.ai"

export function openSignInPage(): void {
  chrome.tabs.create({ url: `${WEB_URL}/auth/login?source=extension` })
}
