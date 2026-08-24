import Link from "next/link"

export const metadata = { title: "Privacy Policy — Captio" }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans" style={{ background: "#0F0F0F" }}>
      <div className="max-w-2xl mx-auto px-space-4 py-space-8">
        <Link href="/" className="text-body-sm text-accent hover:underline">
          ← Back to Captio
        </Link>

        <h1 className="text-headline-lg font-bold text-primary mt-space-6 mb-space-2">Privacy Policy</h1>
        <p className="text-body-sm text-text-secondary mb-space-8">Last updated: August 2026</p>

        <div className="flex flex-col gap-space-6 text-body text-on-surface leading-relaxed">
          <section>
            <h2 className="text-headline-md text-primary mb-space-2">What we collect</h2>
            <p>
              When you create a Captio account, we collect your email address (via Supabase Auth, or via
              Google if you sign in with Google). If you save transcripts or vocabulary while signed in,
              that content — the video title/URL, caption text, and any words you save — is stored under
              your account so you can view and export it later.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">How captioning works</h2>
            <p>
              When you turn on captions, the extension captures the audio of the current tab and streams
              it through our server to Deepgram (speech-to-text) and, if you&apos;ve selected a different
              Caption language, DeepL (translation) to produce the caption text shown in the overlay.
              Audio is streamed for live transcription only — our server does not record or store the
              audio itself. If you&apos;re signed in and choose to keep a transcript, the resulting text
              (not audio) is saved to your account as described above.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">What we don&apos;t do</h2>
            <p>
              We don&apos;t sell your data. We don&apos;t use your captions or saved vocabulary to train
              models. We don&apos;t track your browsing outside of youtube.com pages where the extension
              is active.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Your data, your control</h2>
            <p>
              You can delete any saved transcript or vocabulary entry at any time from your dashboard.
              To delete your account entirely, contact us and we&apos;ll remove your account and all
              associated data.
            </p>
          </section>

          <section>
            <h2 className="text-headline-md text-primary mb-space-2">Questions</h2>
            <p>
              Captio is an early-stage product — if you have questions about how your data is handled,
              reach out and we&apos;ll answer directly.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
