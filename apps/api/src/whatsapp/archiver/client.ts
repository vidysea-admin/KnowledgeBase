/**
 * Typed client for the archiver service API (docs/whatsapp/archiver-service-api.md, W2a). Control plane only.
 * Security shape (plan W3): the URL is the fixed config origin plus a constant path; ids are validated before any
 * call; redirects are never followed; every failure is a closed ArchiverError; no body, token or QR is logged or
 * kept; `getQr` is never retried or cached; only idempotent calls are retried, and keyed mutations reuse their key.
 */
import { randomBytes } from "node:crypto";
import { IDEMPOTENCY_KEY_RE, JID_RE, OWNER_ID_RE, PERSON_ID_RE, type ArchiverConfig } from "./config.js";
import { ArchiverError, isArchiverError, mapUpstreamError, unavailable, unexpected } from "./errors.js";

export type SessionStatus = "connecting" | "awaiting_qr" | "connected" | "reconnecting" | "logged_out" | "closed" | "not_started";
export type Capture = "all" | "selected" | "none";
export interface OwnerRecord { ownerId: string; ownerRef: string; created: boolean; state: "active" | "unlinked" }
export interface SessionInfo { status: SessionStatus; detail: "logged_out" | "bad_session" | "connection_replaced" | null; updatedAt: string | null; accountHint: string | null }
export interface QrInfo { status: SessionStatus; qr: string | null; qrDataUrl: string | null; expiresAt: string | null }
export interface GroupInfo { jid: string; subject: string; participantCount: number; isTracked: boolean; trackAllSenders: boolean; membersSyncedAt: string | null }
export interface GroupList { source: "live" | "cache"; refreshedAt: string | null; truncated: boolean; groups: GroupInfo[] }
export interface PersonInfo { personId: string; label: string; isSelected: boolean; hasName: boolean }
export interface TrackingResult { jid: string; isTracked: boolean; trackAllSenders: boolean; capture: Capture; changed: boolean }
export interface UnlinkResult { ownerId: string; state: "unlinked"; status: "closed"; captureDisabled: true; unlinkedAt: string }
export interface HealthInfo { status: "ok" | "degraded"; time: string; store: "ok" | "down"; owners: { active: number; unlinked: number }; sessions: Record<string, number> }
export interface CallOptions { idempotencyKey?: string }
/** Closed event shape for the optional observer: codes and counts only. */
export interface ArchiverClientEvent { op: string; attempt: number; outcome: string; status: number | null; requestId: string | null; ms: number }
export interface ArchiverClientDeps {
  fetch?: typeof globalThis.fetch; sleep?: (ms: number) => Promise<void>; onEvent?: (e: ArchiverClientEvent) => void;
  maxRetries?: number; retryBaseMs?: number;
}

const STATUSES: readonly SessionStatus[] = ["connecting", "awaiting_qr", "connected", "reconnecting", "logged_out", "closed", "not_started"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_WAIT_MS = 5_000;
const KB = 1024;

type Obj = Record<string, unknown>;
const bad = (): never => { throw unexpected("bad_response"); };
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : bad());
const str = (v: unknown, re?: RegExp, max = 512): string => (typeof v === "string" && v.length <= max && (!re || re.test(v)) ? v : bad());
const iso = (v: unknown): string => str(v, ISO_RE, 24);
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : bad());
const int = (v: unknown): number => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : bad());
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : bad());
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : bad());

function requireId(re: RegExp, v: unknown): string {
  if (typeof v !== "string" || !re.test(v)) throw new ArchiverError("invalid_request");
  return v;
}

export interface ArchiverClient {
  ensureOwner(ownerRef: string, o?: CallOptions): Promise<OwnerRecord>;
  startSession(ownerId: string, o?: CallOptions): Promise<{ status: SessionStatus; updatedAt: string }>;
  getSession(ownerId: string): Promise<SessionInfo>;
  getQr(ownerId: string): Promise<QrInfo>;
  listGroups(ownerId: string): Promise<GroupList>;
  setGroupTracking(ownerId: string, jid: string, input: { isTracked: boolean; trackAllSenders?: boolean }, o?: CallOptions): Promise<TrackingResult>;
  listPeople(ownerId: string, jid: string): Promise<{ source: "live" | "cache" | "observed"; people: PersonInfo[] }>;
  setPeople(ownerId: string, jid: string, personIds: readonly string[], o?: CallOptions): Promise<{ jid: string; count: number; capture: Capture; changed: boolean }>;
  unlinkSession(ownerId: string, o?: CallOptions): Promise<UnlinkResult>;
  getHealth(): Promise<HealthInfo>;
}

interface Spec { op: string; method: "GET" | "POST" | "PUT"; path: string; body?: unknown; retry: boolean; timeoutMs: number; maxBytes: number; key?: string }

