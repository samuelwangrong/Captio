import { describe, expect, it } from "vitest"
import { float32ToInt16 } from "./audio"

function readInt16(buffer: ArrayBuffer): number[] {
  return Array.from(new Int16Array(buffer))
}

describe("float32ToInt16", () => {
  it("converts 0 to 0", () => {
    expect(readInt16(float32ToInt16(new Float32Array([0])))).toEqual([0])
  })

  it("converts 1.0 to the max positive Int16 value (32767)", () => {
    expect(readInt16(float32ToInt16(new Float32Array([1])))).toEqual([0x7fff])
  })

  it("converts -1.0 to the min Int16 value (-32768)", () => {
    expect(readInt16(float32ToInt16(new Float32Array([-1])))).toEqual([-0x8000])
  })

  it("clamps values above 1.0 to the max positive Int16 value", () => {
    expect(readInt16(float32ToInt16(new Float32Array([1.5])))).toEqual([0x7fff])
  })

  it("clamps values below -1.0 to the min Int16 value", () => {
    expect(readInt16(float32ToInt16(new Float32Array([-1.5])))).toEqual([-0x8000])
  })

  it("scales intermediate positive and negative values proportionally", () => {
    const [pos, neg] = readInt16(float32ToInt16(new Float32Array([0.5, -0.5])))
    // Int16Array assignment truncates toward zero (ECMAScript ToInt16).
    expect(pos).toBe(Math.trunc(0.5 * 0x7fff))
    expect(neg).toBe(0.5 * -0x8000)
  })

  it("preserves sample count and order across a multi-sample buffer", () => {
    const input = new Float32Array([0, 0.25, -0.25, 1, -1])
    const out = readInt16(float32ToInt16(input))
    expect(out).toHaveLength(5)
    expect(out[0]).toBe(0)
    expect(out[3]).toBe(0x7fff)
    expect(out[4]).toBe(-0x8000)
  })

  it("returns an ArrayBuffer with byteLength = 2 * sample count", () => {
    const input = new Float32Array(4096)
    const out = float32ToInt16(input)
    expect(out.byteLength).toBe(4096 * 2)
  })

  it("returns an empty buffer for an empty input", () => {
    expect(float32ToInt16(new Float32Array([])).byteLength).toBe(0)
  })
})
