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
 * Concurrency: the mutate helpers are read-modify-write with no lock (single scheduler process assumed).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  EMPTY_JOIN_RULE_STATE, recordApproval as applyApproval, recordOptOut as applyOptOut,
  validateJoinRuleSet, validateJoinRuleState, type JoinRuleSet, type JoinRuleState,
} from "./join-rules.js";

export const JOIN_RULES_MAX_BYTES = 1024 * 1024;
const TENANT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

export interface StoredJoinRules { ruleSet: JoinRuleSet; state: JoinRuleState }

export class JoinRulesStoreError extends Error {
  constructor(public readonly code: "bad-tenant" | "corrupt" | "too-large" | "invalid" | "tenant-mismatch" | "not-a-file" | "write-failed", detail: string) {
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

/** Atomic write. `io.rename` exists only so tests can inject a failure. */
export function saveJoinRules(stateDir: string, tenantId: string, value: StoredJoinRules, io: { rename?: typeof renameSync } = {}): void {
  const file = joinRulesFilePath(stateDir, tenantId);
  const clean = checkedCopy(value);
  const bytes = JSON.stringify({ version: 1, tenantId, ruleSet: clean.ruleSet, state: clean.state }, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > JOIN_RULES_MAX_BYTES) throw new JoinRulesStoreError("too-large", "serialised rules exceed the size cap");
  if (entryExists(file) && !lstatSync(file).isFile()) throw new JoinRulesStoreError("not-a-file", `${file} is not a regular file`);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let descriptor: number | undefined, created = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600); created = true;
    writeFileSync(descriptor, bytes); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    (io.rename ?? renameSync)(temporary, file);
  } catch (e) {
    throw new JoinRulesStoreError("write-failed", e instanceof Error ? e.message : String(e));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}

/** Approve-once for a sender or domain; loads first, so a bad stored file blocks the write. */
export function recordTenantApproval(stateDir: string, tenantId: string, approval: { kind: "sender" | "domain"; value: string }): JoinRuleState {
  const cur = loadJoinRules(stateDir, tenantId);
  let state!: JoinRuleState;
  wrapInvalid(() => { state = applyApproval(cur.state, approval); });
  saveJoinRules(stateDir, tenantId, { ruleSet: cur.ruleSet, state });
  return state;
}

/** Per-meeting opt-out; same load-first behaviour. */
export function recordTenantOptOut(stateDir: string, tenantId: string, eventId: string): JoinRuleState {
  const cur = loadJoinRules(stateDir, tenantId);
  let state!: JoinRuleState;
  wrapInvalid(() => { state = applyOptOut(cur.state, eventId); });
  saveJoinRules(stateDir, tenantId, { ruleSet: cur.ruleSet, state });
  return state;
}