export function createArchiverClient(config: ArchiverConfig, deps: ArchiverClientDeps = {}): ArchiverClient {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const maxRetries = deps.maxRetries ?? 2;
  const retryBaseMs = deps.retryBaseMs ?? 200;
  const emit = (e: ArchiverClientEvent): void => { try { deps.onEvent?.(e); } catch { /* observer must not affect calls */ } };
  const origin = new URL(config.baseUrl).origin;

  async function readBounded(res: Response, max: number): Promise<string> {
    const declared = res.headers.get("content-length");
    if (declared !== null && Number(declared) > max) { void res.body?.cancel().catch(() => {}); throw unexpected("oversize", res.status); }
    if (!res.body) return "";
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      n += next.value.byteLength;
      if (n > max) { void reader.cancel().catch(() => {}); throw unexpected("oversize", res.status); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  async function once(spec: Spec): Promise<Obj> {
    const url = new URL(spec.path, origin);
    if (url.origin !== origin) throw new ArchiverError("invalid_request"); // defence in depth: never leave the configured origin
    const headers: Record<string, string> = {
      authorization: config.bearer(), accept: "application/json", "x-request-id": randomBytes(12).toString("hex"),
    };
    if (spec.body !== undefined) headers["content-type"] = "application/json";
    if (spec.key) headers["idempotency-key"] = spec.key;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), spec.timeoutMs);
    try {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: spec.method, headers, redirect: "manual", cache: "no-store", signal: ctl.signal,
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
        });
      } catch { throw unavailable(ctl.signal.aborted ? "timeout" : "network"); }
      try {
        if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) { void res.body?.cancel().catch(() => {}); throw unavailable("redirect_refused", res.status); }
        if (res.headers.get("x-archiver-api-version") !== "1") { void res.body?.cancel().catch(() => {}); throw unavailable("version_mismatch", res.status); }
        const ok = res.status === 200;
        const text = await readBounded(res, ok ? spec.maxBytes : 8 * KB);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { parsed = undefined; }
        if (!ok) throw mapUpstreamError(res.status, parsed, res.headers.get("retry-after"));
        if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw unexpected("bad_response", res.status);
        return obj(parsed);
      } catch (e) {
        if (isArchiverError(e)) throw e;
        throw unavailable(ctl.signal.aborted ? "timeout" : "network", res.status);
      }
    } finally { clearTimeout(timer); }
  }

  function retryDelay(e: ArchiverError, attempt: number): number | null {
    const backoff = retryBaseMs * 3 ** attempt;
    if (e.code === "archiver_api_unavailable") return e.reason === "timeout" || e.reason === "network" ? backoff : null;
    if (e.code === "store_unavailable" || e.code === "rate_limited" || e.code === "request_in_progress") {
      const wait = e.retryAfterSec !== null ? e.retryAfterSec * 1000 : e.code === "request_in_progress" ? 1000 : backoff;
      return wait <= MAX_WAIT_MS ? Math.max(wait, backoff) : null;
    }
    return null;
  }

  async function call(spec: Spec): Promise<Obj> {
    const attempts = spec.retry ? 1 + maxRetries : 1;
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const out = await once(spec);
        emit({ op: spec.op, attempt, outcome: "ok", status: 200, requestId: null, ms: Date.now() - started });
        return out;
      } catch (e) {
        const err = isArchiverError(e) ? e : unavailable("network");
        emit({ op: spec.op, attempt, outcome: err.code, status: err.status, requestId: err.requestId, ms: Date.now() - started });
        const delay = attempt + 1 < attempts ? retryDelay(err, attempt) : null;
        if (delay === null) throw err;
        await sleep(delay);
      }
    }
  }

  const keyFor = (o?: CallOptions): string =>
    o?.idempotencyKey === undefined ? `kb-${randomBytes(12).toString("hex")}` : requireId(IDEMPOTENCY_KEY_RE, o.idempotencyKey);
  const base = (op: string, timeoutMs = config.timeoutMs, maxBytes = 256 * KB) => ({ op, timeoutMs, maxBytes });
  const ownerPath = (id: string, rest = ""): string => `/svc/v1/owners/${requireId(OWNER_ID_RE, id)}${rest}`;
  const groupPath = (id: string, jid: string, rest: string): string => ownerPath(id, `/groups/${encodeURIComponent(requireId(JID_RE, jid))}${rest}`);
  const status = (v: unknown): SessionStatus => oneOf(v, STATUSES);
  const capture = (v: unknown): Capture => oneOf(v, ["all", "selected", "none"] as const);

  return {
    async ensureOwner(ownerRef, o) {
      const ref = requireId(OWNER_ID_RE, ownerRef);
      const r = await call({ ...base("ensureOwner"), method: "POST", path: "/svc/v1/owners", body: { ownerRef: ref }, retry: true, key: keyFor(o) });
      if (r.ownerRef !== ref) bad();
      return { ownerId: str(r.ownerId, OWNER_ID_RE), ownerRef: ref, created: bool(r.created), state: oneOf(r.state, ["active", "unlinked"] as const) };
    },
    async startSession(ownerId, o) {
      const r = await call({ ...base("startSession"), method: "POST", path: ownerPath(ownerId, "/session"), retry: true, key: keyFor(o) });
      return { status: status(r.status), updatedAt: iso(r.updatedAt) };
    },
    async getSession(ownerId) {
      const r = await call({ ...base("getSession"), method: "GET", path: ownerPath(ownerId, "/session"), retry: true });
      const st = status(r.status);
      const hint = r.accountHint === undefined || r.accountHint === null ? null : str(r.accountHint, /^[0-9]{2}$/, 2);
      const detail = r.detail === undefined || r.detail === null ? null : oneOf(r.detail, ["logged_out", "bad_session", "connection_replaced"] as const);
      return { status: st, detail, updatedAt: isoOrNull(r.updatedAt), accountHint: st === "connected" ? hint : null };
    },
    async getQr(ownerId) {
      // Never retried, never cached: a QR is a short-lived capture credential (R-12, R-13).
      const r = await call({ ...base("getQr", config.timeoutMs, 512 * KB), method: "GET", path: ownerPath(ownerId, "/session/qr"), retry: false });
      const st = status(r.status);
      const qr = r.qr === null ? null : str(r.qr, undefined, 4096);
      const qrDataUrl = r.qrDataUrl === null ? null : str(r.qrDataUrl, DATA_URL_RE, 300_000);
      const expiresAt = r.expiresAt === null ? null : iso(r.expiresAt);
      const present = [qr, qrDataUrl, expiresAt].filter(x => x !== null).length;
      if ((present !== 0 && present !== 3) || (present === 3 && st !== "awaiting_qr")) bad();
      return { status: st, qr, qrDataUrl, expiresAt };
    },
    async listGroups(ownerId) {
      const r = await call({ ...base("listGroups", config.listTimeoutMs, 4096 * KB), method: "GET", path: ownerPath(ownerId, "/groups"), retry: true });
      const groups = arr(r.groups, 2000).map(g => {
        const x = obj(g);
        return { jid: str(x.jid, JID_RE), subject: str(x.subject, undefined, 400), participantCount: int(x.participantCount),
          isTracked: bool(x.isTracked), trackAllSenders: bool(x.trackAllSenders), membersSyncedAt: isoOrNull(x.membersSyncedAt) };
      });
      return { source: oneOf(r.source, ["live", "cache"] as const), refreshedAt: isoOrNull(r.refreshedAt), truncated: bool(r.truncated), groups };
    },
    async setGroupTracking(ownerId, jid, input, o) {
      if (typeof input?.isTracked !== "boolean" || (input.trackAllSenders !== undefined && typeof input.trackAllSenders !== "boolean")) throw new ArchiverError("invalid_request");
      const body: Obj = { isTracked: input.isTracked };
      if (input.trackAllSenders !== undefined) body.trackAllSenders = input.trackAllSenders;
      const r = await call({ ...base("setGroupTracking"), method: "PUT", path: groupPath(ownerId, jid, "/tracking"), body, retry: true, key: keyFor(o) });
      if (r.jid !== jid) bad();
      return { jid, isTracked: bool(r.isTracked), trackAllSenders: bool(r.trackAllSenders), capture: capture(r.capture), changed: bool(r.changed) };
    },
    async listPeople(ownerId, jid) {
      const r = await call({ ...base("listPeople", config.listTimeoutMs, 2048 * KB), method: "GET", path: groupPath(ownerId, jid, "/people"), retry: true });
      const people = arr(r.people, 5000).map(p => {
        const x = obj(p);
        return { personId: str(x.personId, PERSON_ID_RE), label: str(x.label, undefined, 160), isSelected: bool(x.isSelected), hasName: bool(x.hasName) };
      });
      return { source: oneOf(r.source, ["live", "cache", "observed"] as const), people };
    },
    async setPeople(ownerId, jid, personIds, o) {
      if (!Array.isArray(personIds) || personIds.length > 1000 || new Set(personIds).size !== personIds.length) throw new ArchiverError("invalid_request");
      const ids = personIds.map(p => requireId(PERSON_ID_RE, p));
      const r = await call({ ...base("setPeople"), method: "PUT", path: groupPath(ownerId, jid, "/people"), body: { personIds: ids }, retry: true, key: keyFor(o) });
      if (r.jid !== jid) bad();
      return { jid, count: int(r.count), capture: capture(r.capture), changed: bool(r.changed) };
    },
    async unlinkSession(ownerId, o) {
      const r = await call({ ...base("unlinkSession"), method: "POST", path: ownerPath(ownerId, "/unlink"), body: { confirm: "UNLINK" }, retry: true, key: keyFor(o) });
      if (r.ownerId !== ownerId || r.state !== "unlinked" || r.status !== "closed" || r.captureDisabled !== true) bad();
      return { ownerId, state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: iso(r.unlinkedAt) };
    },
    async getHealth() {
      const r = await call({ ...base("getHealth"), method: "GET", path: "/svc/v1/health", retry: true });
      if (r.apiVersion !== "1") bad();
      const owners = obj(r.owners); const sess = obj(r.sessions);
      return { status: oneOf(r.status, ["ok", "degraded"] as const), time: iso(r.time), store: oneOf(r.store, ["ok", "down"] as const),
        owners: { active: int(owners.active), unlinked: int(owners.unlinked) },
        sessions: Object.fromEntries(Object.entries(sess).map(([k, v]) => [k, int(v)])) };
    },
  };
}
