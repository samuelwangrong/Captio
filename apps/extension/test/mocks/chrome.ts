/**
 * test/mocks/chrome.ts — hand-rolled `chrome` API mock for unit + integration
 * tests.
 *
 * The extension is split across multiple "contexts" (background service
 * worker, offscreen document, content script, popup/options pages) that
 * communicate via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` /
 * `chrome.runtime.onMessage`. To test cross-context flows faithfully we share
 * a single `MessageBus` between several `chrome` mock instances — one per
 * context — so that a `sendMessage` call from one context is delivered to the
 * `onMessage` listeners registered by the others, just like real Chrome.
 *
 * Usage — single context (e.g. testing background.ts in isolation):
 *
 *   const bus = createMessageBus()
 *   const chrome = createChromeMock({ context: "background", bus })
 *   vi.stubGlobal("chrome", chrome)
 *
 * Usage — cross-context integration test:
 *
 *   const bus = createMessageBus()
 *   const bgChrome = createChromeMock({ context: "background", bus })
 *   const contentChrome = createChromeMock({ context: "content", bus })
 *   const offscreenChrome = createChromeMock({ context: "offscreen", bus })
 *   // install bgChrome as `chrome`, import background.ts so it registers
 *   // its onMessage listener against `bus`'s "background" context, then
 *   // swap in contentChrome / offscreenChrome the same way.
 */

export type ChromeContext = "background" | "offscreen" | "content" | "popup"

export type MessageSender = {
  id?: string
  tab?: { id: number; url?: string }
}

