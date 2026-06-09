import { useEffect, useState } from "react"
import "./style.css"

export default function Options() {
  const [fontSize,  setFontSize]  = useState(18)
  const [textColor, setTextColor] = useState("#FFFFFF")
  const [bgOpacity, setBgOpacity] = useState(75)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => {
    chrome.storage.local.get(
      ["fontSize", "textColor", "bgOpacity", "userEmail"],
      (result) => {
        if (result.fontSize)              setFontSize(result.fontSize)
        if (result.textColor)             setTextColor(result.textColor)
        if (result.bgOpacity !== undefined) setBgOpacity(result.bgOpacity)
        if (result.userEmail)             setUserEmail(result.userEmail)
      }
    )
  }, [])

  const handleSave = () => {
    chrome.storage.local.set({ fontSize, textColor, bgOpacity })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogout = () => {
    chrome.storage.local.remove(["userEmail", "userToken"])
    setUserEmail(null)
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

        {/* Account */}
        <section className="mb-space-8">
          <h2 className="text-headline-md text-on-surface mb-space-4">Account</h2>
          <div className="bg-surface border border-border rounded-xl p-space-6">
            {userEmail ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body text-on-surface">{userEmail}</p>
                  <p className="text-body-sm text-accent">Pro Account</p>
                </div>
                <button onClick={handleLogout} className="text-body text-error hover:underline">
                  Log out
                </button>
              </div>
            ) : (
              <a href="https://captio.ai/auth/login" target="_blank" rel="noreferrer"
                className="text-body text-accent hover:underline">
                Sign in to Captio
              </a>
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
