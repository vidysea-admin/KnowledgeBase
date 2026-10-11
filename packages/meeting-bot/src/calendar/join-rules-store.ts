/**
 * packages/meeting-bot/src/calendar/join-rules-store.ts — T-037 unit `t037-join-rules-persistence`.
 * Tenant-scoped, atomic, file-backed storage for the pure engine's `JoinRuleSet` + `JoinRuleState`
 * (join-rules.ts). Nothing calls this yet; the scheduler is NOT switched over.
 *
 * FAIL CLOSED: this data decides whether a meeting is joined with no human click.
 *  - missing file            -> empty rule set + empty state (nothing auto-joins)
 *  - corrupt / oversized / schema-invalid / wrong-tenant / non-regular file -> THROW `JoinRulesStoreError`.
 *    Never treated as empty, and the mutate helpers load first, so they can never overwrite a bad file.
 *  - tenant ids are a closed lowercase charset (`[a-z0-9][a-z0-9_-]{0,63}`), Windows device names refused;
 *    lowercase-only means case variants cannot alias one file on a case-insensitive filesystem.
 *  - the embedded `tenantId` must equal the requested tenant.
 *  - writes validate first, then temp file + fsync + rename (as schedule-state.ts); a failed write leaves
 *    the previous file intact and removes its temp file.
 * Validation is the engine's own `validateJoinRuleSet` / `validateJoinRuleState`; none is duplicated here.
 * Concurrency (unit `t037-join-rules-store-lock`): EVERY mutation (save, record approval, record opt-out) holds an exclusive
 * per-tenant lock file `<stateDir>/join-rules/<tenant>.lock` (join-rules-store-lock.ts) for the whole read-validate-modify-write,
 * released in a `finally`. Timeout -> `locked`, nothing written; a stale lock is reported, never stolen. Loading takes NO lock:
 * the write is temp file + rename, so a reader sees the old or the new file, never a partial one. The lock is ADVISORY.
 * A lock whose holder is provably dead (same host, pid gone, lock older than lockStaleMs) is taken over automatically (join-rules-store-lock.ts; `onLockTakeover` reports it,
 * with no path); a live / other-host / undeterminable holder stays `locked`. Immediately before the final rename the writer re-checks that the
 * lock still carries its own token and throws `locked` (nothing written) if not, so a holder wrongly judged dead cannot complete a write.
 * `saveJoinRules` refuses to replace an unreadable / corrupt / wrong-tenant file unless `overwriteInvalid: true` (the repair path).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  EMPTY_JOIN_RULE_STATE, recordRuleApproval as applyApproval, recordOptOut as applyOptOut,
  validateJoinRuleSet, validateJoinRuleState, type JoinRuleSet, type JoinRuleState,
} from "./join-rules.js";
import { acquireLock, releaseLock, sleep, LockFailure } from "./join-rules-store-lock.js";
import { lockStillOwned, type LockOptions, type TakeoverInfo } from "./join-rules-store-lock.js";

export const JOIN_RULES_MAX_BYTES = 1024 * 1024;
const TENANT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

export interface StoredJoinRules { ruleSet: JoinRuleSet; state: JoinRuleState }

export class JoinRulesStoreError extends Error {
  constructor(public readonly code: "bad-tenant" | "corrupt" | "too-large" | "invalid" | "tenant-mismatch" | "not-a-file" | "write-failed" | "locked" | "lock-failed", detail: string) {
    super(`join-rules store: ${code}: ${detail}`);
    this.name = "JoinRulesStoreError";
  }
}

export function emptyStoredJoinRules(): StoredJoinRules {
  return { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { ...EMPTY_JOIN_RULE_STATE } };
}

function assertTenant(tenantId: unknown): string {
  if (typeof tenantId !== "string" || !TENANT_ID.test(tenantId) || WINDOWS_DEVICE.test(tenantId))
    throw new JoinRulesStoreError("bad-tenant", `invalid tenant id ${JSON.stringify(String(tenantId).slice(0, 80))}`);
  return tenantId;
}

export function joinRulesFilePath(stateDir: string, tenantId: string): string {
  const id = assertTenant(tenantId);
  const dir = path.resolve(stateDir, "join-rules");
  const file = path.join(dir, `${id}.json`);
  if (path.dirname(file) !== dir) throw new JoinRulesStoreError("bad-tenant", "tenant id escapes the store directory");
  return file;
}

function wrapInvalid(fn: () => void): void {
  try { fn(); } catch (e) { throw new JoinRulesStoreError("invalid", e instanceof Error ? e.message : String(e)); }
}

function checkedCopy(value: StoredJoinRules): StoredJoinRules {
  let out: StoredJoinRules | undefined;
  wrapInvalid(() => {
    if (value === null || typeof value !== "object") throw new Error("value must be an object");
    out = { ruleSet: validateJoinRuleSet(value.ruleSet), state: validateJoinRuleState(value.state) };
  });
  return out!;
}

/** True when anything (file, directory, symlink, dangling link) exists at the path. */
function entryExists(file: string): boolean {
  try { lstatSync(file); return true; } catch { return false; }
}

