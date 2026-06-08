# Captio — Design Spec

## Brand

**Tagline:** Captions that actually work.

**Personality:** Clean, trustworthy, fast. Feels like a tool built by someone who cares about the details — not a startup trying too hard. Think Raycast or Linear, not a browser extension from 2015.

---

## Colors

### Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#0F0F0F` | App background |
| `--color-surface` | `#1A1A1A` | Cards, popup background, settings panel |
| `--color-surface-raised` | `#242424` | Hover states, input backgrounds |
| `--color-border` | `#2E2E2E` | Dividers, input borders |
| `--color-accent` | `#5B6EF5` | Primary buttons, active states, links |
| `--color-accent-hover` | `#4A5CE0` | Button hover |
| `--color-text-primary` | `#F2F2F2` | Headlines, body |
| `--color-text-secondary` | `#888888` | Labels, placeholders, metadata |
| `--color-success` | `#34C759` | Ready / transcription complete |
| `--color-warning` | `#FF9F0A` | Transcribing / loading |
| `--color-error` | `#FF453A` | Error states |

### Dark mode only
The product is dark mode only for MVP. YouTube's interface is dark by default — the extension overlay and popup should match that environment.

### Caption overlay colors (on YouTube)
- Default caption text: `#FFFFFF`
- Caption background: `rgba(0, 0, 0, 0.75)` — slightly more opaque than YouTube's default
- User can override these in settings

---

## Typography

**Font:** [Inter](https://fonts.google.com/specimen/Inter) — clean, highly legible at small sizes, widely available.

| Role | Size | Weight | Usage |
|---|---|---|---|
| Heading L | 20px | 600 | Page titles |
| Heading M | 16px | 600 | Section headers, popup title |
| Body | 14px | 400 | General text, settings labels |
| Body Small | 12px | 400 | Metadata, timestamps, hints |
| Caption | 11px | 500 | Tags, status pills |
| Button | 14px | 500 | All buttons |

**Line height:** 1.5 for body, 1.2 for headings.

**Caption overlay text (on YouTube):**
- Size: 18px default (user-adjustable: 14–28px)
- Weight: 500
- Letter spacing: 0.01em
- One sentence per line max

---

## Spacing

Use an 8px base grid. All spacing values are multiples of 4px or 8px.

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight gaps (icon to label) |
| `--space-2` | 8px | Default inner padding |
| `--space-3` | 12px | Between grouped elements |
| `--space-4` | 16px | Section padding |
| `--space-6` | 24px | Between sections |
| `--space-8` | 32px | Page-level padding |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 6px | Inputs, small pills |
| `--radius-md` | 10px | Cards, popup, dropdowns |
| `--radius-lg` | 16px | Modals, larger surfaces |
| `--radius-full` | 999px | Toggles, avatar, status dots |

---

## Components

### Toggle (on/off)
- Track: 36×20px, rounded-full
- Off state: `--color-surface-raised` track, white thumb
- On state: `--color-accent` track, white thumb
- Smooth 150ms ease transition

### Status Pill
Small rounded badge next to the video title in popup.
- **Idle:** grey dot + "Idle" in `--color-text-secondary`
- **Transcribing:** amber dot (pulsing) + "Transcribing…"
- **Ready:** green dot + "Ready"
- **Error:** red dot + "Error — retry"

Dot size: 6px circle. Pulse animation on transcribing state only.

### Buttons
- **Primary:** `--color-accent` background, white text, `--radius-sm`, 36px height, 16px horizontal padding
- **Secondary:** transparent background, `--color-border` border, `--color-text-primary` text
- **Ghost:** no border, `--color-text-secondary` text, hover shows `--color-surface-raised` background
- No shadows on any buttons.

### Inputs
- Background: `--color-surface-raised`
- Border: `--color-border`, 1px
- Focus border: `--color-accent`
- Height: 38px
- Padding: 0 12px
- Radius: `--radius-sm`
- No box-shadow on focus — use border color change only

### Dropdown (language selector)
- Same styling as input
- Custom dropdown list (not native `<select>`)
- Each option: flag emoji + language name
- Max 6 visible rows, scrollable

### Account Pill (in popup)
- Logged in: small avatar (24px circle, initials fallback) + email truncated to 18 chars + chevron
- Logged out: person icon + "Sign in" text in `--color-accent`

---

## Screens

### Popup (360×480px)
Layout top to bottom:
1. **Header row** — Captio wordmark (left) + settings gear icon (right, links to options page)
2. **Video row** — YouTube favicon + truncated video title (current tab)
3. **Toggle row** — "Enable on this video" label + toggle (right-aligned)
4. **Status row** — status pill centered
5. **Divider**
6. **Language row** — "Language" label + compact dropdown (right-aligned)
7. **Divider**
8. **Account row** — account pill full width, tappable

All rows: 48px tall, 16px horizontal padding.

### Options / Settings Page
Single-column layout, max-width 560px, centered.

Sections (separated by headings + dividers):
1. **Captions** — font size slider (14–28px), text color swatch, background opacity slider, preview of caption style on a mock video thumbnail
2. **Language** — default language dropdown
3. **Account** — email displayed, logout button
4. **Storage** — "Clear cached transcripts" ghost button with confirmation

### Landing Page
Single scroll, no navbar for MVP.

Sections:
1. **Hero** — centered layout, wordmark + tagline + two CTAs side by side: "Add to Chrome" (primary) and "Create account" (secondary). Subtle dark gradient background.
2. **Demo** — one GIF or screenshot of Captio captions on a YouTube video. No text needed, let it speak.
3. **Three-point value prop** — icon + one-line description each: "More accurate," "Fully customisable," "Free to start." Horizontal row.
4. **Footer** — Privacy Policy link, Terms link, copyright.

No pricing section, no testimonials, no FAQ for MVP.

### Auth Screens (Sign up / Login)
- Centered card on dark background, 400px wide
- Card: `--color-surface`, `--radius-lg`, 32px padding
- Logo at top, centered
- Input fields stacked with 12px gap
- Google OAuth button above email form, with "or" divider
- Primary CTA button full width
- Toggle link at bottom: "Already have an account? Sign in"

---

## Iconography

Use [Lucide Icons](https://lucide.dev/) — clean, consistent 24px stroke icons. Stroke width: 1.5px. Use `--color-text-secondary` for inactive icons, `--color-text-primary` for active.

Icons used in MVP:
- Settings: `Settings`
- Language: `Globe`
- Account: `CircleUser`
- Toggle feedback: none needed (the toggle itself is sufficient)
- Status dots: CSS only, no icon

---

## Motion

Keep it minimal. Only two animations in the product:

1. **Toggle transition:** 150ms ease, thumb slides + track color changes
2. **Status dot pulse:** `opacity` keyframe animation, 1.5s loop, transcribing state only

No page transitions, no skeleton loaders for MVP — just show content or a simple spinner.

---

## Do Nots

- No gradients on UI elements (hero background gradient is the only exception)
- No drop shadows on cards or buttons
- No rounded corners above 16px except the toggle
- No more than 2 font weights on any one screen
- No illustrations — keep it text and icon only
- No light mode for MVP
