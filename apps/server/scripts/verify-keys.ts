#!/usr/bin/env -S npx tsx
/**
 * scripts/verify-keys.ts — sanity-checks DEEPGRAM_API_KEY and (optionally)
 * DEEPL_API_KEY against the real APIs, without needing chrome, the browser
 * extension, or a manually-started server. Useful after setting up .env, or
 * after rotating a key.
 *
 * Usage (from apps/server):
 *   pnpm verify-keys                     # checks the keys only
 *   pnpm verify-keys path/to/audio.wav   # also streams the WAV through a
 *     temporary local server instance and prints the real transcript (and
 *     translation, if DEEPL_API_KEY is set) — the same round trip the
 *     extension does, minus the browser.
 *
 * The WAV should be 16-bit PCM, mono, ideally 16kHz (matching what the
 * extension's offscreen document actually sends) — most short recordings or
 * a system TTS export work fine.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { WebSocket } from 'ws'
import { buildServer } from '../src/server.js'

function ok(label: string) { console.log(`✅ ${label}`) }
function fail(label: string, detail?: string) { console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`) }

async function checkDeepgram() {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return fail('DEEPGRAM_API_KEY', 'not set in .env')
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${key}` },
    })
    if (res.ok) ok('DEEPGRAM_API_KEY is valid')
    else fail('DEEPGRAM_API_KEY', `Deepgram returned ${res.status}`)
  } catch (err) {
    fail('DEEPGRAM_API_KEY', (err as Error).message)
  }
}

async function checkDeepL() {
  const key = process.env.DEEPL_API_KEY
  if (!key) {
    console.log('ℹ️  DEEPL_API_KEY not set — translation is optional, skipping')
    return
  }
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  try {
    const res = await fetch(`${base}/v2/usage`, { headers: { Authorization: `DeepL-Auth-Key ${key}` } })
    if (res.ok) {
      const { character_count, character_limit } = await res.json()
      ok(`DEEPL_API_KEY is valid (${character_count}/${character_limit} chars used this period)`)
    } else {
      fail('DEEPL_API_KEY', `DeepL returned ${res.status}`)
    }
  } catch (err) {
    fail('DEEPL_API_KEY', (err as Error).message)
  }
}

function extractPcmFromWav(buffer: Buffer): Buffer {
  let offset = 12
  while (offset < buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'data') return buffer.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  throw new Error('no "data" chunk found — is this a valid WAV file?')
}

interface FinalResult {
  type: 'transcript' | 'translation'
  text: string
}

async function streamAudio(wavPath: string) {
  console.log(`\nStreaming ${wavPath} through a local proxy instance...`)
  const pcm = extractPcmFromWav(readFileSync(wavPath))

  const server = await buildServer({ logger: false })
  await server.listen({ port: 0, host: '127.0.0.1' })
  const address = server.server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const targetLang = process.env.DEEPL_API_KEY ? 'ES' : undefined
  const url = `ws://127.0.0.1:${port}/transcribe?language=en${targetLang ? `&targetLang=${targetLang}` : ''}`
  const ws = new WebSocket(url)
  const finals: FinalResult[] = []

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      const chunkSize = 640 // ~20ms at 16kHz/16-bit/mono
      let i = 0
      const interval = setInterval(() => {
        if (i >= pcm.length) {
          clearInterval(interval)
          ws.send(JSON.stringify({ type: 'CloseStream' }))
          return
        }
        ws.send(pcm.subarray(i, i + chunkSize))
        i += chunkSize
      }, 20)
    })

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'Results' && msg.is_final) {
        const text = msg.channel?.alternatives?.[0]?.transcript
        if (text) finals.push({ type: 'transcript', text })
      }
      if (msg.type === 'Translation' && msg.isFinal) {
        finals.push({ type: 'translation', text: msg.translated })
      }
    })

    ws.on('close', () => resolve())
    ws.on('error', reject)
    setTimeout(() => reject(new Error('timed out waiting for a response')), 20_000)
  })

  await server.close()

  const transcript = finals.filter((f) => f.type === 'transcript').map((f) => f.text).join(' ')
  const translation = finals.filter((f) => f.type === 'translation').map((f) => f.text).join(' ')

  if (transcript) ok(`Live transcript: "${transcript}"`)
  else fail('No transcript received', 'check the WAV has audible speech and is 16-bit PCM')

  if (targetLang && translation) ok(`Live translation (ES): "${translation}"`)
}

async function main() {
  console.log('Checking API keys...\n')
  await checkDeepgram()
  await checkDeepL()

  const wavPath = process.argv[2]
  if (wavPath) await streamAudio(wavPath)
  else console.log('\n(pass a path to a 16-bit PCM WAV file to also test live transcription)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
