import { test, after } from "node:test";
import assert from "node:assert/strict";
import { user } from "../../user-accounts/sessions.testsupport.js";
import { createWhatsAppSelectionRouter } from "../selection/router.js";
import { linksRig, startFakeArchiver, NOTICE } from "./links.rig.testsupport.js";

const U = [
  user({ _id: "u-admin", tenantId: "tenant-1", role: "admin" }), user({ _id: "u-admin2", tenantId: "tenant-1", role: "admin" }),
  user({ _id: "u-member", tenantId: "tenant-1" }), user({ _id: "u-member2", tenantId: "tenant-1" }),
  user({ _id: "u-viewer", tenantId: "tenant-1", role: "viewer" }), user({ _id: "u-pending", tenantId: "tenant-1", status: "pending" }),
  user({ _id: "t2-admin", tenantId: "tenant-2", role: "admin" }), user({ _id: "t2-member", tenantId: "tenant-2" }),
];
const KEYS = {
  "k-link": { tenantId: "tenant-1", scopes: ["whatsapp-link"] }, "k-all": { tenantId: "tenant-1", scopes: ["whatsapp-link", "whatsapp-admin"] }, "k-other": { tenantId: "tenant-1", scopes: ["sessions"] }, "k-t2-admin": { tenantId: "tenant-2", keyId: "key-t2", scopes: ["whatsapp-link", "whatsapp-admin"] },
};
const fake = await startFakeArchiver();
after(async () => { await fake.stop(); });
async function setup(o: Parameters<typeof linksRig>[0] extends infer P ? Partial<P> : never = {}) {
  const rig = await linksRig({ users: U, keys: KEYS, fake, ...o });
  for (const u of U) await rig.login(u._id, u.tenantId);
  return rig;
}
const as = (user: string) => ({ user });
const create = (rig: Awaited<ReturnType<typeof setup>>, who = "u-member", body: unknown = { label: "My phone", noticeVersion: NOTICE.version }) => rig.call(as(who), "POST", "/whatsapp/links", body);

test("auth perimeter: no credential is 401; a key without the scope is 403; a viewer and a pending user are refused", async () => {
  const rig = await setup(); try {
    assert.equal((await rig.call(null, "GET", "/whatsapp/links")).status, 401);
    assert.equal((await rig.call({ key: "k-other" }, "GET", "/whatsapp/links")).status, 403);
    assert.equal((await rig.call({ key: "k-other" }, "POST", "/whatsapp/links", { label: "x", noticeVersion: NOTICE.version })).status, 403);
    assert.equal((await rig.call(as("u-viewer"), "GET", "/whatsapp/links/notice")).status, 403, "a viewer holds no whatsapp-link");
    assert.equal((await create(rig, "u-viewer")).status, 403);
    assert.equal((await create(rig, "u-pending")).status, 403);
    assert.equal(rig.store.rows.size, 0);
  } finally { await rig.close(); }
});

test("A1 create: 201 for a member with strict body; unknown fields, bad label and a stale notice are refused; responses are no-store", async () => {
  const rig = await setup(); try {
    const n = await rig.call(as("u-member"), "GET", "/whatsapp/links/notice");
    assert.deepEqual([n.status, n.json!.version, n.headers.get("cache-control")], [200, NOTICE.version, "no-store"]);
    for (const extra of [{ tenantId: "tenant-2" }, { userId: "u-admin" }, { state: "active" }, { archiverOwnerId: "c".repeat(24) }, { studentData: "yes" }, { "$set": { x: 1 } }])
      assert.equal((await create(rig, "u-member", { label: "x", noticeVersion: NOTICE.version, ...extra })).status, 400, JSON.stringify(extra));
    for (const body of [{ noticeVersion: NOTICE.version }, { label: "", noticeVersion: NOTICE.version }, { label: "x".repeat(121), noticeVersion: NOTICE.version }, { label: "a\nb", noticeVersion: NOTICE.version }, { label: "a b", noticeVersion: NOTICE.version }, { label: 5, noticeVersion: NOTICE.version }, { label: "x" }, { label: "x", noticeVersion: "nope" }, [], "str"])
      assert.equal((await create(rig, "u-member", body)).status, 400, JSON.stringify(body));
    assert.equal(rig.store.rows.size, 0, "nothing was written by a refused request");
    assert.equal((await create(rig, "u-member", { label: "x", noticeVersion: "0".repeat(64) })).json!.error, "notice_changed");
    const ok = await create(rig);
    assert.deepEqual([ok.status, ok.headers.get("cache-control"), ok.json!.link.state, ok.json!.link.userId], [201, "no-store", "requested", "u-member"]);
    assert.equal((await create(rig)).status, 409);
    assert.equal((await rig.call({ key: "k-link" }, "POST", "/whatsapp/links", { label: "x", noticeVersion: NOTICE.version })).status, 403, "a key may not request");
  } finally { await rig.close(); }
});

