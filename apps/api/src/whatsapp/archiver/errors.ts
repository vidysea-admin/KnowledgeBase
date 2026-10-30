/**
 * Closed error vocabulary of the archiver client (contract docs/whatsapp/archiver-service-api.md section 4, plus two
 * KB-side codes). An ArchiverError carries codes and numbers only: its message is the code, and no upstream body text,
 * URL, header, token or QR payload can reach a message, a property, JSON or a stack (R-42, plan W3 criterion 2).
 */
export const UPSTREAM_CODES = [
  "unauthorized", "invalid_request", "confirm_required", "not_found", "method_not_allowed", "owner_not_found",
  "group_not_found", "person_not_found", "payload_too_large", "unsupported_media_type", "owner_unlinked",
  "session_not_started", "idempotency_key_reused", "request_in_progress", "rate_limited", "store_unavailable", "internal_error",
] as const;
export type UpstreamCode = (typeof UPSTREAM_CODES)[number];

/** What callers (W5..W9) switch on. `archiver_api_unavailable` is the spec's 503 code; `archiver_api_unexpected` is any contract violation. */
export type ArchiverErrorCode =
  | "invalid_request" | "confirm_required" | "owner_not_found" | "group_not_found" | "person_not_found" | "owner_unlinked"
  | "session_not_started" | "idempotency_key_reused" | "request_in_progress" | "rate_limited" | "store_unavailable"
  | "internal_error" | "archiver_api_unavailable" | "archiver_api_unexpected";

/** Why the archiver was treated as unavailable or its answer as unexpected. Closed list, safe to log. */
export type ArchiverFailureReason =
  | "unauthorized" | "redirect_refused" | "timeout" | "network" | "version_mismatch" | "oversize" | "bad_response" | "upstream_5xx";

const PASS_THROUGH = new Set<string>([
  "invalid_request", "confirm_required", "owner_not_found", "group_not_found", "person_not_found", "owner_unlinked",
  "session_not_started", "idempotency_key_reused", "request_in_progress", "rate_limited", "store_unavailable", "internal_error",
]);
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_RETRY_AFTER_SEC = 3600;

export interface ArchiverErrorInit {
  upstreamCode?: UpstreamCode | null; reason?: ArchiverFailureReason | null; status?: number | null;
  retryAfterSec?: number | null; requestId?: string | null;
}
export class ArchiverError extends Error {
  readonly code: ArchiverErrorCode;
  readonly upstreamCode: UpstreamCode | null;
  readonly reason: ArchiverFailureReason | null;
  readonly status: number | null;
  readonly retryAfterSec: number | null;
  readonly requestId: string | null;
  constructor(code: ArchiverErrorCode, init: ArchiverErrorInit = {}) {
    super(code);
    this.name = "ArchiverError";
    this.code = code;
    this.upstreamCode = init.upstreamCode ?? null;
    this.reason = init.reason ?? null;
    this.status = init.status ?? null;
    this.retryAfterSec = init.retryAfterSec ?? null;
    this.requestId = init.requestId ?? null;
  }
  toJSON(): Record<string, unknown> {
    return { name: this.name, code: this.code, upstreamCode: this.upstreamCode, reason: this.reason, status: this.status,
      retryAfterSec: this.retryAfterSec, requestId: this.requestId };
  }
}
export const isArchiverError = (e: unknown): e is ArchiverError => e instanceof ArchiverError;

export const unavailable = (reason: ArchiverFailureReason, status: number | null = null): ArchiverError =>
  new ArchiverError("archiver_api_unavailable", { reason, status });
export const unexpected = (reason: ArchiverFailureReason = "bad_response", status: number | null = null): ArchiverError =>
  new ArchiverError("archiver_api_unexpected", { reason, status });

function envelope(parsed: unknown): { code: UpstreamCode; requestId: string | null; retryAfterSec: number | null } | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const err = (parsed as Record<string, unknown>).error;
  if (!err || typeof err !== "object" || Array.isArray(err)) return null;
  const e = err as Record<string, unknown>;
  if (typeof e.code !== "string" || !(UPSTREAM_CODES as readonly string[]).includes(e.code)) return null;
  const requestId = typeof e.requestId === "string" && REQUEST_ID_RE.test(e.requestId) ? e.requestId : null;
  const r = e.retryAfterSec;
  const retryAfterSec = typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= MAX_RETRY_AFTER_SEC ? r : null;
  return { code: e.code as UpstreamCode, requestId, retryAfterSec };
}

/** Map a non-2xx answer to the closed vocabulary. `parsed` is the JSON body or undefined; its text is never kept. */
export function mapUpstreamError(status: number, parsed: unknown, retryAfterHeader: string | null): ArchiverError {
  const env = envelope(parsed);
  const headerSec = retryAfterHeader !== null && /^\d{1,4}$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
  if (env) {
    const common = { upstreamCode: env.code, status, requestId: env.requestId, retryAfterSec: env.retryAfterSec ?? headerSec };
    if (env.code === "unauthorized") return new ArchiverError("archiver_api_unavailable", { ...common, reason: "unauthorized" });
    if (PASS_THROUGH.has(env.code)) return new ArchiverError(env.code as ArchiverErrorCode, common);
    return new ArchiverError("archiver_api_unexpected", { ...common, reason: "bad_response" });
  }
  if (status === 401 || status === 403) return new ArchiverError("archiver_api_unavailable", { status, reason: "unauthorized" });
  if (status === 429) return new ArchiverError("rate_limited", { status, retryAfterSec: headerSec });
  if (status >= 500) return new ArchiverError("archiver_api_unavailable", { status, reason: "upstream_5xx" });
  return unexpected("bad_response", status);
}
