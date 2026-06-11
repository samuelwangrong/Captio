import { describe, expect, it, vi } from "vitest"
import { resolveTabId, type TabResolverDeps } from "./tab-resolver"

function makeDeps(overrides: Partial<TabResolverDeps> = {}): TabResolverDeps {
  return {
    getInMemoryTabId: () => null,
    setInMemoryTabId: vi.fn(),
    getStoredTabId: async () => null,
    ...overrides,
  }
}

describe("resolveTabId", () => {
  it("returns the in-memory tabId without checking storage", async () => {
    const getStoredTabId = vi.fn(async () => 999)
    const deps = makeDeps({ getInMemoryTabId: () => 42, getStoredTabId })

    await expect(resolveTabId(7, deps)).resolves.toBe(42)
    expect(getStoredTabId).not.toHaveBeenCalled()
  })

  it("falls back to storage when no in-memory tabId, and caches it", async () => {
    const setInMemoryTabId = vi.fn()
    const deps = makeDeps({
      getInMemoryTabId: () => null,
      getStoredTabId: async () => 55,
      setInMemoryTabId,
    })

    await expect(resolveTabId(7, deps)).resolves.toBe(55)
    expect(setInMemoryTabId).toHaveBeenCalledWith(55)
  })

  it("falls back to the message's tabId when memory and storage are empty", async () => {
    const deps = makeDeps({ getInMemoryTabId: () => null, getStoredTabId: async () => null })

    await expect(resolveTabId(123, deps)).resolves.toBe(123)
  })

  it("returns null when memory, storage, and fallback are all empty", async () => {
    const deps = makeDeps({ getInMemoryTabId: () => null, getStoredTabId: async () => null })

    await expect(resolveTabId(null, deps)).resolves.toBeNull()
    await expect(resolveTabId(undefined, deps)).resolves.toBeNull()
  })

  it("treats in-memory tabId 0 as falsy and falls back to storage", async () => {
    // tabId 0 is falsy in JS — resolveTabId's `if (inMemory)` check means a
    // captured tabId of 0 is treated the same as "not set". This documents
    // the existing (real-world-safe, since chrome tab ids start at 1)
    // behavior rather than asserting an idealized one.
    const deps = makeDeps({ getInMemoryTabId: () => 0, getStoredTabId: async () => 88 })

    await expect(resolveTabId(7, deps)).resolves.toBe(88)
  })
})
