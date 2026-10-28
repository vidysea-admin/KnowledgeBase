import { parseOnairUrl } from "@lkb/ingest";
import { createHash } from "node:crypto";
import type { UploadTransport } from "@lkb/ai";
import { actorIdentity, digest } from "./input.js";
import { SourceJobError, type SourceJob, type SourceJobInput, type SourceSessionAuthority } from "./types.js";

/** Protected-source permission is trusted operator data, never derived from an ingest request's mere existence. */
export const onairSessionFingerprint = (cookie: string): string => createHash("sha256").update(cookie.trim()).digest("hex");
export function approvedSourceSession(env: NodeJS.ProcessEnv, input: Pick<SourceJobInput, "tenantId" | "actorKeyId" | "url">, options: { requireCookie?: boolean; now?: number } = {}): SourceSessionAuthority | undefined {
  const event = parseOnairUrl(input.url), cookie = env.LKB_ONAIR_COOKIE_HEADER?.trim();
  const declared = env.LKB_ONAIR_SESSION_FINGERPRINT;
  if (!event.ok || (!cookie && !declared)) return undefined; // No account authority is used for the public no-cookie path.
  try {
    if (declared !== undefined && !/^[a-f0-9]{64}$/.test(declared) || !cookie && options.requireCookie !== false) throw new Error();
    const sessionFingerprint = cookie ? onairSessionFingerprint(cookie) : declared!;
    if (declared && declared !== sessionFingerprint) throw new Error();
    const tenant = actorIdentity(env.LKB_ONAIR_SESSION_TENANT), account = actorIdentity(env.LKB_ONAIR_SESSION_ACCOUNT);
    if (tenant !== input.tenantId || !env.LKB_ONAIR_SOURCE_BINDINGS) throw new Error();
    const rows: unknown = JSON.parse(env.LKB_ONAIR_SOURCE_BINDINGS);
    if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error();
    const ids = new Set<string>();
    let found: SourceSessionAuthority | undefined;
    for (const value of rows) {
      const row = value as Record<string, unknown>;
      if (!row || Object.keys(row).sort().join(",") !== "accountId,actorKeyIds,approvalRef,eventId,expiresAt,id,providerProcessing,tenantId" ||
          row.providerProcessing !== "approved-recording" || !Array.isArray(row.actorKeyIds) || !row.actorKeyIds.length || row.actorKeyIds.length > 100) throw new Error();
      const id = actorIdentity(row.id), tenantId = actorIdentity(row.tenantId), accountId = actorIdentity(row.accountId), approvalRef = actorIdentity(row.approvalRef);
      if (ids.has(id)) throw new Error(); ids.add(id);
      const eventId = actorIdentity(row.eventId), parsed = parseOnairUrl(`https://cloudonair.withgoogle.com/events/${eventId}`);
      const actors = row.actorKeyIds.map(actorIdentity).sort();
      if (!parsed.ok || parsed.eventId !== eventId || new Set(actors).size !== actors.length || tenantId !== tenant || accountId !== account) throw new Error();
      const expiresAt = bindingExpiry(row.expiresAt); // D-182: required; missing or malformed is fail-closed.
      if (eventId !== event.eventId || !actors.includes(input.actorKeyId)) continue;
      if (expiresAt <= (options.now ?? Date.now())) throw new Error(); // expired grant is refused like a removed one.
      if (found) throw new Error();
      found = { kind: "onair-account", tenantId, accountId, eventId, bindingId: id,
        bindingFingerprint: digest([id, tenantId, accountId, eventId, actors, approvalRef, row.providerProcessing]), sessionFingerprint };
    }
    if (!found) throw new Error();
    return Object.freeze(found);
  } catch { throw new SourceJobError("source_session_authorization_unavailable", 403); }
}

/** D-182: `expiresAt` is a strict UTC ISO-8601 instant (event end + 24h); anything else throws. */
function bindingExpiry(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) throw new Error();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error();
  return ms;
}

export function sourceSessionStillApproved(env: NodeJS.ProcessEnv, job: Readonly<SourceJob>, now?: number): boolean {
  try {
    const current = approvedSourceSession(env, job, { now });
    return JSON.stringify(current) === JSON.stringify(job.approval.sourceAuthority);
  } catch { return false; }
}

export function guardedSourceMediaTransport(allowed: () => Promise<boolean>, transport: UploadTransport): UploadTransport {
  return async call => {
    // Scoped cleanup is allowed after revocation; processing/upload/generation must recheck current permission.
    if (call.method !== "DELETE" && !await allowed()) throw new SourceJobError("source_job_forbidden", 403);
    return transport(call);
  };
}
