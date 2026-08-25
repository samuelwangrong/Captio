import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export interface RelaySessionResult {
  ok: boolean
  error?: string
}

const SET_SESSION_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export async function setSessionFromRelay(payload: {
  accessToken: string
  refreshToken: string
  expiresAt?: number
  email?: string
}): Promise<RelaySessionResult> {
  // setSession can reject (a network-level failure reaching Supabase), hang
  // indefinitely (Supabase unreachable with no fast DNS/connection failure —
  // e.g. misconfigured or unreachable network), or resolve with `error` set
  // (Supabase reachable but rejects the tokens). The caller (background.ts's
  // AUTH_SESSION_RELAY handler) always needs a response to forward back to
  // the content script, or that script's sendMessage call — and the relay
  // tab it's waiting in — hangs forever with zero feedback to the user.
  // Catch all three failure shapes here so callers only ever see a settled
  // RelaySessionResult within a bounded time.
  try {
    const { error } = await withTimeout(
      supabase.auth.setSession({
        access_token:  payload.accessToken,
        refresh_token: payload.refreshToken,
      }),
      SET_SESSION_TIMEOUT_MS,
      "Timed out reaching Supabase"
    )
    if (error) {
      console.error("[captio] Failed to persist relayed session:", error.message)
      return { ok: false, error: error.message }
    }
  } catch (err) {
    console.error("[captio] Failed to persist relayed session:", err)
    return { ok: false, error: (err as Error).message }
  }

  if (payload.email) {
    await chrome.storage.local.set({ userEmail: payload.email })
  }
  return { ok: true }
}

// Falls back to the local web app for dev. Set PLASMO_PUBLIC_WEB_URL=http://localhost:3000
// to test the full sign-in round trip locally — contents/auth-relay.ts
// matches both the production and localhost relay pages, so this works
// end-to-end, not just the "open the login page" half.
const WEB_URL = process.env.PLASMO_PUBLIC_WEB_URL || "https://captio.ai"

export function openSignInPage(): void {
  chrome.tabs.create({ url: `${WEB_URL}/auth/login?source=extension` })
}
