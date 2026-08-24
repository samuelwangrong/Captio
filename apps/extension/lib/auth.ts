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

export function openSignInPage(): void {
  chrome.tabs.create({ url: "https://captio.ai/auth/login?source=extension" })
}
