/**
 * packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts — unit `t037-tick-verifies-key-tenant` (ISS-T037WIRE-001, ISS-WIREPRE-002).
 * Learns the tenant of the API key the tick uses, from the `X-LKB-Tenant` response header of `GET /meeting-candidates`
 * (set from req.auth.tenantId, scope `gmail`, already required by the scheduler). Runs ONLY when join-rules enforcement is enabled
 * (the caller checks) and costs exactly ONE request per enforcing tick; nothing is cached (a rotated key changes the tenant).
 *
 * Returns the tenant id (validated by the join-rules store's own validator, via joinRulesFilePath) or `null` = "could not verify".
 * null is never read as verified: absent/empty/multi-valued/invalid header, no key, HTTP error (401/403 missing `gmail` scope/5xx),
 * network error, timeout, redirect. The same key and base URL as the candidate fetch are used; the key is sent nowhere else.
 * The raw header is never logged: only a fixed reason token is.
 */
import { joinRulesFilePath } from "../join-rules/join-rules-store.js";

export const KEY_TENANT_PATH = "/meeting-candidates";
/** Operator-facing cause for the statuses whose meaning is known (ISS-TENANTSIG-001 / -002). Fixed text only; the response is never echoed. */
const STATUS_HINT: Readonly<Record<number, string>> = {
  401: "the API rejected the key",
  403: "the key lacks the `gmail` scope",
  503: "the API's candidate discovery is unavailable: an API-side fault, not a tenant mismatch",
};
const TIMEOUT_MS = 15_000;

/** The store's own tenant validator (no second regex): joinRulesFilePath throws for any id the store would refuse. */
function validTenant(v: string | null): string | null {
  if (v === null || v === "") return null;
  try { joinRulesFilePath(".", v); return v; } catch { return null; }
}

export function createKeyTenantLoader(apiUrl: string, apiKey: string | undefined, log: (msg: string) => void): () => Promise<string | null> {
  return async () => {
    const unknown = (why: string): null => { log(`schedule-tick: key tenant NOT verified (${why}) — join rules cannot be attributed to this key`); return null; };
    if (!apiKey) return unknown("no API key");
    try {
      const res = await fetch(`${apiUrl}${KEY_TENANT_PATH}`, {
        headers: { authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      try {
        if (!res.ok) {
          const status = Number(res.status) || 0;
          return unknown(`GET ${KEY_TENANT_PATH} -> ${status || "?"}${STATUS_HINT[status] ? `; ${STATUS_HINT[status]}` : ""}`);
        }
        const tenant = validTenant(res.headers.get("x-lkb-tenant"));
        return tenant ?? unknown("X-LKB-Tenant header missing or invalid");
      } finally { await res.body?.cancel().catch(() => {}); }
    } catch { return unknown("request failed"); }
  };
}
