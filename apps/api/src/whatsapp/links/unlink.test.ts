/** W8 (R-7, R-8, R-10; ISS-WALINKS-001/-006/-008, ISS-WASYNC-001): unlink / revoke follow-through, authorisation, idempotency, races and account coupling. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLinksService, type ArchiverPort, type LinkRow, type LinksServiceDeps, type Principal } from "./service.js";
import { ArchiverError } from "../archiver/errors.js";
import { memoryLinkData, memoryLinksStore, seed, NOTICE, T1, T2 } from "./links.testsupport.js";

const OWNER = "b".repeat(24), OTHER_OWNER = "c".repeat(24);
const member = (userId = "u-member", tenantId = T1): Principal => ({ tenantId, kind: "session", userId, actor: `user:${userId}`, link: true, admin: false });
const admin = (userId = "u-admin", tenantId = T1): Principal => ({ tenantId, kind: "session", userId, actor: `user:${userId}`, link: true, admin: true });
const key = (scopes: { link?: boolean; admin?: boolean }, actor: string | null = "key-1", tenantId = T1): Principal => ({ tenantId, kind: "key", userId: null, actor, link: !!scopes.link, admin: !!scopes.admin });

/** Archiver double with hooks: `onEnsure` / `onSession` run mid-call so a test can race a revoke into the middle of a connect. */
function archiver() {
  const c = { ensureOwner: 0, getSession: 0, getQr: 0, unlink: [] as string[], unlinkKeys: [] as string[] };
  const st = { unlinkFails: 0, unlinkError: null as ArchiverError | null, onEnsure: async () => {}, onSession: async () => {}, status: "awaiting_qr" };
  const port: ArchiverPort = {
    async ensureOwner() { c.ensureOwner++; await st.onEnsure(); return { ownerId: OWNER, ownerRef: "x", created: true, state: "active" } as never; },
    async startSession() { return { status: "awaiting_qr", updatedAt: "2026-11-01T00:00:00.000Z" } as never; },
    async getSession() { c.getSession++; await st.onSession(); return { status: st.status, detail: null, updatedAt: "2026-11-01T00:00:00.000Z", accountHint: null } as never; },
    async getQr() { c.getQr++; return { status: "awaiting_qr", qr: "CANARY-QR", expiresAt: "2026-11-01T00:01:00.000Z" } as never; },
    async unlinkSession(ownerId: string, o?: { idempotencyKey?: string }) {
      c.unlink.push(ownerId); c.unlinkKeys.push(o?.idempotencyKey ?? "");
      if (st.unlinkError) throw st.unlinkError;
      if (st.unlinkFails-- > 0) throw new ArchiverError("archiver_api_unavailable", { reason: "network" });
      return { ownerId, state: "unlinked", status: "closed", captureDisabled: true, unlinkedAt: "2026-11-01T00:00:00.000Z" } as never;
    },
  };
  return { port, c, st };
}
function rig(over: Partial<LinksServiceDeps> = {}, users: Record<string, { status: string; role?: string } | null> = {}) {
  const store = memoryLinksStore(), data = memoryLinkData(), a = archiver(), logs: string[] = [];
  const log = { warn: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); }, error: (m: string, f?: unknown) => { logs.push(m + JSON.stringify(f ?? {})); } };
  const svc = createLinksService({ store, archiver: a.port, data, notice: () => NOTICE, countActiveAdmins: async () => 1, log,
    userStatus: async (_t, id) => (id in users ? users[id]! : { status: "active", role: "member" }), ...over });
  return { svc, store, data, a, logs };
}
type R = ReturnType<typeof rig>;
const ok = (r: { ok: boolean }): Record<string, any> => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as unknown as { value: Record<string, any> }).value; };
const code = (r: unknown): [number, string] => [(r as any).status, (r as any).error];
const status = (r: unknown): number => (r as any).status;
const live = (r: R, over: Partial<LinkRow> = {}): LinkRow => seed(r.store, { tenantId: T1, state: "active", userId: "u-member", archiverOwnerId: OWNER, activatedAt: "2026-10-01T00:00:00.000Z", ...over });

