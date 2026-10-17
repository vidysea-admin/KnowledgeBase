/** Tenant-bound operator authorization. Atomic CAS edits revoke approval, never infer consent. */
import { closeSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { joinRulesFilePath, loadJoinRules } from "./join-rules-store.js";
import { evaluateJoinRules } from "./join-rules.js";
import { optedOutMeetingMatch } from "./join-rules-optout.js";
import { acquireLock, releaseLock, lockStillOwned } from "./join-rules-store-lock.js";
import { validateRegistrationPolicy, registrationPolicyAllows, type RegistrationPolicy, type RegistrationCandidate } from "./registration-policy.js";

export interface RegistrationPolicyView { policy: RegistrationPolicy | null; approved: boolean; revision: string }
interface Document { version: 1; tenantId: string; policy: RegistrationPolicy; approvedPolicyRevision: string | null }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const MAX_BYTES = 100000;
export class RegistrationPolicyError extends Error {
  constructor(public code: "invalid" | "unavailable" | "conflict" | "unapproved" | "denied") { super(`Registration policy ${code}`); }
}
function filePath(root: string, tenant: string): string {
  const id = path.basename(joinRulesFilePath(root, tenant));
  return path.resolve(root, "registration-policies", id);
}
/** Inspect the complete existing ancestor chain before a recursive mkdir can traverse a junction/symlink. */
function assertSafeAncestors(target: string): void {
  for (let dir = path.resolve(target); ; dir = path.dirname(dir)) {
    try {
      const st = lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink() || path.relative(dir, realpathSync(dir)) !== "") throw new RegistrationPolicyError("unavailable");
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new RegistrationPolicyError("unavailable"); }
    if (path.dirname(dir) === dir) return;
  }
}
function checked(raw: unknown, tenant: string): Document {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new RegistrationPolicyError("unavailable");
  const d = raw as Record<string, unknown>;
  if (Object.keys(d).some(k => !["version", "tenantId", "policy", "approvedPolicyRevision"].includes(k)) || d.version !== 1 || d.tenantId !== tenant)
    throw new RegistrationPolicyError("unavailable");
  let policy: RegistrationPolicy; try { policy = validateRegistrationPolicy(d.policy); } catch { throw new RegistrationPolicyError("unavailable"); }
  if (d.approvedPolicyRevision !== null && d.approvedPolicyRevision !== hash(policy)) throw new RegistrationPolicyError("unavailable");
  return {version: 1, tenantId: tenant, policy, approvedPolicyRevision: d.approvedPolicyRevision as string | null};
}
function read(root: string, tenant: string): Document | null {
  const file = filePath(root, tenant);
  try {
    const st = lstatSync(file), parent = path.dirname(file);
    assertSafeAncestors(parent);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_BYTES) throw new RegistrationPolicyError("unavailable");
    const fd = openSync(file, "r"), bytes = Buffer.alloc(MAX_BYTES + 1);
    let count = 0;
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.size > MAX_BYTES) throw new RegistrationPolicyError("unavailable");
      for (;;) {
        const n = readSync(fd, bytes, count, bytes.length - count, null);
        if (!n) break; count += n;
        if (count > MAX_BYTES) throw new RegistrationPolicyError("unavailable");
      }
    } finally { closeSync(fd); }
    return checked(JSON.parse(bytes.subarray(0, count).toString("utf8")), tenant);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new RegistrationPolicyError("unavailable");
  }
}
function view(d: Document | null): RegistrationPolicyView {
  return {policy: d?.policy ?? null, approved: d?.approvedPolicyRevision !== null && d !== null, revision: d ? hash(d) : "absent"};
}
export function loadRegistrationPolicy(root: string, tenant: string): RegistrationPolicyView { return view(read(root, tenant)); }
export function mutateRegistrationPolicy(root: string, tenant: string, expected: string,
  action: "replace" | "approve" | "revoke", raw?: unknown): RegistrationPolicyView {
  const file = filePath(root, tenant), dir = path.dirname(file);
  let policy: RegistrationPolicy | undefined;
  if (action === "replace") { try { policy = validateRegistrationPolicy(raw); } catch { throw new RegistrationPolicyError("invalid"); } }
  assertSafeAncestors(dir);
  mkdirSync(dir, {recursive: true, mode: 0o700});
  assertSafeAncestors(dir);
  const lock = `${file}.lock`, token = acquireLock(lock), tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const old = read(root, tenant);
    if (view(old).revision !== expected) throw new RegistrationPolicyError("conflict");
    if (action !== "replace" && old === null) throw new RegistrationPolicyError("invalid");
    const d: Document = action === "replace" ? {version: 1, tenantId: tenant, policy: policy!, approvedPolicyRevision: null}
      : {...old!, approvedPolicyRevision: action === "approve" ? hash(old!.policy) : null};
    const serialized = JSON.stringify(d) + "\n";
    if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES) throw new RegistrationPolicyError("invalid");
    const fd = openSync(tmp, "wx", 0o600);
    try { writeFileSync(fd, serialized); fsyncSync(fd); } finally { closeSync(fd); }
    if (!lockStillOwned(lock, token)) throw new RegistrationPolicyError("conflict");
    renameSync(tmp, file);
    return view(d);
  } finally {
    try { unlinkSync(tmp); } catch { /* absent temp */ }
    releaseLock(lock, token);
  }
}
/** Candidate-bound authority; unconfigured, unapproved and denied are distinguishable without exposing profile data. */
export function resolveRegistrationPolicy(root: string, tenant: string, candidate: RegistrationCandidate): RegistrationPolicy {
  if (candidate.sessionKey !== undefined && (typeof candidate.sessionKey !== "string" || !candidate.sessionKey ||
    candidate.sessionKey.length > 200 || /[\s\x00-\x1f\x7f]/.test(candidate.sessionKey))) throw new RegistrationPolicyError("unavailable");
  const stored = loadRegistrationPolicy(root, tenant);
  if (!stored.policy) throw new RegistrationPolicyError("unavailable");
  if (!stored.approved) throw new RegistrationPolicyError("unapproved");
  const rules = loadJoinRules(root, tenant);
  const event = {id: candidate.id, organizer: candidate.senderEmail, meetingUrl: candidate.meetingUrl ?? candidate.registrationUrl};
  const decision = evaluateJoinRules(event, rules.ruleSet, rules.state);
  if (decision.reason === "invalid-rule-set") throw new RegistrationPolicyError("unavailable");
  if (decision.reason === "meeting-opt-out" || decision.reason === "deny-rule") throw new RegistrationPolicyError("denied");
  const ids = [candidate.id, ...(candidate.sessionKey ? [candidate.sessionKey] : [])];
  const identity = candidate.registrationIdentity;
  if (identity !== undefined) {
    const bounded = (x: unknown, max: number): x is string => typeof x === "string" && !!x && x.length <= max && !/[\s\x00-\x1f\x7f]/.test(x);
    if (!identity || typeof identity !== "object" || Array.isArray(identity) ||
      Object.keys(identity).some(k => !["sourceOccurrenceKey", "sourceIds", "sessionKeys"].includes(k)) ||
      !bounded(identity.sourceOccurrenceKey, 200) || !Array.isArray(identity.sourceIds) || !Array.isArray(identity.sessionKeys) ||
      identity.sourceIds.length + identity.sessionKeys.length > 200 ||
      !identity.sourceIds.every(id => bounded(id, 1024)) || !identity.sessionKeys.every(id => bounded(id, 200)))
      throw new RegistrationPolicyError("unavailable");
    ids.push(identity.sourceOccurrenceKey, ...identity.sourceIds, ...identity.sessionKeys);
  }
  if (ids.some(id => rules.state.optedOutEventIds.includes(id) || optedOutMeetingMatch(rules.state.optedOutMeetings, id, event.meetingUrl) !== undefined))
    throw new RegistrationPolicyError("denied");
  if (!registrationPolicyAllows(stored.policy, candidate)) throw new RegistrationPolicyError("denied");
  return stored.policy;
}
