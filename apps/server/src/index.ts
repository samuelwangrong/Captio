import 'dotenv/config'
import { buildServer } from './server.js'

const PORT = parseInt(process.env.PORT ?? '3001')
const HOST = process.env.HOST ?? '0.0.0.0'

if (!process.env.DEEPGRAM_API_KEY) {
  console.error('DEEPGRAM_API_KEY is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

async function main() {
  const server = await buildServer()

  await server.listen({ port: PORT, host: HOST })
  console.log(`Captio server listening on ws://${HOST}:${PORT}`)
  console.log(`  WebSocket proxy: ws://localhost:${PORT}/transcribe`)
  console.log(`  Health check:    http://localhost:${PORT}/health`)

  // Docker/Fly.io/Railway/etc. send SIGTERM on every deploy and scale-down —
  // without this, Node's default SIGTERM behavior kills the process
  // immediately, severing every open /transcribe connection mid-transcript
  // instead of closing them cleanly. @fastify/websocket closes tracked
  // WebSocket clients as part of server.close().
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`\nCaptio server: ${signal} received, shutting down...`)
    server
      .close()
      .then(() => {
        console.log('Captio server: shutdown complete')
        process.exit(0)
      })
      .catch((err) => {
        console.error('Captio server: error during shutdown:', err)
        process.exit(1)
      })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
