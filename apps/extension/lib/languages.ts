/**
 * lib/languages.ts — language picker data + helpers, shared by popup.tsx
 * (UI) and tabs/offscreen.tsx (which reads the persisted choices and feeds
 * them to the proxy server).
 *
 * Two independent settings, both REQUIRED (see docs/translation-research.md):
 *
 *  - "Spoken language" -> Deepgram `language` query param. Always a specific
 *      Deepgram language code (e.g. "en", "es", "ko") — passed straight
 *      through. There is no "Auto-detect" option: Deepgram's `language=multi`
 *      (Nova-3 multilingual code-switching) only covers 10 languages and
 *      silently fails to transcribe anything outside that set, so every
 *      capture now requires an explicit Spoken language.
 *
 *  - "Caption language" -> DeepL `target_lang` query param. Always a specific
 *      DeepL target language code (e.g. "EN-US", "ES", "PT-BR") — passed
 *      straight through. There is no "Same as spoken" option in the UI;
 *      instead, `getDeepLTargetLang` automatically omits `targetLang` (and
 *      the proxy skips the DeepL call entirely) when the chosen Caption
 *      language is the same language as the chosen Spoken language — see
 *      `isSameLanguage`.
 *
 * Both lists are intentionally curated subsets of what Deepgram/DeepL
 * support — broad enough for everyday use, short enough to be a usable
 * dropdown. `source_lang` is never sent to DeepL (it auto-detects), so any
 * combination of these two pickers is a valid request by construction.
 *
 * Model selection: every Spoken language code below is supported
 * monolingually by Deepgram's nova-3 model (Deepgram's highest-accuracy
 * general-purpose ASR model as of June 2026), so the proxy
 * (apps/server/src/proxy.ts) always requests `model=nova-3` — there's no
 * per-language model map to maintain here.
 */

export interface LanguageOption {
  /** Value stored in chrome.storage.local and used to build query params. */
  code: string
  /** Human-readable name shown in the dropdown. */
  label: string
  /** Flag emoji (or other icon) shown before the label. */
  flag: string
}

export const STORAGE_KEYS = {
  spokenLanguage: "spokenLanguage",
  captionLanguage: "captionLanguage",
} as const

/** Default "Spoken language" — English, Deepgram `language=en`. */
export const DEFAULT_SPOKEN_LANGUAGE = "en"

/** Default "Caption language" — English (US), DeepL `target_lang=EN-US`. */
export const DEFAULT_CAPTION_LANGUAGE = "EN-US"

// ---------------------------------------------------------------------------
// Spoken language (Deepgram `language` param)
// ---------------------------------------------------------------------------

export const SPOKEN_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Spanish", flag: "🇪🇸" },
  { code: "fr", label: "French", flag: "🇫🇷" },
  { code: "de", label: "German", flag: "🇩🇪" },
  { code: "it", label: "Italian", flag: "🇮🇹" },
  { code: "pt", label: "Portuguese", flag: "🇵🇹" },
  { code: "pt-BR", label: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "nl", label: "Dutch", flag: "🇳🇱" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
  { code: "ja", label: "Japanese", flag: "🇯🇵" },
  { code: "ko", label: "Korean", flag: "🇰🇷" },
  { code: "zh", label: "Chinese (Mandarin)", flag: "🇨🇳" },
  { code: "zh-TW", label: "Chinese (Taiwan)", flag: "🇹🇼" },
  { code: "ru", label: "Russian", flag: "🇷🇺" },
  { code: "pl", label: "Polish", flag: "🇵🇱" },
  { code: "sv", label: "Swedish", flag: "🇸🇪" },
  { code: "da", label: "Danish", flag: "🇩🇰" },
  { code: "no", label: "Norwegian", flag: "🇳🇴" },
  { code: "fi", label: "Finnish", flag: "🇫🇮" },
  { code: "tr", label: "Turkish", flag: "🇹🇷" },
  { code: "uk", label: "Ukrainian", flag: "🇺🇦" },
  { code: "vi", label: "Vietnamese", flag: "🇻🇳" },
  { code: "th", label: "Thai", flag: "🇹🇭" },
  { code: "id", label: "Indonesian", flag: "🇮🇩" },
  { code: "ms", label: "Malay", flag: "🇲🇾" },
  { code: "ro", label: "Romanian", flag: "🇷🇴" },
  { code: "hu", label: "Hungarian", flag: "🇭🇺" },
  { code: "cs", label: "Czech", flag: "🇨🇿" },
  { code: "el", label: "Greek", flag: "🇬🇷" },
  { code: "bg", label: "Bulgarian", flag: "🇧🇬" },
  { code: "sk", label: "Slovak", flag: "🇸🇰" },
]

