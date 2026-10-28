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

export const REASON_TENANT_UNVERIFIED = "tenant-unverified: the API key's tenant could not be verified against LKB_TENANT_ID; join rules not applied";
interface RemoteJoinRulesContext {
  remote?: {url:string;apiKey?:string;fetch?:typeof fetch}; mode:unknown; tenantId?:string; keyTenantId?:unknown;
  stateDir:string; now?:()=>number; readOnly?:boolean; log:(message:string)=>void;
}

const rejectedRemoteAuthorities = new Set<string>();
const networkFailure = (error: unknown): boolean => {
  const value = error as {name?: string; cause?: {code?: string}};
  return ["AbortError", "TimeoutError"].includes(value?.name ?? "") ||
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT"].includes(value?.cause?.code ?? "");
};

/** Remote snapshot is bound to the exact endpoint, key and tenant; source bytes never enter logs. */
export async function remoteRules(c: RemoteJoinRulesContext, notifyDegraded: (event: {tenantId?:string;reason:string;usingSnapshot:boolean;snapshotValidatedAt?:number;snapshotExpiresAt?:number}) => Promise<void>): Promise<{stored:StoredJoinRules;healthy?:boolean;snapshot?:{validatedAt:number;expiresAt:number}} | {error: string}> {
  const now = (c.now ?? Date.now)(), remote = c.remote!, cap = 1024 * 1024;
  if (!c.tenantId || c.keyTenantId !== c.tenantId || !remote.apiKey || !Number.isSafeInteger(now) || now < 0)
    return {error: REASON_TENANT_UNVERIFIED};
  let file: string, url: URL;
  try {
    file = joinRulesFilePath(c.stateDir, c.tenantId).replace(/\.json$/, ".remote.json");
    url = new URL(remote.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
  } catch { return {error: "invalid remote policy configuration"}; }
  const authority = createHash("sha256").update(JSON.stringify([url.href, c.tenantId, remote.apiKey])).digest("hex");
  const checked = (value: any): StoredJoinRules => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !["ruleSet", "state"].includes(k))) throw new Error();
    return {ruleSet: validateJoinRuleSet(value.ruleSet), state: validateJoinRuleState(value.state)};
  };
  const invalidate = () => { rejectedRemoteAuthorities.add(authority); if (!c.readOnly) { try { unlinkSync(file); } catch {} } };
  let transient = false;
  try {
    let response: Response;
    try { response = await (remote.fetch ?? fetch)(url.href.replace(/\/$/, "") + "/calendar/join-rules", {
      headers: {authorization: "Bearer " + remote.apiKey}, redirect: "error", signal: AbortSignal.timeout(30000)}); }
    catch (error) { transient = networkFailure(error); throw new Error(); }
    if (!response.ok) {
      const owner = response.headers.get("x-lkb-tenant");
      transient = (owner === null || owner === c.tenantId) && ([408, 429].includes(response.status) || response.status >= 500);
      await response.body?.cancel(); throw new Error();
    }
    if (response.headers.get("x-lkb-tenant") !== c.tenantId || !/^"[^"\r\n]{1,200}"$/.test(response.headers.get("etag") ?? "") || !response.body) {
      await response.body?.cancel(); throw new Error();
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > cap) throw new Error(); chunks.push(value); }
    } catch (e) { transient = networkFailure(e); await reader.cancel().catch(() => {}); throw e; } finally { reader.releaseLock(); }
    const stored = checked(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    rejectedRemoteAuthorities.delete(authority);
    let saved = false;
    if (!c.readOnly) {
      const temp = file + "." + randomUUID() + ".tmp";
      try {
        mkdirSync(path.dirname(file), {recursive: true});
        const fd = openSync(temp, "wx", 0o600);
        try {writeFileSync(fd, JSON.stringify({version: 1, authority, tenantId: c.tenantId, validatedAt: now, expiresAt: now + 3600000, stored})); fsyncSync(fd);} finally {closeSync(fd);}
        renameSync(temp, file); saved = true;
      } catch { c.log("schedule-tick: JOIN RULES WARNING: remote snapshot not persisted; current policy remains enforced"); }
      finally {try {unlinkSync(temp);} catch {}}
    }
    return {stored, healthy: saved};
  } catch {
    if (!transient) invalidate();
    if (transient && c.mode === "last-valid" && !rejectedRemoteAuthorities.has(authority)) {
      try {
        const stat = lstatSync(file); if (!stat.isFile() || stat.size > cap + 4096) throw new Error();
        const cached = JSON.parse(readFileSync(file, "utf8"));
        if (cached.version !== 1 || cached.authority !== authority || cached.tenantId !== c.tenantId ||
          !Number.isSafeInteger(cached.validatedAt) || cached.validatedAt < 0 || cached.validatedAt > now ||
          cached.expiresAt !== cached.validatedAt + 3600000 || now >= cached.expiresAt) throw new Error();
        const stored = checked(cached.stored);
        await notifyDegraded({tenantId: c.tenantId, reason: "remote-unavailable", usingSnapshot: true, snapshotValidatedAt: cached.validatedAt, snapshotExpiresAt: cached.expiresAt});
        return {stored, snapshot: {validatedAt: cached.validatedAt, expiresAt: cached.expiresAt}};
      } catch {}
    }
    await notifyDegraded({tenantId: c.tenantId, reason: transient ? "remote-unavailable" : "remote-invalid", usingSnapshot: false});
    return {error: "authenticated remote rules unavailable or invalid; scheduling refused"};
  }
}
