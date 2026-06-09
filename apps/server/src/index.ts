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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
