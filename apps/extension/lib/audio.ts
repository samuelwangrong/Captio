/**
 * lib/audio.ts — pure audio-format helpers shared by the offscreen capture
 * pipeline. Kept dependency-free (no Web Audio / chrome APIs) so it can be
 * unit tested directly in Node.
 */

/**
 * Convert a Float32Array of audio samples in the range [-1, 1] (the format
 * the Web Audio API hands us) into 16-bit PCM (the `linear16` format
 * Deepgram's streaming endpoint expects).
 *
 * Samples are clamped to [-1, 1] before scaling so out-of-range input
 * (e.g. from clipping) doesn't wrap around to the opposite sign.
 */
export function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16.buffer
}
