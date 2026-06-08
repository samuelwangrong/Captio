"use client"

import Link from "next/link"
import { useState } from "react"

export default function LoginPage() {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    // TODO: wire up auth (Supabase / NextAuth)
    await new Promise((r) => setTimeout(r, 1000))
    setLoading(false)
    setError("Auth not yet wired up — coming soon.")
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Captio account">
      <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
        <GoogleButton />
        <Divider />

        <Field label="Email address" id="email" type="email" value={email} onChange={setEmail} placeholder="name@example.com" />
        <Field label="Password"      id="password" type="password" value={password} onChange={setPassword} placeholder="••••••••"
          rightLabel={<Link href="/auth/forgot-password" className="text-label text-primary hover:underline">Forgot?</Link>}
        />

        {error && <p className="text-body-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-button font-medium rounded-sm transition-colors mt-space-1"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-body-sm text-text-secondary mt-space-4">
        Don&apos;t have an account?{" "}
        <Link href="/auth/signup" className="text-primary hover:underline">Sign up</Link>
      </p>
    </AuthLayout>
  )
}

// ── Shared auth components ────────────────────────────────────────────────────

export function AuthLayout({
  title, subtitle, children,
}: {
  title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center px-4 font-sans"
      style={{ background: "radial-gradient(circle at center, rgba(91,110,245,0.06) 0%, transparent 70%), #0F0F0F" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-space-8">
          <Link href="/" className="text-headline-lg font-bold text-primary tracking-tight mb-space-3">
            Captio
          </Link>
          <h1 className="text-headline-md text-on-surface">{title}</h1>
          <p className="text-body-sm text-text-secondary mt-space-1">{subtitle}</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-space-6">
          {children}
        </div>
      </div>
    </div>
  )
}

export function GoogleButton() {
  return (
    <button
      type="button"
      className="w-full h-9 bg-surface-raised border border-border rounded-sm flex items-center justify-center gap-space-2 hover:bg-surface-variant transition-colors text-button text-on-surface font-medium"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  )
}

export function Divider() {
  return (
    <div className="flex items-center gap-space-4 my-space-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-label text-text-secondary uppercase tracking-widest">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export function Field({
  label, id, type, value, onChange, placeholder, rightLabel,
}: {
  label: string; id: string; type: string
  value: string; onChange: (v: string) => void
  placeholder: string; rightLabel?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-space-1">
      <div className="flex justify-between items-center px-1">
        <label htmlFor={id} className="text-label text-text-secondary">{label}</label>
        {rightLabel}
      </div>
      <input
        id={id} type={type} value={value} placeholder={placeholder} required
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[38px] bg-surface-raised border border-border rounded-sm px-space-3 text-body text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.443 2.048.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}