export type MessageListener = (
  message: any,
  sender: MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void

/**
 * Shared state between all `chrome` mock instances created for a given test.
 * Represents the "extension process" — storage and registered listeners are
 * global to the extension, not per-context, but listeners ARE grouped by
 * context so messages can be routed the way Chrome routes them.
 */
export interface MessageBus {
  /** Backing store for chrome.storage.local. */
  storage: Map<string, any>
  /** onMessage listeners registered by each context. */
  contexts: Map<ChromeContext, Set<MessageListener>>
  /** Whether an offscreen document is currently "open" (createDocument called, closeDocument not yet called). */
  offscreenOpen: boolean
  /** Stream id returned by chrome.tabCapture.getMediaStreamId; override per-test. */
  tabCaptureStreamId: string
  /** If set, chrome.tabCapture.getMediaStreamId reports this as chrome.runtime.lastError instead of succeeding. */
  tabCaptureError: string | null
}

export function createMessageBus(): MessageBus {
  return {
    storage: new Map(),
    contexts: new Map(),
    offscreenOpen: false,
    tabCaptureStreamId: "fake-stream-id",
    tabCaptureError: null,
  }
}

function getContextListeners(bus: MessageBus, context: ChromeContext): Set<MessageListener> {
  let listeners = bus.contexts.get(context)
  if (!listeners) {
    listeners = new Set()
    bus.contexts.set(context, listeners)
  }
  return listeners
}

/**
 * Deliver `message` to every listener registered in contexts other than
 * `fromContext` (mirrors chrome.runtime.sendMessage, which does not loop a
 * message back to its own sender).
 *
 * If a listener returns `true`, it has signalled it will call
 * `sendResponse` asynchronously — in that case we leave `callback` pending
 * indefinitely (matching Chrome) rather than racing it with a microtask
 * timeout, so tests can `await` real `await`-chains inside the listener
 * before it calls `sendResponse`. If no listener returns `true` and none
 * responded synchronously, `callback` fires immediately with `undefined`.
 */
function dispatch(
  bus: MessageBus,
  fromContext: ChromeContext,
  message: any,
  sender: MessageSender,
  callback?: (response?: any) => void
) {
  let responded = false
  let asyncResponseExpected = false
  const sendResponse = (response?: any) => {
    if (responded) return
    responded = true
    callback?.(response)
  }

  for (const [ctxName, listeners] of bus.contexts.entries()) {
    if (ctxName === fromContext) continue
    // Real Chrome never delivers chrome.runtime.sendMessage() to content
    // scripts — only chrome.tabs.sendMessage() does (see tabs.sendMessage
    // below, which iterates the "content" bucket directly). Without this,
    // an offscreen->background TRANSCRIPT would double-render in the
    // overlay: once here (a message never actually reachable in real
    // Chrome) and once via background's legitimate tabs.sendMessage forward.
    if (ctxName === "content") continue
    for (const listener of listeners) {
      const result = listener(message, sender, sendResponse)
      if (result === true) asyncResponseExpected = true
    }
  }

  if (callback && !responded && !asyncResponseExpected) {
    callback(undefined)
  }
}

export interface MockChromeOptions {
  /** Which extension context this `chrome` instance represents. */
  context: ChromeContext
  /** Shared bus — pass the same instance across contexts for integration tests. */
  bus: MessageBus
  /** Tab id returned by chrome.tabs.query and used as the implicit "active tab". */
  tabId?: number
  /** Tab URL returned by chrome.tabs.query. */
  tabUrl?: string
  /** Tab title returned by chrome.tabs.query. */
  tabTitle?: string
}

/**
 * Create a `chrome` API mock for one extension context, backed by `bus`.
 * Covers the subset of the chrome.* API used by background.ts, the
 * offscreen document, content scripts, popup.tsx, and options.tsx.
 */
export function createChromeMock(options: MockChromeOptions) {
  const { context, bus } = options
  const tabId = options.tabId ?? 1
  const tabUrl = options.tabUrl ?? "https://www.youtube.com/watch?v=abc123"
  const tabTitle = options.tabTitle ?? "Test Video - YouTube"
  const extensionSender: MessageSender = { id: "test-extension-id" }

  const chromeMock = {
    runtime: {
      lastError: undefined as { message: string } | undefined,

      onMessage: {
        addListener(listener: MessageListener) {
          getContextListeners(bus, context).add(listener)
        },
        removeListener(listener: MessageListener) {
          getContextListeners(bus, context).delete(listener)
        },
        hasListener(listener: MessageListener) {
          return getContextListeners(bus, context).has(listener)
        },
      },

      sendMessage(message: any, callback?: (response?: any) => void) {
        dispatch(bus, context, message, extensionSender, callback)
      },

      getURL(pathName: string) {
        return `chrome-extension://test-extension-id/${pathName.replace(/^\//, "")}`
      },

      getContexts(_filter?: { contextTypes?: string[] }) {
        if (bus.offscreenOpen) {
          return Promise.resolve([{ contextType: "OFFSCREEN_DOCUMENT" }])
        }
        return Promise.resolve([])
      },

      ContextType: {
        OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT",
      },

      openOptionsPage(callback?: () => void) {
        callback?.()
        return Promise.resolve()
      },
    },

    storage: {
      // chrome.storage.local supports both a callback style
      // (get(keys, cb)) and a Promise style (await get(keys)) — popup.tsx
      // and options.tsx use the callback style, background.ts uses Promises.
      local: {
        get(
          keys?: string | string[] | Record<string, any> | null,
          callback?: (items: Record<string, any>) => void
        ) {
          const result: Record<string, any> = {}
          if (keys === undefined || keys === null) {
            for (const [k, v] of bus.storage.entries()) result[k] = v
          } else if (typeof keys === "string") {
            if (bus.storage.has(keys)) result[keys] = bus.storage.get(keys)
          } else if (Array.isArray(keys)) {
            for (const k of keys) {
              if (bus.storage.has(k)) result[k] = bus.storage.get(k)
            }
          } else {
            for (const [k, defaultValue] of Object.entries(keys)) {
              result[k] = bus.storage.has(k) ? bus.storage.get(k) : defaultValue
            }
          }
          if (callback) {
            callback(result)
            return undefined
          }
          return Promise.resolve(result)
        },
        set(items: Record<string, any>, callback?: () => void) {
          for (const [k, v] of Object.entries(items)) bus.storage.set(k, v)
          if (callback) {
            callback()
            return undefined
          }
          return Promise.resolve()
        },
        remove(keys: string | string[], callback?: () => void) {
          for (const k of Array.isArray(keys) ? keys : [keys]) bus.storage.delete(k)
          if (callback) {
            callback()
            return undefined
          }
          return Promise.resolve()
        },
        clear(callback?: () => void) {
          bus.storage.clear()
          if (callback) {
            callback()
            return undefined
          }
          return Promise.resolve()
        },
      },
    },

    tabs: {
      // chrome.tabs.query also supports both callback and Promise styles —
      // popup.tsx uses the callback style.
      query(_queryInfo: any, callback?: (tabs: any[]) => void) {
        const tabs = [{ id: tabId, url: tabUrl, title: tabTitle }]
        if (callback) {
          callback(tabs)
          return undefined
        }
        return Promise.resolve(tabs)
      },
      // chrome.tabs.get(tabId) — MV3 promise-based form, used by background.ts's
      // startCapture() to read the video's title/url for transcript saving.
      get(_targetTabId: number, callback?: (tab: any) => void) {
        const tab = { id: tabId, url: tabUrl, title: tabTitle }
        if (callback) {
          callback(tab)
          return undefined
        }
        return Promise.resolve(tab)
      },
      sendMessage(targetTabId: number, message: any, callback?: (response?: any) => void) {
        const sender: MessageSender = { id: "test-extension-id" }
        let responded = false
        let asyncResponseExpected = false
        const sendResponse = (response?: any) => {
          if (responded) return
          responded = true
          callback?.(response)
        }
        for (const listener of getContextListeners(bus, "content")) {
          const result = listener(message, sender, sendResponse)
          if (result === true) asyncResponseExpected = true
        }
        if (callback && !responded && !asyncResponseExpected) callback(undefined)
        return Promise.resolve()
      },
    },

    tabCapture: {
      getMediaStreamId(_options: { targetTabId?: number }, callback: (streamId: string) => void) {
        if (bus.tabCaptureError) {
          chromeMock.runtime.lastError = { message: bus.tabCaptureError }
          callback("")
          // Clear lastError on next tick, matching Chrome's behavior of only
          // making it available within the callback's synchronous scope.
          queueMicrotask(() => {
            chromeMock.runtime.lastError = undefined
          })
        } else {
          chromeMock.runtime.lastError = undefined
          callback(bus.tabCaptureStreamId)
        }
      },
    },

    offscreen: {
      createDocument(_options: any) {
        bus.offscreenOpen = true
        return Promise.resolve()
      },
      closeDocument() {
        bus.offscreenOpen = false
        return Promise.resolve()
      },
      Reason: {
        USER_MEDIA: "USER_MEDIA",
      },
    },
  }

  return chromeMock
}
