/**
 * packages/meeting-bot/src/capture/controller-state.ts — T-047. The one fact a watchdog needs
 * that a live `record` process can't expose once it's been killed: is anything actually
 * mid-recording right now, and for which session? `runRecord` (record-commands.ts) writes this
 * file right after a successful join and removes it once its own cleanup (joiner.stop + the
 * finalize call) has run to completion. A state file surviving with no live pid behind it means
 * the controller died mid-run without a chance to clean up — exactly the 2026-09-24 16:30:56
 * failure (console closed, Ctrl+C exit 0xC000013A) that T-047 closes.
 */
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