// ---------------------------------------------------------------------------
// Caption language (DeepL `target_lang` param)
// ---------------------------------------------------------------------------
// Codes match DeepL's documented target_lang values exactly:
// https://developers.deepl.com/docs/getting-started/supported-languages

export const CAPTION_LANGUAGES: LanguageOption[] = [
  { code: "EN-US", label: "English (US)", flag: "🇺🇸" },
  { code: "EN-GB", label: "English (UK)", flag: "🇬🇧" },
  { code: "ES", label: "Spanish", flag: "🇪🇸" },
  { code: "FR", label: "French", flag: "🇫🇷" },
  { code: "DE", label: "German", flag: "🇩🇪" },
  { code: "IT", label: "Italian", flag: "🇮🇹" },
  { code: "PT-PT", label: "Portuguese (Portugal)", flag: "🇵🇹" },
  { code: "PT-BR", label: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "NL", label: "Dutch", flag: "🇳🇱" },
  { code: "PL", label: "Polish", flag: "🇵🇱" },
  { code: "RU", label: "Russian", flag: "🇷🇺" },
  { code: "JA", label: "Japanese", flag: "🇯🇵" },
  { code: "KO", label: "Korean", flag: "🇰🇷" },
  { code: "ZH-HANS", label: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "ZH-HANT", label: "Chinese (Traditional)", flag: "🇹🇼" },
  { code: "AR", label: "Arabic", flag: "🇸🇦" },
  { code: "HI", label: "Hindi", flag: "🇮🇳" },
  { code: "TR", label: "Turkish", flag: "🇹🇷" },
  { code: "VI", label: "Vietnamese", flag: "🇻🇳" },
  { code: "TH", label: "Thai", flag: "🇹🇭" },
  { code: "ID", label: "Indonesian", flag: "🇮🇩" },
  { code: "SV", label: "Swedish", flag: "🇸🇪" },
  { code: "DA", label: "Danish", flag: "🇩🇰" },
  { code: "NB", label: "Norwegian", flag: "🇳🇴" },
  { code: "FI", label: "Finnish", flag: "🇫🇮" },
  { code: "EL", label: "Greek", flag: "🇬🇷" },
  { code: "CS", label: "Czech", flag: "🇨🇿" },
  { code: "RO", label: "Romanian", flag: "🇷🇴" },
  { code: "HU", label: "Hungarian", flag: "🇭🇺" },
  { code: "UK", label: "Ukrainian", flag: "🇺🇦" },
  { code: "BG", label: "Bulgarian", flag: "🇧🇬" },
  { code: "SK", label: "Slovak", flag: "🇸🇰" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base language subtag of a language code, lowercased —
 * e.g. "pt-BR" -> "pt", "ZH-HANT" -> "zh", "en" -> "en".
 */
function baseLanguage(code: string): string {
  return code.split("-")[0].toLowerCase()
}

/**
 * Returns true if `captionLanguage` represents the same language as
 * `spokenLanguage` (comparing base language subtags, case-insensitively) —
 * e.g. "en" and "EN-US", or "pt-BR" and "PT-BR".
 */
export function isSameLanguage(spokenLanguage: string, captionLanguage: string): boolean {
  return baseLanguage(spokenLanguage) === baseLanguage(captionLanguage)
}

/**
 * Map a "Caption language" picker value to a DeepL `target_lang`, or
 * `undefined` when it's the same language as the Spoken language — in that
 * case the proxy is told nothing, so it skips the translation step entirely
 * (zero added cost/latency, and real-time interim captions are preserved).
 */
export function getDeepLTargetLang(spokenLanguage: string, captionLanguage: string): string | undefined {
  return isSameLanguage(spokenLanguage, captionLanguage) ? undefined : captionLanguage
}