test("CSRF: every unsafe method on every mutating route refuses a cookie without the token or with a foreign origin", async () => {
  const rig = await setup(); try {
    const id = (await create(rig)).json!.link.id as string;
    const routes: Array<[string, string, string, unknown?]> = [
      ["u-member", "POST", "/whatsapp/links", { label: "y", noticeVersion: NOTICE.version }], ["u-admin", "POST", `/whatsapp/links/${id}/approve`, {}],
      ["u-admin", "POST", `/whatsapp/links/${id}/reject`, {}], ["u-admin", "POST", `/whatsapp/links/${id}/suspend`, {}], ["u-admin", "POST", `/whatsapp/links/${id}/resume`, {}],
      ["u-admin", "POST", `/whatsapp/links/${id}/revoke`, {}], ["u-admin", "POST", `/whatsapp/links/${id}/bind`, { userId: "u-member2" }], ["u-member", "POST", `/whatsapp/links/${id}/unlink`, {}],
    ];
    for (const [who, method, path, body] of routes) {
      for (const bad of [{ user: who, csrf: null }, { user: who, csrf: "forged" }, { user: who, origin: "https://evil.example" }, { user: who, origin: null }] as const) {
        const r = await rig.call(bad, method, path, body);
        assert.equal(r.status, 403, `${path} ${JSON.stringify(bad)} -> ${r.status}`);
      }
    }
    assert.deepEqual([...rig.store.rows.values()].map(r => r.state), ["requested"], "no refused request changed anything");
    assert.equal(rig.store.events.length, 1);
    assert.equal((await rig.call({ user: "u-member", csrf: null, origin: null }, "GET", "/whatsapp/links")).status, 200, "a safe method needs no token");
  } finally { await rig.close(); }
});

