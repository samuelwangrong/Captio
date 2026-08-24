"use client"

import { useState } from "react"

export function DeleteAccountSection({
  email,
  deleteAccount,
}: {
  email: string
  deleteAccount: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-body text-error hover:underline"
      >
        Delete account
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-space-3">
      <p className="text-body-sm text-text-secondary">
        This permanently deletes your account and everything tied to it — saved transcripts,
        vocabulary, and settings. This can&apos;t be undone. Type your email (
        <span className="text-on-surface">{email}</span>) to confirm.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={email}
        className="w-full h-[38px] bg-surface-raised border border-border rounded-sm px-space-3 text-body text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-error transition-colors"
      />
      <div className="flex gap-space-2">
        <button
          onClick={() => {
            setConfirming(false)
            setConfirmText("")
          }}
          className="px-space-4 h-9 bg-surface-raised border border-border rounded-sm text-button text-on-surface hover:border-accent transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={confirmText !== email || deleting}
          onClick={async () => {
            setDeleting(true)
            await deleteAccount()
          }}
          className="px-space-4 h-9 bg-error text-white text-button font-medium rounded-sm transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Permanently delete my account"}
        </button>
      </div>
    </div>
  )
}
