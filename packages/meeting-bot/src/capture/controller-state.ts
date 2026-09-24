/**
 * packages/meeting-bot/src/capture/controller-state.ts — T-047. The one fact a watchdog needs
 * that a live `record` process can't expose once it's been killed: is anything actually
 * mid-recording right now, and for which session? `runRecord` (record-commands.ts) writes this
 * file right after a successful join and removes it once its own cleanup (joiner.stop + the
 * finalize call) has run to completion. A state file surviving with no live pid behind it means
 * the controller died mid-run without a chance to clean up — exactly the 2026-09-24 16:30:56
 * failure (console closed, Ctrl+C exit 0xC000013A) that T-047 closes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  /**
   * ISS-T-047-CONTROLLER-002: the controlling process's OS start time (from `getProcessStartTime`
   * at write time), recorded so a later watchdog tick can tell "the pid that wrote this state is
   * still alive" apart from "some unrelated process the OS later recycled onto the same pid is
   * alive." Optional/undefined for state files written before this field existed, or when the
   * platform probe fails at write time — both fall back to the old pid-only trust rather than
   * treating the controller as dead on missing data.
   */
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

/**
 * ISS-T-047-CONTROLLER-002: the OS process-creation timestamp for `pid`, as an identity marker
 * beyond the bare pid number (which the OS is free to recycle onto an unrelated process once the
 * original controller has died). Windows-only (`Get-Process`), matching the rest of this package
 * (OBS_EXE, the `chrome.exe` cleanup in record-commands.ts are already Windows-specific). Returns
 * undefined — never throws — on any failure (no such process, powershell unavailable, parse
 * failure): callers must treat "can't determine" as "can't confirm a mismatch," not as proof of
 * one, the same conservative direction as ISS-T-047-CONTROLLER-001's OBS-unknown fix.
 */
export function getProcessStartTime(pid: number): string | undefined {
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString("o")`],
      { encoding: "utf8" },
    ).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pure comparison: does the identity recorded in `RecordState.controllerStartedAt` match the
 * pid's actual current OS start time? `undefined` on either side means "can't confirm a
 * mismatch" and is trusted (back-compat with state files written before this field existed, and
 * with a failed `getProcessStartTime` probe) — a probe failure must never make a live controller
 * look dead, only a real mismatch may. Separated from `isPidAlive`/`getProcessStartTime` so the
 * decision itself is testable without spawning real processes.
 */
export function controllerMatchesIdentity(expectedStartedAt: string | undefined, actualStartedAt: string | undefined): boolean {
  if (!expectedStartedAt || !actualStartedAt) return true;
  return expectedStartedAt === actualStartedAt;
}

/**
 * Combined liveness check the watchdog uses: alive by pid AND (if both sides recorded an
 * identity) that identity still matches, so a pid the OS recycled onto an unrelated process after
 * the original controller died is correctly reported as dead rather than masking the exact
 * scenario T-047 exists to catch.
 *
 * `probes` defaults to the real OS checks (`isPidAlive`, `getProcessStartTime`) but is
 * injectable so a test can exercise this exact function's pid-reuse branch deterministically,
 * without spawning a real process to simulate a mismatch.
 */
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
