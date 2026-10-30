import { test } from "node:test";
import assert from "node:assert/strict";
import { createLinksService, toLinkView, type ArchiverPort, type LinksServiceDeps, type Principal } from "./service.js";
import { ArchiverError } from "../archiver/errors.js";
import { memoryLinksStore, seed, NOTICE, T1, T2, type MemStore } from "./links.testsupport.js";

const CANARY_QR = "CANARY-QR-0f1e2d3c4b5a69788796";
const OWNER_ID = "b".repeat(24);
const member = (userId = "u-member", tenantId = T1): Principal => ({ tenantId, kind: "session", userId, actor: `user:${userId}`, link: true, admin: false });
const admin = (userId = "u-admin", tenantId = T1): Principal => ({ tenantId, kind: "session", userId, actor: `user:${userId}`, link: true, admin: true });
const key = (scopes: { link?: boolean; admin?: boolean }, tenantId = T1): Principal => ({ tenantId, kind: "key", userId: null, actor: "key-1", link: !!scopes.link, admin: !!scopes.admin });

function archiverStub(start = "not_started") {
  const c = { ensureOwner: 0, startSession: 0, getSession: 0, getQr: 0 }, st = { status: start, failOn: "" };
  const port: ArchiverPort = {
    async ensureOwner() { c.ensureOwner++; await new Promise(r => setImmediate(r)); if (st.failOn === "ensureOwner") throw new ArchiverError("archiver_api_unavailable", { reason: "network" }); return { ownerId: OWNER_ID, ownerRef: "x", created: true, state: "active" } as never; },
    async startSession() { c.startSession++; st.status = "awaiting_qr"; return { status: "awaiting_qr", updatedAt: "2026-11-01T00:00:00.000Z" } as never; },
    async getSession() { c.getSession++; await new Promise(r => setImmediate(r)); return { status: st.status, detail: null, updatedAt: "2026-11-01T00:00:00.000Z", accountHint: st.status === "connected" ? "47" : null } as never; },
    async getQr() { c.getQr++; return { status: "awaiting_qr", qr: CANARY_QR, expiresAt: "2026-11-01T00:01:00.000Z" } as never; },
  };
  return { port, c, st };
}
function rig(over: Partial<LinksServiceDeps> = {}, admins = 1) {
  const store = memoryLinksStore(), logs: unknown[] = [], a = archiverStub();
  const log = { warn: (m: string, f?: unknown) => { logs.push([m, f]); }, error: (m: string, f?: unknown) => { logs.push([m, f]); } };
  const svc = createLinksService({ store, archiver: a.port, notice: () => NOTICE, countActiveAdmins: async () => admins, userStatus: async (_t, id) => (id === "u-gone" ? null : { status: "active", role: "member" }), log, ...over });
  return { svc, store, a, logs };
}
const req = (svc: ReturnType<typeof rig>["svc"], p: Principal, label = "My phone") => svc.request(p, { label, noticeVersion: NOTICE.version });
const val = <T>(r: { ok: boolean }): T => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as unknown as { value: T }).value; };
const linkOf = (v: Record<string, any>): Record<string, any> => v.link;
async function approved(r: ReturnType<typeof rig>, userId = "u-member"): Promise<string> {
  const id = linkOf(val(await req(r.svc, member(userId))))["id"] as string;
  val(await r.svc.approve(admin(), id, {})); return id;
}

test("A1 request: only a member session with the link scope, with the current notice, one live link per user", async () => {
  const r = rig();
  assert.equal((await req(r.svc, key({ link: true }))).ok, false, "a key never requests (R-1)");
  assert.equal((await req(r.svc, { ...member(), link: false })).ok, false, "a viewer-like principal without the scope");
  const stale = await r.svc.request(member(), { label: "x", noticeVersion: "0".repeat(64) });
  assert.deepEqual([stale.ok, (stale as any).status, (stale as any).error], [false, 409, "notice_changed"]);
  const ok = linkOf(val(await req(r.svc, member())));
  assert.deepEqual([ok["state"], ok["userId"], ok["noticeVersion"], ok["legacy"]], ["requested", "u-member", NOTICE.version, false]);
  assert.equal(typeof ok["noticeShownAt"], "string");
  const dup = await req(r.svc, member());
  assert.deepEqual([(dup as any).status, (dup as any).error], [409, "link_exists"]);
  assert.equal(r.store.events.filter(e => e.eventType === "link.requested").length, 1);
  assert.deepEqual(r.store.events[0]!.data, { requesterId: "u-member", toState: "requested" }, "ids and codes only (R-39)");
});

