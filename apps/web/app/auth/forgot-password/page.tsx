"use client"

import Link from "next/link"
import { useState } from "react"
import { AuthLayout, Field } from "../login/page"

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("")
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // TODO: wire up password reset
    await new Promise((r) => setTimeout(r, 1000))
    setLoading(false)
    setSent(true)
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send you a link to reset it">
      {sent ? (
        <div className="text-center py-space-4">
          <p className="text-body text-on-surface mb-space-2">Check your inbox</p>
          <p className="text-body-sm text-text-secondary mb-space-6">
            We sent a reset link to <span className="text-primary">{email}</span>
          </p>
          <Link href="/auth/login" className="text-body text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
          <Field label="Email address" id="email" type="email" value={email} onChange={setEmail} placeholder="name@example.com" />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-button font-medium rounded-sm transition-colors"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <p className="text-center text-body-sm text-text-secondary mt-space-1">
            <Link href="/auth/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
