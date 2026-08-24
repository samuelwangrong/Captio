import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border h-14 flex items-center justify-between px-space-6">
        <span className="text-headline-md font-bold text-primary tracking-tight">Captio</span>
        <nav className="flex items-center gap-space-4">
          <Link
            href="/auth/login"
            className="text-body text-on-surface-variant hover:text-primary transition-colors"
          >
            Sign in
          </Link>
          <a
            href="https://chromewebstore.google.com"
            target="_blank"
            rel="noreferrer"
            className="h-9 px-space-4 bg-accent hover:bg-accent-hover text-white text-button font-medium rounded-sm transition-colors flex items-center"
          >
            Add to Chrome
          </a>
        </nav>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section
          className="min-h-[70vh] flex flex-col items-center justify-center text-center px-space-4 py-space-8"
          style={{
            background: "radial-gradient(circle at 50% -20%, #1e1f27 0%, #0F0F0F 70%)",
          }}
        >
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-white mb-space-4 max-w-3xl leading-tight">
            Captions that<br />actually work.
          </h1>
          <p className="text-lg text-text-secondary mb-space-8 max-w-xl">
            Whisper-powered accuracy, full style control, and language learning — all on top of YouTube.
          </p>
          <div className="flex flex-col sm:flex-row gap-space-4 items-center">
            <a
              href="https://chromewebstore.google.com"
              target="_blank"
              rel="noreferrer"
              className="h-9 px-space-6 bg-accent hover:bg-accent-hover text-white text-button font-medium rounded-sm transition-colors flex items-center gap-space-2 shadow-lg"
            >
              <ChromeIcon />
              Add to Chrome — it&apos;s free
            </a>
            <Link
              href="/auth/signup"
              className="h-9 px-space-6 border border-border hover:bg-surface-raised text-on-surface text-button font-medium rounded-sm transition-colors flex items-center"
            >
              Create account
            </Link>
          </div>
        </section>

        {/* Demo screenshot */}
        <section className="max-w-5xl mx-auto px-space-4 -mt-16 mb-space-8">
          <div className="relative rounded-xl overflow-hidden border border-border bg-surface-container shadow-2xl">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500/50" />
              </div>
              <div className="mx-auto bg-surface-raised px-4 py-1 rounded text-[10px] text-text-secondary font-mono border border-border">
                youtube.com
              </div>
            </div>
            {/* Mock player */}
            <div className="aspect-video bg-black flex items-end justify-center pb-14 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-surface-container to-black opacity-60" />
              <div
                className="relative z-10 px-4 py-2 rounded-sm text-center"
                style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
              >
                <span
                  className="text-white font-medium"
                  style={{ fontSize: "18px", letterSpacing: "0.01em" }}
                >
                  Captions that actually work.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Value props */}
        <section className="max-w-5xl mx-auto px-space-6 py-space-8 grid grid-cols-1 md:grid-cols-3 gap-space-6">
          {[
            {
              icon: "🎯",
              title: "More accurate",
              desc:  "Whisper AI handles accents, technical jargon, and fast speech that YouTube's auto-captions miss.",
            },
            {
              icon: "🎨",
              title: "Fully customisable",
              desc:  "Control font size, color, and background. Captions that look how you want them.",
            },
            {
              icon: "🆓",
              title: "Free to start",
              desc:  "Install the extension and get better captions immediately. No credit card required.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="p-space-6 bg-surface border border-border rounded-xl hover:border-accent/40 transition-colors"
            >
              <div className="text-3xl mb-space-4">{card.icon}</div>
              <h3 className="text-headline-md text-white mb-space-2">{card.title}</h3>
              <p className="text-body-sm text-text-secondary leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-space-8 mt-auto">
        <div className="max-w-5xl mx-auto px-space-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-body-sm text-text-secondary">© {new Date().getFullYear()} Captio. All rights reserved.</span>
          <div className="flex gap-space-6">
            <Link href="/privacy" className="text-body-sm text-text-secondary hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms"   className="text-body-sm text-text-secondary hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ChromeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" fill="white" />
      <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 3a3 3 0 0 1 2.6 1.5H21a9 9 0 0 1 0 1.5H7.4A3 3 0 0 1 12 5z" opacity=".3" />
    </svg>
  )
}
