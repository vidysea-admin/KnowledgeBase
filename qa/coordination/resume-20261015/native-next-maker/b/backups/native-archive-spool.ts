/** Full closed-spool replay from private admission. Returns facts, never an issued capability. */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireNativeArchiveAdmission, type NativeArchiveAdmission } from "./native-archive-authority.js";
import { NativeClockLedger, sameNativeIdentity, safeInteger } from "./native-clock-ledger.js";
import { parseIvf, isVp8KeyFrame } from "./native-ivf.js";
import { fingerprintNativeFile } from "./native-media-probe.js";
import type { NativeSpoolFile } from "./native-media-types.js";

const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
};
export async function proveArchivedNativeSpool(admission: NativeArchiveAdmission) {
  const { directory, manifest } = await requireNativeArchiveAdmission(admission);
  const names = ["source.vp8.ivf", "source.s16le", "producer-observations.jsonl"];
  const files: NativeSpoolFile[] = names.map(name => fingerprintNativeFile(path.join(directory, name)));
  const marker = fingerprintNativeFile(path.join(directory, "complete.json"), 65536);
  const markerRow = JSON.parse(await fs.readFile(marker.path, "utf8"));
  if (files[2]!.byteLength > 64 * 1024 ** 2) throw new Error("Archived native journal outside replay bound");
  const journal = await fs.readFile(files[2]!.path, "utf8");
  if (!journal.endsWith("\n")) throw new Error("Invalid archived native journal");
  const lines = journal.trimEnd().split("\n"), config = JSON.parse(lines.shift()!);
  if (config.schema !== "native-spool/1" || !sameNativeIdentity(config.identity, manifest.identity) ||
    !sameNativeIdentity(markerRow.identity, manifest.identity) || !safeInteger(config.maxBytes, 1) ||
    !safeInteger(config.maxChunkBytes, 1) || !safeInteger(config.maxPendingBytes, 1) ||
    config.maxChunkBytes > config.maxPendingBytes || config.maxPendingBytes > config.maxBytes ||
    files.reduce((n, file) => n + file.byteLength, marker.byteLength) > config.maxBytes) throw new Error("Invalid archived native configuration");
  const ledger = new NativeClockLedger(manifest.identity, config.sampleRate);
  const video = parseIvf(await fs.readFile(files[0]!.path), config.maxBytes);
  if (video.width !== config.width || video.height !== config.height) throw new Error("Archived native IVF configuration mismatch");
  const audio = await fs.readFile(files[1]!.path);
  let sequence = 0, videoIndex = 0, audioOffset = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    if (row.kind === "input") { ledger.observeVideo(row.observation); continue; }
    if (row.sequence !== sequence++) throw new Error("Gapped archived native sequence");
    if (row.kind === "video" || row.kind === "audio") {
      const observation = row.observation;
      const size = row.kind === "video" ? observation.encodedByteLength : observation.byteLength;
      if (!safeInteger(size, 1) || size > config.maxChunkBytes) throw new Error("Archived native chunk outside quota");
      const frame = row.kind === "video" ? video.frames[videoIndex++] : undefined;
      const raw = row.kind === "video" ? frame?.bytes : audio.subarray(audioOffset, audioOffset + size);
      if (!raw || raw.length !== size || hash(raw) !== row.sha256) throw new Error("Archived native chunk identity mismatch");
      const wire = { ...observation }; delete wire.chunkSha256; delete wire.sha256;
      if (hash(canonical({ kind: row.kind, identity: manifest.identity, observation: wire, sha256: row.sha256 })) !== row.fingerprint) throw new Error("Archived native metadata changed");
      if (row.kind === "video") {
        const origin = ledger.video[0]?.timestampUs ?? observation.timestampUs;
        if (frame!.timestampUs !== observation.timestampUs - origin || row.sha256 !== observation.chunkSha256 ||
          isVp8KeyFrame(raw) !== (observation.encodedType === "key")) throw new Error("Archived native video framing mismatch");
        ledger.acceptVideo(observation);
      } else {
        if (row.sha256 !== observation.sha256) throw new Error("Archived native audio identity mismatch");
        ledger.acceptAudio(observation); audioOffset += size;
      }
    } else if (row.kind === "clock") {
      if (hash(canonical(row.pair)) !== row.sha256 || hash(canonical({ kind: "clock", identity: manifest.identity, clockKind: row.clockKind, pair: row.pair })) !== row.fingerprint) throw new Error("Archived native clock changed");
      if (row.clockKind === "audio") ledger.acceptAudioClock(row.pair);
      else if (row.clockKind === "host") ledger.acceptHostClock(row.pair);
      else throw new Error("Invalid archived native clock kind");
    } else throw new Error("Invalid archived native journal row");
  }
  ledger.finish();
  const audioSampleCount = ledger.audio.reduce((count, block) => count + block.frameCount, 0);
  if (videoIndex !== video.frames.length || audioOffset !== audio.length || audio.length !== audioSampleCount * 2 ||
    sequence !== markerRow.nextSequence || markerRow.videoFrameCount !== videoIndex || markerRow.audioSampleCount !== audioSampleCount ||
    !Array.isArray(markerRow.files) || markerRow.files.length !== 3 || files.some((file, i) => file.sha256 !== markerRow.files[i]?.sha256 || file.byteLength !== markerRow.files[i]?.byteLength)) throw new Error("Archived native completion mismatch");
  await requireNativeArchiveAdmission(admission);
  return { directory, files, marker, ledger, identity: manifest.identity, audioSampleCount, sampleRate: config.sampleRate as number };
}
