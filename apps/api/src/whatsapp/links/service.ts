/**
 * WhatsApp link lifecycle service (whatsapp-multiuser W5; spec R-1..R-6, R-9..R-14, R-24 bind, R-44). Pure logic over ports:
 * a LinksStore (Mongo in router.ts, in-memory in tests) and the W3 archiver client. Every method authorises its own caller
 * (defence in depth beneath the router's scope checks) and takes the tenant from the Principal only. Unlink/revoke here move
 * KB eligibility only; quarantine, the consent CAS and the archiver unlink step belong to W8, which extends this file.
 */
import type { ArchiverClient } from "../archiver/client.js";
import { isArchiverError } from "../archiver/errors.js";
import { isLiveLinkState, whatsAppLinkStores } from "@lkb/db";
import type { Db } from "mongodb";
import type { Notice } from "./notice.js";

export type LinkState = "requested" | "approved" | "active" | "suspended" | "rejected" | "unlinked" | "revoked";
export type StudentData = "yes" | "no" | "unknown";
export const LIVE_STATES: readonly LinkState[] = ["requested", "approved", "active", "suspended"];
export const LINK_ID_RE = /^[0-9a-f]{24}$/;
export const REASON_RE = /^[a-z][a-z0-9_]{0,63}$/;
const APPROVAL_TTL_MS = 14 * 24 * 3600_000; // R-5
const EVENT_ID_RE = /^[A-Za-z0-9_.:@-]{1,200}$/;
const OPEN_STATES: readonly string[] = ["not_started", "logged_out", "closed"];

export interface LinkHealth { lastStatus?: string; lastStatusAt?: string; lastRunAt?: string; lastSuccessAt?: string; lastMessageAt?: string; flags?: string[] }
export interface LinkRow {
  _id: string; tenantId: string; userId: string | null; label: string; state: LinkState; live: boolean; studentData: StudentData; createdAt: string; updatedAt: string;
  archiverOwnerId?: string; noticeVersion?: string; noticeShownAt?: string; requestedAt?: string; approvedBy?: string; approvedAt?: string; approvalExpiresAt?: string;
  activatedAt?: string; suspendedAt?: string; suspendedBy?: string; suspendedReason?: string; rejectedAt?: string; rejectedBy?: string; rejectedReason?: string;
  unlinkedAt?: string; unlinkedBy?: string; unlinkedReason?: string; revokedAt?: string; revokedBy?: string; revokedReason?: string; blocksNewRequests?: boolean; health?: LinkHealth;
}
export type EventType = "link.requested" | "link.approved" | "link.rejected" | "link.connected" | "link.suspended" | "link.resumed" | "link.unlinked" | "link.revoked";
export interface NewEvent { eventType: EventType; actorKind: "user" | "key" | "system"; linkId: string; actorId?: string; data?: Record<string, string | number> }
/** Guards a CAS transition must also satisfy: archiver owner stored, was once active, flagged needs-relink, legacy (no user). */
export type Guard = "owner_id" | "activated" | "needs_relink" | "legacy";
export interface Transition { from: readonly LinkState[]; to: LinkState; set?: Record<string, unknown>; unset?: readonly string[]; require?: readonly Guard[] }
export class LiveLinkExistsError extends Error { constructor() { super("live_link_exists"); this.name = "LiveLinkExistsError"; } }

export interface LinksStore {
  insert(tenantId: string, row: Omit<LinkRow, "tenantId">): Promise<LinkRow>; // throws LiveLinkExistsError on the one-live-link index (R-2)
  get(tenantId: string, id: string): Promise<LinkRow | null>;
  listForUser(tenantId: string, userId: string): Promise<LinkRow[]>;
  listAll(tenantId: string, limit: number): Promise<LinkRow[]>;
  hasBlockingLink(tenantId: string, userId: string): Promise<boolean>;
  /** Compare-and-set: null when the link is absent, not in `from`, or a guard fails. May throw LiveLinkExistsError (bind). */
  transition(tenantId: string, id: string, t: Transition): Promise<LinkRow | null>;
  setOwnerId(tenantId: string, id: string, ownerId: string): Promise<"set" | "same" | "conflict" | "gone">;
  appendEvent(tenantId: string, e: NewEvent): Promise<void>;
}
export type ArchiverPort = Pick<ArchiverClient, "ensureOwner" | "startSession" | "getSession" | "getQr">;

