import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { createDeepgramProxy } from './proxy.js'

export async function buildServer() {
  const fastify = Fastify({ logger: true })

  await fastify.register(fastifyWebsocket)

  // Health check — useful for deployment uptime checks
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }))

  // WebSocket proxy endpoint.
  // The extension's offscreen document connects here, sends raw audio binary frames,
  // and receives Deepgram transcript events as JSON strings.
  fastify.register(async (instance) => {
    instance.get('/transcribe', { websocket: true }, (socket, _req) => {
      createDeepgramProxy(socket)
    })
  })

  return fastify
}
