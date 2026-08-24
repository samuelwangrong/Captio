import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Custom storage adapter that proxies Supabase's auth token storage through
// chrome.storage.local instead of localStorage (which isn't available in
// service workers or offscreen documents).
const chromeStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((resolve) =>
      chrome.storage.local.get(key, (result) => resolve(result[key] ?? null))
    ),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise((resolve) =>
      chrome.storage.local.set({ [key]: value }, resolve)
    ),
  removeItem: (key: string): Promise<void> =>
    new Promise((resolve) => chrome.storage.local.remove(key, resolve)),
}

export const supabase = createSupabaseClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)
