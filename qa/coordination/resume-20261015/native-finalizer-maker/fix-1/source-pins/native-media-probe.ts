/** Independent full decode readback. JSON/flags/durations alone never issue a receipt. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { DecodedMediaIdentity, DecodedStreamIdentity, NativeSpoolFile } from "./native-media-types.js";

const MAX_BYTES = 8 * 1024 ** 3;
const MAX_FRAMES = 1_000_000;
export interface NativeDecoderOptions { ffmpegPath: string; ffprobePath: string }
export interface DecodedFrameHash { streamIndex: number; pts: number; duration: number; size: number; sha256: string; timebase: { numerator: number; denominator: number } }
export interface NativeDecodedProbe {
  readonly media: DecodedMediaIdentity;
  readonly frames: readonly DecodedFrameHash[];
  readonly decoder: { path: string; version: string; sha256: string; argv: readonly string[] };
  readonly inspector: { path: string; version: string; sha256: string; argv: readonly string[] };
  readonly audioPcmSha256: string | null;
}
const admitted = new WeakSet<object>();
const immutable = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); } return value; };
function integer(value: unknown, label: string, minimum = 0): number {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw new Error(`Invalid decoded ${label}`);
  return Number(value);
}
function rational(value: unknown): { numerator: number; denominator: number } {
  if (typeof value !== "string" || !/^\d+\/\d+$/.test(value)) throw new Error("Missing decoded timebase");
  const [a,b] = value.split("/"); return { numerator: integer(a,"timebase",1), denominator: integer(b,"timebase",1) };
}
/** Hash bounded regular local bytes, refusing aliases at every ancestor and changes during read. */
export function fingerprintNativeFile(file: string, maxBytes = MAX_BYTES): NativeSpoolFile {
  if (!path.isAbsolute(file) || /^[/\\]{2}/.test(file) || /[\x00-\x1f]/.test(file) || (process.platform === "win32" && file.slice(path.parse(file).root.length).includes(":"))) throw new Error("Local native file required");
  const resolved = path.resolve(file), canonical = (s: string) => process.platform === "win32" ? s.toLowerCase() : s;
  for (let current = resolved;; current = path.dirname(current)) {
    const s = lstatSync(current);
    if (s.isSymbolicLink() || canonical(realpathSync(current)) !== canonical(current)) throw new Error("Native file alias refused");
    if (path.dirname(current) === current) break;
  }
  const before = statSync(resolved, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size <= 0n || before.size > BigInt(maxBytes)) throw new Error("Native file outside bounds");
  const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024), fd = openSync(resolved,"r");
  try { let left=Number(before.size);while(left>0){const n=readSync(fd,buffer,0,Math.min(buffer.length,left),null);if(!n)throw new Error("Native file truncated while hashing");hash.update(buffer.subarray(0,n));left-=n;}if(readSync(fd,buffer,0,1,null))throw new Error("Native file grew while hashing"); } finally { closeSync(fd); }
  const after = statSync(resolved,{bigint:true});
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Native file changed while hashing");
  return { path: resolved, sha256: hash.digest("hex"), byteLength: Number(after.size) };
}
function command(binary: string, args: string[], timeout = 120_000): string {
  const result = spawnSync(binary,args,{ encoding:"utf8", timeout, killSignal:"SIGKILL", windowsHide:true, maxBuffer:128 * 1024 * 1024 });
  if (result.error || result.status !== 0 || result.stderr.trim()) throw new Error(`Native decoder failed: ${result.error?.message ?? result.stderr.slice(0,300)}`);
  return result.stdout;
}
export function parseNativeFrameHashes(text: string): DecodedFrameHash[] {
  const timebases = new Map<number,{numerator:number;denominator:number}>(), frames: DecodedFrameHash[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tb = /^#tb\s+(\d+):\s*(\d+\/\d+)\s*$/.exec(line);
    if (tb) { const index = integer(tb[1],"framehash stream"); if (timebases.has(index)) throw new Error("Duplicate decoded timebase"); timebases.set(index,rational(tb[2])); continue; }
    if (!line.trim() || line.startsWith("#")) continue;
    const fields = line.split(",").map(s=>s.trim());
    const streamIndex = integer(fields[0],"framehash stream"), timebase = timebases.get(streamIndex);
    if (fields.length !== 6 || !timebase || !/^[a-f0-9]{64}$/.test(fields[5] ?? "")) throw new Error("Malformed decoded framehash");
    const pts = integer(fields[2],"framehash PTS",-Number.MAX_SAFE_INTEGER);
    frames.push({ streamIndex,pts,duration:integer(fields[3],"framehash duration",1),size:integer(fields[4],"framehash size",1),sha256:fields[5]!,timebase });
    if (frames.length > MAX_FRAMES) throw new Error("Decoded frame limit exceeded");
  }
  if (!frames.length) throw new Error("No independently decoded frames");
  return frames;
}
type JsonRecord = Record<string,unknown>;
function records(value: unknown): JsonRecord[] { if (!Array.isArray(value) || value.length > MAX_FRAMES || value.some(v=>!v || typeof v!=="object" || Array.isArray(v))) throw new Error("Malformed decoded records"); return value as JsonRecord[]; }
/** Parsing is deliberately not authority: only probeNativeMedia admits its returned object. */
export function parseNativeProbe(file: NativeSpoolFile, raw: unknown, hashes: readonly DecodedFrameHash[]): DecodedMediaIdentity {
  if (!raw || typeof raw !== "object") throw new Error("Missing decoded inspection");
  const doc = raw as JsonRecord, streams = records(doc.streams);
  // With -show_frames and -show_packets ffprobe uses one interleaved collection.
  const combined = doc.packets_and_frames === undefined ? null : records(doc.packets_and_frames);
  const frames = combined ? combined.filter(v=>v.type==="frame") : records(doc.frames);
  const packets = combined ? combined.filter(v=>v.type==="packet") : records(doc.packets);
  if (streams.length < 1 || streams.length > 2) throw new Error("Unexpected native stream count");
  const seen = new Set<string>();
  const decoded = streams.map((stream): DecodedStreamIdentity => {
    const kind = stream.codec_type;
    if ((kind !== "audio" && kind !== "video") || seen.has(kind) || typeof stream.codec_name !== "string" || !stream.codec_name) throw new Error("Ambiguous decoded stream");
    seen.add(kind);
    const index = integer(stream.index,"stream index"), timebase = rational(stream.time_base);
    const own = frames.filter(frame=>frame.stream_index===index);
    const ordinal = kind === "audio" && streams.some(s=>s.codec_type==="video") ? 1 : 0;
    const ownHashes = hashes.filter(frame=>frame.streamIndex===ordinal);
    if (!own.length || ownHashes.length !== own.length) throw new Error("Decoded identity/frame count mismatch");
    const pts = own.map(frame=>integer(frame.pts,"frame PTS",-Number.MAX_SAFE_INTEGER));
    for (let i=0;i<pts.length;i++) {
      const hash = ownHashes[i]!;
      if (i && pts[i]! <= pts[i-1]!) throw new Error("Nonmonotonic decoded PTS");
      const a = BigInt(pts[i]!) * BigInt(timebase.numerator) * BigInt(hash.timebase.denominator);
      const b = BigInt(hash.pts) * BigInt(hash.timebase.numerator) * BigInt(timebase.denominator);
      if (a !== b) throw new Error("Independent decoder PTS mismatch");
    }
    let skip: number | null = null, discard: number | null = null;
    for (const packet of packets.filter(p=>p.stream_index===index)) {
      if (packet.side_data_list === undefined) continue;
      for (const side of records(packet.side_data_list)) if (side.side_data_type === "Skip Samples") {
        const s = integer(side.skip_samples,"skip samples"), d = integer(side.discard_padding,"discard samples");
        if (s) { if (skip !== null && skip !== s) throw new Error("Conflicting codec skip"); skip=s; }
        else if (skip===null) skip=0;
        if (d) { if (discard !== null && discard !== d) throw new Error("Conflicting codec discard"); discard=d; }
        else if (discard===null) discard=0;
      }
    }
    const pcm = kind === "audio" && stream.codec_name.startsWith("pcm_");
    const sampleRate = kind === "audio" ? integer(stream.sample_rate,"sample rate",1) : null;
    if (kind === "audio" && integer(stream.channels,"channels",1)!==1) throw new Error("Mono native audio required");
    const count = kind === "audio" ? own.reduce((sum,frame)=>sum+integer(frame.nb_samples,"audio samples",1),0) : null;
    if (count !== null && !Number.isSafeInteger(count)) throw new Error("Decoded sample count overflow");
    return { streamId:`${file.sha256}:${index}`,streamIndex:index,kind,codec:stream.codec_name,timebase,
      firstPts:pts[0]!,lastPts:pts.at(-1)!,decodedFrameCount:own.length,decodedSampleCount:count,sampleRate,
      codecPrimingSamples:pcm ? 0 : stream.initial_padding === undefined ? null : integer(stream.initial_padding,"codec priming"),
      skipSamples:pcm ? 0 : skip,discardPaddingSamples:pcm ? 0 : discard };
  });
  if (hashes.some(h=>h.streamIndex>=decoded.length)) throw new Error("Unidentified decoded stream");
  return {file,streams:decoded};
}
export function requireNativeDecodedProbe(value: NativeDecodedProbe): NativeDecodedProbe {
  if (!value || !admitted.has(value)) throw new Error("Independent decoder capability required");
  if (fingerprintNativeFile(value.media.file.path).sha256 !== value.media.file.sha256 || fingerprintNativeFile(value.decoder.path,512*1024**2).sha256!==value.decoder.sha256 || fingerprintNativeFile(value.inspector.path,512*1024**2).sha256!==value.inspector.sha256) throw new Error("Decoded identity changed");
  return value;
}
/** Positive rational is supported across FFmpeg builds; -1 is not a portable alias.
 * This is only an encoder setting: parseNativeProbe still verifies decoded PTS exactly. */
