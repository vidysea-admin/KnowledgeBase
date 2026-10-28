// Local canvas-copy clock only. Source/display latency remains unknown.
export class NativeVideoProducer {
  constructor({encoder, canvas, now, VideoFrame, observe, fail, maxPending = 16}) {
    Object.assign(this, {encoder, canvas, now, VideoFrame, observe, fail, maxPending});
    this.pending = new Map(); this.next = 0; this.last = -1;
  }
  sample(source, sourceTimestampUs = null) {
    if (this.pending.size >= this.maxPending || this.encoder.encodeQueueSize >= this.maxPending)
      throw new Error('Native video backpressure');
    const copyBeforeUs = Math.floor(this.now() * 1000);
    this.canvas.getContext('2d').drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    const timestampUs = copyBeforeUs;
    if (!Number.isSafeInteger(timestampUs) || timestampUs <= this.last) throw new Error('Native video clock discontinuity');
    const frame = new this.VideoFrame(this.canvas, {timestamp: timestampUs});
    const copyAfterUs = Math.ceil(this.now() * 1000);
    const observation = {frameId: String(this.next++), timestampUs, sourceTimestampUs, copyBeforeUs, copyAfterUs};
    this.pending.set(timestampUs, observation); this.last = timestampUs;
    try {
      this.observe(observation);
      this.encoder.encode(frame, {keyFrame: this.next === 1});
    } catch (error) { this.fail(error); throw error; }
    finally { frame.close(); }
  }
  output(chunk) {
    const observation = this.pending.get(chunk.timestamp);
    if (!observation || chunk.timestamp !== this.pending.keys().next().value) throw new Error('Unmatched/reordered native video output');
    if (observation.frameId === '0' && chunk.type !== 'key') throw new Error('First native frame must be key');
    this.pending.delete(chunk.timestamp);
    const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes);
    return {observation: {...observation, encodedType: chunk.type, encodedByteLength: bytes.length}, bytes};
  }
  finish() { if (this.pending.size) throw new Error('Native encoded frames missing'); }
}
