/**
 * FakeSocket — minimal EventEmitter-based stand-in for a `ws.WebSocket`.
 *
 * Implements just enough of the WebSocket surface (`readyState`, `send`,
 * `close`, plus the `open`/`message`/`close`/`error` events) for
 * `createDeepgramProxy` to operate on. Tests can call `.open()`,
 * `.message()`, `.serverClose()`, and `.serverError()` to simulate
 * inbound socket events, and inspect `.sent` / `.closed` to assert on
 * outbound behavior.
 */

import { EventEmitter } from "node:events"

// Mirrors the numeric values of ws.WebSocket.{CONNECTING,OPEN,CLOSING,CLOSED}
export const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

export class FakeSocket extends EventEmitter {
  readyState: number = READY_STATE.CONNECTING
  sent: Array<string | Buffer> = []
  closed = false

  send(data: string | Buffer): void {
    this.sent.push(data)
  }

  /** Simulate the underlying connection finishing its handshake. */
  open(): void {
    this.readyState = READY_STATE.OPEN
    this.emit("open")
  }

  /** Simulate an inbound message (from Deepgram, or from the extension). */
  message(data: string | Buffer, isBinary = false): void {
    this.emit("message", Buffer.isBuffer(data) ? data : Buffer.from(data), isBinary)
  }

  /** Simulate the remote end closing the connection. */
  serverClose(code = 1000, reason = ""): void {
    this.readyState = READY_STATE.CLOSED
    this.closed = true
    this.emit("close", code, Buffer.from(reason))
  }

  /** Simulate a connection-level error. */
  serverError(err: Error): void {
    this.emit("error", err)
  }

  /** Called by the proxy under test. */
  close(): void {
    this.closed = true
    this.readyState = READY_STATE.CLOSED
    this.emit("close", 1000, Buffer.from(""))
  }

  /** Convenience: parse all sent text frames as JSON, ignoring non-JSON ones. */
  sentJson(): any[] {
    return this.sent
      .map((d) => d.toString())
      .map((s) => {
        try {
          return JSON.parse(s)
        } catch {
          return undefined
        }
      })
      .filter((v) => v !== undefined)
  }
}
