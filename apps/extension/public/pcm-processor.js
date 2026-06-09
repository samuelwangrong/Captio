/**
 * pcm-processor.js — AudioWorklet processor for PCM extraction.
 *
 * Loaded via chrome.runtime.getURL("pcm-processor.js") in the offscreen document.
 * Runs on a dedicated audio thread (AudioWorkletGlobalScope).
 *
 * What it does:
 *  - Receives Float32 audio samples from the browser's audio pipeline
 *  - Passes them through to the output (keeps the tab audible — fixes tabCapture muting)
 *  - Converts channel 0 (mono) from Float32 → Int16 PCM
 *  - Posts the Int16 buffer to the main thread via the MessagePort
 *    so the offscreen page can forward it to the WebSocket server
 */

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]

    if (!input?.length) return true

    // Pass-through: copy every input channel to its matching output channel.
    // This keeps the captured tab audio playing through the speakers.
    for (let ch = 0; ch < output.length && ch < input.length; ch++) {
      output[ch].set(input[ch])
    }

    // Mono PCM: use channel 0 only (AudioContext is already forced to mono
    // at the AudioContext level via the single-channel graph).
    const float32 = input[0]
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      // Clamp to [-1, 1] then scale to Int16 range
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    // Transfer ownership of the buffer (zero-copy) to the main thread
    this.port.postMessage(int16.buffer, [int16.buffer])

    return true // keep processor alive
  }
}

registerProcessor("pcm-processor", PCMProcessor)
