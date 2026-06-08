import type { Config } from "tailwindcss"
import sharedConfig from "../../packages/ui/tailwind.config"

const config: Config = {
  ...sharedConfig,
  content: [
    "./popup.tsx",
    "./options.tsx",
    "./contents/**/*.tsx",
    "./background/**/*.ts",
  ],
}

export default config