test("R-7 unlink order: the KB state moves FIRST, then pending candidates, then consent per source, then the archiver; the owner's own unlink", async () => {
  const r = rig(); const l = live(r);
  const order: string[] = [];
  const state = () => r.store.rows.get(l._id)!.state;
  const data = r.data, q = data.quarantineCandidates, w = data.withdrawSources;
  data.quarantineCandidates = async (...a) => { order.push(`quarantine@${state()}`); return q(...a); };
  data.withdrawSources = async (...a) => { order.push(`withdraw@${state()}`); return w(...a); };
  const up = r.a.port.unlinkSession; r.a.port.unlinkSession = async (...a) => { order.push(`archiver@${state()}`); return up(...a); };
  const v = ok(await r.svc.unlink(member(), l._id, { reason: "ignored_for_owner" }));
  assert.deepEqual(order, ["quarantine@unlinked", "withdraw@unlinked", "archiver@unlinked"], "eligibility is authoritative before any side effect");
  assert.deepEqual([v["changed"], v["followThrough"], v["link"].state, v["link"].unlinkedReason], [true, { candidates: "done", consent: "done", archiver: "done" }, "unlinked", "owner_request"]);
  const row = r.store.rows.get(l._id)!;
  assert.deepEqual([row.live, row.unlinkedBy, "archiverUnlinkPending" in row], [false, "u-member", false], "owed flag cleared once the archiver confirmed");
  assert.deepEqual(r.data.calls.map(c => [c.op, c.tenantId, c.linkId, c.ownerId]), [["quarantine", T1, l._id, OWNER], ["withdraw", T1, l._id, OWNER]]);
  assert.equal(r.data.calls[1]!.recordedBy, "u-member");
  assert.deepEqual([r.a.c.unlink, r.a.c.unlinkKeys], [[OWNER], [`unlink-${l._id}`]]);
  assert.deepEqual(r.store.events.map(e => [e.eventType, e.data]), [["link.unlinked", { fromState: "active", toState: "unlinked", reason: "owner_request" }]], "one event; codes and ids only");
});

test("R-7 authorisation: owner or an admin with an actor id; a stranger, another tenant, a keyless admin and a scope-less key never reach the data steps", async () => {
  const r = rig(); const l = live(r);
  assert.deepEqual(code(await r.svc.unlink(member("u-other"), l._id, {})), [404, "not_found"], "another member's id looks absent");
  assert.deepEqual(code(await r.svc.unlink(admin("u-admin", T2), l._id, {})), [404, "not_found"], "another tenant's admin sees nothing");
  assert.deepEqual(code(await r.svc.unlink(admin(), "z".repeat(24), {})), [404, "not_found"]);
  assert.equal(status(await r.svc.unlink({ ...member(), link: false }, l._id, {})), 403, "no link scope");
  assert.equal(status(await r.svc.unlink(key({}), l._id, {})), 403, "a key with no scope");
  assert.equal(status(await r.svc.unlink(key({ link: true }), l._id, {})), 403, "a link-scope key is not an owner session and not an admin");
  assert.equal(status(await r.svc.unlink({ ...admin(), actor: null }, l._id, {})), 403, "ISS-WALINKS-008: no actor id, no unlink (the audit trail needs one)");
  assert.equal(status(await r.svc.unlink(key({ admin: true }, null), l._id, {})), 403, "ISS-WALINKS-008: an admin key without a key id");
  assert.deepEqual([r.store.rows.get(l._id)!.state, r.data.calls.length, r.a.c.unlink.length, r.store.events.length], ["active", 0, 0, 0], "every refusal is side-effect free");
  const v = ok(await r.svc.unlink(key({ admin: true }), l._id, { reason: "left_company" }));
  assert.deepEqual([v["link"].unlinkedReason, r.store.rows.get(l._id)!.unlinkedBy], ["left_company", "key:key-1"], "an admin key unlinks with its key id");
});

test("R-7 idempotent: repeating returns 200 changed:false, no second event, no second archiver call once everything is done", async () => {
  const r = rig(); const l = live(r);
  ok(await r.svc.unlink(member(), l._id, {}));
  const again = ok(await r.svc.unlink(member(), l._id, {}));
  assert.deepEqual([again["changed"], again["followThrough"].archiver, r.a.c.unlink.length, r.store.events.length], [false, "none", 1, 1]);
  assert.equal(ok(await r.svc.unlink(admin(), l._id, {}))["changed"], false);
  assert.deepEqual(code(await r.svc.revoke(admin(), l._id, {})), [409, "invalid_state"], "an unlinked link is not revoked afterwards");
  for (const s of ["rejected", "revoked"] as const) {
    const t = seed(r.store, { tenantId: T1, state: s, userId: `u-${s}` });
    if (s === "rejected") assert.deepEqual(code(await r.svc.unlink(admin(), t._id, {})), [409, "invalid_state"], `${s} is terminal`);
  }
});

