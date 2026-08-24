/**
 * End-to-end test for the server's actual entrypoint (src/index.ts).
 *
 * Unlike server.test.ts (which calls `buildServer()` in-process), this spawns
 * the real `tsx src/index.ts` process — the same command `pnpm dev` runs —
 * and talks to it over real HTTP/WebSocket sockets. This catches issues that
 * only show up when the entrypoint itself runs: env var validation
 * (DEEPGRAM_API_KEY), `dotenv/config`, and `server.listen({ host, port })`.
 *
 * The /transcribe check intentionally does NOT require real Deepgram
 * connectivity: with a fake DEEPGRAM_API_KEY and no network access, Deepgram's
 * `dg.on('error'|'close')` handlers in proxy.ts still fire, sending an
 * `{ type: "Error" | ... }` message (or just closing) — which is enough to
 * prove the proxy endpoint is wired up end-to-end. If real Deepgram
 * connectivity *is* available, the same assertions hold (Ready, then
 * eventually closed when we close our end).
 */

import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { type ChildProcessByStdio, spawn } from "node:child_process"
import type { Readable } from "node:stream"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { WebSocket } from "ws"

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, "..")

function resolveTsxCli(): string {
  const pkgPath = require.resolve("tsx/package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { bin: string | Record<string, string> }
  const binRelative = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.tsx
  return path.join(path.dirname(pkgPath), binRelative)
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
  })
}

async function waitForHealth(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Server on port ${port} never became healthy: ${String(lastError)}`)
}

describe("server entrypoint (src/index.ts)", () => {
  let child: ChildProcessByStdio<null, Readable, Readable>
  let port: number
  let stdout = ""
  let stderr = ""

  beforeAll(async () => {
    port = await getFreePort()
    const tsxCli = resolveTsxCli()

    child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
      cwd: SERVER_ROOT,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        DEEPGRAM_API_KEY: "test-key-e2e",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()))

    await waitForHealth(port)
  }, 30_000)

  afterAll(() => {
    child?.kill()
  })

  it("responds to GET /health with ok status", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(typeof body.timestamp).toBe("number")
  })

  it("accepts a /transcribe websocket connection and eventually closes it", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/transcribe`)
    const messages: string[] = []

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.close()
        resolve()
      }, 5_000)

      client.on("message", (data) => messages.push(data.toString()))
      client.on("close", () => {
        clearTimeout(timer)
        resolve()
      })
      client.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    // Either Deepgram accepted the connection (Ready, possibly Results/Error)
    // or it failed immediately (Error) — both prove the proxy is wired up.
    // At minimum the process must not have crashed.
    expect(child.exitCode).toBeNull()
    if (messages.length > 0) {
      const parsed = messages.map((m) => JSON.parse(m))
      for (const msg of parsed) expect(typeof msg.type).toBe("string")
    }
  })

  it("did not log uncaught fatal errors on startup", () => {
    expect(stderr).not.toMatch(/DEEPGRAM_API_KEY is not set/)
    expect(stdout).toContain("Captio server listening")
  })

  describe("graceful shutdown (SIGTERM)", () => {
    // Own process — SIGTERM ends its life, so it can't share the outer
    // beforeAll's `child` without breaking every test that runs after it.
    let shutdownChild: ChildProcessByStdio<null, Readable, Readable>
    let shutdownPort: number

    beforeAll(async () => {
      shutdownPort = await getFreePort()
      shutdownChild = spawn(process.execPath, [resolveTsxCli(), "src/index.ts"], {
        cwd: SERVER_ROOT,
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(shutdownPort), DEEPGRAM_API_KEY: "test-key-e2e" },
        stdio: ["ignore", "pipe", "pipe"],
      })
      await waitForHealth(shutdownPort)
    }, 30_000)

    afterAll(() => {
      shutdownChild?.kill()
    })

    // Windows has no POSIX signals — Node's child.kill('SIGTERM') on Windows
    // calls TerminateProcess() unconditionally (confirmed empirically: a
    // process.on('SIGTERM') handler never runs, the process just dies with
    // code: null, signal: 'SIGTERM', same as if it had no handler at all).
    // The shutdown handler in index.ts is correct for its real target (every
    // deploy platform — Docker/Fly.io/Railway/etc. — runs Linux containers
    // with real signal delivery), but this specific behavior is only
    // verifiable on a POSIX platform. CI (ubuntu-latest) is where this
    // actually gets exercised.
    it.skipIf(process.platform === "win32")(
      "closes open /transcribe connections and exits cleanly instead of being killed outright",
      async () => {
        let debugOut = ""
        let debugErr = ""
        shutdownChild.stdout.on("data", (c) => (debugOut += c.toString()))
        shutdownChild.stderr.on("data", (c) => (debugErr += c.toString()))

        const client = new WebSocket(`ws://127.0.0.1:${shutdownPort}/transcribe`)
        await new Promise<void>((resolve, reject) => {
          client.on("open", () => resolve())
          client.on("error", reject)
        })

        const clientClosed = new Promise<void>((resolve) => client.on("close", () => resolve()))
        const processExited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
          shutdownChild.on("exit", (code, signal) => resolve({ code, signal }))
        )

        shutdownChild.kill("SIGTERM")

        // Both must happen within a normal deploy's grace period (typically
        // 10-30s) — a hung shutdown defeats the whole point, since the platform
        // would SIGKILL it anyway once that window expires.
        await Promise.all([
          clientClosed,
          Promise.race([
            processExited,
            new Promise((_, reject) => setTimeout(() => reject(new Error("process did not exit within 5s")), 5_000)),
          ]),
        ])

        const result = await processExited
        expect(result, `stdout: ${debugOut}\nstderr: ${debugErr}`).toEqual({ code: 0, signal: null })
      },
      10_000
    )
  })
})
