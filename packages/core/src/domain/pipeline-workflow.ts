/**
 * packages/core/src/domain/pipeline-workflow.ts — T-050 slice 1. PURE, UNWIRED planner for one
 * session's pipeline run. No I/O, no clock reads: time arrives only as the injected `now`.
 *
 * A run is an ordered list of stages (each dependency must appear EARLIER in the list, so the
 * definition is a topologically sorted DAG). State per stage records status, attempt count, the
 * id of the current attempt, the last error code, the input fingerprint the stage ran against
 * and the output fingerprint it produced. `planNext` decides what may run; `applyEvent` (in
 * pipeline-workflow-reduce.ts) is the only way state moves.
 *
 * Input fingerprint of a stage = for a root, `source:<run.sourceFingerprint>`; otherwise the
 * `dep:outputFingerprint` pairs of its dependencies. A stage is VALID only if it is done (or
 * cleanly skipped), its recorded input fingerprint equals the expected one, and every dependency
 * is valid. Hence a changed upstream output invalidates the whole downstream closure, never
 * anything upstream, and a done stage with an unchanged input is never planned again.
 */
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";
export const SKIPPED_OUTPUT = "skipped";

export interface StageDef {
  name: string;
  deps: string[];
  /** Optional stages may be skipped cleanly (no error code). */
  optional?: boolean;
  maxAttempts: number;
  /** Error codes worth another attempt. A dead worker (lease expiry) is always retryable. */
  retryable: string[];
}
export interface WorkflowDef { stages: StageDef[]; leaseMs: number }
export interface StageState {
  status: StageStatus;
  attempt: number;
  attemptId: string | null;
  errorCode: string | null;
  inputFingerprint: string | null;
  outputFingerprint: string | null;
  heartbeatAt: number | null;
}
export interface RunState { sourceFingerprint: string; stages: Record<string, StageState> }
export interface WorkflowError { code: string; stage?: string; message: string }

export type ReadyCause = "first-run" | "retry-after-failure" | "lease-expired" | "input-changed";
export interface ReadyStage { stage: string; attempt: number; inputFingerprint: string; cause: ReadyCause }
export interface BlockedStage { stage: string; reason: string }
export interface TerminalFailure { stage: string; code: string; why: "retry-exhausted" | "non-retryable" | "skipped-with-error" }
export interface Plan {
  outcome: "complete" | "failed-terminal" | "ready" | "waiting" | "invalid";
  /** True when the run can still make progress (ready or waiting on a live lease). */
  resumable: boolean;
  ready: ReadyStage[];
  blocked: BlockedStage[];
  terminal: TerminalFailure | null;
  reason: string;
  errors: WorkflowError[];
}

