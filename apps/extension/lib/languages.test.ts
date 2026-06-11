import { describe, expect, it } from "vitest"
import {
  CAPTION_LANGUAGES,
  DEFAULT_CAPTION_LANGUAGE,
  DEFAULT_SPOKEN_LANGUAGE,
  SPOKEN_LANGUAGES,
  getDeepLTargetLang,
  isSameLanguage,
} from "./languages"

describe("SPOKEN_LANGUAGES", () => {
  it("has 'English' as the first entry (no Auto-detect option)", () => {
    expect(SPOKEN_LANGUAGES[0].code).toBe("en")
    expect(SPOKEN_LANGUAGES[0].label).toBe("English")
  })

  it("has unique codes", () => {
    const codes = SPOKEN_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("every entry has a non-empty label and flag", () => {
    for (const lang of SPOKEN_LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0)
      expect(lang.flag.length).toBeGreaterThan(0)
    }
  })
})

describe("CAPTION_LANGUAGES", () => {
  it("has 'English (US)' as the first entry (no Same as spoken option)", () => {
    expect(CAPTION_LANGUAGES[0].code).toBe("EN-US")
    expect(CAPTION_LANGUAGES[0].label).toBe("English (US)")
  })

  it("has unique codes", () => {
    const codes = CAPTION_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("uses uppercase DeepL target_lang codes", () => {
    for (const lang of CAPTION_LANGUAGES) {
      expect(lang.code).toBe(lang.code.toUpperCase())
    }
  })
})

describe("isSameLanguage", () => {
  it("matches identical codes", () => {
    expect(isSameLanguage("en", "en")).toBe(true)
  })

  it("matches a Deepgram code against a DeepL code with the same base language", () => {
    expect(isSameLanguage("en", "EN-US")).toBe(true)
    expect(isSameLanguage("pt-BR", "PT-BR")).toBe(true)
    expect(isSameLanguage("zh", "ZH-HANS")).toBe(true)
    expect(isSameLanguage("zh-TW", "ZH-HANT")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(isSameLanguage("FR", "fr")).toBe(true)
  })

  it("returns false for different languages", () => {
    expect(isSameLanguage("en", "ES")).toBe(false)
    expect(isSameLanguage("ko", "EN-US")).toBe(false)
  })
})

describe("getDeepLTargetLang", () => {
  it("returns undefined when the Caption language matches the Spoken language (no translation)", () => {
    expect(getDeepLTargetLang("en", "EN-US")).toBeUndefined()
    expect(getDeepLTargetLang("fr", "FR")).toBeUndefined()
  })

  it("returns the Caption language when it differs from the Spoken language", () => {
    expect(getDeepLTargetLang("en", "ES")).toBe("ES")
    expect(getDeepLTargetLang("fr", "PT-BR")).toBe("PT-BR")
  })
})

describe("defaults", () => {
  it("defaults to English (Spoken) and English (US) (Caption)", () => {
    expect(DEFAULT_SPOKEN_LANGUAGE).toBe("en")
    expect(DEFAULT_CAPTION_LANGUAGE).toBe("EN-US")
    expect(SPOKEN_LANGUAGES.some((l) => l.code === DEFAULT_SPOKEN_LANGUAGE)).toBe(true)
    expect(CAPTION_LANGUAGES.some((l) => l.code === DEFAULT_CAPTION_LANGUAGE)).toBe(true)
  })

  it("the default Caption language is the same language as the default Spoken language (no translation by default)", () => {
    expect(isSameLanguage(DEFAULT_SPOKEN_LANGUAGE, DEFAULT_CAPTION_LANGUAGE)).toBe(true)
  })
})