/** Who is asking, derived from req.auth only (router.principalOf). `actor` is actorId(): user:<id> for a session, the key id for a key. */
export interface Principal { tenantId: string; kind: "session" | "key"; userId: string | null; actor: string | null; link: boolean; admin: boolean }
export type Fail = { ok: false; status: number; error: string; message: string; extra?: Record<string, unknown> };
export type Result<T> = { ok: true; value: T } | Fail;
const fail = (status: number, error: string, message: string, extra?: Record<string, unknown>): Fail => ({ ok: false, status, error, message, ...(extra ? { extra } : {}) });
const NOT_FOUND = fail(404, "not_found", "no such link");
const FORBIDDEN = fail(403, "forbidden", "this action is not allowed for this caller");
const INVALID_STATE = fail(409, "invalid_state", "the link is not in a state that allows this");
const ARCHIVER_DOWN = fail(503, "archiver_api_unavailable", "the WhatsApp archiver is temporarily unavailable");

export interface ConnectView { state: string; linkState: LinkState; qr: string | null; expiresAt: string | null; accountHint: string | null }
export interface LinksServiceDeps {
  store: LinksStore; archiver: ArchiverPort | null; notice: () => Notice | null; countActiveAdmins: (tenantId: string) => Promise<number>;
  userStatus: (tenantId: string, userId: string) => Promise<{ status: string; role?: string } | null>;
  now?: () => Date; log?: { warn(msg: string, f?: Record<string, unknown>): void; error(msg: string, f?: Record<string, unknown>): void };
  requestLimit?: { max: number; windowMs: number }; qrLimit?: { max: number; windowMs: number };
}

/** Fixed-window limiter; returns the seconds to wait when the key is over `max`, else 0. Per process (see manifest open points). */
export function createWindowLimiter(max: number, windowMs: number, now: () => Date) {
  const hits = new Map<string, { start: number; n: number }>();
  return (key: string): number => {
    const t = now().getTime(), w = hits.get(key);
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    if (!w || t - w.start >= windowMs) { hits.set(key, { start: t, n: 1 }); return 0; }
    return ++w.n > max ? Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) : 0;
  };
}

const ADMIN_ONLY = ["approvedBy", "suspendedBy", "rejectedBy", "unlinkedBy", "revokedBy", "archiverOwnerId", "studentData"] as const;
const COMMON = ["label", "state", "noticeVersion", "noticeShownAt", "requestedAt", "approvedAt", "approvalExpiresAt", "activatedAt", "suspendedAt", "suspendedReason", "rejectedAt",
  "rejectedReason", "unlinkedAt", "unlinkedReason", "revokedAt", "revokedReason", "blocksNewRequests", "createdAt", "updatedAt"] as const;
const HEALTH = ["lastStatus", "lastStatusAt", "lastRunAt", "lastSuccessAt", "lastMessageAt", "flags"] as const;
/** Allowlist projection (never a spread of the row): the archiver owner id, student-data class and acting admins are admin-only (R-24, R-42). */
export function toLinkView(row: LinkRow, admin: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row._id, userId: row.userId, legacy: row.userId === null };
  const src = row as unknown as Record<string, unknown>;
  for (const k of [...COMMON, ...(admin ? ADMIN_ONLY : [])]) if (src[k] !== undefined) out[k] = src[k];
  if (row.health) out.health = Object.fromEntries(HEALTH.filter(k => row.health![k] !== undefined).map(k => [k, row.health![k]]));
  return out;
}

