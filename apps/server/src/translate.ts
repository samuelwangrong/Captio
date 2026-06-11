/**
 * translate.ts — thin client for the DeepL API.
 *
 * Used by proxy.ts to translate finalized Deepgram transcripts into the
 * user's chosen "Caption language" before forwarding them to the extension.
 *
 * Design notes (see docs/translation-research.md for full rationale):
 *  - `source_lang` is intentionally never sent — DeepL auto-detects the
 *    source language from the text itself. This means any "Spoken
 *    language" / "Caption language" combination the pickers allow is a
 *    valid DeepL request by construction.
 *  - DeepL Free API keys end in ":fx" and must use the api-free.deepl.com
 *    host; Pro keys use api.deepl.com. `deeplApiUrl()` picks the right one.
 *  - Only `is_final: true` transcripts are translated (see proxy.ts) — this
 *    module itself is agnostic to that and just translates whatever text
 *    it's given.
 */

export interface TranslateResult {
  /** The translated text. */
  translatedText: string
  /** Source language DeepL auto-detected (e.g. "EN", "JA"). */
  detectedSourceLang: string
}

export interface TranslateOptions {
  /** DeepL API key. Defaults to process.env.DEEPL_API_KEY. */
  apiKey?: string
  /** Override the DeepL API base URL (mainly for tests). */
  apiUrl?: string
  /** Injectable fetch implementation (mainly for tests). */
  fetchFn?: typeof fetch
}

/** A function that translates `text` into `targetLang`, or null on failure. */
export type TranslateFn = (text: string, targetLang: string) => Promise<TranslateResult | null>

/**
 * DeepL API free-tier keys always end in ":fx" and must be sent to
 * api-free.deepl.com instead of api.deepl.com.
 * https://developers.deepl.com/docs/api-reference/translate
 */
export function deeplApiUrl(apiKey: string): string {
  const host = apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  return `https://${host}/v2/translate`
}

/**
 * Translate `text` into `targetLang` using the DeepL API.
 *
 * Returns `null` (rather than throwing) on any failure — translation is a
 * best-effort enhancement, and a missing/failed translation should never
 * take down the live-caption pipeline.
 */
export async function translateText(
  text: string,
  targetLang: string,
  options: TranslateOptions = {}
): Promise<TranslateResult | null> {
  const apiKey = options.apiKey ?? process.env.DEEPL_API_KEY ?? ''
  const fetchFn = options.fetchFn ?? fetch

  if (!apiKey) {
    console.error('[translate] DEEPL_API_KEY is not set — skipping translation')
    return null
  }

  if (!text.trim()) return null

  const apiUrl = options.apiUrl ?? deeplApiUrl(apiKey)

  try {
    const res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // No `source_lang` — DeepL auto-detects from `text`. See module docstring.
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang,
      }),
    })

    if (!res.ok) {
      console.error(`[translate] DeepL API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data = (await res.json()) as {
      translations?: Array<{ text: string; detected_source_language: string }>
    }
    const translation = data.translations?.[0]
    if (!translation) return null

    return {
      translatedText: translation.text,
      detectedSourceLang: translation.detected_source_language,
    }
  } catch (err) {
    console.error('[translate] DeepL request failed:', (err as Error).message)
    return null
  }
}

/**
 * Default DeepL-backed TranslateFn, bound to the given options.
 * Used by createDeepgramProxy when no `translateFn` override is supplied.
 */
export function createDeepLTranslateFn(options: TranslateOptions = {}): TranslateFn {
  return (text, targetLang) => translateText(text, targetLang, options)
}
