/**
 * contents/auth-relay.ts — injected only on captio.ai/auth/extension-relay*
 *
 * After the user signs in on the web, the relay page embeds the Supabase session
 * in a <script id="auth-data" type="application/json"> element.
 * This content script reads it, forwards it to the background service worker
 * (which calls supabase.auth.setSession), then closes the tab.
 *
 * `matches` below MUST stay a static string literal — Plasmo resolves
 * manifest.json's content_scripts entries at manifest-generation time by
 * statically reading this array, not by running the bundled JS, so
 * `process.env.X` substitution (which works fine elsewhere, e.g.
 * tabs/offscreen.tsx's SERVER_URL) silently resolves to an empty matches
 * list here instead — verified by actually building with a template-literal
 * version of this line and inspecting the output manifest.json. That means
 * this flow's round trip isn't testable against a local web app; only the
 * "open the login page" half is (see lib/auth.ts's openSignInPage).
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://captio.ai/auth/extension-relay*"],
  run_at: "document_idle",
}

;(async () => {
  const el = document.getElementById("auth-data")
  if (!el?.textContent) return

  let payload: {
    accessToken: string
    refreshToken: string
    expiresAt?: number
    email?: string
  }

  try {
    payload = JSON.parse(el.textContent)
  } catch {
    return
  }

  if (!payload.accessToken || !payload.refreshToken) return

  await chrome.runtime.sendMessage({ type: "AUTH_SESSION_RELAY", ...payload })

  // Small delay so the background has time to persist before we close.
  setTimeout(() => window.close(), 300)
})()
