import { useEffect, useState } from "react"
import "./style.css"
import {
  CAPTION_LANGUAGES,
  DEFAULT_CAPTION_LANGUAGE,
  DEFAULT_SPOKEN_LANGUAGE,
  SPOKEN_LANGUAGES,
  STORAGE_KEYS,
} from "./lib/languages"

export default function Options() {
  const [fontSize,  setFontSize]  = useState(18)
  const [textColor, setTextColor] = useState("#FFFFFF")
  const [bgOpacity, setBgOpacity] = useState(75)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)
  const [spokenLanguage, setSpokenLanguage]     = useState(DEFAULT_SPOKEN_LANGUAGE)
  const [captionLanguage, setCaptionLanguage]   = useState(DEFAULT_CAPTION_LANGUAGE)

  useEffect(() => {
    chrome.storage.local.get(
      ["fontSize", "textColor", "bgOpacity", "userEmail", STORAGE_KEYS.spokenLanguage, STORAGE_KEYS.captionLanguage],
      (result) => {
        if (result.fontSize)              setFontSize(result.fontSize)
        if (result.textColor)             setTextColor(result.textColor)
        if (result.bgOpacity !== undefined) setBgOpacity(result.bgOpacity)
        if (result.userEmail)             setUserEmail(result.userEmail)
        if (result[STORAGE_KEYS.spokenLanguage])  setSpokenLanguage(result[STORAGE_KEYS.spokenLanguage])
        if (result[STORAGE_KEYS.captionLanguage]) setCaptionLanguage(result[STORAGE_KEYS.captionLanguage])
      }
    )

    // Prefer the live Supabase session over the cached userEmail above.
    try {
      chrome.runtime.sendMessage({ type: "GET_AUTH_SESSION" }, (response) => {
        if (chrome.runtime.lastError) return
        const email = response?.session?.user?.email ?? null
        if (email) setUserEmail(email)
      })
    } catch { /* extension context invalidated on hot-reload */ }
  }, [])

  const handleSave = () => {
    chrome.storage.local.set({ fontSize, textColor, bgOpacity })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSpokenLanguageChange = (value: string) => {
    setSpokenLanguage(value)
    chrome.storage.local.set({ [STORAGE_KEYS.spokenLanguage]: value })
  }

  const handleCaptionLanguageChange = (value: string) => {
    setCaptionLanguage(value)
    chrome.storage.local.set({ [STORAGE_KEYS.captionLanguage]: value })
  }

  const handleLogout = () => {
    try {
      chrome.runtime.sendMessage({ type: "SIGN_OUT" }, () => setUserEmail(null))
    } catch { /* extension context invalidated on hot-reload */ }
  }

  const handleSignIn = () => {
    try {
      chrome.runtime.sendMessage({ type: "OPEN_SIGN_IN" })
    } catch { /* extension context invalidated on hot-reload */ }
  }

  const handleClearCache = () => {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter((k) => k.startsWith("transcript:"))
      chrome.storage.local.remove(keys)
    })
  }

  const previewBg = `rgba(0, 0, 0, ${bgOpacity / 100})`

  return (
    <div className="dark bg-bg text-text-primary min-h-screen font-sans">
      <div className="max-w-[560px] mx-auto px-space-8 py-space-8">

        <div className="flex items-center gap-space-3 mb-space-8">
          <span className="text-headline-lg font-bold text-primary">Captio</span>
          <span className="text-body-sm text-text-secondary">Settings</span>
        </div>

        {/* Captions */}
        <section className="mb-space-8">
          <h2 className="text-headline-md text-on-surface mb-space-4">Captions</h2>
          <div className="bg-surface border border-border rounded-xl p-space-6 space-y-space-6">

            {/* Live preview */}
            <div className="w-full rounded-lg flex items-center justify-center py-8" style={{ background: "#111" }}>
              <span
                className="px-4 py-2 rounded-sm font-medium"
                style={{ fontSize: `${fontSize}px`, color: textColor, backgroundColor: previewBg, letterSpacing: "0.01em" }}
              >
                Preview caption text
              </span>
            </div>

            {/* Font size */}
            <div>
              <div className="flex justify-between mb-space-2">
                <label className="text-label text-text-secondary">Font size</label>
                <span className="text-label text-accent">{fontSize}px</span>
              </div>
              <input type="range" min={14} max={28} value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-accent" />
              <div className="flex justify-between text-label text-text-secondary mt-space-1">
                <span>14px</span><span>28px</span>
              </div>
            </div>

            {/* Text color */}
            <div className="flex items-center justify-between">
              <label className="text-body text-on-surface">Text color</label>
              <input type="color" value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent" />
            </div>

            {/* Background opacity */}
            <div>
              <div className="flex justify-between mb-space-2">
                <label className="text-label text-text-secondary">Background opacity</label>
                <span className="text-label text-accent">{bgOpacity}%</span>
              </div>
              <input type="range" min={0} max={100} value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))}
                className="w-full accent-accent" />
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="mb-space-8">
          <h2 className="text-headline-md text-on-surface mb-space-4">Language</h2>
          <div className="bg-surface border border-border rounded-xl p-space-6 space-y-space-4">
            <div className="flex items-center justify-between gap-space-4">
              <label className="text-body text-on-surface" htmlFor="spoken-language">Spoken language</label>
              <select
                id="spoken-language"
                value={spokenLanguage}
                onChange={(e) => handleSpokenLanguageChange(e.target.value)}
                className="bg-surface-raised border border-border rounded-sm px-space-3 py-space-2 text-body text-on-surface focus:outline-none focus:border-accent"
              >
                {SPOKEN_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-space-4">
              <label className="text-body text-on-surface" htmlFor="caption-language">Caption language</label>
              <select
                id="caption-language"
                value={captionLanguage}
                onChange={(e) => handleCaptionLanguageChange(e.target.value)}
                className="bg-surface-raised border border-border rounded-sm px-space-3 py-space-2 text-body text-on-surface focus:outline-none focus:border-accent"
              >
                {CAPTION_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="mb-space-8">
          <h2 className="text-headline-md text-on-surface mb-space-4">Account</h2>
          <div className="bg-surface border border-border rounded-xl p-space-6">
            {userEmail ? (
              <div className="flex items-center justify-between">
                <p className="text-body text-on-surface">{userEmail}</p>
                <button onClick={handleLogout} className="text-body text-error hover:underline">
                  Log out
                </button>
              </div>
            ) : (
              <button onClick={handleSignIn} className="text-body text-accent hover:underline">
                Sign in to Captio
              </button>
            )}
          </div>
        </section>

        {/* Storage */}
        <section className="mb-space-8">
          <h2 className="text-headline-md text-on-surface mb-space-4">Storage</h2>
          <div className="bg-surface border border-border rounded-xl p-space-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-on-surface">Cached transcripts</p>
                <p className="text-body-sm text-text-secondary">Clears all locally stored transcripts</p>
              </div>
              <button onClick={handleClearCache}
                className="text-body text-text-secondary border border-border px-space-4 py-space-2 rounded-sm hover:border-error hover:text-error transition-colors">
                Clear cache
              </button>
            </div>
          </div>
        </section>

        <button onClick={handleSave}
          className="w-full h-9 bg-accent hover:bg-accent-hover text-white font-medium rounded-sm transition-colors">
          {saved ? "Saved ✓" : "Save settings"}
        </button>

      </div>
    </div>
  )
}
