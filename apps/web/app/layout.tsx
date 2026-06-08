import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Captio — Captions that actually work",
  description:
    "Accurate, beautiful captions for YouTube. Whisper-powered transcription with full style control.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