test("A1 request: rate limited per user (429 + retry), a blocked user stays blocked, a notice outage fails closed", async () => {
  const r = rig({ requestLimit: { max: 2, windowMs: 3600_000 } });
  for (const u of ["a", "a", "a"]) await req(r.svc, member(u)); // 3rd hit is limited whatever it would have done
  const third = await req(r.svc, member("a"));
  assert.deepEqual([(third as any).status, (third as any).error, typeof (third as any).extra.retryAfterSec], [429, "rate_limited", "number"]);
  assert.equal((await req(r.svc, member("b"))).ok, true, "another user has their own budget");
  seed(r.store, { tenantId: T1, state: "revoked", userId: "u-blocked", blocksNewRequests: true });
  assert.equal(((await req(r.svc, member("u-blocked"))) as any).error, "link_blocked");
  const down = rig({ notice: () => null });
  assert.equal(((await req(down.svc, member())) as any).status, 503);
});

test("A2 approve: admin-only, tenant-scoped, 14-day window, event names requester and approver", async () => {
  const r = rig();
  const id = linkOf(val(await req(r.svc, member())))["id"] as string;
  assert.equal(((await r.svc.approve(member(), id, {})) as any).status, 403, "the owner cannot approve");
  assert.equal(((await r.svc.approve(key({ link: true }), id, {})) as any).status, 403, "a link-scope key cannot approve");
  assert.equal(((await r.svc.approve(admin("u-admin", T2), id, {})) as any).status, 404, "another tenant's admin sees nothing");
  assert.equal(((await r.svc.approve(admin(), "z".repeat(24), {})) as any).status, 404);
  assert.equal(((await r.svc.approve(admin(), "../etc", {})) as any).status, 404);
  const v = val<Record<string, any>>(await r.svc.approve(admin(), id, { studentData: "yes" }));
  assert.deepEqual([v.link.state, v.selfApproved, v.link.approvedBy, v.link.studentData], ["approved", false, "u-admin", "yes"]);
  assert.equal(Date.parse(v.link.approvalExpiresAt) - Date.parse(r.store.rows.get(id)!.approvedAt!), 14 * 24 * 3600_000);
  assert.equal(((await r.svc.approve(admin(), id, {})) as any).status, 409, "approving twice is invalid_state");
  const ev = r.store.events.find(e => e.eventType === "link.approved")!;
  assert.deepEqual(ev.data, { fromState: "requested", toState: "approved", requesterId: "u-member", approverId: "u-admin" });
});

test("H-4 self-approval: allowed for the sole active admin and recorded; forbidden when a second admin exists", async () => {
  const sole = rig({}, 1), many = rig({}, 2);
  for (const [r, allowed] of [[sole, true], [many, false]] as const) {
    const id = linkOf(val(await req(r.svc, admin("u-admin")))) ["id"] as string;
    const res = await r.svc.approve(admin("u-admin"), id, {});
    if (allowed) {
      const v = val<Record<string, any>>(res);
      assert.equal(v.selfApproved, true);
      const ev = r.store.events.find(e => e.eventType === "link.approved")!;
      assert.deepEqual([ev.data!["requesterId"], ev.data!["approverId"], ev.data!["reason"]], ["u-admin", "u-admin", "self_approved"]);
      assert.equal(v.link.approvedBy, "u-admin");
    } else assert.deepEqual([(res as any).status, (res as any).error], [403, "self_approval_forbidden"]);
  }
});

test("A2 reject / suspend / resume / revoke are admin-only CAS moves with one event each", async () => {
  const r = rig();
  const a = await approved(r), b = linkOf(val(await req(r.svc, member("u-two"))))["id"] as string;
  assert.equal(((await r.svc.reject(member(), b, {})) as any).status, 403);
  const rej = val<Record<string, any>>(await r.svc.reject(admin(), b, { reason: "not_staff" }));
  assert.deepEqual([rej.link.state, rej.link.rejectedReason], ["rejected", "not_staff"]);
  assert.equal(((await r.svc.reject(admin(), b, {})) as any).status, 409);
  assert.equal(((await r.svc.suspend(admin(), a, {})) as any).status, 409, "only an active link suspends");
  r.store.rows.get(a)!.state = "active"; r.store.rows.get(a)!.activatedAt = "2026-11-01T00:00:00.000Z"; r.store.rows.get(a)!.archiverOwnerId = OWNER_ID;
  assert.equal(val<Record<string, any>>(await r.svc.suspend(admin(), a, { reason: "policy" })).link.state, "suspended");
  assert.equal(val<Record<string, any>>(await r.svc.resume(admin(), a)).link.state, "active");
  assert.equal(((await r.svc.resume(admin(), a)) as any).status, 409);
  const rv = val<Record<string, any>>(await r.svc.revoke(admin(), a, {}));
  assert.deepEqual([rv.link.state, rv.link.blocksNewRequests], ["revoked", true]);
  assert.deepEqual(r.store.events.map(e => e.eventType), ["link.requested", "link.approved", "link.requested", "link.rejected", "link.suspended", "link.resumed", "link.revoked"]);
  assert.equal(r.store.rows.get(a)!.live, false);
});