/** Missing file -> empty (nothing joins). Any other defect -> throws; never returns permissive data. */
export function loadJoinRules(stateDir: string, tenantId: string): StoredJoinRules {
  const file = joinRulesFilePath(stateDir, tenantId);
  if (!entryExists(file)) return emptyStoredJoinRules();
  const st = lstatSync(file);
  if (!st.isFile()) throw new JoinRulesStoreError("not-a-file", `${file} is not a regular file`);
  if (st.size > JOIN_RULES_MAX_BYTES) throw new JoinRulesStoreError("too-large", `${st.size} bytes exceeds ${JOIN_RULES_MAX_BYTES}`);
  let parsed: any;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { throw new JoinRulesStoreError("corrupt", e instanceof Error ? e.message : String(e)); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new JoinRulesStoreError("invalid", "top level must be an object");
  const extra = Object.keys(parsed).filter(k => !["version", "tenantId", "ruleSet", "state"].includes(k));
  if (parsed.version !== 1 || extra.length) throw new JoinRulesStoreError("invalid", `unsupported version or unknown field(s): ${extra.join(",")}`);
  if (parsed.tenantId !== tenantId) throw new JoinRulesStoreError("tenant-mismatch", `file embeds tenant ${JSON.stringify(parsed.tenantId)}, requested ${JSON.stringify(tenantId)}`);
  return checkedCopy({ ruleSet: parsed.ruleSet, state: parsed.state });
}

/**
 * Options. `lockWaitMs` / `lockStaleMs` tune the lock per call (never global state). `rename` and `afterRead` exist only so tests
 * can inject a failure / widen the read-to-write window; production never sets them.
 */
export interface StoreOptions {
  lockWaitMs?: number; lockStaleMs?: number; rename?: typeof renameSync; afterRead?: () => void;
  /** Called when a dead writer's lock was replaced (pid + age only, no path). */
  onLockTakeover?: (info: TakeoverInfo) => void; lockTest?: Pick<LockOptions, "now" | "sleep" | "hostname" | "isAlive" | "step">;
  /** saveJoinRules only: allow replacing an existing unreadable / corrupt / wrong-tenant file (the explicit repair path). */
  overwriteInvalid?: boolean;
}

function encode(tenantId: string, value: StoredJoinRules): string {
  const clean = checkedCopy(value);
  const bytes = JSON.stringify({ version: 1, tenantId, ruleSet: clean.ruleSet, state: clean.state }, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > JOIN_RULES_MAX_BYTES) throw new JoinRulesStoreError("too-large", "serialised rules exceed the size cap");
  return bytes;
}

/** Runs `fn` holding the tenant's lock; the lock is released in a `finally`. */
function withTenantLock<T>(file: string, o: StoreOptions, fn: (owns: () => void) => T): T {
  const lockPath = file.slice(0, -".json".length) + ".lock";
  let token: string;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    token = acquireLock(lockPath, { waitMs: o.lockWaitMs, staleMs: o.lockStaleMs, onTakeover: o.onLockTakeover, ...o.lockTest });
  } catch (e) {
    if (e instanceof LockFailure) throw new JoinRulesStoreError(e.code, e.message);
    throw new JoinRulesStoreError("lock-failed", e instanceof Error ? e.message : String(e));
  }
  const owns = () => {
    if (!lockStillOwned(lockPath, token)) throw new JoinRulesStoreError("locked", "the join-rules lock was lost before the write (another writer took it over); nothing was written, retry");
  };
  try { return fn(owns); } finally { releaseLock(lockPath, token); }
}

