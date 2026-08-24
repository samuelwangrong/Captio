import Link from "next/link"

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center px-4 font-sans"
      style={{
        background:
          "radial-gradient(circle at center, rgba(91,110,245,0.06) 0%, transparent 70%), #0F0F0F",
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-space-8">
          <Link
            href="/"
            className="text-headline-lg font-bold text-primary tracking-tight mb-space-3"
          >
            Captio
          </Link>
          <h1 className="text-headline-md text-on-surface">{title}</h1>
          <p className="text-body-sm text-text-secondary mt-space-1">{subtitle}</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-space-6">
          {children}
        </div>
      </div>
    </div>
  )
}
