import Link from "next/link"

export const metadata = { title: "Terms of Service — Captio" }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans" style={{ background: "#0F0F0F" }}>
      <div className="max-w-2xl mx-auto px-space-4 py-space-8">
        <Link href="/" className="text-body-sm text-accent hover:underline">
          ← Back to Captio
        </Link>

        <h1 className="text-headline-lg font-bold text-primary mt-space-6 mb-space-2">Terms of Service</h1>
        <p className="text-body-sm text-text-secondary mb-space-8">Last updated: August 2026</p>

        <div className="flex flex-col gap-space-6 text-body text-on-surface leading-relaxed">
          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Using Captio</h2>
            <p>
              Captio is a Chrome extension and web app that generates and displays alternative captions
              for YouTube videos, and lets you save transcripts and vocabulary for your own reference. By
              installing the extension or creating an account, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Acceptable use</h2>
            <p>
              Use Captio for your own viewing and learning. Don&apos;t use it to scrape, redistribute, or
              republish other people&apos;s video content or captions at scale, and don&apos;t attempt to
              disrupt or abuse the transcription service.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">No warranty</h2>
            <p>
              Captio is under active development and provided as-is. Caption accuracy depends on
              third-party speech-to-text and translation services and won&apos;t always be perfect. We
              make no guarantee of uninterrupted availability.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Your account</h2>
            <p>
              You&apos;re responsible for keeping your account credentials secure. You can delete saved
              content or your account at any time — see our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Changes</h2>
            <p>
              We may update these terms as Captio evolves. Material changes will be reflected here with
              an updated date.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