test("A2 resume refuses a link that never activated (the guard, not the state, decides)", async () => {
  const r = rig();
  const s = seed(r.store, { tenantId: T1, state: "suspended", userId: "u-x" });
  assert.equal(((await r.svc.resume(admin(), s._id)) as any).status, 409);
});

test("A3 unlink: the owner or an admin; idempotent; another person's id is a 404", async () => {
  const r = rig();
  const id = await approved(r);
  assert.equal(((await r.svc.unlink(member("u-other"), id, {})) as any).status, 404);
  assert.equal(((await r.svc.unlink(key({ link: true }), id, {})) as any).status, 403, "a link-scope key owns nothing");
  const u = val<Record<string, any>>(await r.svc.unlink(member(), id, { reason: "ignored_for_owner" }));
  assert.deepEqual([u.link.state, u.changed, u.link.unlinkedReason], ["unlinked", true, "owner_request"]);
  assert.equal(val<Record<string, any>>(await r.svc.unlink(member(), id, {})).changed, false);
  assert.equal(r.store.events.filter(e => e.eventType === "link.unlinked").length, 1, "the repeat writes no second event");
  const again = await req(r.svc, member());
  assert.equal(again.ok, true, "an unlinked link frees the live-link slot");
});

test("A4 views: another person's id is 404; the owner never sees admin-only fields", async () => {
  const r = rig();
  const id = await approved(r);
  r.store.rows.get(id)!.archiverOwnerId = OWNER_ID;
  assert.equal(((await r.svc.get(member("u-other"), id)) as any).status, 404);
  assert.equal(((await r.svc.get(member("u-other", T2), id)) as any).status, 404);
  const own = linkOf(val(await r.svc.get(member(), id)));
  for (const k of ["archiverOwnerId", "approvedBy", "studentData", "tenantId", "live"]) assert.equal(k in own, false, k);
  const adm = linkOf(val(await r.svc.get(admin(), id)));
  assert.deepEqual([adm["archiverOwnerId"], adm["approvedBy"], adm["studentData"]], [OWNER_ID, "u-admin", "no"]);
  assert.equal(val<{ links: unknown[] }>(await r.svc.list(member("u-other"))).links.length, 0);
  assert.equal(val<{ links: unknown[] }>(await r.svc.list(admin("u-admin", T2))).links.length, 0, "tenant scoped list");
  assert.equal(JSON.stringify(toLinkView(r.store.rows.get(id)!, false)).includes(OWNER_ID), false);
});

test("A5 connect: only the owner's session; ensureOwner once under concurrency; QR returned but never stored, logged or evented", async () => {
  const r = rig();
  const id = await approved(r);
  assert.equal(((await r.svc.connect(admin(), id)) as any).status, 404, "an admin is not the owner");
  assert.equal(((await r.svc.connect(key({ link: true, admin: true }), id)) as any).status, 403, "an all-scopes key cannot connect");
  assert.equal(((await r.svc.connect(member("u-other"), id)) as any).status, 404);
  const out = await Promise.all(Array.from({ length: 6 }, () => r.svc.connect(member(), id)));
  for (const o of out) assert.deepEqual([val<any>(o).state, val<any>(o).qr], ["awaiting_qr", CANARY_QR]);
  assert.equal(r.a.c.ensureOwner, 1, "single flight (R-11)");
  assert.equal(r.store.rows.get(id)!.archiverOwnerId, OWNER_ID);
  const everything = JSON.stringify([[...r.store.rows.values()], r.store.events, r.logs]);
  assert.equal(everything.includes(CANARY_QR), false, "the QR is a credential: never persisted or logged");
});

test("A5 connect: activation is a CAS and emits exactly one event, a healthy link gets no QR", async () => {
  const r = rig();
  const id = await approved(r);
  r.store.rows.get(id)!.archiverOwnerId = OWNER_ID; r.a.st.status = "connected";
  const res = await Promise.all([1, 2, 3, 4].map(() => r.svc.connect(member(), id)));
  for (const o of res) assert.deepEqual([val<any>(o).linkState, val<any>(o).qr], ["active", null]);
  assert.equal(r.store.events.filter(e => e.eventType === "link.connected").length, 1);
  assert.equal(r.store.rows.get(id)!.state, "active");
  assert.equal(typeof r.store.rows.get(id)!.activatedAt, "string");
  const calls = { ...r.a.c };
  const healthy = val<any>(await r.svc.connect(member(), id));
  assert.deepEqual([healthy.state, healthy.qr], ["connected", null]);
  assert.deepEqual(r.a.c, calls, "a healthy active link makes no archiver call");
});

