/**
 * packages/core/src/run-state-store/run-state-store.ts — T-050 slice 2. UNWIRED, local-filesystem store for the
 * planner's `RunState` (domain/pipeline-workflow.ts), one file per run id under a caller-supplied root.
 *
 *  - Atomic write (pattern of meeting-bot's join-rules store, not its code): temp file in the SAME directory,
 *    fsync, rename over the target; Windows EPERM/EACCES/EBUSY on rename is retried for ~3 s. A crash at any step
 *    leaves the old or the new complete file; a stray `.tmp` or lock file may remain.
 *  - Compare-and-swap: `save(runId, expected, next)`; `expected` is the state the caller loaded (null = "must
 *    not exist"). The stored state must have the same revision, i.e. the same per-stage attempt/attemptId/status
 *    and every other planner field, or the save is refused as `conflict`. No identity beyond RunState's own.
 *  - The read-check-rename window runs under an exclusive `<id>.run-state.lock` file; a held lock is `locked`.
 *  - A load never writes. A corrupt or schema-invalid file is a typed error and is never overwritten or deleted,
 *    by load OR by save (`corrupt-existing`).
 */
import path from "node:path";
import { validateState, type RunState, type WorkflowDef } from "../domain/pipeline-workflow.js";
import { validateRunId } from "./run-state-id.js";
import { realRunStateFs, type RunStateFsOps } from "./run-state-fs.js";

export const RUN_STATE_FORMAT = "lkb-run-state/1";
export type RunStateErrorCode = "bad-run-id" | "corrupt" | "schema-invalid" | "not-a-file" | "io-error";
export type RunStateLoadResult =
  | { ok: true; state: RunState | null }
  | { ok: false; code: RunStateErrorCode; message: string };
export type RunStateSaveFailure = "conflict" | "locked" | "invalid-state" | "corrupt-existing" | RunStateErrorCode;
export type RunStateSaveResult = { ok: true } | { ok: false; code: RunStateSaveFailure; message: string };
export interface RunStateStore {
  load(runId: string): RunStateLoadResult;
  save(runId: string, expected: RunState | null, next: RunState): RunStateSaveResult;
}

const RENAME_RETRY_CODES = ["EPERM", "EACCES", "EBUSY"];
const RENAME_RETRY_MS = 3000;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
/** The CAS token: a canonical rendering of the whole RunState (includes every stage's attempt and attemptId). */
export const runStateRevision = (state: RunState): string => canonical(state);

/** Structural check using the planner's own validator against a definition derived from the state's stage names. */
function schemaProblem(state: unknown): string | null {
  const stages = state && typeof state === "object" ? (state as { stages?: unknown }).stages : undefined;
  const names = stages && typeof stages === "object" && !Array.isArray(stages) ? Object.keys(stages) : [];
  if (names.length === 0) return "state has no stages";
  const def: WorkflowDef = { leaseMs: 1, stages: names.map((name) => ({ name, deps: [], maxAttempts: 1, retryable: [] })) };
  return validateState(def, state)[0]?.message ?? null;
}

type Read = { kind: "absent" } | { kind: "state"; state: RunState } | { kind: "error"; code: RunStateErrorCode; message: string };

