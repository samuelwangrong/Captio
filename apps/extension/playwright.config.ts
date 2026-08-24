import { defineConfig } from "@playwright/test"

/**
 * Playwright config for end-to-end tests of the built Chrome extension.
 *
 * These tests load the real unpacked MV3 extension from build/chrome-mv3-dev
 * into a persistent Chromium context, so they exercise the actual manifest,
 * service worker, popup/options pages, and content script — no chrome.* mocks.
 *
 * Run `pnpm build` (plasmo build, dev target) before `pnpm test:e2e` so
 * build/chrome-mv3-dev exists and reflects the current source.
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
})
