import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { NativeCaptureIdentity, ProducerVideoObservation, ProducerAudioObservation, AudioClockPair, HostClockPair, ClosedNativeSpool, NativeSpoolFile } from './native-media-types.js';
import { NativeClockLedger, sameNativeIdentity, safeInteger, type VideoInputObservation } from './native-clock-ledger.js';
import { createIvfHeader, encodeIvfFrame, isVp8KeyFrame, parseIvf } from './native-ivf.js';
import { proveArchivedNativeSpool } from './native-archive-spool.js';
import type { NativeArchiveAdmission } from './native-capture-archive.js';

const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
};
export interface NativeSpoolOptions {
  directory: string; identity: NativeCaptureIdentity; width: number; height: number; sampleRate: number;
  maxBytes: number; maxChunkBytes: number; maxPendingBytes: number; resume?: boolean;
  /** Retained by the server outside the spool, never accepted from transport JSON. */
  resumeCheckpoint?: NativeSpoolResumeCheckpoint;
}
export interface NativeSpoolResumeCheckpoint {
  readonly nextSequence: number; readonly videoSha256: string; readonly audioSha256: string; readonly ledgerSha256: string;
}
export interface NativeSpoolAck { readonly sequence: number; readonly sha256: string }
type Envelope<T> = { sequence: number; identity: NativeCaptureIdentity; observation: T; bytes: Uint8Array };
type VideoWire = Omit<ProducerVideoObservation, 'chunkSha256'>;
type AudioWire = Omit<ProducerAudioObservation, 'sha256'>;
type ClockEnvelope = { sequence: number; identity: NativeCaptureIdentity; kind: 'audio'; pair: AudioClockPair } |
  { sequence: number; identity: NativeCaptureIdentity; kind: 'host'; pair: HostClockPair };
export interface NativeSpoolReceiver {
  observeVideo(observation: VideoInputObservation): Promise<void>;
  appendVideo(input: Envelope<VideoWire>): Promise<NativeSpoolAck>;
  appendAudio(input: Envelope<AudioWire>): Promise<NativeSpoolAck>;
  appendClockPair(input: ClockEnvelope): Promise<NativeSpoolAck>;
  close(): Promise<ClosedNativeSpool>;
  poison(reason: string): Promise<void>;
  abort(): Promise<void>;
  suspendForResume(): Promise<NativeSpoolResumeCheckpoint>;
  status(): Readonly<{ complete: boolean; poisoned: boolean; nextSequence: number; pendingBytes: number; byteLength: number }>;
}
type Row = { kind: 'input'; observation: VideoInputObservation } |
  { kind: 'video'; sequence: number; fingerprint: string; sha256: string; observation: ProducerVideoObservation } |
  { kind: 'audio'; sequence: number; fingerprint: string; sha256: string; observation: ProducerAudioObservation } |
  { kind: 'clock'; sequence: number; fingerprint: string; sha256: string; clockKind: 'audio' | 'host'; pair: AudioClockPair | HostClockPair };
type PrivateState = { directory: string; files: NativeSpoolFile[]; marker: NativeSpoolFile; ledger: NativeClockLedger; identities: { dev: number; ino: number }[] };
const issued = new WeakMap<object, PrivateState>();
/** A manifest or a cast cannot issue this cap: the helper requires live private admission. */
export async function rehydrateNativeSpool(admission: NativeArchiveAdmission): Promise<ClosedNativeSpool> {
  const state = await proveArchivedNativeSpool(admission), { files, marker, ledger } = state;
  const cap = Object.freeze({ identity: Object.freeze(state.identity), video: files[0]!, audio: files[1]!, ledger: files[2]!,
    videoFrameCount: ledger.video.length, audioSampleCount: state.audioSampleCount,
    firstVideoTimestampUs: ledger.video[0]!.timestampUs, firstAudioSampleIndex: ledger.audio[0]!.startFrame,
    sampleRate: state.sampleRate, audioChannels: 1, audioFormat: 's16le', ivfTimebase: Object.freeze({ rate: 1000000, scale: 1 }), complete: true, poisoned: false }) as ClosedNativeSpool;
  const identities = await Promise.all([...files, marker].map(async file => {
    const stat = await confined(state.directory, path.basename(file.path)); return { dev: stat.dev, ino: stat.ino };
  }));
  issued.set(cap, { directory: state.directory, files, marker, ledger, identities });
  return verifyClosedNativeSpool(cap);
}
async function confined(directory: string, filename: string) {
  const target = path.join(directory, filename), st = await fs.lstat(target);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || await fs.realpath(target) !== target) throw new Error('unsafe native spool file');
  return st;
}
async function physical(directory: string, filename: string): Promise<NativeSpoolFile> {
  await confined(directory, filename); const target = path.join(directory, filename), bytes = await fs.readFile(target);
  return Object.freeze({ path: target, byteLength: bytes.length, sha256: hash(bytes) });
}
export function readClosedNativeSpool(capability: ClosedNativeSpool): ClosedNativeSpool {
  if (!capability || !issued.has(capability)) throw new Error('unissued native spool capability');
  return capability;
}
export async function verifyClosedNativeSpool(capability: ClosedNativeSpool): Promise<ClosedNativeSpool> {
  readClosedNativeSpool(capability); const state = issued.get(capability)!;
  if (await fs.realpath(state.directory) !== state.directory || (await fs.lstat(state.directory)).isSymbolicLink()) throw new Error('redirected native spool');
  for (const [i, file] of [...state.files, state.marker].entries()) {
    const st = await confined(state.directory, path.basename(file.path)), original = state.identities[i]!;
    if (st.dev !== original.dev || st.ino !== original.ino || st.size !== file.byteLength || hash(await fs.readFile(file.path)) !== file.sha256) throw new Error('native spool replaced/modified');
  }
  return capability;
}
export async function readNativeSpoolLedger(capability: ClosedNativeSpool) {
  await verifyClosedNativeSpool(capability); const l = issued.get(capability)!.ledger;
  return structuredClone({ video: l.video, audio: l.audio, audioClockPairs: l.audioClockPairs, hostClockPairs: l.hostClockPairs });
}

