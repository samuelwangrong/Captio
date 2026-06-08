/**
 * Caption Overlay — Content Script
 *
 * Injected into YouTube pages. Hides YouTube's native captions and renders
 * Captio's own overlay div positioned over the video player.
 *
 * Message API (from popup / background):
 *   TOGGLE_CAPTIONS  { enabled: boolean }
 *   SET_LANGUAGE     { language: string }
 *   SHOW_CAPTION     { text: string }
 *   CLEAR_CAPTION    {}
 */

import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useRef, useState } from "react"
import cssText from "data-text:../style.css"

// Tell Plasmo where to inject this content script
export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*"],
  all_frames: false,
}

// Inject Tailwind styles into the shadow DOM
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export default function CaptionOverlay() {
  const [enabled, setEnabled]     = useState(true)
  const [caption, setCaption]     = useState("")
  const [visible, setVisible]     = useState(false)
  const hideTimer                 = useRef<ReturnType<typeof setTimeout>>()

  // Listen for messages from popup and background
  useEffect(() => {
    const handler = (msg: { type: string; [k: string]: unknown }) => {
      switch (msg.type) {
        case "TOGGLE_CAPTIONS":
          setEnabled(msg.enabled as boolean)
          if (!msg.enabled) setCaption("")
          break
        case "SHOW_CAPTION":
          setCaption(msg.text as string)
          setVisible(true)
          clearTimeout(hideTimer.current)
          // Auto-hide after 4 seconds if no new caption arrives
          hideTimer.current = setTimeout(() => setVisible(false), 4000)
          break
        case "CLEAR_CAPTION":
          setVisible(false)
          break
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // Hide YouTube's own captions while Captio is enabled
  useEffect(() => {
    const style = document.createElement("style")
    style.id    = "captio-hide-yt-captions"
    if (enabled) {
      style.textContent = `.ytp-caption-window-container { display: none !important; }`
      document.head.appendChild(style)
    }
    return () => document.getElementById("captio-hide-yt-captions")?.remove()
  }, [enabled])

  if (!enabled || !visible || !caption) return null

  return (
    <div
      className="dark fixed z-[99999] bottom-16 left-0 right-0 flex justify-center px-4 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="inline-block px-4 py-2 rounded-sm shadow-lg max-w-[80vw] text-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
      >
        <span
          className="text-white font-sans font-medium leading-relaxed"
          style={{ fontSize: "18px", letterSpacing: "0.01em" }}
        >
          {caption}
        </span>
      </div>
    </div>
  )
}
