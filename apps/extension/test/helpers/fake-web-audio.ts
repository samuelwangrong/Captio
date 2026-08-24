/**
 * test/helpers/fake-web-audio.ts — fakes for the Web Audio + WebSocket APIs
 * used by tabs/offscreen.tsx, so the audio capture pipeline can be exercised
 * without a real browser audio stack or network connection.
 */
import { vi } from "vitest"

// ─── Web Audio ──────────────────────────────────────────────────────────────

export class FakeScriptProcessorNode {
  onaudioprocess: ((event: any) => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  bufferSize: number

  constructor(bufferSize: number) {
    this.bufferSize = bufferSize
  }

  /**
   * Simulate the audio thread invoking onaudioprocess with `input` as the
   * input channel data. Returns whatever was written to the output channel
   * (e.g. for verifying the passthrough copy).
   */
  process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length)
    this.onaudioprocess?.({
      inputBuffer: { getChannelData: () => input },
      outputBuffer: { getChannelData: () => output },
    })
    return output
  }
}

export class FakeMediaStreamAudioSourceNode {
  connect = vi.fn()
}

export class FakeGainNode {
  gain = { value: 1 }
  connect = vi.fn()
  disconnect = vi.fn()
}

export class FakeAudioContext {
  sampleRate: number
  destination = {}
  close = vi.fn().mockResolvedValue(undefined)
  lastProcessor: FakeScriptProcessorNode | null = null
  lastSource: FakeMediaStreamAudioSourceNode | null = null
  lastGain: FakeGainNode | null = null

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48000
    createdAudioContexts.push(this)
  }

  createMediaStreamSource(_stream: unknown) {
    this.lastSource = new FakeMediaStreamAudioSourceNode()
    return this.lastSource
  }

  createScriptProcessor(bufferSize: number, _numberOfInputChannels: number, _numberOfOutputChannels: number) {
    this.lastProcessor = new FakeScriptProcessorNode(bufferSize)
    return this.lastProcessor
  }

  createGain() {
    this.lastGain = new FakeGainNode()
    return this.lastGain
  }
}

export const createdAudioContexts: FakeAudioContext[] = []

// ─── WebSocket ──────────────────────────────────────────────────────────────

export const READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const

export class FakeWebSocket {
  static CONNECTING = READY_STATE.CONNECTING
  static OPEN = READY_STATE.OPEN
  static CLOSING = READY_STATE.CLOSING
  static CLOSED = READY_STATE.CLOSED

  url: string
  readyState: number = READY_STATE.CONNECTING
  sent: Array<string | ArrayBuffer> = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    createdWebSockets.push(this)
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data)
  }

  close() {
    this.readyState = READY_STATE.CLOSED
    this.onclose?.()
  }

  /** Test helper: simulate the connection opening. */
  simulateOpen() {
    this.readyState = READY_STATE.OPEN
    this.onopen?.()
  }

  /** Test helper: simulate a message from the server (object is JSON-encoded). */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) })
  }

  /** Test helper: simulate a connection error. */
  simulateError() {
    this.onerror?.()
  }

  /** Returns every text frame sent so far, JSON-parsed. */
  sentJson(): any[] {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d))
  }
}

export const createdWebSockets: FakeWebSocket[] = []

export function resetFakeWebAudio() {
  createdAudioContexts.length = 0
  createdWebSockets.length = 0
}
