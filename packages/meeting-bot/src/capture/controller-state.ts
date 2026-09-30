/** Durable controller identity and owned interrupted-capture recovery. */
import { randomBytes } from "node:crypto";
import type { GapWindow } from "./reconnect-gaps.js";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync, lstatSync, realpathSync, statSync, readdirSync, openSync, readSync, writeSync, fsyncSync, closeSync } from "node:fs";
import path from "node:path";

export interface RecordState {
  pid: number;
  sessionId: string;
  title: string;
  platform: string;
  /** ISO timestamp of the `--until` bound the controller was given. */
  until: string;
  /** Directory OBS was told to write its output into for this run. */
  obsOutputDir: string;
  /** ISO timestamp of when this state file was written. */
  startedAt: string;
  /** Process creation time prevents PID reuse; missing legacy identity remains conservative. */
  controllerStartedAt?: string;
}

export function stateFilePath(recordDir: string): string {
  return path.join(recordDir, ".record-state.json");
}

export function writeControllerState(recordDir: string, state: RecordState): void {
  writeFileSync(stateFilePath(recordDir), JSON.stringify(state, null, 2) + "\n");
}

/** Returns undefined when there's no state file, or its content isn't a valid record — never
 * throws, since a watchdog tick must never crash on a partial/corrupt write. */
export function readControllerState(recordDir: string): RecordState | undefined {
  const p = stateFilePath(recordDir);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<RecordState>;
    if (typeof parsed.pid !== "number" || typeof parsed.sessionId !== "string") return undefined;
    return parsed as RecordState;
  } catch {
    return undefined;
  }
}

/** Idempotent — a missing file is not an error (`force: true`). */
export function removeControllerState(recordDir: string): void {
  rmSync(stateFilePath(recordDir), { force: true });
}

/** Signal 0 probes whether a pid exists without affecting it (works on Windows + POSIX in
 * Node); any throw (ESRCH, EPERM on a foreign pid it can't see, EINVAL on a bad pid) means "can't
 * confirm this controller is alive," which the watchdog must treat as dead rather than hang. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Bounded platform identity; an unknown probe must never imply a mismatch. */
