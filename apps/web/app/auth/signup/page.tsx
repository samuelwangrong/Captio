"use client"

import Link from "next/link"
import { useState } from "react"
import { AuthLayout } from "../_components/AuthLayout"
import { Divider } from "../_components/Divider"
import { Field } from "../_components/Field"
import { GoogleButton } from "../_components/GoogleButton"
import { createClient } from "@/lib/supabase/client"

export default function SignupPage() {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [sent,     setSent]     = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="One step left to get started">
        <div className="text-center py-space-4 flex flex-col gap-space-4">
          <p className="text-body text-on-surface">
            We sent a confirmation link to{" "}
            <span className="text-primary">{email}</span>.
          </p>
          <p className="text-body-sm text-text-secondary">
            Click the link to activate your account, then sign in.
          </p>
          <Link href="/auth/login" className="text-body text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create an account" subtitle="Join the future of precision transcription">
      <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
        <GoogleButton />
        <Divider />

        <Field
          label="Email address"
          id="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@example.com"
        />
        <Field
          label="Password"
          id="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Min. 8 characters"
        />

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
          <Link href="/terms" className="text-primary hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="text-center text-body-sm text-text-secondary mt-space-4">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
