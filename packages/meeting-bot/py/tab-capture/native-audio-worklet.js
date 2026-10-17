// Explicit mono signed little-endian PCM, indexed by the rendering sample clock.
const Base = globalThis.AudioWorkletProcessor || class {};
export class NativePcmProcessor extends Base {
  constructor() {
    super(); this.blockId = 0; this.nextFrame = null; this.dead = false; this.parts = []; this.frames = 0;
    if (this.port) this.port.onmessage = ({data}) => {
      if (data?.op === 'stop') { this.flush(); this.dead = true; this.port.postMessage({stopped:true}); }
    };
  }
  flush() {
    if (!this.frames) return;
    const bytes = new Uint8Array(this.frames * 2); let offset = 0;
    for (const part of this.parts) { bytes.set(new Uint8Array(part), offset); offset += part.byteLength; }
    this.port.postMessage({observation: {blockId: String(this.blockId++), startFrame: this.nextFrame - this.frames, frameCount: this.frames,
      sampleRate: globalThis.sampleRate, channels: 1, format: 's16le', byteLength: bytes.byteLength}, bytes:bytes.buffer}, [bytes.buffer]);
    this.parts = []; this.frames = 0;
  }
  process(inputs, outputs) {
    if (this.dead) return false;
    const channels = inputs[0];
    if (!channels?.length || !channels[0].length) return true;
    const count = channels[0].length, startFrame = globalThis.currentFrame;
    if (this.nextFrame !== null && startFrame !== this.nextFrame) {
      this.dead = true; this.port.postMessage({error: 'Native audio sample gap'}); return false;
    }
    const bytes = new ArrayBuffer(count * 2), view = new DataView(bytes);
    for (let i = 0; i < count; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      if (!Number.isFinite(sample)) { this.dead = true; this.port.postMessage({error: 'Invalid native PCM'}); return false; }
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
    }
    this.nextFrame = startFrame + count;
    this.parts.push(bytes); this.frames += count;
    if (this.frames >= 4096) this.flush();
    // A silent connected output keeps processing scheduled without duplicating tab playback.
    for (const channel of outputs[0] || []) channel.fill(0);
    return true;
  }
}
if (globalThis.registerProcessor) registerProcessor('native-pcm', NativePcmProcessor);
