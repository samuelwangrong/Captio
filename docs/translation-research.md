# Auto-Detect Source Language + Translated Output Captions — Research

> Status: research only, nothing implemented yet. Goal: figure out the cleanest way to (1) detect the spoken language automatically and feed it to Deepgram, and (2) let users pick a different caption *output* language with translated captions.

> **Update (June 2026):** The "Auto" Spoken language option (`language=multi`) and "Same as spoken" Caption language option described below have since been **removed**. In practice, `language=multi` only transcribes the 10 code-switching languages and silently produced empty/garbled output for everything else (e.g. Korean-only audio). Both pickers now require an explicit choice; "no translation" is now derived automatically by comparing the Spoken/Caption languages (`isSameLanguage` in `apps/extension/lib/languages.ts`) rather than via a separate "Same as spoken" sentinel. The proxy now always requests Deepgram's `model=nova-3`, which covers every language in the Spoken language list monolingually. The rest of this document is kept for historical context on the original design tradeoffs.

These are two separate problems with two separate pipelines. Detection feeds Deepgram (transcription). Translation is a second pass on Deepgram's output text.

---

## 1. Source language detection → Deepgram

**`detect_language=true` does not work on streaming connections** — it's pre-recorded only ([Deepgram docs](https://developers.deepgram.com/docs/language-detection)). Streaming requires `language=<code>` to be set at connection time. So "detect then feed" can't happen *inside* a single streaming session in the literal sense — we need one of these patterns:

### Option A — `language=multi` (Nova-3 multilingual code-switching)
Open the streaming connection with `language=multi`. Nova-3 detects the spoken language at the word level on the fly and transcribes accordingly, no separate detection step needed. Recommended `endpointing=100` for code-switching.

