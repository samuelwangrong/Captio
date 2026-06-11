/**
 * lib/tab-resolver.ts — resolves which tab TRANSCRIPT messages should be
 * delivered to.
 *
 * MV3 service workers can be killed and restarted at any time, wiping
 * in-memory state. To survive this, the background service worker persists
 * `capturedTabId` to chrome.storage.local, and the offscreen document also
 * embeds the tabId in every TRANSCRIPT message as a last-resort fallback.
 *
 * This module contains the pure resolution policy (in-memory -> storage ->
 * message fallback) with all chrome API access injected, so it can be unit
 * tested without any chrome mocks.
 */

export interface TabResolverDeps {
  /** Read the in-memory capturedTabId (may be null after an SW restart). */
  getInMemoryTabId(): number | null
  /** Cache a tabId recovered from storage for subsequent calls. */
  setInMemoryTabId(tabId: number): void
  /** Read the persisted capturedTabId from chrome.storage.local. */
  getStoredTabId(): Promise<number | null>
}

/**
 * Resolve the tab to forward a TRANSCRIPT message to.
 *
 * Resolution order:
 *  1. In-memory `capturedTabId` (fast path, valid while the SW stays alive)
 *  2. `chrome.storage.local` (handles the SW having been restarted)
 *  3. `fallbackTabId` — the tabId embedded in the message by the offscreen
 *     document (most reliable, but only available on TRANSCRIPT messages)
 */
export async function resolveTabId(
  fallbackTabId: number | null | undefined,
  deps: TabResolverDeps
): Promise<number | null> {
  const inMemory = deps.getInMemoryTabId()
  if (inMemory) return inMemory

  const stored = await deps.getStoredTabId()
  if (stored) {
    deps.setInMemoryTabId(stored)
    return stored
  }

  return fallbackTabId ?? null
}