export function getProcessStartTime(pid: number, probes: {
  platform?: NodeJS.Platform;
  readProc?: (file: string, maxBytes: number) => string | undefined;
  windowsStartTime?: (pid: number) => string;
} = {}): string | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) return undefined;
  try {
    const platform = probes.platform ?? process.platform;
    if (platform === "win32") {
      const out = probes.windowsStartTime ? probes.windowsStartTime(pid) : execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString("o")`],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      return out.trim() || undefined;
    }
    if (platform !== "linux") return undefined;
    const read = probes.readProc ?? ((file: string, maxBytes: number) => {
      const fd = openSync(file, "r");
      try {
        const buffer = Buffer.alloc(maxBytes + 1);
        const size = readSync(fd, buffer, 0, buffer.length, 0);
        return size <= maxBytes ? buffer.toString("utf8", 0, size) : undefined;
      } finally { closeSync(fd); }
    });
    const stat = read(`/proc/${pid}/stat`, 8192), boot = read("/proc/sys/kernel/random/boot_id", 128);
    if (typeof stat !== "string" || typeof boot !== "string" || Buffer.byteLength(stat) > 8192 || Buffer.byteLength(boot) > 128) return undefined;
    const bootId = boot.trim().toLowerCase();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(bootId)) return undefined;
    const closing = stat.lastIndexOf(")");
    if (!stat.startsWith(`${pid} (`) || closing < `${pid} (`.length || stat[closing + 1] !== " ") return undefined;
    const fields = stat.slice(closing + 2).trim().split(/\s+/);
    const ticks = fields[19]; // proc_pid_stat(5): field 22; tail starts with field 3 (state).
    if (fields.length < 20 || typeof fields[0] !== "string" || typeof ticks !== "string" || !/^[RSDZTtWXxKPI]$/.test(fields[0]) || fields.slice(1, 19).some(value => !/^-?\d+$/.test(value)) ||
        !/^[1-9]\d{0,19}$/.test(ticks) || BigInt(ticks) > 18446744073709551615n) return undefined;
    return `linux:${bootId}:${ticks}`;
  } catch {
    return undefined;
  }
}

/** Missing identity retains legacy pid trust; only a proven mismatch rejects it. */
export function controllerMatchesIdentity(expectedStartedAt: string | undefined, actualStartedAt: string | undefined): boolean {
  if (!expectedStartedAt || !actualStartedAt) return true;
  return expectedStartedAt === actualStartedAt;
}

/** Watchdog liveness with injectable identity probes; recovery separately refuses unknown liveness. */
export function isControllerAlive(
  state: RecordState,
  probes: { pidAlive?: (pid: number) => boolean; processStartTime?: (pid: number) => string | undefined } = {},
): boolean {
  const pidAlive = probes.pidAlive ?? isPidAlive;
  const processStartTime = probes.processStartTime ?? getProcessStartTime;
  if (!pidAlive(state.pid)) return false;
  // No identity was recorded (state file predates this field, or the write-time probe failed) —
  // nothing to compare against, so don't pay for a getProcessStartTime probe on every tick just
  // to immediately discard it; fall back to the pid-alive result, same as before this fix.
  if (!state.controllerStartedAt) return true;
  return controllerMatchesIdentity(state.controllerStartedAt, processStartTime(state.pid));
}

function confinedRecoveryPath(target: string, base: string, required = true): string {
  const absolute = path.resolve(target), relative = path.relative(base, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Recovery path unconfined");
  let cursor = absolute;
  while (cursor !== path.dirname(cursor)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Recovery symlink refused");
    cursor = path.dirname(cursor);
  }
  if (required && (!existsSync(absolute) || realpathSync(absolute) !== absolute)) throw new Error("Recovery path identity refused");
  return absolute;
}

/** Exact operator profile cleanup only; controller death and mutex authorization belong to the caller. */
export function cleanupOwnedBrowserProfile(
  profile: string, context: {repoRoot: string; python: string; joinScript: string; stopFile: string},
  cleanup?: (profile: string) => void,
): boolean {
  confinedRecoveryPath(profile, path.resolve(context.repoRoot), false);
  if (!existsSync(profile)) return false;
  if (cleanup) cleanup(profile);
  else {
    const result = spawnSync(context.python, [context.joinScript, "http://127.0.0.1/", "--profile", profile,
      "--title", "owned profile cleanup", "--stop-file", context.stopFile, "--cleanup-only"], {encoding: "utf8", timeout: 10000, windowsHide: true});
    if (result.status !== 0) throw new Error("Owned browser cleanup failed; inspect configured profile");
  }
  return true;
}

export interface ControllerRecoveryContext {
  repoRoot: string;
  recordDir: string;
  profileDir: string;
  sessionId: string;
  tenantId: string;
  python: string;
  joinScript: string;
}

export interface ControllerRecoveryActions {
  normalize: (video: string) => string;
  finalize: (video: string, gaps: GapWindow[]) => Promise<void>;
  processArtifacts: (video: string) => void;
  pidProbe?: (pid: number) => "dead" | "live" | "unknown";
  startTime?: (pid: number) => string | undefined;
  cleanup?: (profile: string) => void;
  mediaDuration?: (video: string) => number;
}

/** Recover media only after exact operator/controller/profile ownership checks; retain coverage gaps. */
export async function finalizeControllerRecording(
  video: string,
  context: ControllerRecoveryContext,
  actions: ControllerRecoveryActions,
): Promise<void> {
  const {sessionId, tenantId} = context;
  const raw = path.resolve(video.endsWith(".playable.webm") ? video.replace(/\.playable\.webm$/, ".webm") : video);
  const statusPath = `${raw}.status.json`;
  const root = path.resolve(context.repoRoot), recordDir = path.resolve(context.recordDir);
  const profileDir = path.resolve(context.profileDir);
  let recovery: Record<string, any> | undefined;
  let gaps: GapWindow[] = [];
  let recoveryLock: string | undefined, recoveryLockIdentity: string | undefined;
  try {
  if (existsSync(statusPath)) {
    confinedRecoveryPath(recordDir, root); confinedRecoveryPath(profileDir, root); confinedRecoveryPath(raw, recordDir); confinedRecoveryPath(statusPath, recordDir);
    if (statSync(statusPath).size > 8192) throw new Error("Recovery capture status oversized");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    const handle = path.basename(raw, ".webm");
    if (!/^tab-[0-9]+-[a-f0-9]{8}$/.test(handle) || status.output !== raw || status.handle !== handle ||
        status.sessionId !== sessionId || status.tenantId !== tenantId || status.profileDir !== profileDir || status.recordDir !== recordDir ||
        !Number.isInteger(status.pid) || status.pid <= 0 || !["recording", "starting", "failed", "recovering", "recovery-failed", "recovered", "stopped"].includes(status.state)) {
      throw new Error("Recovery capture ownership refused");
    }
    const sourcePath = path.join(root, "data", "toc-migrated", sessionId, "source.json");
    confinedRecoveryPath(sourcePath, root, false);
    if (existsSync(sourcePath) && JSON.parse(readFileSync(sourcePath, "utf8")).tenantId !== tenantId) throw new Error("Existing capture belongs to a different tenant");
    if (status.state === "recovered") {
      if (!Array.isArray(status.gaps)) throw new Error("Recovery gaps missing");
      gaps = status.gaps;
    } else if (status.state !== "stopped") {
      recoveryLock = confinedRecoveryPath(path.join(profileDir, ".lkb-recovery.lock"), profileDir, false);
      recoveryLockIdentity = JSON.stringify({pid: process.pid, sessionId, output: raw, token: randomBytes(16).toString("hex")});
      const lockFd = openSync(recoveryLock, "wx");
      try { writeSync(lockFd, recoveryLockIdentity); fsyncSync(lockFd); } finally { closeSync(lockFd); }
      const statePath = path.join(recordDir, ".record-state.json");
      confinedRecoveryPath(statePath, recordDir);
      if (statSync(statePath).size > 8192) throw new Error("Recovery controller state oversized");
      const state = readControllerState(recordDir);
      if (!state || state.pid !== status.pid || state.sessionId !== sessionId || path.resolve(state.obsOutputDir) !== recordDir ||
          state.controllerStartedAt !== status.controllerStartedAt || !Number.isFinite(Date.parse(state.until)) || !Number.isFinite(Date.parse(status.captureStartedAt))) {
        throw new Error("Recovery controller binding refused");
      }
      let liveness: "dead" | "live" | "unknown";
      if (actions.pidProbe) liveness = actions.pidProbe(status.pid);
      else {
        try { process.kill(status.pid, 0); liveness = "live"; }
        catch (error) { liveness = (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown"; }
      }
      if (liveness === "unknown") throw new Error("Recovery controller liveness unknown");
      if (liveness === "live") {
        const actualStart = (actions.startTime ?? getProcessStartTime)(status.pid);
        if (!status.controllerStartedAt || !actualStart || controllerMatchesIdentity(status.controllerStartedAt, actualStart)) throw new Error("Recovery controller live or identity unknown");
      }
      const lock = confinedRecoveryPath(path.join(profileDir, ".lkb-tab-capture.lock"), profileDir, !status.cleanupComplete);
      if (existsSync(lock) && readFileSync(lock, "utf8") !== String(status.pid)) throw new Error("Recovery profile lock ownership refused");
      const extension = confinedRecoveryPath(path.join(recordDir, `.extension-${handle}`), recordDir, !status.cleanupComplete);
      if (existsSync(extension)) for (const name of readdirSync(extension)) confinedRecoveryPath(path.join(extension, name), extension);
      const stop = confinedRecoveryPath(path.join(recordDir, `.stop-${handle}`), recordDir, false);
      const reload = confinedRecoveryPath(path.join(recordDir, `.reload-${handle}`), recordDir, false);
      recovery = {...status, state: "recovering", plannedUntil: state.until, coverageIncomplete: true, recoveryReason: "controller-interrupted-coverage-unverified"};
      writeFileSync(statusPath, JSON.stringify(recovery) + "\n");
      try {
        if (existsSync(lock) && readFileSync(lock, "utf8") !== String(status.pid)) throw new Error("Recovery lock changed before cleanup");
        writeFileSync(stop, "stop");
        cleanupOwnedBrowserProfile(profileDir, {...context, stopFile: stop}, actions.cleanup);
        if (existsSync(lock) && readFileSync(lock, "utf8") !== String(status.pid)) throw new Error("Recovery lock changed during cleanup");
        rmSync(lock, {force: true}); rmSync(extension, {recursive: true, force: true}); rmSync(stop, {force: true}); rmSync(reload, {force: true});
        recovery = {...recovery, cleanupComplete: true};
        writeFileSync(statusPath, JSON.stringify(recovery) + "\n");
      } catch (error) {
        writeFileSync(statusPath, JSON.stringify({...recovery, state: "recovery-failed", error: "Owned browser cleanup failed"}) + "\n");
        throw error;
      }
    }
  }
  try {
    video = actions.normalize(video);
    if (recovery) {
      const probed = actions.mediaDuration ? actions.mediaDuration(video) : (() => {
        const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", video], {encoding: "utf8", timeout: 15000});
        if (result.status !== 0) throw new Error("Recovery duration probe failed");
        return Number(JSON.parse(result.stdout).format.duration);
      })();
      if (!Number.isFinite(probed) || probed <= 0) throw new Error("Recovery media duration invalid");
      const end = Date.parse(recovery.plannedUntil) / 1000;
      const start = Math.min(end, Date.parse(recovery.captureStartedAt) / 1000 + Math.max(0, probed - 2));
      gaps = [{start, end, reason: "controller-interrupted-coverage-unverified", recovered: false}];
    }
    await actions.finalize(video, gaps);
    if (recovery) {
      const current = readControllerState(recordDir);
      if (!current || current.pid !== recovery.pid || current.sessionId !== sessionId) throw new Error("Recovery controller state changed before close-out");
      removeControllerState(recordDir);
      writeFileSync(statusPath, JSON.stringify({...recovery, state: "recovered", gaps, recoveredMedia: video, updatedAt: new Date().toISOString()}) + "\n");
    }
    actions.processArtifacts(video);
  } catch (error) {
    if (recovery) writeFileSync(statusPath, JSON.stringify({...recovery, state: "recovery-failed", gaps, error: "Recovery finalization failed", updatedAt: new Date().toISOString()}) + "\n");
    throw error;
  }
  } finally {
    if (recoveryLock && recoveryLockIdentity && existsSync(recoveryLock) && !lstatSync(recoveryLock).isSymbolicLink() && statSync(recoveryLock).size <= 8192 && readFileSync(recoveryLock, "utf8") === recoveryLockIdentity) rmSync(recoveryLock);
  }
}