- **Pros:** zero extra latency, one connection, handles videos that mix languages mid-sentence.
- **Cons:** only 10 languages currently supported for multilingual code-switching — EN, ES, FR, DE, PT, HI, RU, JA, IT, NL ([Deepgram Nova-3 multilingual](https://deepgram.com/learn/nova-3-multilingual-major-wer-improvements-across-languages)). A monolingual model is generally more accurate for single-language content than `multi` mode.

### Option B — Bootstrap detect, then reconnect monolingual
Buffer the first ~2-4 seconds of audio, send it to Deepgram's **pre-recorded** REST endpoint with `detect_language=true&model=nova-3-general` (35 languages, returns `detected_language` + `language_confidence`), then open the real-time websocket with `language=<detected>` for the rest of the session.

- **Pros:** full 36-language Nova-2/3 monolingual accuracy for the whole session.
- **Cons:** ~1-2s startup delay before live captions begin; one extra REST call; needs a fallback if `language_confidence` is low (drop to `multi` or ask the user).

### Option C — Manual override (already scaffolded)
DESIGN.md already specs a "Language" dropdown in the popup, and `background/index.ts` already has a `language?: string` field and `SET_LANGUAGE` message stub. Simplest possible version: default to `"Auto"`, let the user pick a specific language to force `language=<code>` on Nova-2/3.

**Decision: keep it simple — a single "Spoken language" picker, no bootstrap-detection step.** This matches how every competitor in §3 does it (a source-language dropdown, with an "Auto" entry rather than hidden inference logic):

- **"Auto"** maps to `language=multi` (Option A) — zero extra latency, one connection, decent accuracy across the 10 code-switching languages.
- **Any specific language** the user picks maps directly to `language=<code>` (Option C) — full 36-language Nova-2/3 monolingual accuracy.

This drops Option B (bootstrap-detect-then-reconnect) entirely — no extra REST call, no startup delay, no confidence-threshold fallback logic to maintain. Users who get poor results on "Auto" can just pick their language from the dropdown, exactly like Maestra/YouTube.

---

## 2. Output language (translated captions)

Deepgram (any model) is **transcription only — it does not translate**. Translating to a different caption language requires a second pipeline stage: take Deepgram's `is_final` transcript text and run it through a machine-translation API before displaying/overlaying it. This is the same pattern every competitor uses (see §3).

### Provider comparison

| Provider | Languages | Latency (text) | Pricing (2026) | Notes |
|---|---|---|---|---|
| **DeepL API** | ~30 "core" languages with full feature support (glossaries, formality, style rules) + ~70 more in beta = 100+ total ([supported languages](https://developers.deepl.com/docs/getting-started/supported-languages)) | Not officially published; generally fast (sub-second) for short strings | New customers: free Developer tier (1M chars one-time), Growth ~$26/mo incl. 12M chars/yr then ~$25/M overage. Legacy Pro API: $5.49/mo + $25/M. | Best-in-class quality for major European/Asian languages. Beta languages are unbilled for now. Also has built-in `detect_language` for *text* (not audio) if ever needed. |
| **Google Cloud Translation v2/v3** | ~130+ languages | 50-200ms — fastest of the bunch | $20 per 1M chars, 500K chars/month free | Lower latency, broadest coverage, simplest pricing. Good fallback for languages DeepL doesn't cover. |
| **Azure AI Translator** | ~100+ languages | Comparable to Google | Similar per-character pricing | Also offers **Azure AI Speech → Speech Translation**, a combined STT+MT service that does detection, transcription, and translation in one streaming connection — a possible *alternative architecture* to Deepgram+MT, but would mean replacing the existing Deepgram pipeline entirely. |
| **LLM (GPT-4o-mini / Claude Haiku, etc.)** | Effectively any language | Higher — cascaded LLM translation runs ~800ms-2s per call; cost-efficient small models exist | Token-based, roughly comparable to or higher than NMT per character at this volume | Better at idioms/slang/context — useful for an optional "natural/learning mode" but too slow/costly to run on every interim caption. |

### Decision
- **DeepL as primary (and only, for now) translator** — quality is genuinely the best for the languages it covers, and Captio's "language learning" angle benefits from DeepL's more natural phrasing. ~100 languages (30 "core" + ~70 beta) covers nearly everything Deepgram can transcribe; a Google Cloud Translation fallback can be added later if a specific source/target pair turns out unsupported.
- Translate **only `is_final: true` Results**, never interim — interim transcripts change too often and would multiply API calls/cost for no benefit, and would cause distracting flicker in translated captions.
- **Output captions show only the translated text** — no dual-subtitle/original-text display in the overlay. Simpler UI, matches the "Caption" overlay spec in DESIGN.md (one sentence per line, no extra clutter). The original transcript is still stored server-side/in the web app for export and language-learning features, just not rendered in the live overlay.
- Treat an LLM-based "natural translation" mode as a v2 stretch goal (e.g., for the web app's language-learning mode, run on saved transcripts rather than live captions).

---

## 3. How competitors do this (validates the architecture above)

- **YouTube auto-translate**: cascaded pipeline — its own ASR (English-only for *live* captions) produces a transcript, then **Google Translate** translates that transcript text into 100+ languages. Quality depends entirely on the ASR step; live auto-translate is English-source only today ([YouTube Help](https://support.google.com/youtube/answer/4792576)).
- **Maestra (Live Voice Translation Chrome extension)**: same cascade — STT with a "source language: Auto Detect or manual" picker, separate "target language" picker for translated captions, optional dual captions (original + translated) and speaker diarization ([Maestra blog](https://maestra.ai/blogs/how-to-live-translate-a-youtube-video)).
- **Language Reactor / dual-subtitle extensions**: render **original + translated subtitles simultaneously** ("dual subs"), with click-to-translate on individual words — a UX pattern worth adopting for Captio's web-app language-learning mode, since it lets learners see both languages at once.

The common shape across all of these: **(source language picker, Auto or manual) → STT → final transcript → MT → (target language picker) → render, often dual-subtitle.** Captio's existing Deepgram pipeline + a new MT stage fits this exactly.

---

## 4. Proposed architecture for Captio

```
Tab audio → AudioWorklet (existing)
   → offscreen.js → proxy.ts (server) → Deepgram websocket
                                            │
                          language = <picked language | "multi" if "Auto">
                                            │
                          Results (is_final=true) ──► NEW: translation step (DeepL)
                                            │              cache by transcript hash
                                            ▼
                          { type: "Results", ... }   +   { type: "Translation", original, translated, lang }
                                            │
                                            ▼
                          extension caption-overlay.tsx
                          (renders ONLY the translated text — original is not shown)
```

Key implementation notes:
- **Do translation server-side** (in `apps/server`, alongside `proxy.ts`), not from the extension directly — keeps the DeepL API key off the client, and centralizes caching/rate-limiting/cost tracking.
- **Two independent settings** in the popup/options UI (extends the existing single "Language" dropdown spec in DESIGN.md):
  - **Spoken language**: "Auto" (→ `language=multi`) or a specific language (→ `language=<code>`) → feeds Deepgram. Default: "Auto".
  - **Caption language**: "Same as spoken" (no translation, default) or a target language → feeds the new DeepL step. If "Same as spoken" the `Translation` step is skipped entirely (zero added cost/latency).
- **Overlay shows translated text only** — no dual-subtitle in the live overlay, keeping it simple and matching the existing "one sentence per line" overlay spec.
- **Web app / transcript export**: still store both original and translated text per segment server-side so exported transcripts and any future language-learning/dual-subtitle features (e.g., in the web app, which has more screen space) can use either — this costs nothing extra since DeepL's response includes both.

---

## 5. Cost & latency back-of-envelope

- Average spoken English ≈ ~150 words/min ≈ ~750 chars/min ≈ **~45K chars/hour** of *final* transcript text (interim text isn't translated, so this is the real volume).
- At DeepL's ~$25/1M char overage rate: roughly **~$1.10/hour** of video translated, negligible per-user but worth metering if usage scales — likely fine to fold into the existing "Pro Account" tier. The free Developer tier (1M chars one-time) covers ~22 hours of translated video before any cost.
- Per-segment translation latency (DeepL, short strings): roughly 100-300ms, applied only on finalized segments — shouldn't be perceptible against Deepgram's own ~300ms endpointing delay.
- "Auto" spoken-language mode (`language=multi`) and "Same as spoken" caption mode both add **zero** extra latency — no bootstrap step, no translation call.

---

## 6. Decisions locked in

- Spoken language: single dropdown, "Auto" (`language=multi`) or specific language (`language=<code>`). No bootstrap-detection step.
- Caption language: separate dropdown, "Same as spoken" (default, no translation) or a target language.
- Translator: **DeepL only** for now, applied to `is_final` transcripts only.
- Overlay renders **translated text only** — no dual-subtitle. Original text still saved server-side for export/web app use later.

## Resolved

1. **Pro-gating**: not gated for now — free for everyone while the feature is being built out.
2. **Unsupported language pairs**: avoided by construction — the "Caption language" dropdown is populated only from DeepL's supported target languages, and DeepL translation calls omit `source_lang` (DeepL auto-detects source from the text itself), so any spoken-language/caption-language combination the pickers allow is valid.
3. **DeepL API key**: set in `apps/server/.env`.

Ready to implement.

---

## Sources
- [Deepgram — Language Detection](https://developers.deepgram.com/docs/language-detection)
- [Deepgram — Multilingual Codeswitching](https://developers.deepgram.com/docs/multilingual-code-switching)
- [Deepgram — Nova-3 Multilingual WER improvements](https://deepgram.com/learn/nova-3-multilingual-major-wer-improvements-across-languages)
- [DeepL API — Supported Languages](https://developers.deepl.com/docs/getting-started/supported-languages)
- [DeepL Pro API](https://www.deepl.com/en/pro-api)
- [Google Cloud Translation Pricing](https://cloud.google.com/translate/pricing)
- [Azure AI Speech — Speech Translation overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-translation)
- [YouTube — Tools to translate your content](https://support.google.com/youtube/answer/4792576)
- [Maestra — Live translate a YouTube video](https://maestra.ai/blogs/how-to-live-translate-a-youtube-video)
- [Language Reactor](https://www.languagereactor.com/)
