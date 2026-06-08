"use client"

import Link from "next/link"
import { useState } from "react"
import { AuthLayout, GoogleButton, Divider, Field } from "../login/page"

export default function SignupPage() {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    // TODO: wire up auth
    await new Promise((r) => setTimeout(r, 1000))
    setLoading(false)
    setError("Auth not yet wired up — coming soon.")
  }

  return (
    <AuthLayout title="Create an account" subtitle="Join the future of precision transcription">
      <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
        <GoogleButton />
        <Divider />

        <Field label="Email address" id="email"    type="email"    value={email}    onChange={setEmail}    placeholder="name@example.com" />
        <Field label="Password"      id="password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />

        {error && <p className="text-body-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-button font-medium rounded-sm transition-colors mt-space-1"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-body-sm text-text-secondary mt-space-1">
          By signing up you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">Terms</Link> and{" "}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </form>

      <p className="text-center text-body-sm text-text-secondary mt-space-4">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
