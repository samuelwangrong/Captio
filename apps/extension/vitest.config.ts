import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // lib/supabase.ts creates its client at module load time, so any test that
    // transitively imports it (background.ts, offscreen.tsx, popup.tsx all pull
    // in lib/auth.ts -> lib/supabase.ts) needs these set before import — a real
    // .env is not loaded under vitest.
    env: {
      PLASMO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      PLASMO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
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
