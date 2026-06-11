/**
 * Unit tests for translate.ts. All `fetch` calls are mocked — no real
 * DeepL credentials or network access are used.
 */

import { describe, it, expect, vi } from "vitest"
import { deeplApiUrl, translateText, createDeepLTranslateFn } from "./translate.js"

function fakeFetch(response: { ok: boolean; status?: number; statusText?: string; json?: () => Promise<any> }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    json: response.json ?? (async () => ({})),
  }) as unknown as typeof fetch
}

describe("deeplApiUrl", () => {
  it("uses the free-tier host for keys ending in :fx", () => {
    expect(deeplApiUrl("abc123:fx")).toBe("https://api-free.deepl.com/v2/translate")
  })

  it("uses the pro host for keys without :fx", () => {
    expect(deeplApiUrl("abc123")).toBe("https://api.deepl.com/v2/translate")
  })
})

describe("translateText", () => {
  it("returns null and skips the request when no API key is configured", async () => {
    const fetchFn = fakeFetch({ ok: true })
    const result = await translateText("hello", "ES", { apiKey: "", fetchFn })
    expect(result).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("returns null for empty/whitespace-only text without calling the API", async () => {
    const fetchFn = fakeFetch({ ok: true })
    const result = await translateText("   ", "ES", { apiKey: "test-key:fx", fetchFn })
    expect(result).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("sends text and target_lang, omitting source_lang, with the DeepL-Auth-Key header", async () => {
    const fetchFn = fakeFetch({
      ok: true,
      json: async () => ({
        translations: [{ text: "Hola mundo", detected_source_language: "EN" }],
      }),
    })

    const result = await translateText("hello world", "ES", { apiKey: "test-key:fx", fetchFn })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchFn as any).mock.calls[0]
    expect(url).toBe("https://api-free.deepl.com/v2/translate")
    expect(init.method).toBe("POST")
    expect(init.headers["Authorization"]).toBe("DeepL-Auth-Key test-key:fx")

    const body = JSON.parse(init.body)
    expect(body).toEqual({ text: ["hello world"], target_lang: "ES" })
    expect(body.source_lang).toBeUndefined()

    expect(result).toEqual({ translatedText: "Hola mundo", detectedSourceLang: "EN" })
  })

  it("returns null when the DeepL API responds with a non-OK status", async () => {
    const fetchFn = fakeFetch({ ok: false, status: 456, statusText: "Unprocessable Entity" })
    const result = await translateText("hello", "XX", { apiKey: "test-key:fx", fetchFn })
    expect(result).toBeNull()
  })

  it("returns null when the response has no translations", async () => {
    const fetchFn = fakeFetch({ ok: true, json: async () => ({ translations: [] }) })
    const result = await translateText("hello", "ES", { apiKey: "test-key:fx", fetchFn })
    expect(result).toBeNull()
  })

  it("returns null (without throwing) when fetch itself rejects", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch
    const result = await translateText("hello", "ES", { apiKey: "test-key:fx", fetchFn })
    expect(result).toBeNull()
  })
})

describe("createDeepLTranslateFn", () => {
  it("returns a TranslateFn bound to the given options", async () => {
    const fetchFn = fakeFetch({
      ok: true,
      json: async () => ({
        translations: [{ text: "Bonjour", detected_source_language: "EN" }],
      }),
    })

    const translate = createDeepLTranslateFn({ apiKey: "test-key:fx", fetchFn })
    const result = await translate("hello", "FR")

    expect(result).toEqual({ translatedText: "Bonjour", detectedSourceLang: "EN" })
  })
})
