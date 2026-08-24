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
}

export async function buildServer(options: BuildServerOptions = {}) {
  const fastify = Fastify({ logger: options.logger ?? true })

  await fastify.register(fastifyWebsocket)

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
      if (options.authClient || isAuthConfigured()) {
        const user = query.token ? await verifySupabaseToken(query.token, { client: options.authClient }) : null
        if (!user) {
          socket.close(4001, 'Authentication required')
          return
        }
      }

      createDeepgramProxy(socket, {
        ...options.proxyOptions,
        language: query.language || options.proxyOptions?.language,
        targetLanguage: query.targetLang || options.proxyOptions?.targetLanguage,
      })
    })
  })

  return fastify
}