test("A5 connect: states that grant no connect, the expired approval, and archiver outage mapping", async () => {
  const r = rig();
  for (const state of ["requested", "rejected", "revoked", "unlinked", "suspended"] as const) {
    const l = seed(r.store, { tenantId: T1, state, userId: `u-${state}` });
    const res = await r.svc.connect(member(`u-${state}`), l._id);
    assert.deepEqual([(res as any).status, (res as any).error], [409, "invalid_state"], state);
  }
  const old = seed(r.store, { tenantId: T1, state: "approved", userId: "u-old", approvalExpiresAt: "2026-10-01T00:00:00.000Z" });
  assert.equal(((await r.svc.connect(member("u-old"), old._id)) as any).error, "approval_expired");
  assert.equal(r.store.rows.get(old._id)!.state, "unlinked");
  const id = await approved(r); r.a.st.failOn = "ensureOwner";
  const down = await r.svc.connect(member(), id);
  assert.deepEqual([(down as any).status, (down as any).error], [503, "archiver_api_unavailable"]);
  assert.equal(JSON.stringify(down).includes("network"), false, "no upstream detail is echoed");
  const none = rig({ archiver: null }); const i2 = await approved(none);
  assert.equal(((await none.svc.connect(member(), i2)) as any).status, 503);
});

test("A5 connect: 429 after the per-link QR budget, a stranger's attempts do not spend the owner's budget", async () => {
  const r = rig({ qrLimit: { max: 2, windowMs: 60_000 } });
  const id = await approved(r);
  for (let i = 0; i < 5; i++) await r.svc.connect(member("u-other"), id); // 404s
  assert.equal((await r.svc.connect(member(), id)).ok, true);
  assert.equal((await r.svc.connect(member(), id)).ok, true);
  const third = await r.svc.connect(member(), id);
  assert.deepEqual([(third as any).status, typeof (third as any).extra.retryAfterSec], [429, "number"]);
});

test("A6 bind: admin binds a LEGACY live link to an active member; refuses bound links, ended links and unknown users", async () => {
  const r = rig();
  const legacy = seed(r.store, { tenantId: T1, state: "active", userId: null, archiverOwnerId: OWNER_ID, activatedAt: "2026-10-01T00:00:00.000Z" });
  assert.equal(((await r.svc.bind(member(), legacy._id, { userId: "u-m" })) as any).status, 403);
  assert.equal(((await r.svc.bind(admin(), legacy._id, { userId: "u-gone" })) as any).status, 404);
  const ok = val<Record<string, any>>(await r.svc.bind(admin(), legacy._id, { userId: "u-m" }));
  assert.deepEqual([ok.link.userId, ok.link.legacy, ok.link.state], ["u-m", false, "active"]);
  assert.equal(((await r.svc.bind(admin(), legacy._id, { userId: "u-m2" })) as any).error, "not_legacy");
  const l2 = seed(r.store, { tenantId: T1, state: "active", userId: null });
  assert.equal(((await r.svc.bind(admin(), l2._id, { userId: "u-m" })) as any).error, "link_exists", "one live link per user (R-2)");
  const dead = seed(r.store, { tenantId: T1, state: "revoked", userId: null });
  assert.equal(((await r.svc.bind(admin(), dead._id, { userId: "u-z" })) as any).error, "not_legacy");
});

test("R-10 suspendForAccount suspends ACTIVE links only, by system actor, and never resumes", async () => {
  const r = rig();
  const act = seed(r.store, { tenantId: T1, state: "active", userId: "u-s", archiverOwnerId: OWNER_ID });
  assert.equal(await r.svc.suspendForAccount(T1, "u-s", "account_disabled"), 1);
  assert.deepEqual([r.store.rows.get(act._id)!.state, r.store.rows.get(act._id)!.suspendedBy], ["suspended", "system:account"]);
  assert.equal(await r.svc.suspendForAccount(T1, "u-s", "account_disabled"), 0);
  assert.equal(r.store.events.at(-1)!.actorKind, "system");
});

test("R-39 a failing event write does not undo the state change and is logged by code only", async () => {
  const r = rig();
  const id = linkOf(val(await req(r.svc, member())))["id"] as string;
  r.store.failEvents = true;
  assert.equal(val<Record<string, any>>(await r.svc.approve(admin(), id, {})).link.state, "approved");
  assert.deepEqual(r.logs.map(l => (l as any)[1].code), ["event_write_failed"]);
});
