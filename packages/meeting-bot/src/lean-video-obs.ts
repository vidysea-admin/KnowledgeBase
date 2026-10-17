/**
 * packages/meeting-bot/src/lean-video-obs.ts — T-035 wiring: push the lean-video settings (720p, low fps,
 * low bitrate; packages/core/src/domain/lean-video.ts) into OBS over obs-websocket v5 before a recording starts,
 * and put the operator's own values back afterwards (ISS-LEANWIRE-003).
 * Lives outside capture/ (that directory is at its 30-file budget). Fail-soft: an OBS that refuses a request
 * is logged and the recording proceeds with OBS's current settings — a lost recording is worse than a big one.
 *
 * Restore design: BEFORE the first Set call the previous canvas/fps (GetVideoSettings) and the previous value of
 * every profile parameter we are about to set (GetProfileParameter; null = unset) are written to a state file in the
 * record dir. The state file survives a crash, so `lkb finalize --stop-obs` can restore too. Restore is best-effort
 * but loud: any failure is logged and handed to `alert`, and the state file is KEPT so a later run can retry.
 * Never restores while OBS is still recording (SetVideoSettings is rejected then anyway).
 *
 * Output mode: SimpleOutput VBitrate/ABitrate only drive the recording in Simple output mode with RecQuality
 * "Stream" ("Same as stream"). If the profile is definitely in another mode/quality the bitrate keys are SKIPPED with a
 * warning (the mode is the operator's choice and is not changed); canvas and fps still apply.
 */
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, rmSync, writeFileSync, type BigIntStats } from "node:fs";
import path from "node:path";
// Deep import: packages/core/src/index.ts does not re-export lean-video yet (ISS-LEANWIRE-001).
import { assessLeanVideoSettings, toObsRequests, type LeanVideoAssessment, type LeanVideoInput } from "@lkb/core/src/domain/lean-video.js";

export interface LeanObsClient { call: (request: string, args?: unknown) => Promise<any> }

export interface LeanVideoApplyResult {
  assessment: LeanVideoAssessment;
  failed: string[];
  /** Profile parameters not sent, with the reason (output mode would ignore them, or the old value was unreadable). */
  skipped: string[];
  /** True when a restore state file holds the previous values. False = nothing was changed in OBS. */
  restorable: boolean;
}

export interface LeanApplyOptions { /** Where the previous values are persisted. Required for a restorable apply. */ stateFile?: string }

interface PrevParam { parameterCategory: string; parameterName: string; previous: string | null }
interface PrevVideo { baseWidth: number; baseHeight: number; outputWidth: number; outputHeight: number; fpsNumerator: number; fpsDenominator: number }
export interface LeanRestoreState { version: 1; video: PrevVideo; params: PrevParam[]; appliedAt: string }

export const LEAN_RESTORE_FILE = ".lean-video-restore.json";
export const leanRestorePath = (recordDir: string): string => path.join(recordDir, LEAN_RESTORE_FILE);

const VIDEO_KEYS = ["baseWidth", "baseHeight", "outputWidth", "outputHeight", "fpsNumerator", "fpsDenominator"] as const;
const validVideo = (video: PrevVideo) => VIDEO_KEYS.every((k) => Number.isSafeInteger(video?.[k]) && video[k] > 0 && video[k] <= (k.startsWith("fps") ? 1000000 : 32768));

async function readParam(obs: LeanObsClient, parameterCategory: string, parameterName: string): Promise<string | null | undefined> {
  try {
    const r = await obs.call("GetProfileParameter", { parameterCategory, parameterName });
    const v = r?.parameterValue;
    return typeof v === "string" ? v : v === null || v === undefined ? null : undefined;
  } catch { return undefined; } // undefined = unreadable
}

interface OwnedState { state: LeanRestoreState; identity: BigIntStats; bytes: string }
const sameIdentity = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs;

/** State is authority to change OBS, so aliases and foreign replacements are refused. */
function localStatePath(file: string): void {
  if (!path.isAbsolute(file) || /^[\\/]{2}/.test(file) || /[\x00-\x1f]/.test(file) ||
      (process.platform === "win32" && file.slice(path.parse(file).root.length).includes(":"))) throw new Error("unsafe restore state path");
  for (let current = path.dirname(file); ; current = path.dirname(current)) {
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error("restore state ancestor alias");
    if (path.dirname(current) === current) break;
  }
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (canonical(realpathSync(path.dirname(file))) !== canonical(path.resolve(path.dirname(file)))) throw new Error("restore state ancestor alias");
}

