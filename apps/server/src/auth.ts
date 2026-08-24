import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface AuthUser {
  sub: string
  email: string
}

/** The only part of SupabaseClient this module actually calls — lets tests inject a minimal fake. */
export interface MinimalAuthClient {
  auth: {
    getUser: SupabaseClient['auth']['getUser']
  }
}

export interface VerifyTokenOptions {
  /** Supabase project URL. Defaults to process.env.SUPABASE_URL. */
  url?: string
  /** Supabase anon key. Defaults to process.env.SUPABASE_ANON_KEY. */
  anonKey?: string
  /**
   * Injectable client for tests — bypasses real client creation and the
   * env-var configured-check entirely, so tests can supply a fake with a
   * mocked `auth.getUser`.
   */
  client?: MinimalAuthClient
}

export function isAuthConfigured(options: Pick<VerifyTokenOptions, 'url' | 'anonKey'> = {}): boolean {
  const url = options.url ?? process.env.SUPABASE_URL
  const anonKey = options.anonKey ?? process.env.SUPABASE_ANON_KEY
  return !!(url && anonKey)
}

/**
 * Verifies a Supabase access token by asking Supabase itself (auth.getUser)
 * rather than verifying it locally against a static secret.
 *
 * Why: Supabase Auth can sign tokens with either the legacy shared HMAC
 * secret or newer asymmetric JWT Signing Keys (any project that has rotated
 * — Settings -> JWT Keys -> JWT Signing Keys — issues the latter). Verifying
 * locally requires knowing which one is currently in use and keeping up with
 * rotations; asking Supabase directly works correctly regardless, with zero
 * key management here. The cost is one network round trip per /transcribe
 * connection (not per audio chunk), which is negligible.
 */
export async function verifySupabaseToken(token: string, options: VerifyTokenOptions = {}): Promise<AuthUser | null> {
  if (!options.client && !isAuthConfigured(options)) {
    console.warn('[captio server] SUPABASE_URL/SUPABASE_ANON_KEY not set — auth check skipped')
    return null
  }

  const supabase =
    options.client ??
    createClient(options.url ?? process.env.SUPABASE_URL!, options.anonKey ?? process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return { sub: data.user.id, email: data.user.email ?? '' }
}
