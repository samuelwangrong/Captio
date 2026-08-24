import { existsSync } from "node:fs"
import path from "node:path"
import { test as base, chromium, type BrowserContext } from "@playwright/test"

// This package has no "type": "module" in package.json, so Playwright
// transforms and runs test files as CommonJS — `__dirname` is available as
// a native CJS module variable. (Deriving it from `import.meta.url` instead
// causes esbuild/Playwright to emit a broken CJS/ESM hybrid module here —
// "ReferenceError: exports is not defined in ES module scope".)

// build/chrome-mv3-prod is produced by `pnpm build` (plasmo build). Despite
// the name, this is the only static build `plasmo build` can produce —
// Plasmo hardcodes NODE_ENV=production for the `build` command, so
// `chrome-mv3-dev` is never an output of it. That directory only exists
// while `plasmo dev`'s long-running watcher is active, which isn't suitable
// for a one-shot e2e run — so we test against the prod build, same as CI.
export const EXTENSION_PATH = path.resolve(__dirname, "../../build/chrome-mv3-prod")

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(
        `Extension build not found at ${EXTENSION_PATH}.\n` +
          "Run `pnpm --filter extension build` (or `pnpm build:extension` from the repo root) before running e2e tests."
      )
    }

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        // MV3 service workers only run in the new headless mode.
        "--headless=new",
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    })

    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers()
    if (!worker) {
      worker = await context.waitForEvent("serviceworker", { timeout: 15_000 })
    }

    const extensionId = worker.url().split("/")[2]
    await use(extensionId)
  },
})

export const expect = test.expect
