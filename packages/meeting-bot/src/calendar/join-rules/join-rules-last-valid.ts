/** Tenant-bound full rules/state snapshot. Integrity detects accidental tampering; local filesystem permissions remain the trust boundary. */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { joinRulesFilePath, JOIN_RULES_MAX_BYTES, JoinRulesStoreError, type StoredJoinRules } from "./join-rules-store.js";
import { validateJoinRuleSet, validateJoinRuleState } from "./join-rules.js";
import { acquireLock, lockStillOwned, releaseLock } from "./join-rules-store-lock.js";
import path from "node:path";

/** Wall-clock age bound across restarts. A backwards jump past validation refuses; smaller clock regressions require operator clock integrity. */
export const JOIN_RULES_SNAPSHOT_TTL_MS = 3_600_000;
export interface LastValidJoinRules { stored: StoredJoinRules; validatedAt: number; expiresAt: number }
export class JoinRulesSnapshotError extends Error {
  constructor(public readonly code: string) { super(`join-rules snapshot: ${code}`); }
}
export const lastValidJoinRulesPath = (stateDir: string, tenantId: string): string =>
  joinRulesFilePath(stateDir, tenantId).replace(/\.json$/, ".last-valid.json");

function regular(file: string, missingAllowed = false): boolean {
  try {
    const st = lstatSync(file);
    if (!st.isFile()) throw new JoinRulesSnapshotError("not-a-file");
    if (st.size > JOIN_RULES_MAX_BYTES) throw new JoinRulesSnapshotError("too-large");
    return true;
  } catch (e) {
    if (missingAllowed && (e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
function validated(value: StoredJoinRules): StoredJoinRules {
  return { ruleSet: validateJoinRuleSet(value.ruleSet), state: validateJoinRuleState(value.state) };
}
function digest(tenantId: string, validatedAt: number, stored: StoredJoinRules): string {
  return createHash("sha256").update(JSON.stringify({ tenantId, validatedAt, stored })).digest("hex");
}
/** Descriptor and directory entry must identify the same regular file, even when O_NOFOLLOW is unavailable on Windows. */
function capturedBytes(file: string): Buffer {
  regular(file);
  const before = lstatSync(file);
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd), after = lstatSync(file);
    if (!opened.isFile() || !after.isFile() || opened.dev !== before.dev || opened.ino !== before.ino ||
      opened.dev !== after.dev || opened.ino !== after.ino) throw new JoinRulesSnapshotError("file-changed");
    if (opened.size > JOIN_RULES_MAX_BYTES) throw new JoinRulesSnapshotError("too-large");
    const bytes = readFileSync(fd);
    if (bytes.length > JOIN_RULES_MAX_BYTES) throw new JoinRulesSnapshotError("too-large");
    return bytes;
  } finally { closeSync(fd); }
}
/** Unlike the legacy store loader, an absent primary file is unavailable, never a permissive empty set. */
export function loadPrimaryJoinRules(stateDir: string, tenantId: string): StoredJoinRules {
  const file = joinRulesFilePath(stateDir, tenantId);
  if (!regular(file, true)) throw new JoinRulesSnapshotError("primary-missing");
  const p = JSON.parse(capturedBytes(file).toString("utf8"));
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new JoinRulesSnapshotError("invalid-primary");
  if (p.tenantId !== tenantId) throw new JoinRulesStoreError("tenant-mismatch", "primary tenant differs");
  if (p.version !== 1 || Object.keys(p).some(k => !["version", "tenantId", "ruleSet", "state"].includes(k)))
    throw new JoinRulesSnapshotError("invalid-primary");
  return validated(p);
}
export function saveLastValidJoinRules(stateDir: string, tenantId: string, value: StoredJoinRules, now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) throw new JoinRulesSnapshotError("invalid-clock");
  const file = lastValidJoinRulesPath(stateDir, tenantId), stored = validated(value);
  const bytes = JSON.stringify({ version: 1, tenantId, validatedAt: now, stored, hash: digest(tenantId, now, stored) });
  if (Buffer.byteLength(bytes) > JOIN_RULES_MAX_BYTES) throw new JoinRulesSnapshotError("too-large");
  mkdirSync(path.dirname(file), { recursive: true });
  const lockPath = joinRulesFilePath(stateDir, tenantId).replace(/\.json$/, ".lock");
  const token = acquireLock(lockPath); // same lock as authoritative rules/state writes; no thresholds changed
  const tmp = `${file}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    let current: StoredJoinRules;
    try { current = loadPrimaryJoinRules(stateDir, tenantId); }
    catch { throw new JoinRulesSnapshotError("primary-revalidation-failed"); }
    if (digest(tenantId, now, current) !== digest(tenantId, now, stored)) throw new JoinRulesSnapshotError("primary-changed");
    regular(file, true); // never replace a symlink/directory
    fd = openSync(tmp, "wx", 0o600);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    regular(file, true);
    if (!lockStillOwned(lockPath, token)) throw new JoinRulesSnapshotError("lock-lost");
    renameSync(tmp, file);
  } finally {
    try {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(tmp); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    } finally { releaseLock(lockPath, token); }
  }
}
export function loadLastValidJoinRules(stateDir: string, tenantId: string, now: number): LastValidJoinRules {
  if (!Number.isSafeInteger(now) || now < 0) throw new JoinRulesSnapshotError("invalid-clock");
  const file = lastValidJoinRulesPath(stateDir, tenantId);
  const bytes = capturedBytes(file);
  const p: unknown = JSON.parse(bytes.toString("utf8"));
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new JoinRulesSnapshotError("invalid-shape");
  const r = p as Record<string, unknown>;
  if (Object.keys(r).some(k => !["version", "tenantId", "validatedAt", "stored", "hash"].includes(k)) || r.version !== 1)
    throw new JoinRulesSnapshotError("invalid-shape");
  if (r.tenantId !== tenantId) throw new JoinRulesStoreError("tenant-mismatch", "snapshot tenant differs");
  const at = r.validatedAt;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0 || at > now) throw new JoinRulesSnapshotError("invalid-age");
  if (now - at >= JOIN_RULES_SNAPSHOT_TTL_MS) throw new JoinRulesSnapshotError("expired");
  if (!r.stored || typeof r.stored !== "object" || Array.isArray(r.stored) || Object.keys(r.stored).some(k => !["ruleSet", "state"].includes(k)))
    throw new JoinRulesSnapshotError("invalid-shape");
  const stored = validated(r.stored as StoredJoinRules);
  if (typeof r.hash !== "string" || r.hash !== digest(tenantId, at, stored)) throw new JoinRulesSnapshotError("integrity-mismatch");
  return { stored, validatedAt: at, expiresAt: at + JOIN_RULES_SNAPSHOT_TTL_MS };
}