export function nativeDecoderVideoTimebaseArgs(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") throw new Error("Missing decoded inspection");
  const videos=records((raw as JsonRecord).streams).filter(s=>s.codec_type==="video");
  if (!videos.length) return [];
  if (videos.length!==1) throw new Error("Ambiguous decoded video timebase");
  const tb=rational(videos[0]!.time_base);
  if (tb.numerator>0x7fffffff || tb.denominator>0x7fffffff) throw new Error("Decoded timebase outside encoder rational bounds");
  return ["-enc_time_base:v",`${tb.numerator}:${tb.denominator}`];
}
export function probeNativeMedia(file: string, options: NativeDecoderOptions): NativeDecodedProbe {
  const before = fingerprintNativeFile(file), decoderFile = fingerprintNativeFile(options.ffmpegPath,512*1024**2), inspectorFile = fingerprintNativeFile(options.ffprobePath,512*1024**2);
  const version = command(decoderFile.path,["-version"]), inspectorVersion = command(inspectorFile.path,["-version"]);
  const common = ["-protocol_whitelist","file,pipe","-format_whitelist","matroska,webm,mov,ivf,s16le,wav"];
  const inspectorArgv = ["-v","error",...common,"-show_streams","-show_frames","-show_packets","-of","json",before.path];
  const raw = JSON.parse(command(inspectorFile.path,inspectorArgv));
  // Explicit codecs and maps guarantee raw decoded content hashes, not packet hashes.
  const argv = ["-nostdin","-hide_banner","-loglevel","error","-xerror","-err_detect","explode","-threads","1",...common,"-copyts","-i",before.path,"-map","0:v:0?","-map","0:a:0?","-c:v","rawvideo","-threads:v","1","-fps_mode","passthrough",...nativeDecoderVideoTimebaseArgs(raw),"-c:a","pcm_s16le","-f","framehash","-hash","sha256","-"];
  const frames = parseNativeFrameHashes(command(decoderFile.path,argv));
  const media = parseNativeProbe(before,raw,frames);
  let audioPcmSha256: string | null = null;
  if (media.streams.some(s=>s.kind==="audio")) {
    const audioHash = command(decoderFile.path,["-nostdin","-hide_banner","-loglevel","error","-xerror","-err_detect","explode","-threads","1",...common,"-i",before.path,"-map","0:a:0","-vn","-c:a","pcm_s16le","-f","hash","-hash","sha256","-"]);
    const match = /^SHA256=([a-f0-9]{64})\s*$/.exec(audioHash);
    if (!match) throw new Error("Missing decoded PCM identity"); audioPcmSha256=match[1]!;
  }
  if (fingerprintNativeFile(file).sha256 !== before.sha256 || fingerprintNativeFile(decoderFile.path,512*1024**2).sha256 !== decoderFile.sha256 || fingerprintNativeFile(inspectorFile.path,512*1024**2).sha256 !== inspectorFile.sha256) throw new Error("Native decode inputs changed");
  const result = immutable({ media,frames,audioPcmSha256,decoder:{path:decoderFile.path,sha256:decoderFile.sha256,version,argv},inspector:{path:inspectorFile.path,sha256:inspectorFile.sha256,version:inspectorVersion,argv:inspectorArgv} });
  admitted.add(result); return result;
}
