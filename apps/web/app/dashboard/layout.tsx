import Link from "next/link"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg font-sans" style={{ background: "#0F0F0F" }}>
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-space-4 h-14 flex items-center justify-between">
          <span className="text-[15px] font-bold text-primary tracking-tight">Captio</span>
          <nav className="flex items-center gap-space-6">
            <Link href="/dashboard" className="text-body-sm text-on-surface hover:text-primary transition-colors">
              Overview
            </Link>
            <Link
              href="/dashboard/transcripts"
              className="text-body-sm text-on-surface hover:text-primary transition-colors"
            >
              Transcripts
            </Link>
            <Link
              href="/dashboard/vocabulary"
              className="text-body-sm text-on-surface hover:text-primary transition-colors"
            >
              Vocabulary
            </Link>
            <Link
              href="/dashboard/explore"
              className="text-body-sm text-on-surface hover:text-primary transition-colors"
            >
              Explore
            </Link>
            <Link
              href="/dashboard/account"
              className="text-body-sm text-on-surface hover:text-primary transition-colors"
            >
              Account
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-space-4 py-space-8">{children}</main>
    </div>
  )
}
