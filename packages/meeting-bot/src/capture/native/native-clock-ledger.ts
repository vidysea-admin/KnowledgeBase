import type { NativeCaptureIdentity, ProducerAudioObservation, ProducerVideoObservation, AudioClockPair, HostClockPair } from './native-media-types.js';
export type VideoInputObservation = Omit<ProducerVideoObservation, 'encodedType' | 'encodedByteLength' | 'chunkSha256'>;
export function safeInteger(n: number, min = 0): boolean { return Number.isSafeInteger(n) && n >= min; }
export function sameNativeIdentity(a: NativeCaptureIdentity, b: NativeCaptureIdentity): boolean {
  const keys = ['schema','tenantId','sessionId','captureGeneration','captureInstanceId','samplerInstanceId','platform','browserBuild','extensionAssetSha256','clockInstanceId'] as const;
  return keys.every(k => typeof a[k] === 'string' && a[k].length > 0 && a[k].length <= 512 && a[k] === b[k]) && a.schema === 'native-tab-clock/1' && /^[a-f0-9]{64}$/i.test(a.extensionAssetSha256);
}
/** Raw clock observations only; this ledger never qualifies platform uncertainty. */
export class NativeClockLedger {
  readonly video: ProducerVideoObservation[] = [];
  readonly audio: ProducerAudioObservation[] = [];
  readonly audioClockPairs: AudioClockPair[] = [];
  readonly hostClockPairs: HostClockPair[] = [];
  private pending = new Map<number, VideoInputObservation>();
  private frameIds = new Set<string>();
  private blockIds = new Set<string>();
  constructor(readonly identity: NativeCaptureIdentity, readonly sampleRate: number) {
    if (!sameNativeIdentity(identity, identity) || !safeInteger(sampleRate, 1) || sampleRate > 192000) throw new Error('invalid native identity/sample rate');
  }
  observeVideo(o: VideoInputObservation): void {
    if (!o || typeof o.frameId !== 'string' || !o.frameId || o.frameId.length > 256 || this.frameIds.has(o.frameId) ||
        !safeInteger(o.timestampUs) || !safeInteger(o.copyBeforeUs) || !safeInteger(o.copyAfterUs) ||
        o.copyBeforeUs > o.timestampUs || o.timestampUs > o.copyAfterUs ||
        (o.sourceTimestampUs !== null && !safeInteger(o.sourceTimestampUs)) || this.pending.has(o.timestampUs) ||
        (this.video.length > 0 && o.timestampUs <= this.video[this.video.length - 1]!.timestampUs) ||
        [...this.pending.keys()].some(t => t >= o.timestampUs)) throw new Error('invalid/duplicate video input lineage');
    this.frameIds.add(o.frameId); this.pending.set(o.timestampUs, Object.freeze({ ...o }));
  }
  acceptVideo(o: ProducerVideoObservation): void {
    const input = this.pending.get(o.timestampUs), first = this.pending.keys().next().value;
    if (!input || first !== o.timestampUs || input.frameId !== o.frameId || input.copyBeforeUs !== o.copyBeforeUs ||
        input.copyAfterUs !== o.copyAfterUs || input.sourceTimestampUs !== o.sourceTimestampUs ||
        !safeInteger(o.encodedByteLength, 1) || !/^[a-f0-9]{64}$/.test(o.chunkSha256) ||
        (o.encodedType !== 'key' && o.encodedType !== 'delta') || (!this.video.length && o.encodedType !== 'key')) throw new Error('unmatched encoded chunk');
    this.pending.delete(o.timestampUs); this.video.push(Object.freeze({ ...o }));
  }
  acceptAudio(o: ProducerAudioObservation): void {
    const previous = this.audio.at(-1);
    if (!o || typeof o.blockId !== 'string' || !o.blockId || o.blockId.length > 256 || this.blockIds.has(o.blockId) ||
        !safeInteger(o.startFrame) || !safeInteger(o.frameCount, 1) || !safeInteger(o.startFrame + o.frameCount) ||
        o.sampleRate !== this.sampleRate || o.channels !== 1 || o.format !== 's16le' || o.byteLength !== o.frameCount * 2 ||
        !/^[a-f0-9]{64}$/.test(o.sha256) || (previous && o.startFrame !== previous.startFrame + previous.frameCount)) throw new Error('noncontiguous/invalid PCM');
    if (previous && Boolean(previous.windowsPacket) !== Boolean(o.windowsPacket)) throw new Error('mixed PCM clock domains');
    const packet = o.windowsPacket, prior = previous?.windowsPacket;
    if (packet) {
      const decimal = (v: unknown): bigint => {
        if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(v) || BigInt(v) > 0xffffffffffffffffn) throw new Error('invalid WASAPI packet clock');
        return BigInt(v);
      };
      if (this.identity.platform !== 'meet' || packet.method !== 'wasapi-packet-qpc/1' ||
          packet.sequence !== (prior ? prior.sequence + 1 : 0) || packet.firstSampleIndex !== o.startFrame ||
          (!prior && o.startFrame !== 0) || packet.frameCount !== o.frameCount || packet.pcmSha256 !== o.sha256 ||
          !/^[a-f0-9]{64}$/.test(packet.rawSha256) || (packet.flags !== 0 && packet.flags !== 2) ||
          decimal(packet.qpcFrequency) === 0n || (prior && (packet.qpcFrequency !== prior.qpcFrequency ||
            decimal(packet.qpc100ns) <= decimal(prior.qpc100ns) || decimal(packet.devicePosition) !== decimal(prior.devicePosition) + BigInt(prior.frameCount)))) throw new Error('invalid WASAPI packet binding');
      decimal(packet.devicePosition); decimal(packet.qpc100ns);
      for (const b of [packet.before, packet.after]) {
        if (!b || decimal(b.qpcAfter) < decimal(b.qpcBefore) || decimal(b.utcFiletime) < 116444736000000000n) throw new Error('invalid WASAPI UTC bracket');
      }
      if (decimal(packet.after.qpcBefore) < decimal(packet.before.qpcAfter) ||
          (prior && decimal(packet.before.qpcBefore) < decimal(prior.after.qpcAfter))) throw new Error('reordered WASAPI bracket');
    }
    this.blockIds.add(o.blockId); this.audio.push(Object.freeze(structuredClone(o)));
  }
  acceptAudioClock(o: AudioClockPair): void {
    const prev = this.audioClockPairs.at(-1);
    if (!o || o.clockInstanceId !== this.identity.clockInstanceId || !safeInteger(o.beforePerformanceUs) || !safeInteger(o.afterPerformanceUs) ||
        o.beforePerformanceUs > o.afterPerformanceUs || !Number.isFinite(o.contextTime) || o.contextTime < 0 ||
        !Number.isFinite(o.performanceTime) || o.performanceTime <= 0 || o.sampleRate !== this.sampleRate ||
        !['running','suspended','interrupted','closed'].includes(o.state) || (prev && (o.beforePerformanceUs < prev.afterPerformanceUs || o.contextTime < prev.contextTime || o.performanceTime < prev.performanceTime))) throw new Error('invalid audio clock pair');
    this.audioClockPairs.push(Object.freeze({ ...o }));
  }
  acceptHostClock(o: HostClockPair): void {
    if (!o) throw new Error('invalid host clock pair');
    for (const b of [o.browser, o.serverRequest, o.serverResponse]) {
      if (!b || !b.clockInstanceId || !safeInteger(b.beforeMonotonicUs) || !safeInteger(b.afterMonotonicUs) || !safeInteger(b.epochUs, 1) || b.afterMonotonicUs < b.beforeMonotonicUs) throw new Error('invalid epoch bracket');
    }
    if (o.browser.clockInstanceId !== this.identity.clockInstanceId || o.serverRequest.clockInstanceId !== o.serverResponse.clockInstanceId || o.serverResponse.beforeMonotonicUs < o.serverRequest.afterMonotonicUs) throw new Error('mixed clock instance');
    const previous = this.hostClockPairs.at(-1);
    if (previous) for (const key of ['browser','serverRequest','serverResponse'] as const) {
      const a = previous[key], b = o[key];
      // Date.now has a known 1ms representation quantum. This is a rounding allowance,
      // not a measured clock-fit/latency bound and cannot qualify native calibration.
      const quantum = a.epochUs % 1000 === 0 && b.epochUs % 1000 === 0 ? 1000 : 0;
      if (a.clockInstanceId !== b.clockInstanceId || b.beforeMonotonicUs < a.afterMonotonicUs ||
          b.epochUs - b.afterMonotonicUs > a.epochUs - a.beforeMonotonicUs + quantum || b.epochUs - b.beforeMonotonicUs < a.epochUs - a.afterMonotonicUs - quantum) throw new Error('host clock step');
    }
    this.hostClockPairs.push(structuredClone(o));
  }
  finish(): void {
    if (this.pending.size || !this.video.length || !this.audio.length) throw new Error('incomplete native sample lineage');
  }
}
