/**
 * contents/auth-relay.ts — injected on the web app's /auth/extension-relay*
 * page, in either production (captio.ai) or local dev (localhost:3000).
 *
 * After the user signs in on the web, the relay page embeds the Supabase session
 * in a <script id="auth-data" type="application/json"> element.
 * This content script reads it, forwards it to the background service worker
 * (which calls supabase.auth.setSession), then closes the tab on success —
 * or shows an inline error and leaves the tab open on failure, rather than
 * silently doing nothing (see showError below).
 *
 * `matches` below MUST stay static string literals — Plasmo resolves
 * manifest.json's content_scripts entries at manifest-generation time by
 * statically reading this array, not by running the bundled JS, so
 * `process.env.X` substitution (which works fine elsewhere, e.g.
 * tabs/offscreen.tsx's SERVER_URL) silently resolves to an empty matches
 * list here instead — verified by actually building with a template-literal
 * version of this line and inspecting the output manifest.json. Rather than
 * fight that, this just lists both origins outright: a content script can
 * match multiple static patterns at once, so both prod and local dev work
 * without any env-var trick. The localhost entry is harmless in a real
 * production build — it only ever does anything on a page serving the exact
 * #auth-data element below.
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://captio.ai/auth/extension-relay*",
    "http://localhost:3000/auth/extension-relay*",
  ],
  run_at: "document_idle",
}

function showError(message: string) {
  // Something went wrong — leave the tab open (closing it here would just
  // strand the user with no explanation) and show why, so they at least know
  // to retry rather than assume sign-in silently worked.
  const el = document.createElement("p")
  el.textContent = `Captio couldn't finish signing you in: ${message}. You can close this tab and try again.`
  el.style.cssText = "font-family: sans-serif; color: #F2F2F2; background: #0F0F0F; padding: 24px;"
  document.body.appendChild(el)
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

  console.log("[DEBUG] about to sendMessage")
  try {
    const response = await chrome.runtime.sendMessage({ type: "AUTH_SESSION_RELAY", ...payload })
    console.log("[DEBUG] sendMessage resolved", JSON.stringify(response))
    if (!response?.ok) {
      showError(response?.error ?? "unknown error")
      return
    }
  } catch (err) {
    console.log("[DEBUG] sendMessage rejected", (err as Error).message)
    // Extension context invalidated (e.g. reloaded mid-flow) — nothing to relay to.
    showError((err as Error).message)
    return
  }

  // Small delay so the background has time to persist before we close.
  setTimeout(() => window.close(), 300)
})()
