import { expect, test } from "./fixtures"

/**
 * E2E tests for the YouTube content script (contents/youtube.ts).
 *
 * The content script's manifest `matches` pattern is restricted to
 * https://www.youtube.com/*, so we route that origin to a local fixture page
 * that mimics just enough of YouTube's player DOM (#movie_player + a
 * video.video-stream element) for the content script to find and inject its
 * overlay. The extension itself (background service worker, content script)
 * is the real built artifact — only the page content is faked.
 */

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Fixture Video - YouTube</title></head>
  <body>
    <div id="movie_player">
      <video class="video-stream" muted></video>
    </div>
  </body>
</html>`

async function gotoFixtureVideo(page: import("@playwright/test").Page, query = "v=dQw4w9WgXcQ") {
  await page.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: FIXTURE_HTML })
  )
  await page.goto(`https://www.youtube.com/watch?${query}`)
}

test.describe("YouTube content script", () => {
  test("injects the Captio caption overlay into the player", async ({ context }) => {
    const page = await context.newPage()
    await gotoFixtureVideo(page)

    await expect(page.locator("#captio-overlay")).toBeAttached()
    await expect(page.locator("#captio-caption")).toBeAttached()
    await expect(page.locator("#captio-styles")).toBeAttached()
  })

  test("displays a TRANSCRIPT message sent by the background service worker", async ({ context, extensionId }) => {
    const page = await context.newPage()
    await gotoFixtureVideo(page)
    await expect(page.locator("#captio-overlay")).toBeAttached()

    const [worker] = context.serviceWorkers()
    expect(worker).toBeTruthy()
    expect(worker.url()).toContain(extensionId)

    // Simulate background forwarding a Deepgram transcript to this tab, the
    // same way it does after TOGGLE_CAPTIONS + a TRANSCRIPT from the offscreen doc.
    // CAPTIONS_STARTED must come first — that's what shows the caption box
    // (captio-active); TRANSCRIPT alone only fills in the text.
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "CAPTIONS_STARTED" })
          chrome.tabs.sendMessage(tab.id, { type: "TRANSCRIPT", text: "hello from e2e", isFinal: true })
        }
      }
    })

    const caption = page.locator("#captio-caption")
    await expect(caption).toHaveText("hello from e2e")
    await expect(caption).toHaveClass(/captio-active/)
  })

  test("CAPTIONS_STOPPED hides a visible caption", async ({ context }) => {
    const page = await context.newPage()
    await gotoFixtureVideo(page)
    await expect(page.locator("#captio-overlay")).toBeAttached()

    const [worker] = context.serviceWorkers()

    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "CAPTIONS_STARTED" })
          chrome.tabs.sendMessage(tab.id, { type: "TRANSCRIPT", text: "still going", isFinal: false })
        }
      }
    })

    await expect(page.locator("#captio-caption")).toHaveClass(/captio-active/)

    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
      for (const tab of tabs) {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "CAPTIONS_STOPPED" })
      }
    })

    await expect(page.locator("#captio-caption")).not.toHaveClass(/captio-active/)
  })
})
