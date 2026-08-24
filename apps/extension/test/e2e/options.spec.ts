import { expect, test } from "./fixtures"

/**
 * E2E tests for the options page, loaded as a real page inside the
 * extension's persistent context (chrome-extension://<id>/options.html).
 * Uses the real chrome.storage.local — no mocks.
 */

test.describe("options page", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    // Start each test from a clean slate.
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.evaluate(() => new Promise<void>((resolve) => chrome.storage.local.clear(() => resolve())))
    await page.close()
  })

  test("saving caption settings persists them across reloads via chrome.storage.local", async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByText("18px")).toBeVisible()

    // Drive the slider via real keyboard input rather than setting `.value`
    // and dispatching a synthetic event — React's controlled-input value
    // tracking ignores direct DOM mutation, so onChange never fires for that
    // approach. Default fontSize is 18, step is 1, target is 24 -> 6 presses.
    const fontSizeSlider = page.getByRole("slider").first()
    await fontSizeSlider.focus()
    for (let i = 0; i < 6; i++) {
      await fontSizeSlider.press("ArrowRight")
    }
    await expect(page.getByText("24px")).toBeVisible()

    await page.getByRole("button", { name: /save settings/i }).click()
    await expect(page.getByRole("button", { name: /saved/i })).toBeVisible()

    await page.reload()
    await expect(page.getByText("24px")).toBeVisible()

    const stored = await page.evaluate(
      () => new Promise((resolve) => chrome.storage.local.get(["fontSize"], resolve))
    )
    expect(stored).toMatchObject({ fontSize: 24 })
  })

  test("clear cache removes only transcript: prefixed keys", async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          chrome.storage.local.set({ "transcript:abc123": "cached text", fontSize: 22 }, () => resolve())
        )
    )

    await page.getByRole("button", { name: /clear cache/i }).click()

    await expect
      .poll(() =>
        page.evaluate(() => new Promise((resolve) => chrome.storage.local.get(null, resolve)))
      )
      .toMatchObject({ fontSize: 22 })

    const remaining = (await page.evaluate(
      () => new Promise((resolve) => chrome.storage.local.get(null, resolve))
    )) as Record<string, unknown>
    expect(remaining).not.toHaveProperty("transcript:abc123")
  })
})
