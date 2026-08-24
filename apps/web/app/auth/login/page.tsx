"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AuthLayout } from "../_components/AuthLayout"
import { Divider } from "../_components/Divider"
import { Field } from "../_components/Field"
import { GoogleButton } from "../_components/GoogleButton"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get("source")

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (source === "extension") {
      router.push("/auth/extension-relay")
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Captio account">
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
          placeholder="••••••••"
          rightLabel={
            <Link
              href="/auth/forgot-password"
              className="text-label text-primary hover:underline"
            >
              Forgot?
            </Link>
          }
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
        <Link href="/auth/signup" className="text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
