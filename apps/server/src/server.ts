import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { createDeepgramProxy, type DeepgramProxyOptions } from './proxy.js'
import { isAuthConfigured, verifySupabaseToken, type VerifyTokenOptions } from './auth.js'

export interface BuildServerOptions {
  /**
   * Forwarded to createDeepgramProxy for each /transcribe connection.
   * Tests use this to point at a local mock "Deepgram" server instead of
   * the real wss://api.deepgram.com endpoint.
   */
  proxyOptions?: DeepgramProxyOptions
  /** Disable Fastify's request logging (useful for quiet test output). */
  logger?: boolean
  /** Injectable Supabase client for tests — see auth.ts's VerifyTokenOptions.client. */
  authClient?: VerifyTokenOptions['client']
  /**
   * Total /transcribe connections allowed at once, across all users —
   * Deepgram/DeepL are metered APIs, and this proxy had no ceiling at all
   * before. Defaults to 50, which comfortably covers real usage while
   * bounding worst-case cost from a connection storm (bug or abuse).
   */
  maxConcurrentConnections?: number
  /**
   * Connections allowed at once from the same authenticated user — only
   * enforced when auth is configured (an anonymous/dev-open server has no
   * identity to key this on). Defaults to 3: generous for someone with a
   * couple of tabs open, tight enough that one compromised or malicious
   * account can't multiply the global cap on its own.
   */
  maxConcurrentConnectionsPerUser?: number
}

export async function buildServer(options: BuildServerOptions = {}) {
  const fastify = Fastify({ logger: options.logger ?? true })

  await fastify.register(fastifyWebsocket)

  const maxConcurrentConnections = options.maxConcurrentConnections ?? 50
  const maxConcurrentConnectionsPerUser = options.maxConcurrentConnectionsPerUser ?? 3
  let activeConnections = 0
  const activeConnectionsByUser = new Map<string, number>()

  // Health check — useful for deployment uptime checks
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }))

  // WebSocket proxy endpoint.
  // The extension's offscreen document connects here, sends raw audio binary frames,
  // and receives Deepgram transcript events as JSON strings.
  //
  // Query params (set by the extension from its "Spoken language" / "Caption
  // language" pickers — see lib/languages.ts):
  //   ?language=<deepgram code>   — "Spoken language" (always a specific code, e.g. "en", "ko").
  //   ?targetLang=<deepl code>    — "Caption language". Omitted when it's the same
  //                                 language as the Spoken language (no translation).
  fastify.register(async (instance) => {
    instance.get('/transcribe', { websocket: true }, async (socket, req) => {
      const query = req.query as { language?: string; targetLang?: string; token?: string }

      // Require a valid Supabase access token when auth is configured (or a
      // test client is injected).
      let userId: string | undefined
      if (options.authClient || isAuthConfigured()) {
        const user = query.token ? await verifySupabaseToken(query.token, { client: options.authClient }) : null
        if (!user) {
          socket.close(4001, 'Authentication required')
          return
        }
        userId = user.sub
      }

      // Deepgram/DeepL are metered APIs — cap concurrent connections so a bug
      // or malicious actor can't run up an unbounded bill. Global cap applies
      // regardless of auth; the tighter per-user cap only applies when a user
      // is actually identifiable.
      if (activeConnections >= maxConcurrentConnections) {
        socket.close(1013, 'Server busy — too many concurrent connections')
        return
      }
      if (userId) {
        const userCount = activeConnectionsByUser.get(userId) ?? 0
        if (userCount >= maxConcurrentConnectionsPerUser) {
          socket.close(4029, 'Too many concurrent connections for this account')
          return
        }
        activeConnectionsByUser.set(userId, userCount + 1)
      }
      activeConnections++
      socket.once('close', () => {
        activeConnections--
        if (userId) {
          const remaining = (activeConnectionsByUser.get(userId) ?? 1) - 1
          if (remaining <= 0) activeConnectionsByUser.delete(userId)
          else activeConnectionsByUser.set(userId, remaining)
        }
      })

      createDeepgramProxy(socket, {
        ...options.proxyOptions,
        language: query.language || options.proxyOptions?.language,
        targetLanguage: query.targetLang || options.proxyOptions?.targetLanguage,
      })
    })
  })

  return fastify
}
