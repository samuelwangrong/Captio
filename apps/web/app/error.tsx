"use client"

import Link from "next/link"
import { useEffect } from "react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className="min-h-screen bg-bg text-text-primary font-sans flex items-center justify-center"
      style={{ background: "#0F0F0F" }}
    >
      <div className="text-center px-space-4">
        <p className="text-headline-lg font-bold text-primary mb-space-2">Captio</p>
        <p className="text-body text-on-surface mb-space-6">Something went wrong.</p>
        <div className="flex items-center justify-center gap-space-4">
          <button
            onClick={() => reset()}
            className="h-9 px-space-4 bg-accent hover:bg-accent-hover text-white text-button font-medium rounded-sm transition-colors"
          >
            Try again
          </button>
          <Link href="/" className="text-body text-accent hover:underline">
            Back to Captio
          </Link>
        </div>
      </div>
    </div>
  )
}