function readOwnedState(file: string): OwnedState | undefined {
  let fd: number | undefined;
  try {
    localStatePath(file);
    const identity = lstatSync(file, { bigint: true });
    if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1n || identity.size <= 0n || identity.size > 65536n) return undefined;
    fd = openSync(file, "r");
    if (!sameIdentity(identity, fstatSync(fd, { bigint: true }))) return undefined;
    const buffer = Buffer.alloc(65537);
    let length = 0;
    while (length < buffer.length) { const count = readSync(fd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
    if (length > 65536) return undefined;
    const bytes = buffer.subarray(0, length).toString("utf8");
    if (!sameIdentity(identity, fstatSync(fd, { bigint: true })) || !sameIdentity(identity, lstatSync(file, { bigint: true }))) return undefined;
    const s = JSON.parse(bytes) as LeanRestoreState;
    if (s?.version !== 1 || !s.video || !Array.isArray(s.params)) return undefined;
    if (!validVideo(s.video) || Object.keys(s.video).length !== VIDEO_KEYS.length) return undefined;
    if (s.params.length > 2 || !s.params.every((p) => p?.parameterCategory === "SimpleOutput" &&
        (p.parameterName === "VBitrate" || p.parameterName === "ABitrate") &&
        (p.previous === null || (typeof p.previous === "string" && p.previous.length <= 4096))) ||
        new Set(s.params.map((p) => p.parameterName)).size !== s.params.length) return undefined;
    return { state: s, identity, bytes };
  } catch { return undefined; } finally { if (fd !== undefined) closeSync(fd); }
}

function stillOwned(file: string, owned: OwnedState): boolean {
  const current = readOwnedState(file);
  return Boolean(current && sameIdentity(owned.identity, current.identity) && current.bytes === owned.bytes);
}

export async function applyLeanVideoToObs(obs: LeanObsClient, input: LeanVideoInput, log: (msg: string) => void, opts: LeanApplyOptions = {}): Promise<LeanVideoApplyResult> {
  const assessment = assessLeanVideoSettings(input);
  const { settings, estimateMbPerHour, withinTarget, targetMbPerHour } = assessment;
  const req = toObsRequests(settings);
  const failed: string[] = [];
  const skipped: string[] = [];
  const result = (restorable: boolean): LeanVideoApplyResult => ({ assessment, failed, skipped, restorable });
  const key = (p: { parameterCategory: string; parameterName: string }) => `${p.parameterCategory}/${p.parameterName}`;

  // 1. Will the bitrate keys do anything? Only in Simple output mode with RecQuality "Stream".
  const mode = await readParam(obs, "Output", "Mode");
  const quality = await readParam(obs, "SimpleOutput", "RecQuality");
  let bitratesIgnored: string | undefined;
  if (typeof mode === "string" && mode !== "Simple") bitratesIgnored = `output mode is "${mode}", not Simple`;
  else if (typeof quality === "string" && quality !== "Stream") bitratesIgnored = `recording quality is "${quality}", not "Stream" (Same as stream)`;
  else if (mode === undefined || quality === undefined) log("lean video: WARNING could not read the OBS output mode / recording quality; bitrates are sent but may be ignored");
  let toSend = req.profileParameters;
  if (bitratesIgnored) {
    toSend = [];
    for (const p of req.profileParameters) skipped.push(key(p));
    log(`lean video: WARNING ${bitratesIgnored}, so SimpleOutput VBitrate/ABitrate would be ignored — not sent and the mode is not changed; the recording size depends on the operator's own OBS output settings`);
  }

  // 2. Snapshot the values we are about to change, and persist it BEFORE the first Set call.
  const prior = opts.stateFile ? readOwnedState(opts.stateFile) : undefined;
  const stale = prior?.state;
  if (opts.stateFile && !stale && existsSync(opts.stateFile)) {
    log("lean video: WARNING an earlier restore state file exists but is unreadable; lean video NOT applied (it would overwrite the only record of the original values)");
    return result(false);
  }
  if (stale) log("lean video: an earlier run's restore state is still present; keeping its ORIGINAL values (OBS currently holds lean values)");
  let video: PrevVideo | undefined = stale?.video;
  const params: PrevParam[] = [...(stale?.params ?? [])];
  try {
    if (!video) {
      const cur = await obs.call("GetVideoSettings");
      if (!validVideo(cur)) throw new Error("incomplete GetVideoSettings reply");
      video = Object.fromEntries(VIDEO_KEYS.map((k) => [k, cur[k]])) as unknown as PrevVideo;
    }
  } catch (e) {
    log(`lean video: WARNING cannot read OBS's current video settings (${String(e)}); lean video NOT applied because it could not be restored`);
    return result(false);
  }
  const sendable = [];
  for (const p of toSend) {
    if (params.some((x) => key(x) === key(p))) { sendable.push(p); continue; }
    const previous = await readParam(obs, p.parameterCategory, p.parameterName);
    if (previous === undefined) { skipped.push(key(p)); log(`lean video: WARNING cannot read ${key(p)}; not changed because it could not be restored`); continue; }
    params.push({ parameterCategory: p.parameterCategory, parameterName: p.parameterName, previous });
    sendable.push(p);
  }
  let persisted: OwnedState | undefined;
  if (opts.stateFile) {
    let fd: number | undefined;
    try {
      const state: LeanRestoreState = { version: 1, video, params, appliedAt: new Date().toISOString() };
      localStatePath(opts.stateFile);
      if (prior) {
        if (!stillOwned(opts.stateFile, prior) || params.length !== prior.state.params.length) throw new Error("restore state changed or lacks required snapshot");
      } else {
        fd = openSync(opts.stateFile, "wx", 0o600);
        writeFileSync(fd, JSON.stringify(state, null, 2) + "\n");
        closeSync(fd); fd = undefined;
      }
      persisted = readOwnedState(opts.stateFile);
      if (!persisted || (prior && !sameIdentity(prior.identity, persisted.identity))) throw new Error("restore state publication changed");
    } catch (e) {
      log(`lean video: WARNING cannot persist the restore state (${String(e)}); lean video NOT applied because it could not be restored`);
      return result(false);
    } finally { if (fd !== undefined) closeSync(fd); }
  }

  // 3. Apply.
  const send = async (name: string, args: unknown): Promise<void> => {
    if (opts.stateFile && (!persisted || !stillOwned(opts.stateFile, persisted))) { failed.push("state-file"); log("lean video: restore state changed; OBS change refused"); return; }
    try { await obs.call(name, args); } catch (e) { failed.push(name); log(`lean video: ${name} refused, OBS keeps its current value (${String(e)})`); }
  };
  await send("SetVideoSettings", req.videoSettings);
  for (const p of sendable) await send("SetProfileParameter", p);
  for (const note of settings.adjustments) log(`lean video: ${note}`);
  log(`lean video: ${settings.width}x${settings.height} @ ${settings.fps} fps, video ${settings.videoBitrateKbps} kbps, audio ${settings.audioBitrateKbps} kbps; ` +
    `estimate ${estimateMbPerHour.toFixed(1)} MB/h (${withinTarget ? "under" : "NOT under"} ${targetMbPerHour} MB/h)`);
  return result(Boolean(opts.stateFile));
}

export type LeanRestoreStatus = "none" | "restored" | "skipped-recording" | "failed";

/** Put the operator's previous video/profile values back. Never throws. Keeps the state file unless fully restored. */
export async function restoreLeanVideoInObs(obs: LeanObsClient, stateFile: string, log: (msg: string) => void, alert?: (msg: string) => void): Promise<{ status: LeanRestoreStatus; failed: string[] }> {
  if (!existsSync(stateFile)) return { status: "none", failed: [] };
  const fail = (failed: string[], why: string) => {
    const msg = `OBS profile NOT restored (${why}); the lean video values may still be in the OBS profile. Restore state kept at ${stateFile}; rerun lkb finalize --stop-obs or set them by hand.`;
    log(`lean video: ${msg}`);
    try { alert?.(msg); } catch { /* an alert failure must not hide the log line above */ }
    return { status: "failed" as const, failed };
  };
  const owned = readOwnedState(stateFile);
  if (!owned) return fail(["state-file"], "restore state file unreadable or unsafe");
  const state = owned.state;
  try {
    const st = await obs.call("GetRecordStatus");
    if (st?.outputActive === true) {
      log("lean video: OBS is still recording, previous video settings NOT restored yet (state kept)");
      return { status: "skipped-recording", failed: [] };
    }
  } catch { /* status unknown: attempt the restore; OBS itself rejects SetVideoSettings during an active output */ }
  const failed: string[] = [];
  const send = async (label: string, name: string, args: unknown) => {
    if (!stillOwned(stateFile, owned)) { failed.push("state-file"); return; }
    try { await obs.call(name, args); } catch (e) { failed.push(label); log(`lean video: restore ${label} failed (${String(e)})`); }
  };
  await send("SetVideoSettings", "SetVideoSettings", state.video);
  for (const p of state.params) {
    await send(`${p.parameterCategory}/${p.parameterName}`, "SetProfileParameter",
      { parameterCategory: p.parameterCategory, parameterName: p.parameterName, parameterValue: p.previous });
  }
  if (failed.length) return fail(failed, `failed: ${failed.join(", ")}`);
  if (!stillOwned(stateFile, owned)) return fail(["state-file"], "restore state replaced; foreign file preserved");
  try { rmSync(stateFile, { force: true }); } catch (e) { log(`lean video: restored, but could not delete ${stateFile} (${String(e)})`); }
  log("lean video: previous OBS video settings and profile parameters restored");
  return { status: "restored", failed: [] };
}
