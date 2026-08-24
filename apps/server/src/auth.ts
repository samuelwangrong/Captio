import jwt from 'jsonwebtoken'

export interface AuthUser {
  sub: string
  email: string
}

export function verifySupabaseToken(token: string): AuthUser | null {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    console.warn('[captio server] SUPABASE_JWT_SECRET not set — auth check skipped')
    return null
  }
  try {
    const payload = jwt.verify(token, secret) as { sub: string; email: string }
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}
