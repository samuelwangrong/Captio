"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function ChangePasswordForm() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (error) {
      setMessage({ type: "error", text: error.message })
    } else {
      setMessage({ type: "success", text: "Password updated." })
      setPassword("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-space-3">
      <div className="flex flex-col gap-space-1">
        <label htmlFor="new-password" className="text-label text-text-secondary">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          minLength={8}
          className="w-full h-[38px] bg-surface-raised border border-border rounded-sm px-space-3 text-body text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {message && (
        <p className={`text-body-sm ${message.type === "error" ? "text-error" : "text-success"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="self-start px-space-4 h-9 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-button font-medium rounded-sm transition-colors"
      >
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  )
}
