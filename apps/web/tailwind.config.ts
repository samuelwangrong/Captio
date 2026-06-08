import type { Config } from "tailwindcss"
import sharedConfig from "../../packages/ui/tailwind.config"

const config: Config = {
  ...sharedConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
}

export default config
