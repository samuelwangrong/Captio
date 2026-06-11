import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".plasmo", "build", "test/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts", "background.ts", "contents/**/*.ts", "tabs/**/*.tsx", "popup.tsx", "options.tsx"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: [
      // Plasmo's `data-text:` import scheme is a build-time loader that inlines
      // a file's contents as a string. Vitest doesn't understand it, so we
      // redirect any `data-text:*` import to a tiny shim that exports "".
      {
        find: /^data-text:.*$/,
        replacement: path.resolve(__dirname, "test/mocks/data-text.ts"),
      },
    ],
  },
})
