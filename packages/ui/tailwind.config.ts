import type { Config } from "tailwindcss"

// Shared design tokens extracted from Stitch output
// Single source of truth for both the extension and web app
const config: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Core surfaces
        bg: "#0F0F0F",
        surface: "#1A1A1A",
        "surface-raised": "#242424",
        "surface-container": "#1e1f27",
        "surface-container-high": "#292932",
        "surface-container-lowest": "#0d0e15",
        "surface-variant": "#34343d",
        border: "#2E2E2E",
        "outline-variant": "#454654",

        // Brand
        accent: "#5B6EF5",
        "accent-hover": "#4A5CE0",
        primary: "#bcc2ff",
        "primary-container": "#5B6EF5",
        "primary-fixed": "#dfe0ff",
        "primary-fixed-dim": "#bcc2ff",

        // Text
        "text-primary": "#F2F2F2",
        "text-secondary": "#888888",
        "on-surface": "#e3e1ed",
        "on-surface-variant": "#c5c5d7",

        // Semantic
        success: "#34C759",
        warning: "#FF9F0A",
        error: "#FF453A",
        "error-container": "#93000a",

        // Caption overlay
        "caption-overlay-bg": "rgba(0, 0, 0, 0.75)",

        // Misc material tokens
        secondary: "#c8c6c5",
        "secondary-container": "#474746",
        "on-secondary": "#313030",
        "on-secondary-fixed": "#1c1b1b",
        "on-secondary-fixed-variant": "#474746",
        tertiary: "#ffb784",
        "tertiary-container": "#db761d",
        "on-tertiary": "#502500",
        "inverse-surface": "#e3e1ed",
        "inverse-on-surface": "#2f3038",
        "inverse-primary": "#3b4ed6",
        outline: "#8f8fa0",
        background: "#12131b",
        "on-background": "#e3e1ed",
        "on-primary": "#001999",
        "on-primary-container": "#001587",
        "on-primary-fixed": "#000c61",
        "on-primary-fixed-variant": "#1c32be",
        "on-error": "#690005",
        "on-error-container": "#ffdad6",
        "surface-bright": "#383841",
        "surface-dim": "#12131b",
        "surface-tint": "#bcc2ff",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "0.5rem",
        full: "999px",
      },
      spacing: {
        "space-1": "4px",
        "space-2": "8px",
        "space-3": "12px",
        "space-4": "16px",
        "space-6": "24px",
        "space-8": "32px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      fontSize: {
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        button: ["14px", { lineHeight: "16.8px", fontWeight: "500" }],
        label: ["11px", { lineHeight: "13.2px", fontWeight: "500" }],
        body: ["14px", { lineHeight: "21px", fontWeight: "400" }],
        "headline-md": ["16px", { lineHeight: "19.2px", fontWeight: "600" }],
        "headline-lg": ["20px", { lineHeight: "24px", fontWeight: "600" }],
      },
    },
  },
}

export default config
