import Link from "next/link"

export default function NotFound() {
  return (
    <div
      className="min-h-screen bg-bg text-text-primary font-sans flex items-center justify-center"
      style={{ background: "#0F0F0F" }}
    >
      <div className="text-center px-space-4">
        <p className="text-headline-lg font-bold text-primary mb-space-2">Captio</p>
        <p className="text-body text-on-surface mb-space-6">This page doesn&apos;t exist.</p>
        <Link href="/" className="text-body text-accent hover:underline">
          ← Back to Captio
        </Link>
      </div>
    </div>
  )
}
