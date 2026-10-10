/**
 * scripts/webinar/join-rules-host.ts — T-037 unit `t037-join-rules-api-host`.
 * Production wiring for the join-rules edit API. `.dependency-cruiser.cjs` forbids `apps/* ->
 * packages/meeting-bot`, but only cruises `packages apps workers`, so a script is the one lawful place
 * that may import both `apps/api` (the structural `JoinRulesDeps`) and the real store/validator.
 * Pure helpers only (no listen, no Mongo): the entry point is join-rules-api-host.ts.
 */
import { accessSync, closeSync, constants, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JoinRulesDeps } from "../../apps/api/src/join-rules/deps.js";
import { loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut } from "../../packages/meeting-bot/src/calendar/join-rules-store.js";
import { validateJoinRuleSet } from "../../packages/meeting-bot/src/calendar/join-rules.js";

export const HOST_PID_FILE = "join-rules-host.pid";

/** The real store + engine validator mapped onto the injected seam. Store errors pass through unchanged. */
export function createJoinRulesDeps({ stateDir }: { stateDir: string }): JoinRulesDeps {
  return {
    load: t => loadJoinRules(stateDir, t),
    save: (t, v) => saveJoinRules(stateDir, t, v),
    validateRuleSet: validateJoinRuleSet,
    recordApproval: (t, a) => recordTenantApproval(stateDir, t, a),
    recordOptOut: (t, id) => recordTenantOptOut(stateDir, t, id),
  };
}

/** Exactly the scheduler's rule (schedule-tick.ts DEFAULT_STATE_DIR): `<repo root>/raw/webinars`.
 * The scheduler reads no environment variable for it, so neither does this. */
export function resolveStateDir(moduleUrl: string = import.meta.url): string {
  let here: string;
  try { here = path.dirname(fileURLToPath(moduleUrl)); }
  catch { throw new Error("join-rules host: cannot resolve the repository root (module URL is not a file URL); refusing to start"); }
  return path.join(path.resolve(here, "..", ".."), "raw", "webinars");
}

/** Absolute, created if missing (recursive, as the store does), and writable — or throws a clear message. */
export function prepareStateDir(dir: string): string {
  if (typeof dir !== "string" || dir === "" || !path.isAbsolute(dir))
    throw new Error("join-rules host: state directory must be an absolute path; refusing to start");
  const resolved = path.resolve(dir);
  try { mkdirSync(resolved, { recursive: true }); accessSync(resolved, constants.W_OK); }
  catch (e) { throw new Error(`join-rules host: state directory ${resolved} cannot be created or is not writable (${(e as NodeJS.ErrnoException).code ?? "error"}); refusing to start`); }
  return resolved;
}

/** Exclusive pid file (`wx`): a second host on the same directory is refused. A leftover file is NEVER
 * stolen (a stale pid after a crash needs a human to check and delete it). Returns an idempotent release. */
export function acquireHostLock(stateDir: string, pid: number = process.pid): () => void {
  const file = path.join(stateDir, HOST_PID_FILE);
  let fd: number;
  try { fd = openSync(file, "wx"); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`join-rules host: ${file} exists, so another host owns this state directory (or it crashed). Not starting. If no host is running, delete that file and retry.`);
    throw new Error(`join-rules host: cannot create ${file} (${(e as NodeJS.ErrnoException).code ?? "error"}); refusing to start`);
  }
  try { writeSync(fd, `${pid}\n`); } finally { closeSync(fd); }
  let released = false;
  return () => { if (released) return; released = true; try { unlinkSync(file); } catch { /* already gone */ } };
}