export function createRunStateStore(root: string, fs: RunStateFsOps = realRunStateFs): RunStateStore {
  if (typeof root !== "string" || root.length === 0) throw new Error("run-state store needs a root directory");
  const fileOf = (id: string) => path.join(root, `${id}.run-state.json`);
  const lockOf = (id: string) => path.join(root, `${id}.run-state.lock`);

  function read(runId: string): Read {
    const file = fileOf(runId);
    try {
      const kind = fs.kind(file);
      if (kind === null) return { kind: "absent" };
      if (kind !== "file") return { kind: "error", code: "not-a-file", message: `${file} is not a regular file` };
      let parsed: unknown;
      try { parsed = JSON.parse(fs.readText(file)); }
      catch { return { kind: "error", code: "corrupt", message: `${file} is not valid JSON; left untouched for inspection` }; }
      const env = parsed as { format?: unknown; runId?: unknown; state?: unknown } | null;
      if (!env || typeof env !== "object" || env.format !== RUN_STATE_FORMAT || env.runId !== runId)
        return { kind: "error", code: "corrupt", message: `${file} is not a ${RUN_STATE_FORMAT} envelope for run ${runId}; left untouched` };
      const bad = schemaProblem(env.state);
      if (bad) return { kind: "error", code: "schema-invalid", message: `${file}: ${bad}; left untouched` };
      return { kind: "state", state: env.state as RunState };
    } catch (e) {
      return { kind: "error", code: "io-error", message: `${file}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  function renameReplacing(from: string, to: string): void {
    const start = fs.now();
    for (;;) {
      try { fs.rename(from, to); return; }
      catch (e) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if (!code || !RENAME_RETRY_CODES.includes(code) || fs.now() - start > RENAME_RETRY_MS) throw e;
        fs.sleep(5);
      }
    }
  }

  function writeAtomic(runId: string, next: RunState): void {
    const file = fileOf(runId);
    const tmp = `${file}.${fs.uuid()}.tmp`;
    const bytes = `${JSON.stringify({ format: RUN_STATE_FORMAT, runId, state: next })}\n`;
    let fd: number | undefined;
    let created = false;
    try {
      fd = fs.createExclusive(tmp); created = true;
      fs.write(fd, bytes); fs.fsync(fd); fs.close(fd); fd = undefined;
      renameReplacing(tmp, file);
      created = false;
    } finally {
      if (fd !== undefined) try { fs.close(fd); } catch { /* best effort */ }
      if (created) try { fs.unlink(tmp); } catch { /* best effort */ }
    }
  }

  /** Creates the lock file; returns "locked" when it exists, "taken" once created (even if closing it then fails). */
  function takeLock(lock: string, mark: () => void): "locked" | "taken" {
    let fd: number;
    try { fd = fs.createExclusive(lock); }
    catch (e) { if ((e as NodeJS.ErrnoException)?.code === "EEXIST") return "locked"; throw e; }
    mark();
    fs.close(fd);
    return "taken";
  }

  return {
    load(runId) {
      const why = validateRunId(runId);
      if (why) return { ok: false, code: "bad-run-id", message: why };
      const r = read(runId);
      if (r.kind === "absent") return { ok: true, state: null };
      if (r.kind === "state") return { ok: true, state: r.state };
      return { ok: false, code: r.code, message: r.message };
    },

    save(runId, expected, next) {
      const why = validateRunId(runId);
      if (why) return { ok: false, code: "bad-run-id", message: why };
      if (schemaProblem(next)) return { ok: false, code: "invalid-state", message: `next state invalid: ${schemaProblem(next)}` };
      if (expected !== null && schemaProblem(expected)) return { ok: false, code: "invalid-state", message: "expected state is not a valid RunState" };
      const lock = lockOf(runId);
      let held = false;
      try {
        fs.mkdirp(root);
        if (takeLock(lock, () => { held = true; }) === "locked") return { ok: false, code: "locked", message: `${lock} is held by another writer (remove it only if no writer is running)` };
        const cur = read(runId);
        if (cur.kind === "error") return { ok: false, code: cur.code === "io-error" ? "io-error" : "corrupt-existing", message: cur.message };
        const matches = cur.kind === "absent" ? expected === null : expected !== null && runStateRevision(cur.state) === runStateRevision(expected);
        if (!matches) return { ok: false, code: "conflict", message: "stored state does not match the expected state; reload and retry" };
        writeAtomic(runId, next);
        return { ok: true };
      } catch (e) {
        return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e) };
      } finally {
        if (held) try { fs.unlink(lock); } catch { /* best effort */ }
      }
    },
  };
}