export function createLinksService(deps: LinksServiceDeps) {
  const { store, archiver } = deps;
  const now = deps.now ?? (() => new Date());
  const iso = (): string => now().toISOString();
  const requestHit = createWindowLimiter(deps.requestLimit?.max ?? 10, deps.requestLimit?.windowMs ?? 3600_000, now); // R-1 creation rate limit [ASSUMPTION 10/h/user]
  const qrHit = createWindowLimiter(deps.qrLimit?.max ?? 30, deps.qrLimit?.windowMs ?? 60_000, now); // R-13: 30/min/link
  const inflight = new Map<string, Promise<string>>();
  const limited = (s: number): Fail => fail(429, "rate_limited", "too many requests, retry later", { retryAfterSec: s });
  const by = (p: Principal): string => (p.kind === "session" ? p.userId! : `key:${p.actor}`);
  const eventActor = (p: Principal): Pick<NewEvent, "actorKind" | "actorId"> => ({ actorKind: p.kind === "session" ? "user" : "key", ...(p.actor && EVENT_ID_RE.test(p.actor) ? { actorId: p.actor } : {}) });
  const idOf = (v: string | null | undefined): string | undefined => (v && EVENT_ID_RE.test(v) ? v : undefined);
  const owns = (p: Principal, l: LinkRow): boolean => p.kind === "session" && p.link && l.userId !== null && l.userId === p.userId;
  const load = async (p: Principal, id: string): Promise<LinkRow | null> => (LINK_ID_RE.test(id) ? store.get(p.tenantId, id) : null);

  /** State is authoritative: the event is written after the CAS and a failed write is logged by code, never fails the (already applied) transition. */
  async function emit(p: Principal | null, tenantId: string, e: Omit<NewEvent, "actorKind" | "actorId">): Promise<void> {
    try { await store.appendEvent(tenantId, { ...e, ...(p ? eventActor(p) : { actorKind: "system" as const }) } as NewEvent); }
    catch { deps.log?.error("whatsapp link event write failed", { code: "event_write_failed", eventType: e.eventType }); }
  }
  const view = (l: LinkRow, p: Principal, extra: Record<string, unknown> = {}): Result<Record<string, unknown>> => ({ ok: true, value: { link: toLinkView(l, p.admin), ...extra } });

  /** Admin-only CAS transition with one event; the shared body of reject / suspend / resume / revoke. */
  async function adminMove(p: Principal, id: string, t: (l: LinkRow) => Transition | null, ev: EventType, reason?: string): Promise<Result<Record<string, unknown>>> {
    if (!p.admin || !p.actor) return FORBIDDEN;
    const l = await load(p, id); if (!l) return NOT_FOUND;
    const tr = t(l); if (!tr) return INVALID_STATE;
    const next = await store.transition(p.tenantId, l._id, tr); if (!next) return INVALID_STATE;
    await emit(p, p.tenantId, { eventType: ev, linkId: l._id, data: { fromState: l.state, toState: next.state, ...(reason ? { reason } : {}) } });
    return view(next, p);
  }

  async function provision(p: Principal, linkId: string): Promise<string> {
    const key = `${p.tenantId}\u0000${linkId}`;
    const running = inflight.get(key); if (running) return running;
    const flight = (async () => { // R-11: one ensureOwner per link, even under concurrent connects; a late caller re-reads first
      const cur = await store.get(p.tenantId, linkId);
      if (cur?.archiverOwnerId) return cur.archiverOwnerId;
      const rec = await archiver!.ensureOwner(linkId, { idempotencyKey: `ensure-${linkId}` });
      if (rec.state !== "active") throw new Error("owner_unavailable");
      if ((await store.setOwnerId(p.tenantId, linkId, rec.ownerId)) === "conflict") throw new Error("owner_conflict");
      return rec.ownerId;
    })().finally(() => inflight.delete(key));
    inflight.set(key, flight);
    return flight;
  }
  function archiverFail(e: unknown): Fail {
    if (!isArchiverError(e)) { deps.log?.warn("whatsapp connect failed", { code: "connect_failed" }); return ARCHIVER_DOWN; }
    deps.log?.warn("whatsapp archiver call failed", { code: e.code, reason: e.reason ?? undefined }); // closed vocabulary only
    if (e.code === "rate_limited") return fail(429, "archiver_busy", "the archiver is busy, retry shortly", { retryAfterSec: e.retryAfterSec ?? 5 });
    if (e.code === "owner_not_found" || e.code === "owner_unlinked") return fail(409, "archiver_owner_unavailable", "the archiver session for this link is no longer available");
    return ARCHIVER_DOWN;
  }

  return {
    async request(p: Principal, input: { label: string; noticeVersion: string }): Promise<Result<Record<string, unknown>>> {
      if (p.kind !== "session" || !p.userId || !p.link) return FORBIDDEN; // R-1: never a key, a viewer or a pending user
      const wait = requestHit(`${p.tenantId}\u0000${p.userId}`); if (wait) return limited(wait);
      const notice = deps.notice(); if (!notice) return fail(503, "notice_unavailable", "the notice text is unavailable");
      if (input.noticeVersion !== notice.version) return fail(409, "notice_changed", "the notice changed; show the current text", { noticeVersion: notice.version });
      if (await store.hasBlockingLink(p.tenantId, p.userId)) return fail(403, "link_blocked", "an administrator must clear the block before a new request");
      const at = iso();
      let row: LinkRow;
      try { row = await store.insert(p.tenantId, { _id: "", userId: p.userId, label: input.label, state: "requested", live: true, studentData: "no", noticeVersion: notice.version, noticeShownAt: at, requestedAt: at, createdAt: at, updatedAt: at }); }
      catch (e) { if (e instanceof LiveLinkExistsError) return fail(409, "link_exists", "you already have a WhatsApp link"); throw e; }
      await emit(p, p.tenantId, { eventType: "link.requested", linkId: row._id, data: { requesterId: idOf(p.userId)!, toState: "requested" } });
      return view(row, p);
    },
    async list(p: Principal): Promise<Result<Record<string, unknown>>> {
      if (!p.admin && !(p.kind === "session" && p.link && p.userId)) return FORBIDDEN;
      const rows = p.admin ? await store.listAll(p.tenantId, 200) : await store.listForUser(p.tenantId, p.userId!);
      return { ok: true, value: { links: rows.map(r => toLinkView(r, p.admin)) } };
    },
    async get(p: Principal, id: string): Promise<Result<Record<string, unknown>>> {
      if (!p.admin && !(p.kind === "session" && p.link)) return FORBIDDEN;
      const l = await load(p, id);
      return l && (p.admin || owns(p, l)) ? view(l, p) : NOT_FOUND; // another person's id looks exactly like an absent one
    },
    async approve(p: Principal, id: string, input: { studentData?: StudentData }): Promise<Result<Record<string, unknown>>> {
      if (!p.admin || !p.actor) return FORBIDDEN;
      const l = await load(p, id); if (!l) return NOT_FOUND;
      if (l.state !== "requested") return INVALID_STATE;
      const self = p.kind === "session" && l.userId !== null && l.userId === p.userId;
      if (self && (await deps.countActiveAdmins(p.tenantId)) !== 1) return fail(403, "self_approval_forbidden", "only the sole administrator may approve their own request"); // H-4 / R-4
      const at = iso();
      const next = await store.transition(p.tenantId, l._id, { from: ["requested"], to: "approved", set: { approvedBy: by(p), approvedAt: at, approvalExpiresAt: new Date(Date.parse(at) + APPROVAL_TTL_MS).toISOString(), studentData: input.studentData ?? l.studentData } });
      if (!next) return INVALID_STATE;
      const approver = idOf(p.kind === "session" ? p.userId : p.actor), requester = idOf(l.userId);
      await emit(p, p.tenantId, { eventType: "link.approved", linkId: l._id, data: { fromState: "requested", toState: "approved", ...(requester ? { requesterId: requester } : {}), ...(approver ? { approverId: approver } : {}), ...(self ? { reason: "self_approved" } : {}) } });
      return view(next, p, { selfApproved: self });
    },
    reject: (p: Principal, id: string, input: { reason?: string }) => adminMove(p, id, l => (l.state === "requested" ? { from: ["requested"], to: "rejected", set: { rejectedAt: iso(), rejectedBy: by(p), rejectedReason: input.reason ?? "admin_decision" } } : null), "link.rejected", input.reason ?? "admin_decision"),
    suspend: (p: Principal, id: string, input: { reason?: string }) => adminMove(p, id, l => (l.state === "active" ? { from: ["active"], to: "suspended", set: { suspendedAt: iso(), suspendedBy: by(p), suspendedReason: input.reason ?? "admin_action" } } : null), "link.suspended", input.reason ?? "admin_action"),
    resume: (p: Principal, id: string) => adminMove(p, id, l => (l.state === "suspended" ? { from: ["suspended"], to: "active", require: ["owner_id", "activated"], unset: ["suspendedAt", "suspendedBy", "suspendedReason"] } : null), "link.resumed"),
    revoke: (p: Principal, id: string, input: { reason?: string }) => adminMove(p, id, l => (LIVE_STATES.includes(l.state) ? { from: LIVE_STATES, to: "revoked", set: { revokedAt: iso(), revokedBy: by(p), revokedReason: input.reason ?? "admin_revoked", blocksNewRequests: true } } : null), "link.revoked", input.reason ?? "admin_revoked"),
    /** R-7 (KB eligibility only; W8 adds quarantine, the consent CAS and the archiver step). Owner or admin; repeating it is a 200 no-op. */
    async unlink(p: Principal, id: string, input: { reason?: string }): Promise<Result<Record<string, unknown>>> {
      if (!p.admin && !(p.kind === "session" && p.link)) return FORBIDDEN;
      const l = await load(p, id); if (!l || !(p.admin || owns(p, l))) return NOT_FOUND;
      if (l.state === "unlinked") return view(l, p, { changed: false });
      if (!LIVE_STATES.includes(l.state)) return INVALID_STATE;
      const reason = owns(p, l) ? "owner_request" : input.reason ?? "admin_request";
      const next = await store.transition(p.tenantId, l._id, { from: LIVE_STATES, to: "unlinked", set: { unlinkedAt: iso(), unlinkedBy: by(p), unlinkedReason: reason } });
      if (!next) { const cur = await store.get(p.tenantId, l._id); return cur?.state === "unlinked" ? view(cur, p, { changed: false }) : INVALID_STATE; }
      await emit(p, p.tenantId, { eventType: "link.unlinked", linkId: l._id, data: { fromState: l.state, toState: "unlinked", reason } });
      return view(next, p, { changed: true });
    },
    /** R-24: an admin binds a LEGACY (userless) live link to an active member/admin of the same tenant; afterwards it follows the normal rules. */
    async bind(p: Principal, id: string, input: { userId: string }): Promise<Result<Record<string, unknown>>> {
      if (!p.admin || !p.actor) return FORBIDDEN;
      const l = await load(p, id); if (!l) return NOT_FOUND;
      if (l.userId !== null || !LIVE_STATES.includes(l.state)) return fail(409, "not_legacy", "only a live legacy link can be bound");
      const u = await deps.userStatus(p.tenantId, input.userId);
      if (!u || u.status !== "active" || (u.role !== "member" && u.role !== "admin")) return fail(404, "user_not_found", "no such active member");
      try {
        const next = await store.transition(p.tenantId, l._id, { from: LIVE_STATES, to: l.state, set: { userId: input.userId }, require: ["legacy"] });
        return next ? view(next, p) : fail(409, "not_legacy", "only a live legacy link can be bound");
      } catch (e) { if (e instanceof LiveLinkExistsError) return fail(409, "link_exists", "that user already has a WhatsApp link"); throw e; }
    },
    /** W8 hook (R-10): suspends the user's ACTIVE links with a reason code; returns how many. Never resumes anything. */
    async suspendForAccount(tenantId: string, userId: string, reason: string): Promise<number> {
      let n = 0;
      for (const l of await store.listForUser(tenantId, userId)) {
        if (l.state !== "active" || !REASON_RE.test(reason)) continue;
        const next = await store.transition(tenantId, l._id, { from: ["active"], to: "suspended", set: { suspendedAt: iso(), suspendedBy: "system:account", suspendedReason: reason } });
        if (next) { n++; await emit(null, tenantId, { eventType: "link.suspended", linkId: l._id, data: { fromState: "active", toState: "suspended", reason } }); }
      }
      return n;
    },
    /** R-11..R-14. Only the owner's own session; anyone else's id is a 404 and never consumes the owner's rate-limit budget. */
    async connect(p: Principal, id: string): Promise<Result<ConnectView>> {
      if (p.kind !== "session" || !p.link || !p.userId) return FORBIDDEN;
      const l = await load(p, id); if (!l || !owns(p, l)) return NOT_FOUND;
      const relink = l.state === "active" && (l.health?.flags ?? []).includes("needs-relink");
      if (l.state === "active" && !relink) return { ok: true, value: { state: l.health?.lastStatus ?? "connected", linkState: "active", qr: null, expiresAt: null, accountHint: null } }; // no QR for a healthy link
      if (l.state !== "approved" && !relink) return INVALID_STATE;
      if (l.state === "approved" && l.approvalExpiresAt && Date.parse(l.approvalExpiresAt) <= now().getTime()) { // R-5 lazy expiry; the scheduler does the same
        const gone = await store.transition(p.tenantId, l._id, { from: ["approved"], to: "unlinked", set: { unlinkedAt: iso(), unlinkedBy: "system:expiry", unlinkedReason: "connect_timeout" } });
        if (gone) await emit(null, p.tenantId, { eventType: "link.unlinked", linkId: l._id, data: { fromState: "approved", toState: "unlinked", reason: "connect_timeout" } });
        return fail(409, "approval_expired", "the approval expired; request a new link");
      }
      if (!archiver) return ARCHIVER_DOWN;
      const wait = qrHit(`${p.tenantId}\u0000${l._id}`); if (wait) return limited(wait);
      try {
        const ownerId = l.archiverOwnerId ?? await provision(p, l._id);
        const sess = await archiver.getSession(ownerId);
        let status: string = sess.status, qr: string | null = null, expiresAt: string | null = null;
        if (OPEN_STATES.includes(status)) status = (await archiver.startSession(ownerId, { idempotencyKey: `start-${l._id}-${Math.floor(now().getTime() / 60_000)}` })).status;
        if (status === "awaiting_qr") { const q = await archiver.getQr(ownerId); status = q.status; qr = q.qr; expiresAt = q.expiresAt; } // never retried, cached or stored
        let linkState = l.state;
        if (status === "connected") {
          const at = iso(), health = { ...(l.health ?? {}), lastStatus: "connected", lastStatusAt: at, flags: (l.health?.flags ?? []).filter(f => f !== "needs-relink") };
          const next = await store.transition(p.tenantId, l._id, relink ? { from: ["active"], to: "active", set: { health }, require: ["needs_relink"] } : { from: ["approved"], to: "active", set: { activatedAt: at, health }, require: ["owner_id"] });
          if (next) await emit(p, p.tenantId, { eventType: "link.connected", linkId: l._id, data: { fromState: l.state, toState: "active", ...(relink ? { reason: "relinked" } : {}) } }); // exactly once: only the CAS winner emits
          linkState = ((next ?? await store.get(p.tenantId, l._id))?.state ?? l.state);
        }
        return { ok: true, value: { state: status, linkState, qr, expiresAt, accountHint: status === "connected" && sess.status === "connected" ? sess.accountHint : null } };
      } catch (e) { return archiverFail(e); }
    },
  };
}
export type LinksService = ReturnType<typeof createLinksService>;

