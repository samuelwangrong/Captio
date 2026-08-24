# Captio

> Accurate, beautiful captions for YouTube — Chrome extension + web app.

## What is Captio?

Captio replaces YouTube's auto-generated captions with Deepgram-powered live
transcription (optionally translated via DeepL) that's more accurate across
accents, technical language, and fast speech. The Chrome extension overlays
captions directly on the YouTube player, with customizable styling. The web
app adds caption export, saved vocabulary with a review mode, and a
trending-by-region explorer.

## Monorepo layout

```
apps/
  extension/   Chrome extension (Plasmo + React) — capture, caption overlay,
               popup, options page
  server/      Fastify WebSocket proxy between the extension and
               Deepgram/DeepL
  web/         Next.js 14 (App Router) — auth, dashboard, landing page
packages/
  ui/          Shared Tailwind config (design tokens from DESIGN.md)
supabase/
  migrations/  Postgres schema (profiles, transcripts, vocabulary), all RLS-scoped
```

## Tech stack

- **Extension**: Plasmo, React, TypeScript, Manifest V3 (tabCapture + offscreen document)
- **Server**: Fastify, `@fastify/websocket`, Deepgram (speech-to-text), DeepL (translation)
- **Web**: Next.js 14 App Router, Supabase Auth (`@supabase/ssr`), Tailwind
- **Data**: Supabase (Postgres + Auth), row-level security on every user table
- **Testing**: Vitest + Testing Library across all three apps, Playwright e2e for the extension

## MVP scope

- [x] Chrome extension: improved caption accuracy + styling overlay
- [x] Web app: caption export (.txt / .srt)
- [x] Web app: vocabulary saving (click a word in the overlay) + flashcard review
- [x] Web app: regional content explorer — needs a `YOUTUBE_API_KEY` to activate (see below)

## Local development

Requires Node 20+ and pnpm 9.

```bash
pnpm install

pnpm dev:extension   # apps/extension — load apps/extension/build/chrome-mv3-dev in chrome://extensions
pnpm dev:web         # apps/web — http://localhost:3000
pnpm dev:server      # apps/server — ws://localhost:3001
```

Each app needs its own env file — copy the `.env.example` (or
`.env.local.example` for web) in each app directory and fill in the values:

| App | File | Required for |
|---|---|---|
| `apps/extension` | `.env.example` | Supabase URL/anon key (auth), server WebSocket URL (defaults to localhost for dev — **must** be set to the deployed server before a real build, see Deployment below) |
| `apps/server` | `.env.example` | Deepgram key (required), DeepL key (translation), Supabase JWT secret (auth gate — omit to run open) |
| `apps/web` | `.env.local.example` | Supabase URL/anon key (required), `YOUTUBE_API_KEY` (optional — gates the Explore page), `SUPABASE_SERVICE_ROLE_KEY` (optional — gates self-serve account deletion on /dashboard/account) |

Database schema lives in `supabase/migrations/`. With the [Supabase
CLI](https://supabase.com/docs/guides/cli) and Docker, `supabase start` runs
it all locally; against a hosted project, `supabase link` then `supabase db
push`.

Once `apps/server/.env` has real Deepgram/DeepL keys, sanity-check them
without opening a browser:

```bash
cd apps/server
pnpm verify-keys                     # checks both keys are valid
pnpm verify-keys path/to/audio.wav   # also streams it through a local proxy
                                      # instance and prints the real transcript
```

## Testing

```bash
pnpm typecheck      # all three apps
pnpm test:unit       # all three apps
pnpm --filter extension test:integration
pnpm --filter extension test:e2e   # Playwright, needs `pnpm build:extension` first
```

## Deployment

Deploy the server first — the extension needs its URL to build correctly.

- **Server**: needs a long-lived process, not serverless (it holds WebSocket connections). `apps/server/Dockerfile` builds a standalone image for Fly.io/Railway/Render/any Docker host.
- **Extension**: set `PLASMO_PUBLIC_SERVER_URL` in `apps/extension/.env` to the deployed server's `wss://` URL, *then* `pnpm build:extension` (this bakes the URL in at build time), and upload `apps/extension/build/chrome-mv3-prod` to the Chrome Web Store. Skipping this step ships an extension that only works for whoever happens to be running a local dev server — it silently fails for everyone else.
- **Web**: any Next.js host (Vercel, etc.) — set the env vars above.

## Status

🚧 In development — core MVP scope built; not yet shipped to the Chrome Web Store.
