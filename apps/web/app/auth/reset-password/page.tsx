"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AuthLayout } from "../_components/AuthLayout"
import { Field } from "../_components/Field"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password,  setPassword]  = useState("")
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState("")
  const [confirmed, setConfirmed] = useState(false)

  // Supabase sends the user here with a token in the URL hash.
  // onAuthStateChange fires with event PASSWORD_RECOVERY once the token is consumed.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setConfirmed(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    setError("")

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    router.push("/dashboard")
  }

  if (!confirmed) {
    return (
      <AuthLayout title="Reset your password" subtitle="Verifying your reset link…">
        <div className="text-center py-space-4">
          <p className="text-body-sm text-text-secondary">
            If this page stays blank, the link may have expired.{" "}
            <Link href="/auth/forgot-password" className="text-primary hover:underline">
              Request a new one.
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose something strong">
      <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
        <Field
          label="New password"
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
          className="w-full h-9 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-button font-medium rounded-sm transition-colors"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  )
}
