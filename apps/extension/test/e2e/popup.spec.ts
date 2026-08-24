import { expect, test } from "./fixtures"

/**
 * E2E tests for the popup, loaded as a real page inside the extension's
 * persistent context (chrome-extension://<id>/popup.html). This exercises
 * the real chrome.storage.local and chrome.runtime.sendMessage <-> the real
 * background service worker — no mocks.
 */

test.describe("popup", () => {
  test("shows the sign-in link and an idle, off toggle by default", async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`)

    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible()
    await expect(page.getByText("Idle")).toBeVisible()
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })

  test("clicking the settings button opens the options page", async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`)

    const [optionsPage] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: /open settings/i }).click(),
    ])

    await optionsPage.waitForLoadState()
    expect(optionsPage.url()).toContain(`chrome-extension://${extensionId}/options.html`)
  })
})