test("A2/A3/A4 over HTTP: approve is admin-only and tenant-scoped; ids are opaque; the owner sees no admin fields; unlink works and repeats", async () => {
  const rig = await setup(); try {
    const id = (await create(rig)).json!.link.id as string;
    assert.equal((await rig.call(as("u-member"), "POST", `/whatsapp/links/${id}/approve`, {})).status, 403);
    assert.equal((await rig.call({ key: "k-link" }, "POST", `/whatsapp/links/${id}/approve`, {})).status, 403);
    assert.equal((await rig.call(as("t2-admin"), "POST", `/whatsapp/links/${id}/approve`, {})).status, 404, "cross-tenant admin");
    assert.equal((await rig.call(as("u-admin"), "POST", `/whatsapp/links/${"f".repeat(24)}/approve`, {})).status, 404);
    assert.equal((await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, { studentData: "maybe" })).status, 400);
    assert.equal((await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, { approvedBy: "u-member" })).status, 400, "no mass assignment");
    const ap = await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, { studentData: "no" });
    assert.deepEqual([ap.status, ap.json!.link.state, ap.json!.link.approvedBy, ap.json!.selfApproved], [200, "approved", "u-admin", false]);
    assert.equal((await rig.call(as("u-member2"), "GET", `/whatsapp/links/${id}`)).status, 404, "another member");
    assert.equal((await rig.call(as("t2-member"), "GET", `/whatsapp/links/${id}`)).status, 404, "another tenant");
    const mine = (await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}`)).json!.link;
    assert.deepEqual(["approvedBy", "archiverOwnerId", "studentData"].filter(k => k in mine), []);
    assert.equal((await rig.call(as("u-member2"), "GET", "/whatsapp/links")).json!.links.length, 0);
    assert.equal((await rig.call(as("u-admin"), "GET", "/whatsapp/links")).json!.links.length, 1);
    assert.equal((await rig.call(as("u-member2"), "POST", `/whatsapp/links/${id}/unlink`, {})).status, 404);
    const un = await rig.call(as("u-member"), "POST", `/whatsapp/links/${id}/unlink`, {});
    assert.deepEqual([un.status, un.json!.link.state, un.json!.changed], [200, "unlinked", true]);
    assert.equal((await rig.call(as("u-member"), "POST", `/whatsapp/links/${id}/unlink`, {})).json!.changed, false);
  } finally { await rig.close(); }
});

test("H-4 over HTTP: a sole admin may approve their own request (flagged); with a second admin it is refused", async () => {
  const solo = [U[0]!, U[2]!], rig = await linksRig({ users: solo, keys: KEYS, fake }); await rig.login("u-admin", "tenant-1");
  try {
    const id = (await rig.call(as("u-admin"), "POST", "/whatsapp/links", { label: "Mine", noticeVersion: NOTICE.version })).json!.link.id as string;
    const ap = await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, {});
    assert.deepEqual([ap.status, ap.json!.selfApproved], [200, true]);
  } finally { await rig.close(); }
  const two = await setup(); try {
    const id = (await two.call(as("u-admin"), "POST", "/whatsapp/links", { label: "Mine", noticeVersion: NOTICE.version })).json!.link.id as string;
    const ap = await two.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, {});
    assert.deepEqual([ap.status, ap.json!.error], [403, "self_approval_forbidden"]);
  } finally { await two.close(); }
});

test("A5 connect through the REAL fake archiver: owner-only, QR no-store and never logged or stored, then activation emits one event", async () => {
  const rig = await setup(); try {
    const id = (await create(rig)).json!.link.id as string;
    await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, {});
    assert.equal((await rig.call({ key: "k-all" }, "GET", `/whatsapp/links/${id}/connect`)).status, 403, "an all-scopes key is not the owner");
    assert.equal((await rig.call(as("u-admin"), "GET", `/whatsapp/links/${id}/connect`)).status, 404, "an admin is not the owner");
    assert.equal((await rig.call(as("u-member2"), "GET", `/whatsapp/links/${id}/connect`)).status, 404);
    const first = await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}/connect`);
    assert.deepEqual([first.status, first.json!.state, first.json!.qr, first.headers.get("cache-control")], [200, "connecting", null, "no-store"], "the archiver has no QR yet: the client polls");
    const ownerId = rig.store.rows.get(id)!.archiverOwnerId!; assert.match(ownerId, /^[0-9a-f]{24}$/);
    const qr = "CANARY-QR-9f8e7d6c5b4a-" + "x".repeat(24); fake.control.emitQr(ownerId, qr);
    const shown = await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}/connect`);
    assert.deepEqual([shown.json!.state, shown.json!.qr, shown.headers.get("cache-control")], ["awaiting_qr", qr, "no-store"]);
    fake.control.setStatus(ownerId, "connected", { hint: "47" });
    const done = await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}/connect`);
    assert.deepEqual([done.json!.state, done.json!.linkState, done.json!.qr], ["connected", "active", null]);
    await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}/connect`);
    assert.equal(rig.store.events.filter(e => e.eventType === "link.connected").length, 1);
    assert.equal(JSON.stringify([[...rig.store.rows.values()], rig.store.events, rig.logs]).includes(qr), false, "the QR lives only in the response");
  } finally { await rig.close(); }
});

test("rate limit on creation answers 429 with Retry-After; a failing store is a generic 503 with no driver text", async () => {
  const rig = await setup({ linkDeps: { requestLimit: { max: 1, windowMs: 3600_000 } } }); try {
    await create(rig, "u-member");
    const r = await create(rig, "u-member");
    assert.deepEqual([r.status, r.json!.error, Number(r.headers.get("retry-after")) > 0], [429, "rate_limited", true]);
  } finally { await rig.close(); }
  const bad = await setup(); bad.store.insert = async () => { throw new Error("mongodb://user:pw@host/db ECONNRESET"); }; try {
    const r = await create(bad);
    assert.deepEqual([r.status, r.json!.error], [503, "links_unavailable"]);
    assert.equal(r.text.includes("mongodb"), false);
    assert.equal(bad.logs.join("").includes("mongodb"), false, "the driver message is never logged");
  } finally { await bad.close(); }
});

test("mount: without the dep the surface answers 503 (never a raw 404); the selection stub is an empty router for W6", async () => {
  const rig = await setup({ noLinks: true }); try {
    assert.equal((await create(rig)).status, 503);
    assert.equal((await rig.call(as("u-viewer"), "GET", "/whatsapp/links")).status, 403);
  } finally { await rig.close(); }
  assert.equal(createWhatsAppSelectionRouter().stack.length, 0);
});

test("adversarial (plan 6): id guessing, swapped tenant header, an all-scopes key, a tenant-B key, and mass assignment of archiverOwnerId", async () => {
  const rig = await setup(); try {
    const id = (await create(rig)).json!.link.id as string;
    await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, {});
    for (const guess of ["0".repeat(24), id.slice(0, 23) + (id.endsWith("0") ? "1" : "0"), id.toUpperCase(), `${id}/../${id}`, "%2e%2e", "x"])
      { const g = await rig.call(as("u-member2"), "GET", `/whatsapp/links/${guess}/connect`); assert.equal(g.status, 404, `${guess} -> ${g.status} ${g.text}`); }
    const swapped = await rig.call(as("t2-member"), "GET", `/whatsapp/links/${id}/connect`, undefined, { "x-tenant-id": "tenant-1", "x-lkb-tenant": "tenant-1" });
    assert.equal(swapped.status, 404, "a header cannot move a caller into another tenant " + swapped.text);
    const swappedAdmin = await rig.call(as("t2-admin"), "GET", `/whatsapp/links/${id}`, undefined, { "x-tenant-id": "tenant-1", "x-lkb-tenant": "tenant-1" });
    assert.equal(swappedAdmin.status, 404, "a tenant-2 admin with a tenant-1 header still sees only tenant 2 " + swappedAdmin.text);
    assert.equal((await rig.call({ key: "k-all" }, "GET", `/whatsapp/links/${id}/connect`)).status, 403);
    const kb = await rig.call({ key: "k-t2-admin" }, "GET", `/whatsapp/links/${id}`);
    assert.equal(kb.status, 404, "tenant-B key on a tenant-A id " + kb.text);
    const kr = await rig.call({ key: "k-t2-admin" }, "POST", `/whatsapp/links/${id}/revoke`, {});
    assert.equal(kr.status, 404, kr.text);
    assert.equal((await rig.call({ key: "k-t2-admin" }, "GET", "/whatsapp/links")).json!.links.length, 0);
    for (const body of [{ archiverOwnerId: "c".repeat(24) }, { studentData: "yes", archiverOwnerId: "c".repeat(24) }, { tenantId: "tenant-2" }])
      assert.equal((await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/approve`, body)).status, 400);
    assert.equal((await rig.call(as("u-admin"), "POST", `/whatsapp/links/${id}/bind`, { userId: "u-member2", archiverOwnerId: "c".repeat(24) })).status, 400);
    assert.equal(rig.store.rows.get(id)!.archiverOwnerId, undefined, "no body field reaches the row");
    assert.equal(rig.store.rows.get(id)!.state, "approved");
  } finally { await rig.close(); }
});
