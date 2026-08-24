import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthConfigured, verifySupabaseToken, type MinimalAuthClient } from './auth.js'

function fakeClient(getUser: MinimalAuthClient['auth']['getUser']): MinimalAuthClient {
  return { auth: { getUser } }
}

describe('isAuthConfigured', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalAnonKey = process.env.SUPABASE_ANON_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_ANON_KEY = originalAnonKey
  })

  it('is false when neither env var is set', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    expect(isAuthConfigured()).toBe(false)
  })

  it('is false when only one of the two is set', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    delete process.env.SUPABASE_ANON_KEY
    expect(isAuthConfigured()).toBe(false)
  })

  it('is true when both are set', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    expect(isAuthConfigured()).toBe(true)
  })

  it('explicit options override env vars', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    expect(isAuthConfigured({ url: 'https://project.supabase.co', anonKey: 'anon-key' })).toBe(true)
  })
})

describe('verifySupabaseToken', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalAnonKey = process.env.SUPABASE_ANON_KEY

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_ANON_KEY = originalAnonKey
    vi.restoreAllMocks()
  })

  it('returns null and warns when not configured and no client is injected (dev-open mode)', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY

    const result = await verifySupabaseToken('some-token')

    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('auth check skipped'))
  })

  it('returns the user for a token Supabase reports as valid', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'user-123', email: 'sam@example.com' } },
      error: null,
    }))

    const result = await verifySupabaseToken('good-token', { client: fakeClient(getUser as any) })

    expect(getUser).toHaveBeenCalledWith('good-token')
    expect(result).toEqual({ sub: 'user-123', email: 'sam@example.com' })
  })

  it('returns null when Supabase reports the token as invalid', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'invalid JWT' },
    }))

    const result = await verifySupabaseToken('bad-token', { client: fakeClient(getUser as any) })

    expect(result).toBeNull()
  })

  it('returns null when Supabase reports no error but also no user (defensive)', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: null }))

    const result = await verifySupabaseToken('weird-token', { client: fakeClient(getUser as any) })

    expect(result).toBeNull()
  })

  it("falls back to an empty string when the user has no email (Supabase's User.email is optional)", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'user-456', email: undefined } },
      error: null,
    }))

    const result = await verifySupabaseToken('token', { client: fakeClient(getUser as any) })

    expect(result).toEqual({ sub: 'user-456', email: '' })
  })

  it('an injected client bypasses the env-var configured check entirely', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'user-123', email: 'sam@example.com' } },
      error: null,
    }))

    const result = await verifySupabaseToken('good-token', { client: fakeClient(getUser as any) })

    expect(result).toEqual({ sub: 'user-123', email: 'sam@example.com' })
    expect(console.warn).not.toHaveBeenCalled()
  })
})