test("R-7 archiver down: the KB state is already unlinked, the unlink stays owed (flag set), and a repeat or the W9 retry completes it", async () => {
  const r = rig(); const l = live(r); r.a.st.unlinkFails = 1;
  const v = ok(await r.svc.unlink(member(), l._id, {}));
  assert.deepEqual([v["link"].state, v["followThrough"].archiver, r.store.rows.get(l._id)!.archiverUnlinkPending], ["unlinked", "pending", true]);
  assert.match(r.logs.join("\n"), /archiver_unlink_failed/);
  assert.doesNotMatch(r.logs.join("\n"), new RegExp(OWNER), "no owner id in logs");
  const retry = ok(await r.svc.unlink(member(), l._id, {}));
  assert.deepEqual([retry["changed"], retry["followThrough"].archiver, "archiverUnlinkPending" in r.store.rows.get(l._id)!, r.a.c.unlink.length], [false, "done", false, 2]);
  assert.equal(ok(await r.svc.unlink(member(), l._id, {}))["followThrough"].archiver, "none", "nothing owed any more");
  assert.equal(r.a.c.unlink.length, 2);
});

test("R-7 archiver says the owner is already gone: counts as done; no archiver configured: stays owed", async () => {
  const r = rig(); const l = live(r); r.a.st.unlinkError = new ArchiverError("owner_unlinked", {});
  assert.equal(ok(await r.svc.unlink(member(), l._id, {}))["followThrough"].archiver, "done");
  const none = rig({ archiver: null }); const n = live(none);
  const v = ok(await none.svc.unlink(member(), n._id, {}));
  assert.deepEqual([v["link"].state, v["followThrough"].archiver, none.store.rows.get(n._id)!.archiverUnlinkPending], ["unlinked", "pending", true]);
});

test("R-7 a link that never got an archiver owner owes nothing to the archiver", async () => {
  const r = rig(); const l = seed(r.store, { tenantId: T1, state: "approved", userId: "u-member" });
  const v = ok(await r.svc.unlink(member(), l._id, {}));
  assert.deepEqual([v["followThrough"], r.a.c.unlink.length, "archiverUnlinkPending" in r.store.rows.get(l._id)!], [{ candidates: "done", consent: "done", archiver: "none" }, 0, false]);
});

test("R-7 data steps fail independently: a failing quarantine never skips consent withdrawal; both are retried by a repeat", async () => {
  const r = rig(); const l = live(r); r.data.fail.quarantine = true;
  const v = ok(await r.svc.unlink(member(), l._id, {}));
  assert.deepEqual(v["followThrough"], { candidates: "failed", consent: "done", archiver: "done" });
  assert.deepEqual(r.data.calls.map(c => c.op), ["quarantine", "withdraw"], "consent was still withdrawn");
  r.data.fail.quarantine = false; r.data.fail.withdraw = true;
  assert.deepEqual(ok(await r.svc.unlink(member(), l._id, {}))["followThrough"], { candidates: "done", consent: "failed", archiver: "none" });
  r.data.fail.withdraw = false;
  assert.deepEqual(ok(await r.svc.unlink(member(), l._id, {}))["followThrough"], { candidates: "done", consent: "done", archiver: "none" });
  assert.equal(r.store.rows.get(l._id)!.state, "unlinked", "a data-step failure never reverts eligibility");
  assert.match(r.logs.join("\n"), /quarantine_failed/);
});

test("ISS-WASYNC-001: an archiver owner another link carries is never owed an unlink (its session belongs to the newer link)", async () => {
  const r = rig(); const old = live(r); const newer = live(r, { userId: "u-new" });
  const v = ok(await r.svc.unlink(member(), old._id, {}));
  assert.deepEqual([v["followThrough"].archiver, r.a.c.unlink.length, "archiverUnlinkPending" in r.store.rows.get(old._id)!], ["none", 0, false]);
  assert.equal(r.store.rows.get(newer._id)!.state, "active", "the newer link is untouched");
  const solo = rig(); const s = live(solo, { archiverOwnerId: OTHER_OWNER });
  assert.equal(ok(await solo.svc.unlink(member(), s._id, {}))["followThrough"].archiver, "done", "control: an unshared owner IS closed");
});