const STATUSES: readonly string[] = ["pending", "running", "done", "failed", "skipped"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strOrNull = (v: unknown) => v === null || isStr(v);
const err = (code: string, message: string, stage?: string): WorkflowError => (stage ? { code, stage, message } : { code, message });

export function validateDefinition(def: unknown): WorkflowError[] {
  if (!isObj(def) || !Array.isArray(def.stages) || def.stages.length === 0) return [err("bad-definition", "definition needs a non-empty stages array")];
  const errors: WorkflowError[] = [];
  if (typeof def.leaseMs !== "number" || !Number.isFinite(def.leaseMs) || def.leaseMs <= 0) errors.push(err("bad-definition", "leaseMs must be a positive finite number"));
  const seen = new Set<string>();
  for (const s of def.stages as unknown[]) {
    if (!isObj(s) || !isStr(s.name)) { errors.push(err("bad-definition", "stage needs a name")); continue; }
    const name = s.name;
    if (seen.has(name)) errors.push(err("bad-definition", "duplicate stage name", name));
    if (!Array.isArray(s.deps) || s.deps.some((d) => !isStr(d) || !seen.has(d))) errors.push(err("bad-definition", "deps must name EARLIER stages", name));
    if (!Number.isInteger(s.maxAttempts) || (s.maxAttempts as number) < 1) errors.push(err("bad-definition", "maxAttempts must be an integer >= 1", name));
    if (!Array.isArray(s.retryable) || s.retryable.some((c) => !isStr(c))) errors.push(err("bad-definition", "retryable must be a string array", name));
    seen.add(name);
  }
  return errors;
}

export function validateState(def: WorkflowDef, state: unknown): WorkflowError[] {
  if (!isObj(state) || !isStr(state.sourceFingerprint) || !isObj(state.stages)) return [err("bad-state", "state needs sourceFingerprint and stages")];
  const errors: WorkflowError[] = [];
  const known = new Set(def.stages.map((s) => s.name));
  for (const key of Object.keys(state.stages)) if (!known.has(key)) errors.push(err("unknown-stage", "state names a stage the definition lacks", key));
  for (const { name } of def.stages) {
    const s = (state.stages as Record<string, unknown>)[name];
    if (!isObj(s)) { errors.push(err("bad-state", "stage state missing", name)); continue; }
    if (typeof s.status !== "string" || !STATUSES.includes(s.status)) errors.push(err("bad-state", "unknown status", name));
    if (!Number.isInteger(s.attempt) || (s.attempt as number) < 0) errors.push(err("bad-state", "attempt must be an integer >= 0", name));
    if (![s.attemptId, s.errorCode, s.inputFingerprint, s.outputFingerprint].every(strOrNull)) errors.push(err("bad-state", "id/code/fingerprint fields must be non-empty strings or null", name));
    if (s.heartbeatAt !== null && (typeof s.heartbeatAt !== "number" || !Number.isFinite(s.heartbeatAt))) errors.push(err("bad-state", "heartbeatAt must be finite or null", name));
    if (s.status === "running" && (!isStr(s.attemptId) || s.heartbeatAt === null || !isStr(s.inputFingerprint))) errors.push(err("bad-state", "running stage needs attemptId, heartbeatAt, inputFingerprint", name));
    if (s.status === "done" && (!isStr(s.outputFingerprint) || !isStr(s.inputFingerprint))) errors.push(err("bad-state", "done stage needs fingerprints", name));
  }
  return errors;
}

export function initialState(def: WorkflowDef, sourceFingerprint: string): RunState {
  const stages: Record<string, StageState> = {};
  for (const s of def.stages) stages[s.name] = { status: "pending", attempt: 0, attemptId: null, errorCode: null, inputFingerprint: null, outputFingerprint: null, heartbeatAt: null };
  return { sourceFingerprint, stages };
}

function leaseAlive(def: WorkflowDef, s: StageState, now: number): boolean {
  return s.heartbeatAt !== null && now - s.heartbeatAt < def.leaseMs;
}

function invalid(errors: WorkflowError[]): Plan {
  return { outcome: "invalid", resumable: false, ready: [], blocked: [], terminal: null, reason: errors[0]?.message ?? "invalid input", errors };
}

export function planNext(def: WorkflowDef, state: RunState, now: number): Plan {
  try {
    const errors = validateDefinition(def);
    if (typeof now !== "number" || !Number.isFinite(now)) errors.push(err("bad-now", "now must be a finite number"));
    if (errors.length === 0) errors.push(...validateState(def, state));
    if (errors.length > 0) return invalid(errors);
    return plan(def, state, now);
  } catch (e) {
    return invalid([err("malformed", `unreadable input: ${String(e)}`)]);
  }
}

function plan(def: WorkflowDef, state: RunState, now: number): Plan {
  const valid = new Map<string, boolean>();
  const ready: ReadyStage[] = [];
  const blocked: BlockedStage[] = [];
  const found: TerminalFailure[] = [];
  let waiting = false;
  const stop = (stage: string, code: string, why: TerminalFailure["why"]) => { found.push({ stage, code, why }); };
  for (const d of def.stages) {
    const s = state.stages[d.name]!;
    const badDep = d.deps.find((x) => !valid.get(x));
    if (s.status === "skipped" && s.errorCode !== null) stop(d.name, s.errorCode, "skipped-with-error");
    if (badDep !== undefined) { valid.set(d.name, false); blocked.push({ stage: d.name, reason: `dependency-not-done:${badDep}` }); continue; }
    const expected = d.deps.length === 0 ? `source:${state.sourceFingerprint}`
      : d.deps.map((x) => `${x}:${state.stages[x]!.outputFingerprint}`).join("|");
    const sameInput = s.inputFingerprint === expected;
    const done = (s.status === "done" || (s.status === "skipped" && s.errorCode === null)) && sameInput;
    valid.set(d.name, done);
    if (done) continue;
    const next = (cause: ReadyCause, keepsBudget: boolean) => ready.push({ stage: d.name, attempt: keepsBudget ? s.attempt + 1 : 1, inputFingerprint: expected, cause });
    const live = s.status === "running" && leaseAlive(def, s, now);
    if (live) { waiting = true; blocked.push({ stage: d.name, reason: "running" }); }
    else if (s.status === "pending") next("first-run", false);
    else if (!sameInput) next("input-changed", false);
    else if (s.status === "running") {
      if (s.attempt >= d.maxAttempts) stop(d.name, "lease-expired", "retry-exhausted");
      else next("lease-expired", true);
    } else if (s.status === "failed") {
      const code = s.errorCode ?? "unknown";
      if (!d.retryable.includes(code)) stop(d.name, code, "non-retryable");
      else if (s.attempt >= d.maxAttempts) stop(d.name, code, "retry-exhausted");
      else next("retry-after-failure", true);
    } else next("input-changed", false);
  }
  const t = found[0];
  const base = { blocked, errors: [] as WorkflowError[] };
  if (t) return { ...base, outcome: "failed-terminal", resumable: false, ready: [], terminal: t, reason: `stage ${t.stage} failed terminally: ${t.code} (${t.why})` };
  if (def.stages.every((d) => valid.get(d.name))) return { ...base, outcome: "complete", resumable: false, ready: [], terminal: null, reason: "every stage done with unchanged inputs" };
  if (ready.length > 0) return { ...base, outcome: "ready", resumable: true, ready, terminal: null, reason: `${ready.length} stage(s) may run` };
  if (waiting) return { ...base, outcome: "waiting", resumable: true, ready: [], terminal: null, reason: "a live worker holds a lease" };
  return invalid([{ code: "deadlock", message: "no stage is ready, running or terminal" }]);
}

/** The pipeline as the real code sequences it today (see manifest for per-name provenance). Policy numbers are placeholders. */
export const WEBINAR_PIPELINE: WorkflowDef = {
  leaseMs: 120_000,
  stages: [
    { name: "capture", deps: [], maxAttempts: 1, retryable: [] },
    { name: "media", deps: ["capture"], maxAttempts: 2, retryable: ["io-error"] },
    { name: "transcript", deps: ["media"], maxAttempts: 3, retryable: ["provider-timeout", "provider-5xx", "rate-limited"] },
    { name: "screen", deps: ["transcript"], optional: true, maxAttempts: 2, retryable: ["provider-timeout", "provider-5xx"] },
    { name: "index", deps: ["screen"], maxAttempts: 3, retryable: ["provider-timeout", "provider-5xx", "rate-limited", "db-unavailable"] },
  ],
};
