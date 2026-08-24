/**
 * Integration tests for the Fastify server: the /health endpoint and the
 * /transcribe WebSocket proxy. These spin up the real Fastify + @fastify/websocket
 * stack on an ephemeral port, plus a local mock "Deepgram" WebSocketServer
 * (also on an ephemeral port) so the full proxy pipeline runs end-to-end
 * without any real network access or API key.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WebSocket, WebSocketServer } from "ws"
import type { AddressInfo } from "node:net"
import type { FastifyInstance } from "fastify"
import { buildServer } from "./server.js"
import { FakeSocket } from "./test/helpers/fake-socket.js"
import type { UpstreamSocket } from "./proxy.js"

describe("GET /health", () => {
  it("returns ok status with a timestamp", async () => {
    const server = await buildServer({ logger: false })
    try {
      const res = await server.inject({ method: "GET", url: "/health" })
      expect(res.statusCode).toBe(200)

      const body = res.json()
      expect(body.status).toBe("ok")
      expect(typeof body.timestamp).toBe("number")
    } finally {
      await server.close()
    }
  })
})

describe("/transcribe websocket proxy", () => {
  let mockDeepgram: WebSocketServer
  let mockDeepgramPort: number
  let server: FastifyInstance

  beforeEach(async () => {
    // Local stand-in for Deepgram's streaming endpoint.
    mockDeepgram = new WebSocketServer({ port: 0, host: "127.0.0.1" })
    await new Promise<void>((resolve) => mockDeepgram.once("listening", resolve))
    mockDeepgramPort = (mockDeepgram.address() as AddressInfo).port

    server = await buildServer({
      logger: false,
      proxyOptions: {
        apiKey: "test-key",
        deepgramUrl: `ws://127.0.0.1:${mockDeepgramPort}`,
      },
    })
    await server.listen({ port: 0, host: "127.0.0.1" })
  })

  afterEach(async () => {
    await server.close()
    await new Promise<void>((resolve) => mockDeepgram.close(() => resolve()))
  })

  function transcribeUrl(): string {
    const address = server.server.address() as AddressInfo
    return `ws://127.0.0.1:${address.port}/transcribe`
  }

  it("sends Ready and relays Deepgram Results to the extension client", async () => {
    mockDeepgram.on("connection", (dgSocket) => {
      dgSocket.send(
        JSON.stringify({
          type: "Results",
          is_final: true,
          channel: { alternatives: [{ transcript: "hello world" }] },
        })
      )
    })

    const client = new WebSocket(transcribeUrl())
    const messages: any[] = []

    await new Promise<void>((resolve, reject) => {
      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()))
        if (messages.length >= 2) resolve()
      })
      client.on("error", reject)
    })

    expect(messages).toContainEqual({ type: "Ready" })
    expect(messages).toContainEqual({
      type: "Results",
      is_final: true,
      channel: { alternatives: [{ transcript: "hello world" }] },
    })

    client.close()
  })

  it("forwards binary audio chunks from the client to Deepgram unchanged", async () => {
    const received = new Promise<Buffer>((resolve) => {
      mockDeepgram.on("connection", (dgSocket) => {
        dgSocket.on("message", (data, isBinary) => {
          if (isBinary) resolve(data as Buffer)
        })
      })
    })

    const client = new WebSocket(transcribeUrl())
    await new Promise<void>((resolve) => client.on("open", resolve))

    const audioChunk = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
    client.send(audioChunk)

    const forwarded = await received
    expect(Buffer.compare(forwarded, audioChunk)).toBe(0)

    client.close()
  })

  it("forwards CloseStream control messages from the client to Deepgram", async () => {
    const dgReceivedClose = new Promise<string>((resolve) => {
      mockDeepgram.on("connection", (dgSocket) => {
        dgSocket.on("message", (data) => resolve(data.toString()))
      })
    })

    const client = new WebSocket(transcribeUrl())
    await new Promise<void>((resolve) => client.on("open", resolve))

    client.send(JSON.stringify({ type: "CloseStream" }))

    const raw = await dgReceivedClose
    expect(JSON.parse(raw)).toEqual({ type: "CloseStream" })

    client.close()
  })

  it("closes the client when Deepgram closes the connection", async () => {
    mockDeepgram.on("connection", (dgSocket) => {
      dgSocket.close()
    })

    const client = new WebSocket(transcribeUrl())

    const closeCode = await new Promise<number>((resolve) => {
      client.on("close", (code) => resolve(code))
    })

    expect(typeof closeCode).toBe("number")
  })

  it("forwards the ?language= query param into buildDeepgramUrl when no deepgramUrl override is configured", async () => {
    let seenUrl = ""
    await server.close()
    server = await buildServer({
      logger: false,
      proxyOptions: {
        apiKey: "test-key",
        createUpstreamSocket: (url) => {
          seenUrl = url
          return new FakeSocket() as unknown as UpstreamSocket
        },
      },
    })
    await server.listen({ port: 0, host: "127.0.0.1" })

    const client = new WebSocket(`${transcribeUrl()}?language=ko`)
    await new Promise<void>((resolve) => client.on("open", resolve))

    expect(new URL(seenUrl).searchParams.get("language")).toBe("ko")
    client.close()
  })

  it("translates is_final transcripts when ?targetLang= is set and forwards a Translation message", async () => {
    const translateFn = vi.fn().mockResolvedValue({ translatedText: "Hola mundo", detectedSourceLang: "EN" })

    await server.close()
    server = await buildServer({
      logger: false,
      proxyOptions: {
        apiKey: "test-key",
        deepgramUrl: `ws://127.0.0.1:${mockDeepgramPort}`,
        translateFn,
      },
    })
    await server.listen({ port: 0, host: "127.0.0.1" })

    mockDeepgram.on("connection", (dgSocket) => {
      dgSocket.send(
        JSON.stringify({
          type: "Results",
          is_final: true,
          channel: { alternatives: [{ transcript: "hello world" }] },
        })
      )
    })

    const client = new WebSocket(`${transcribeUrl()}?targetLang=ES`)
    const messages: any[] = []

    await new Promise<void>((resolve, reject) => {
      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()))
        if (messages.some((m) => m.type === "Translation")) resolve()
      })
      client.on("error", reject)
    })

    expect(translateFn).toHaveBeenCalledWith("hello world", "ES")
    expect(messages).toContainEqual({
      type: "Translation",
      original: "hello world",
      translated: "Hola mundo",
      sourceLang: "EN",
      targetLang: "ES",
      isFinal: true,
    })

    client.close()
  })

  describe("auth gate (SUPABASE_URL/SUPABASE_ANON_KEY configured, or a test client injected)", () => {
    function fakeAuthClient(getUser: (token: string) => Promise<{ data: any; error: any }>) {
      return { auth: { getUser } }
    }

    async function rebuildWithAuthClient(authClient: ReturnType<typeof fakeAuthClient>) {
      await server.close()
      server = await buildServer({
        logger: false,
        authClient,
        proxyOptions: { apiKey: "test-key", deepgramUrl: `ws://127.0.0.1:${mockDeepgramPort}` },
      })
      await server.listen({ port: 0, host: "127.0.0.1" })
    }

    it("rejects a connection with no token", async () => {
      await rebuildWithAuthClient(
        fakeAuthClient(async () => ({ data: { user: null }, error: new Error("no token") }))
      )

      const client = new WebSocket(transcribeUrl())
      const closeCode = await new Promise<number>((resolve) => client.on("close", (code) => resolve(code)))
      expect(closeCode).toBe(4001)
    })

    it("rejects a connection whose token Supabase reports as invalid", async () => {
      await rebuildWithAuthClient(
        fakeAuthClient(async () => ({ data: { user: null }, error: { message: "invalid JWT" } }))
      )

      const client = new WebSocket(`${transcribeUrl()}?token=bad-token`)
      const closeCode = await new Promise<number>((resolve) => client.on("close", (code) => resolve(code)))
      expect(closeCode).toBe(4001)
    })

    it("accepts a connection with a token Supabase reports as valid, and proxies normally", async () => {
      const getUser = vi.fn(async (token: string) => ({
        data: { user: { id: "user-123", email: "sam@example.com" } },
        error: null,
      }))
      await rebuildWithAuthClient(fakeAuthClient(getUser))

      const client = new WebSocket(`${transcribeUrl()}?token=good-token`)
      const messages: any[] = []
      await new Promise<void>((resolve, reject) => {
        client.on("message", (data) => {
          messages.push(JSON.parse(data.toString()))
          resolve()
        })
        client.on("error", reject)
        client.on("close", (code) => reject(new Error(`closed unexpectedly with code ${code}`)))
      })

      expect(getUser).toHaveBeenCalledWith("good-token")
      expect(messages).toContainEqual({ type: "Ready" })
      client.close()
    })
  })
})