test("R-8 revoke: admin only; unlink semantics plus revokedReason and the block on new requests; the owner cannot revoke", async () => {
  const r = rig(); const l = live(r);
  assert.equal(status(await r.svc.revoke(member(), l._id, {})), 403, "the owner may unlink, never revoke");
  assert.equal(status(await r.svc.revoke(key({ link: true }), l._id, {})), 403);
  assert.equal(status(await r.svc.revoke({ ...admin(), actor: null }, l._id, {})), 403);
  assert.deepEqual(code(await r.svc.revoke(admin("u-admin", T2), l._id, {})), [404, "not_found"]);
  const v = ok(await r.svc.revoke(admin(), l._id, { reason: "policy_breach" }));
  const row = r.store.rows.get(l._id)!;
  assert.deepEqual([v["link"].state, row.revokedReason, row.revokedBy, row.blocksNewRequests, row.live], ["revoked", "policy_breach", "u-admin", true, false]);
  assert.deepEqual([v["followThrough"], r.data.calls.map(c => c.op), r.a.c.unlink], [{ candidates: "done", consent: "done", archiver: "done" }, ["quarantine", "withdraw"], [OWNER]]);
  assert.deepEqual(r.store.events.map(e => [e.eventType, e.data]), [["link.revoked", { fromState: "active", toState: "revoked", reason: "policy_breach" }]]);
  assert.equal(code(await r.svc.request(member(), { label: "again", noticeVersion: NOTICE.version }))[1], "link_blocked", "the block holds until an admin clears it");
  assert.equal(ok(await r.svc.revoke(admin(), l._id, {}))["changed"], false, "repeat is idempotent");
});

test("a terminated link can never be resumed, suspended or connected again", async () => {
  const r = rig(); const l = live(r); ok(await r.svc.revoke(admin(), l._id, {}));
  assert.deepEqual(code(await r.svc.resume(admin(), l._id)), [409, "invalid_state"]);
  assert.deepEqual(code(await r.svc.suspend(admin(), l._id, {})), [409, "invalid_state"]);
  assert.deepEqual(code(await r.svc.connect(member(), l._id)), [409, "invalid_state"]);
  assert.equal(r.store.rows.get(l._id)!.state, "revoked");
  assert.equal(r.a.c.getQr, 0);
});

test("ISS-WALINKS-001: a revoke that lands while ensureOwner runs gets no owner stored and the new archiver owner is closed", async () => {
  const r = rig(); const l = seed(r.store, { tenantId: T1, state: "approved", userId: "u-member" });
  r.a.st.onEnsure = async () => { ok(await r.svc.revoke(admin(), l._id, {})); };
  assert.deepEqual(code(await r.svc.connect(member(), l._id)), [409, "invalid_state"]);
  const row = r.store.rows.get(l._id)!;
  assert.deepEqual([row.state, row.archiverOwnerId, r.a.c.getQr, r.a.c.unlink, r.a.c.unlinkKeys], ["revoked", undefined, 0, [OWNER], [`orphan-${l._id}`]], "orphan closed under a recoverable key; no QR");
});

test("ISS-WALINKS-001: a revoke that lands after the owner exists but before the QR is fetched never receives a QR", async () => {
  const r = rig(); const l = live(r, { state: "approved" });
  r.a.st.onSession = async () => { ok(await r.svc.revoke(admin(), l._id, {})); };
  assert.deepEqual(code(await r.svc.connect(member(), l._id)), [409, "invalid_state"]);
  assert.deepEqual([r.a.c.getQr, r.store.rows.get(l._id)!.state, r.a.c.unlink], [0, "revoked", [OWNER]]);
  const calm = rig(); const c = live(calm, { state: "approved" });
  assert.equal(ok(await calm.svc.connect(member(), c._id))["qr"], "CANARY-QR", "control: without the race the QR is handed out");
});