const isDupKey = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 11000;
const GUARDS: Record<Guard, Record<string, unknown>> = { owner_id: { archiverOwnerId: { $type: "string" } }, activated: { activatedAt: { $type: "string" } }, needs_relink: { "health.flags": "needs-relink" }, legacy: { userId: null } };

/** Mongo LinksStore over the W1 accessors (every query is tenant-scoped by scopedCollection). The unique partial indexes are the R-2 authority. */
export function createMongoLinksStore(db: Pick<Db, "collection">): LinksStore {
  const s = whatsAppLinkStores(db);
  const get = async (t: string, id: string): Promise<LinkRow | null> => (await s.getLink(t, id)) as unknown as LinkRow | null;
  const rows = async (c: ReturnType<ReturnType<typeof s.links>["find"]>): Promise<LinkRow[]> => (await c.toArray()) as unknown as LinkRow[];
  return {
    get,
    async insert(t, row) {
      const { _id, live: _l, studentData: _s, ...rest } = row as LinkRow;
      try { return (await s.insertLink(t, { ...rest, ...(_id ? { _id } : {}) } as never)) as unknown as LinkRow; }
      catch (e) { throw isDupKey(e) ? new LiveLinkExistsError() : e; }
    },
    listForUser: (t, userId) => rows(s.links(t).find({ userId } as never).sort({ createdAt: -1, _id: -1 }).limit(50)),
    listAll: (t, limit) => rows(s.links(t).find({}).sort({ createdAt: -1, _id: -1 }).limit(limit)),
    hasBlockingLink: async (t, userId) => (await s.links(t).findOne({ userId, state: "revoked", blocksNewRequests: true } as never)) !== null,
    async transition(t, id, tr) {
      const filter: Record<string, unknown> = { _id: id, state: { $in: [...tr.from] }, ...Object.assign({}, ...(tr.require ?? []).map(g => GUARDS[g])) };
      const update: Record<string, unknown> = { $set: { ...tr.set, state: tr.to, live: isLiveLinkState(tr.to), updatedAt: new Date().toISOString() } };
      if (tr.unset?.length) update.$unset = Object.fromEntries(tr.unset.map(k => [k, ""]));
      try { if ((await s.links(t).updateOne(filter as never, update as never)).matchedCount !== 1) return null; }
      catch (e) { throw isDupKey(e) ? new LiveLinkExistsError() : e; }
      return get(t, id);
    },
    async setOwnerId(t, id, ownerId) {
      try {
        const r = await s.links(t).updateOne({ _id: id, state: { $in: ["approved", "active", "suspended"] }, archiverOwnerId: { $exists: false } } as never, { $set: { archiverOwnerId: ownerId, updatedAt: new Date().toISOString() } } as never);
        if (r.matchedCount === 1) return "set";
      } catch (e) { if (isDupKey(e)) return "conflict"; throw e; }
      const cur = await get(t, id);
      return !cur || !cur.archiverOwnerId ? "gone" : cur.archiverOwnerId === ownerId ? "same" : "conflict";
    },
    async appendEvent(t, e) { await s.events(t).insert(e as never); },
  };
}