/** Only trusted server invocation supplies options/directory. No wire value creates an issuer. */
export async function createNativeSpoolReceiver(options: NativeSpoolOptions): Promise<NativeSpoolReceiver> {
  const o = { ...options, identity: Object.freeze({ ...options.identity }) };
  for (const n of [o.maxBytes, o.maxChunkBytes, o.maxPendingBytes]) if (!safeInteger(n, 1)) throw new Error('invalid native quota');
  if (o.maxChunkBytes > o.maxPendingBytes || o.maxPendingBytes > o.maxBytes) throw new Error('invalid native quota bounds');
  const header = createIvfHeader(o.width, o.height), ledger = new NativeClockLedger(o.identity, o.sampleRate);
  const directory = path.resolve(o.directory), parent = path.dirname(directory);
  // Resolve every existing parent before creation; no redirected ancestor is accepted.
  if (await fs.realpath(parent) !== parent) throw new Error('redirected native spool parent');
  if (!o.resume) await fs.mkdir(directory, { mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error('unsafe native spool directory');
  // Exclusive owner lease. A crashed lease is refused, never guessed stale from age.
  const leasePath = path.join(directory, 'receiver.lock');
  const lease = await fs.open(leasePath, 'wx', 0o600);
  await lease.writeFile(String(process.pid)); await lease.sync();
  const names = ['source.vp8.ivf','source.s16le','producer-observations.jsonl'] as const;
  let handles: FileHandle[] = [], byteLength = 0, pendingBytes = 0, nextSequence = 0, poisoned = false, complete = false, closing = false;
  let tail: Promise<unknown> = Promise.resolve();
  const receipts = new Map<number, { fingerprint: string; ack: NativeSpoolAck }>(), inputs = new Map<number, string>();
  const configuration = { schema: 'native-spool/1', identity: o.identity, width: o.width, height: o.height, sampleRate: o.sampleRate,
    maxBytes: o.maxBytes, maxChunkBytes: o.maxChunkBytes, maxPendingBytes: o.maxPendingBytes };
  const configLine = `${canonical(configuration)}\n`;
  const replay = (row: Row) => {
    if (row.kind === 'input') { ledger.observeVideo(row.observation); inputs.set(row.observation.timestampUs, canonical(row.observation)); return; }
    if (row.sequence !== nextSequence) throw new Error('noncontiguous persisted sequence');
    if (row.kind === 'video') ledger.acceptVideo(row.observation);
    else if (row.kind === 'audio') ledger.acceptAudio(row.observation);
    else if (row.clockKind === 'audio') ledger.acceptAudioClock(row.pair as AudioClockPair);
    else ledger.acceptHostClock(row.pair as HostClockPair);
    receipts.set(row.sequence, { fingerprint: row.fingerprint, ack: Object.freeze({ sequence: row.sequence, sha256: row.sha256 }) }); nextSequence++;
  };
  try {
    if (o.resume) {
      const checkpoint = o.resumeCheckpoint;
      if (!checkpoint || !safeInteger(checkpoint.nextSequence) || [checkpoint.videoSha256,checkpoint.audioSha256,checkpoint.ledgerSha256].some(s => !/^[a-f0-9]{64}$/.test(s))) throw new Error('missing server resume checkpoint');
      const listing = (await fs.readdir(directory)).filter(n => n !== 'receiver.lock');
      if (listing.length !== 3 || names.some(n => !listing.includes(n))) throw new Error('spool complete/poisoned/interrupted');
      for (const name of names) await confined(directory, name);
      const stat = await Promise.all(names.map(n => fs.stat(path.join(directory, n))));
      byteLength = stat.reduce((s, x) => s + x.size, 0);
      if (byteLength > o.maxBytes) throw new Error('native quota exceeded');
      const journal = await fs.readFile(path.join(directory, names[2]), 'utf8');
      if (!journal.startsWith(configLine) || !journal.endsWith('\n')) throw new Error('native resume identity/journal');
      const video = await fs.readFile(path.join(directory, names[0])), audio = await fs.readFile(path.join(directory, names[1]));
      if (hash(video) !== checkpoint.videoSha256 || hash(audio) !== checkpoint.audioSha256 || hash(await fs.readFile(path.join(directory,names[2]))) !== checkpoint.ledgerSha256) throw new Error('native resume checkpoint hash mismatch');
      if (!video.subarray(0, 32).equals(header)) throw new Error('native resume IVF header');
      let vp = 32, ap = 0;
      for (const line of journal.slice(configLine.length).trimEnd().split('\n').filter(Boolean)) {
        const row = JSON.parse(line) as Row;
        if (!['input','video','audio','clock'].includes(row.kind)) throw new Error('native resume row');
        if (row.kind === 'video' || row.kind === 'audio') {
          const size = row.kind === 'video' ? row.observation.encodedByteLength : row.observation.byteLength;
          const raw = row.kind === 'video' ? video.subarray(vp + 12, vp + 12 + size) : audio.subarray(ap, ap + size);
          if (hash(raw) !== row.sha256) throw new Error('native resume bytes/hash');
          const wire = { ...row.observation } as Record<string, unknown>;
          delete wire.chunkSha256; delete wire.sha256;
          if (row.fingerprint !== hash(canonical({ kind: row.kind, identity: o.identity, observation: wire, sha256: row.sha256 }))) throw new Error('native resume metadata');
          if (row.kind === 'video') {
            const first = ledger.video[0]?.timestampUs ?? row.observation.timestampUs;
            const framed = encodeIvfFrame(raw, row.observation.timestampUs - first);
            if (!video.subarray(vp, vp + framed.length).equals(framed)) throw new Error('native resume IVF framing'); vp += framed.length;
          } else ap += size;
        } else if (row.kind === 'clock' && (row.sha256 !== hash(canonical(row.pair)) || row.fingerprint !== hash(canonical({ kind: 'clock', identity: o.identity, clockKind: row.clockKind, pair: row.pair })))) throw new Error('native resume clock hash');
        replay(row);
      }
      if (vp !== video.length || ap !== audio.length) throw new Error('unacknowledged native bytes');
      if (nextSequence !== checkpoint.nextSequence) throw new Error('native resume checkpoint sequence');
      handles = await Promise.all(names.map(n => fs.open(path.join(directory, n), 'r+')));
    } else {
      handles = await Promise.all(names.map(n => fs.open(path.join(directory, n), 'wx', 0o600)));
      byteLength = header.length + Buffer.byteLength(configLine);
      if (byteLength > o.maxBytes) throw new Error('native quota exceeded');
      await handles[0]!.writeFile(header); await handles[2]!.writeFile(configLine);
      await Promise.all(handles.map(h => h.sync()));
    }
  } catch (error) { await Promise.all(handles.map(h => h.close().catch(() => {}))); await lease.close(); await fs.unlink(leasePath); throw error; }
  const poison = async (_reason: string) => {
    poisoned = true;
    await fs.writeFile(path.join(directory, 'poisoned'), 'incomplete\n', { flag: 'wx', mode: 0o600 }).catch(() => {});
  };
  const queue = <T>(cost: number, task: () => Promise<T>): Promise<T> => {
    if (poisoned || complete || closing) return Promise.reject(new Error('native spool unavailable'));
    if (!safeInteger(cost) || cost > o.maxChunkBytes + 65536 || pendingBytes + cost > o.maxPendingBytes) {
      void poison('backpressure'); return Promise.reject(new Error('native spool backpressure'));
    }
    pendingBytes += cost;
    const result = tail.then(async () => {
      if (poisoned) throw new Error('native spool poisoned');
      try { return await task(); } catch (e) { await poison('write/validation'); throw e; }
    });
    tail = result.catch(() => {}); return result.finally(() => { pendingBytes -= cost; });
  };
  const persist = async (row: Row, raw?: Buffer, stream?: 0 | 1) => {
    const line = Buffer.from(`${canonical(row)}\n`), cost = line.length + (raw?.length ?? 0);
    if (byteLength + cost > o.maxBytes) throw new Error('native spool quota');
    if (raw && stream !== undefined) {
      const h = handles[stream]!, size = (await h.stat()).size;
      await writeAll(h, raw, size); await h.sync();
    }
    const journal = handles[2]!, size = (await journal.stat()).size;
    await writeAll(journal, line, size); await journal.sync(); byteLength += cost;
  };
  const check = (sequence: number, identity: NativeCaptureIdentity, fingerprint: string): NativeSpoolAck | undefined => {
    if (!sameNativeIdentity(o.identity, identity) || !safeInteger(sequence)) throw new Error('foreign native envelope');
    const prior = receipts.get(sequence);
    if (prior) { if (prior.fingerprint !== fingerprint) throw new Error('different native retry'); return prior.ack; }
    if (sequence !== nextSequence) throw new Error('native sequence gap');
    return undefined;
  };
  const append = (kind: 'video' | 'audio', value: Envelope<VideoWire> | Envelope<AudioWire>) => {
    // Copy before yielding: caller cannot change bytes/metadata while queued.
    if (!(value?.bytes instanceof Uint8Array) || value.bytes.byteLength > o.maxChunkBytes || !value.bytes.byteLength) {
      void poison('chunk bound'); return Promise.reject(new Error('native chunk bound'));
    }
    const input = structuredClone(value), raw = Buffer.from(input.bytes), digest = hash(raw);
    const fingerprint = hash(canonical({ kind, identity: input.identity, observation: input.observation, sha256: digest }));
    return queue(raw.length + Buffer.byteLength(canonical({ identity: input.identity, observation: input.observation })) + 256, async () => {
      const retry = check(input.sequence, input.identity, fingerprint); if (retry) return retry;
      let row: Row, physicalBytes: Buffer;
      if (kind === 'video') {
        const observation = { ...input.observation, chunkSha256: digest } as ProducerVideoObservation;
        if (observation.encodedByteLength !== raw.length || (observation.encodedType === 'key') !== isVp8KeyFrame(raw)) throw new Error('native VP8 length/type');
        ledger.acceptVideo(observation);
        physicalBytes = encodeIvfFrame(raw, observation.timestampUs - ledger.video[0]!.timestampUs);
        // Validate the actual codec header/dimensions for every keyframe before ACK.
        if (observation.encodedType === 'key') parseIvf(Buffer.concat([createIvfHeader(o.width, o.height, 1), encodeIvfFrame(raw, 0)]), o.maxChunkBytes + 44);
        row = { kind, sequence: input.sequence, fingerprint, sha256: digest, observation };
      } else {
        const observation = { ...input.observation, sha256: digest } as ProducerAudioObservation;
        if (observation.byteLength !== raw.length) throw new Error('native PCM length');
        ledger.acceptAudio(observation); physicalBytes = raw;
        row = { kind, sequence: input.sequence, fingerprint, sha256: digest, observation };
      }
      await persist(row, physicalBytes, kind === 'video' ? 0 : 1); replayReceipt(row);
      return receipts.get(input.sequence)!.ack;
    });
  };
  const replayReceipt = (row: Exclude<Row, { kind: 'input' }>) => {
    receipts.set(row.sequence, { fingerprint: row.fingerprint, ack: Object.freeze({ sequence: row.sequence, sha256: row.sha256 }) }); nextSequence++;
  };
  const receiver: NativeSpoolReceiver = {
    observeVideo(value) {
      const observation = structuredClone(value), serialized = canonical(observation);
      return queue(Buffer.byteLength(serialized) + 128, async () => {
        if (inputs.has(observation.timestampUs)) {
          if (inputs.get(observation.timestampUs) !== serialized) throw new Error('different video declaration retry'); return;
        }
        ledger.observeVideo(observation); await persist({ kind: 'input', observation }); inputs.set(observation.timestampUs, serialized);
      });
    },
    appendVideo: value => append('video', value), appendAudio: value => append('audio', value),
    appendClockPair(value) {
      const input = structuredClone(value), sha256 = hash(canonical(input.pair));
      const fingerprint = hash(canonical({ kind: 'clock', identity: input.identity, clockKind: input.kind, pair: input.pair }));
      return queue(Buffer.byteLength(canonical(input)) + 128, async () => {
        const retry = check(input.sequence, input.identity, fingerprint); if (retry) return retry;
        if (input.kind === 'audio') ledger.acceptAudioClock(input.pair); else if (input.kind === 'host') ledger.acceptHostClock(input.pair); else throw new Error('invalid native clock kind');
        const row: Row = { kind: 'clock', sequence: input.sequence, fingerprint, sha256, clockKind: input.kind, pair: input.pair };
        await persist(row); replayReceipt(row); return receipts.get(input.sequence)!.ack;
      });
    },
    async close() {
      if (closing || complete || poisoned) throw new Error('native close unavailable'); closing = true; await tail;
      try {
        if (poisoned) throw new Error('native spool poisoned'); ledger.finish();
        const count = ledger.video.length;
        await writeAll(handles[0]!, createIvfHeader(o.width, o.height, count), 0);
        await Promise.all(handles.map(h => h.sync())); await Promise.all(handles.map(h => h.close())); handles = [];
        const files = await Promise.all(names.map(n => physical(directory, n)));
        const readback = parseIvf(await fs.readFile(files[0]!.path), o.maxBytes);
        if (readback.frames.length !== count || readback.frames.some((f, i) => hash(f.bytes) !== ledger.video[i]!.chunkSha256 || f.timestampUs !== ledger.video[i]!.timestampUs - ledger.video[0]!.timestampUs)) throw new Error('native close video readback');
        const audioSampleCount = ledger.audio.reduce((n, b) => n + b.frameCount, 0);
        if (files[1]!.byteLength !== audioSampleCount * 2) throw new Error('native close PCM readback');
        const markerBytes = Buffer.from(canonical({ identity: o.identity, files, nextSequence, videoFrameCount: count, audioSampleCount }));
        if (byteLength + markerBytes.length > o.maxBytes) throw new Error('native completion quota');
        const markerHandle = await fs.open(path.join(directory, 'complete.json'), 'wx', 0o600);
        try { await markerHandle.writeFile(markerBytes); await markerHandle.sync(); } finally { await markerHandle.close(); }
        const marker = await physical(directory, 'complete.json');
        const cap = Object.freeze({ identity: o.identity, video: files[0]!, audio: files[1]!, ledger: files[2]!, videoFrameCount: count,
          audioSampleCount, firstVideoTimestampUs: ledger.video[0]!.timestampUs, firstAudioSampleIndex: ledger.audio[0]!.startFrame,
          sampleRate: o.sampleRate, audioChannels: 1, audioFormat: 's16le', ivfTimebase: Object.freeze({ rate: 1000000, scale: 1 }), complete: true, poisoned: false }) as ClosedNativeSpool;
        const identities = await Promise.all([...files, marker].map(async f => { const s = await confined(directory, path.basename(f.path)); return { dev: s.dev, ino: s.ino }; }));
        issued.set(cap, { directory, files, marker, ledger, identities });
        await Promise.all([...files, marker].map(f => fs.chmod(f.path, 0o400))); await lease.close(); complete = true; byteLength += markerBytes.length;
        return cap;
      } catch (error) { await poison('close failure'); await Promise.all(handles.map(h => h.close().catch(() => {}))); await lease.close().catch(() => {}); handles = []; throw error; }
    },
    poison: async reason => { await poison(reason); await tail; await Promise.all(handles.map(h => h.close().catch(() => {}))); await lease.close().catch(() => {}); handles = []; },
    abort: async () => receiver.poison('aborted'),
    suspendForResume: async () => {
      if (closing || complete || poisoned) throw new Error('native suspend unavailable');
      closing = true; await tail;
      if (poisoned) throw new Error('native spool poisoned');
      await Promise.all(handles.map(h => h.sync())); await Promise.all(handles.map(h => h.close())); handles = [];
      const files = await Promise.all(names.map(n => physical(directory,n)));
      const checkpoint = Object.freeze({ nextSequence, videoSha256:files[0]!.sha256, audioSha256:files[1]!.sha256, ledgerSha256:files[2]!.sha256 });
      await lease.close(); await fs.unlink(leasePath);
      return checkpoint;
    },
    status: () => Object.freeze({ complete, poisoned, nextSequence, pendingBytes, byteLength }),
  };
  return receiver;
}

async function writeAll(handle: FileHandle, bytes: Buffer, position: number): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, position + offset);
    if (!result.bytesWritten) throw new Error('native spool short write'); offset += result.bytesWritten;
  }
}