/**
 * Windows refuses to rename over a file a reader has open at that instant (EPERM/EACCES/EBUSY); it is transient, and the old
 * file stays whole meanwhile. Retry within a bounded ~3s (we hold the tenant lock); any other error, or exhaustion, propagates.
 */
function renameReplacing(rename: typeof renameSync, from: string, to: string): void {
  const start = Date.now();
  for (;;) {
    try { rename(from, to); return; }
    catch (e: any) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(e?.code) || Date.now() - start > 3000) throw e;
      sleep(2 + Math.floor(Math.random() * 8));
    }
  }
}

/** Atomic write. Caller holds the lock. */
function writeAtomic(file: string, bytes: string, rename: typeof renameSync | undefined, owns: () => void): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let descriptor: number | undefined, created = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600); created = true;
    writeFileSync(descriptor, bytes); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    owns(); // still our lock? checked as late as possible, right before the data file is replaced
    renameReplacing(rename ?? renameSync, temporary, file);
  } catch (e) {
    if (e instanceof JoinRulesStoreError) throw e;
    throw new JoinRulesStoreError("write-failed", e instanceof Error ? e.message : String(e));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}

/**
 * Full replace of a tenant's rules, under the tenant lock. By default an existing file that is unreadable, corrupt, oversized,
 * schema-invalid or embeds another tenant is REFUSED with the load error (nothing written), so a caller saving
 * `{newRules, emptyState}` cannot silently discard approvals / opt-outs. `{ overwriteInvalid: true }` is the explicit repair.
 * A non-regular file (directory, link) is refused either way.
 */
export function saveJoinRules(stateDir: string, tenantId: string, value: StoredJoinRules, io: StoreOptions = {}): void {
  const file = joinRulesFilePath(stateDir, tenantId);
  const bytes = encode(tenantId, value);
  withTenantLock(file, io, owns => {
    if (entryExists(file)) {
      if (!lstatSync(file).isFile()) throw new JoinRulesStoreError("not-a-file", `${file} is not a regular file`);
      if (!io.overwriteInvalid) loadJoinRules(stateDir, tenantId);
    }
    writeAtomic(file, bytes, io.rename, owns);
  });
}

/** Locked load -> apply -> validate -> write. A bad stored file blocks the write (load throws). */
function mutateState(stateDir: string, tenantId: string, o: StoreOptions, apply: (s: JoinRuleState) => JoinRuleState): JoinRuleState {
  const file = joinRulesFilePath(stateDir, tenantId);
  return withTenantLock(file, o, owns => {
    const cur = loadJoinRules(stateDir, tenantId);
    o.afterRead?.();
    let state!: JoinRuleState;
    wrapInvalid(() => { state = apply(cur.state); });
    writeAtomic(file, encode(tenantId, { ruleSet: cur.ruleSet, state }), o.rename, owns);
    return state;
  });
}

/** Approve-once for a sender or domain; loads first, so a bad stored file blocks the write. */
export function recordTenantApproval(stateDir: string, tenantId: string, approval: { kind: "sender" | "domain"; value: string }, opts: Omit<StoreOptions, "overwriteInvalid"> = {}): JoinRuleState {
  return mutateState(stateDir, tenantId, opts, s => applyApproval(s, approval));
}

/** Per-meeting opt-out; same lock and load-first behaviour. */
export function recordTenantOptOut(stateDir: string, tenantId: string, eventId: string, opts: Omit<StoreOptions, "overwriteInvalid"> = {}): JoinRuleState {
  return mutateState(stateDir, tenantId, opts, s => applyOptOut(s, eventId));
}
