import { useEffect, useState } from "react"
import "./style.css"
import {
  CAPTION_LANGUAGES,
  DEFAULT_CAPTION_LANGUAGE,
  DEFAULT_SPOKEN_LANGUAGE,
  SPOKEN_LANGUAGES,
  STORAGE_KEYS,
} from "./lib/languages"

type Status = "idle" | "transcribing" | "ready" | "error"

const STATUS_CONFIG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle:         { label: "Idle",          color: "bg-text-secondary", pulse: false },
  transcribing: { label: "Transcribing…", color: "bg-warning",        pulse: true  },
  ready:        { label: "Ready",         color: "bg-success",        pulse: false },
  error:        { label: "Error — retry", color: "bg-error",          pulse: false },
}

function Toggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? "bg-accent" : "bg-surface-raised"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${
          active ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  )
}

export default function Popup() {
  const [enabled, setEnabled]       = useState(false)
  const [status, setStatus]         = useState<Status>("idle")
  const [videoTitle, setVideoTitle] = useState("Loading…")
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [spokenLanguage, setSpokenLanguage]   = useState(DEFAULT_SPOKEN_LANGUAGE)
  const [captionLanguage, setCaptionLanguage] = useState(DEFAULT_CAPTION_LANGUAGE)

  useEffect(() => {
    // Prefer the live Supabase session over the cached userEmail in storage.
    try {
      chrome.runtime.sendMessage({ type: "GET_AUTH_SESSION" }, (response) => {
        if (chrome.runtime.lastError) {
          // Fall back to storage if the background isn't ready.
          chrome.storage.local.get(["userEmail"], (r) => {
            if (r.userEmail) setUserEmail(r.userEmail)
          })
          return
        }
        const email = response?.session?.user?.email ?? null
        if (email) {
          setUserEmail(email)
        } else {
          // No live session — check legacy storage key.
          chrome.storage.local.get(["userEmail"], (r) => {
            if (r.userEmail) setUserEmail(r.userEmail)
          })
        }
      })
    } catch {
      chrome.storage.local.get(["userEmail"], (r) => {
        if (r.userEmail) setUserEmail(r.userEmail)
      })
    }

    // Restore the "Spoken language" / "Caption language" picker choices.
    chrome.storage.local.get(
      [STORAGE_KEYS.spokenLanguage, STORAGE_KEYS.captionLanguage],
      (result) => {
        if (result[STORAGE_KEYS.spokenLanguage]) {
          setSpokenLanguage(result[STORAGE_KEYS.spokenLanguage])
        }
        if (result[STORAGE_KEYS.captionLanguage]) {
          setCaptionLanguage(result[STORAGE_KEYS.captionLanguage])
        }
      }
    )

    // Sync toggle + status with actual background state on open
    try {
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
        if (chrome.runtime.lastError) return
        if (response) {
          setEnabled(response.isCapturing)
          setStatus(response.isCapturing ? "transcribing" : "idle")
        }
      })
    } catch { /* extension context invalidated on hot-reload */ }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const title = tabs[0]?.title?.replace(" - YouTube", "") ?? "YouTube Video"
      setVideoTitle(title)
    })
  }, [])

  const handleToggle = (_val: boolean) => {
    // Query the active tab from the popup context (more reliable than querying from the service worker)
    // then pass the tab ID along with the toggle message.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      try {
        chrome.runtime.sendMessage({ type: "TOGGLE_CAPTIONS", tabId }, (response) => {
          if (chrome.runtime.lastError) return
          if (response) {
            setEnabled(response.isCapturing)
            setStatus(response.isCapturing ? "transcribing" : "idle")
          }
        })
      } catch { /* extension context invalidated on hot-reload */ }
    })
  }

  const handleSpokenLanguageChange = (value: string) => {
    setSpokenLanguage(value)
    chrome.storage.local.set({ [STORAGE_KEYS.spokenLanguage]: value })
  }

  const handleCaptionLanguageChange = (value: string) => {
    setCaptionLanguage(value)
    chrome.storage.local.set({ [STORAGE_KEYS.captionLanguage]: value })
  }

  const openOptions = () => chrome.runtime.openOptionsPage()
  const statusCfg   = STATUS_CONFIG[status]

  return (
    <div className="dark bg-bg text-text-primary w-[360px] h-[480px] flex flex-col overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-space-4 h-14 border-b border-border shrink-0">
        <span className="text-[15px] font-bold text-primary tracking-tight">Captio</span>
        <button
          onClick={openOptions}
          className="p-space-2 rounded-md hover:bg-surface-variant transition-colors"
          aria-label="Open settings"
        >
          <SettingsIcon />
        </button>
      </header>

      <main className="flex-1 px-space-4 py-space-4 flex flex-col">
        {/* Video row */}
        <section className="bg-surface p-space-3 rounded-xl border border-border mb-space-4">
          <div className="flex items-center gap-space-3">
            <YoutubeIcon />
            <div className="flex-1 overflow-hidden">
              <p className="text-body font-semibold truncate">{videoTitle}</p>
              <p className="text-body-sm text-text-secondary">YouTube.com</p>
            </div>
          </div>
        </section>

        {/* Toggle row */}
        <section className="flex items-center justify-between py-space-2 mb-space-4">
          <span className="text-body text-on-surface">Enable on this video</span>
          <Toggle active={enabled} onChange={handleToggle} />
        </section>

        {/* Language pickers */}
        <section className="grid grid-cols-2 gap-space-3 mb-space-4">
          <label className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-wider text-text-secondary">Spoken language</span>
            <select
              value={spokenLanguage}
              onChange={(e) => handleSpokenLanguageChange(e.target.value)}
              className="bg-surface border border-border rounded-lg px-space-2 py-1.5 text-body-sm text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {SPOKEN_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-wider text-text-secondary">Caption language</span>
            <select
              value={captionLanguage}
              onChange={(e) => handleCaptionLanguageChange(e.target.value)}
              className="bg-surface border border-border rounded-lg px-space-2 py-1.5 text-body-sm text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {CAPTION_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Status pill */}
        <section className="flex items-center justify-center py-space-2 mb-space-4">
          <div className="flex items-center gap-space-2 bg-surface px-space-4 py-2 rounded-full border border-border">
            <span className={`w-2.5 h-2.5 rounded-full ${statusCfg.color} ${statusCfg.pulse ? "animate-pulse" : ""}`} />
            <span className="text-label uppercase tracking-wider text-on-surface">{statusCfg.label}</span>
          </div>
        </section>

        <div className="h-px bg-border w-full mt-auto mb-space-4" />

        {/* Account row */}
        <footer>
          {userEmail ? (
            <div className="flex items-center justify-between p-space-3 rounded-lg bg-surface border border-border">
              <div className="flex items-center gap-space-3 overflow-hidden">
                <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {userEmail[0].toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-body-sm font-medium text-on-surface truncate">{userEmail}</span>
                  <span className="text-[10px] text-text-secondary">Captio account</span>
                </div>
              </div>
              <button
                onClick={() => {
                  try {
                    chrome.runtime.sendMessage({ type: "SIGN_OUT" }, () => {
                      setUserEmail(null)
                    })
                  } catch { /* context invalidated */ }
                }}
                className="text-label text-text-secondary hover:text-error transition-colors shrink-0 ml-space-2"
                aria-label="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                try {
                  chrome.runtime.sendMessage({ type: "OPEN_SIGN_IN" })
                } catch { /* context invalidated */ }
              }}
              className="w-full flex items-center justify-center gap-space-2 p-space-3 rounded-lg bg-surface border border-border hover:border-accent transition-colors text-accent text-body font-medium"
            >
              <PersonIcon />
              Sign in
            </button>
          )}
        </footer>
      </main>
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-variant">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function YoutubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z" />
      <polygon fill="white" points="9.8,15.5 15.8,12 9.8,8.5" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}