test("ISS-WALINKS-001: an unlink that lands while ensureOwner runs leaves the owner id unset; the post-CAS reconcile owes a mid-flight owner", async () => {
  const r = rig(); const l = seed(r.store, { tenantId: T1, state: "approved", userId: "u-member" });
  r.a.st.onEnsure = async () => { ok(await r.svc.unlink(member(), l._id, {})); };
  assert.deepEqual(code(await r.svc.connect(member(), l._id)), [409, "invalid_state"]);
  assert.deepEqual([r.store.rows.get(l._id)!.state, r.store.rows.get(l._id)!.archiverOwnerId, r.a.c.unlink], ["unlinked", undefined, [OWNER]]);
  // reconcile: the owner id lands between the terminate read and its CAS (the row the CAS returns already carries it)
  const q = rig(); const m = seed(q.store, { tenantId: T1, state: "active", userId: "u-member" });
  const tr = q.store.transition; q.store.transition = async (t, id, x) => { if (x.to === "unlinked" && !x.set?.["archiverUnlinkPending"]) q.store.rows.get(id)!.archiverOwnerId = OWNER; return tr(t, id, x); };
  const v = ok(await q.svc.unlink(member(), m._id, {}));
  assert.deepEqual([v["followThrough"].archiver, q.a.c.unlink], ["done", [OWNER]], "an owner stored mid-flight is still closed");
});

test("ISS-WALINKS-006: resume checks the owner's account is active (a missing, disabled, pending or viewer owner is refused); a legacy link resumes", async () => {
  for (const [who, u] of [["u-gone", null], ["u-off", { status: "disabled", role: "member" }], ["u-pend", { status: "pending" }], ["u-view", { status: "active", role: "viewer" }]] as const) {
    const r = rig({}, { [who]: u }); const l = live(r, { state: "suspended", userId: who });
    assert.deepEqual(code(await r.svc.resume(admin(), l._id)), [409, "account_inactive"], who);
    assert.equal(r.store.rows.get(l._id)!.state, "suspended");
  }
  const okRig = rig(); const good = live(okRig, { state: "suspended" });
  assert.equal(ok(await okRig.svc.resume(admin(), good._id))["link"].state, "active");
  const legacy = live(okRig, { state: "suspended", userId: null });
  assert.equal(ok(await okRig.svc.resume(admin(), legacy._id))["link"].state, "active", "a legacy link has no account to check");
});

test("R-10 account coupling: disable / reject / demote-to-viewer suspends the ACTIVE links with account_inactive; re-enabling never resumes", async () => {
  const r = rig(); const a1 = live(r), a2 = live(r, { userId: "u-x" }), other = live(r, { userId: "u-other" });
  assert.equal(await r.svc.accountChanged(T1, "u-member", { status: "disabled", role: "member" }), 1);
  assert.equal(await r.svc.accountChanged(T1, "u-x", { status: "active", role: "viewer" }), 1, "demotion to viewer");
  assert.equal(await r.svc.accountChanged(T1, "u-member", { status: "rejected" }), 0, "already suspended: nothing left to do");
  assert.deepEqual([a1, a2, other].map(l => r.store.rows.get(l._id)!.state), ["suspended", "suspended", "active"], "only the affected person's links");
  assert.deepEqual(r.store.events.map(e => [e.eventType, e.actorKind, (e.data as any).reason]), [["link.suspended", "system", "account_inactive"], ["link.suspended", "system", "account_inactive"]]);
  assert.equal(await r.svc.accountChanged(T1, "u-member", { status: "active", role: "member" }), 0, "re-enable is an input that does nothing");
  assert.equal(await r.svc.accountChanged(T1, "u-other", { status: "active", role: "member" }), 0, "a healthy account event never suspends an ACTIVE link");
  assert.equal(r.store.rows.get(other._id)!.state, "active");
  assert.equal(await r.svc.accountChanged(T1, "u-member", { status: "active", role: "admin" }), 0);
  assert.equal(r.store.rows.get(a1._id)!.state, "suspended", "re-enabling never resumes (an admin must)");
  assert.equal(await r.svc.accountChanged(T2, "u-other", { status: "disabled" }), 0, "tenant-scoped");
  assert.equal(r.store.rows.get(other._id)!.state, "active");
  assert.equal(ok(await r.svc.resume(admin(), a1._id))["link"].state, "active", "the explicit resume path works");
});

test("R-10 logout and session expiry have no input into the links service: the only account entry point is accountChanged", async () => {
  const r = rig(); const l = live(r);
  assert.deepEqual(Object.keys(r.svc).filter(k => /logout|session|expire/i.test(k)), [], "no logout or session-expiry entry point exists");
  assert.equal(r.store.rows.get(l._id)!.state, "active");
  assert.deepEqual([r.a.c.unlink.length, r.data.calls.length, r.store.events.length], [0, 0, 0]);
});
