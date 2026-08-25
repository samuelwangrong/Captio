import { expect, hasSupabaseCredentials, test } from "./fixtures"

/**
 * E2E test for contents/auth-relay.ts against the localhost:3000 origin —
 * the one a local `pnpm dev:web` actually serves. The content script's
 * manifest matches both https://captio.ai/auth/extension-relay* and
 * http://localhost:3000/auth/extension-relay* (see contents/auth-relay.ts
 * for why both are listed as static entries), so this exercises the same
 * local-dev path a real sign-in would take — only the web app's page content
 * is faked here, the extension is the real built artifact.
 */

const FIXTURE_HTML = (payload: object) => `<!DOCTYPE html>
<html>
  <head><title>Signing you in</title></head>
  <body>
    <script id="auth-data" type="application/json">${JSON.stringify(payload)}</script>
  </body>
</html>`

test.describe("auth relay content script (local dev origin)", () => {
  // A genuinely valid access/refresh token pair can only come from a real
  // sign-in against a real Supabase project, which this e2e run doesn't
  // have. Fake tokens are still a meaningful, realistic case to exercise:
  // Supabase (or, with no Supabase configured at all, the network call
  // itself) will reject them, and the content script must handle that
  // failure visibly rather than silently closing the tab as if it worked —
  // see lib/auth.ts's setSessionFromRelay and contents/auth-relay.ts's
  // showError for the fix this covers.
  test("shows an inline error and leaves the tab open when the relayed session is rejected", async ({
    context,
    extensionId,
  }) => {
    // See fixtures.ts's hasSupabaseCredentials — supabase.auth.setSession()
    // hangs indefinitely (rather than failing fast) against a client built
    // with zero Supabase config, which is this repo's current CI condition.
    // Skip rather than hang the suite; run this locally with a real
    // apps/extension/.env to actually exercise it.
    test.skip(!hasSupabaseCredentials, "requires apps/extension/.env with real Supabase credentials")

    void extensionId // just forces the fixture to wait for the service worker to register
    const page = await context.newPage()
    await page.route("http://localhost:3000/auth/extension-relay*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: FIXTURE_HTML({
          accessToken: "not-a-real-token",
          refreshToken: "not-a-real-token",
          email: "sam@example.com",
        }),
      })
    )

    const [worker] = context.serviceWorkers()
    expect(worker).toBeTruthy()

    await page.goto("http://localhost:3000/auth/extension-relay")

    await expect(page.locator("body")).toContainText("couldn't finish signing you in", { timeout: 10_000 })
    expect(page.isClosed()).toBe(false)

    const stored = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("userEmail", resolve)))
    expect((stored as any).userEmail).toBeUndefined()
  })

  test("does nothing when the page has no #auth-data element", async ({ context }) => {
    const page = await context.newPage()
    await page.route("http://localhost:3000/auth/extension-relay*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!DOCTYPE html><html><body></body></html>" })
    )

    await page.goto("http://localhost:3000/auth/extension-relay")
    // Give any (incorrect) relay attempt a moment to fire, then assert it didn't.
    await page.waitForTimeout(500)

    const [worker] = context.serviceWorkers()
    const stored = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("userEmail", resolve)))
    expect((stored as any).userEmail).toBeUndefined()
    expect(page.isClosed()).toBe(false)
  })
})
