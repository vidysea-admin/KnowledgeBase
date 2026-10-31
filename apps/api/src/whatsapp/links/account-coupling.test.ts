/**
 * W8 R-10, end to end in memory: the REAL admin HTTP surface (createServer -> /admin router -> admin service) with the links service injected as the
 * `onAccountChange` hook exactly the way composition injects it. A disabled / rejected / viewer-demoted owner's ACTIVE link is suspended by the admin
 * action itself, re-enabling resumes nothing, and a failing hook never fails or undoes the committed account change. The real-Mongo composition proof
 * (buildUserAccounts with its default hook) is account-coupling.mongo.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Users } from "@lkb/core";
import { adminRig, user } from "../../user-accounts/admin.testsupport.js";
import { createLinksService } from "./service.js";
import { memoryLinkData, memoryLinksStore, seed, NOTICE } from "./links.testsupport.js";

const TA = "tA", TB = "tB";
const people = (): Users[] => [
  user({ _id: "a1", tenantId: TA, role: "admin" }), user({ _id: "a2", tenantId: TA, role: "admin" }),
  user({ _id: "m1", tenantId: TA, role: "member" }), user({ _id: "m2", tenantId: TA, role: "member" }), user({ _id: "m3", tenantId: TA, role: "member" }),
  user({ _id: "ad1", tenantId: TA, role: "admin" }),
  user({ _id: "p1", tenantId: TA, status: "pending", role: undefined }),
  user({ _id: "a9", tenantId: TB, role: "admin" }), user({ _id: "m9", tenantId: TB, role: "member" }),
];

async function rig(over: { hook?: "links" | "none" | "throws" } = {}) {
  const list = people(), store = memoryLinksStore(), warned: string[] = [];
  const links = createLinksService({ store, archiver: null, data: memoryLinkData(), notice: () => NOTICE, countActiveAdmins: async () => 2, userStatus: async () => ({ status: "active", role: "member" }) });
  const calls: unknown[][] = [];
  // The hook is the only thing composition adds: (tenantId, userId, to) -> links.accountChanged.
  const onAccountChange = over.hook === "none" ? undefined : over.hook === "throws"
    ? async (...a: unknown[]) => { calls.push(a); throw new Error("links store down"); }
    : async (t: string, u: string, to: { status: string; role?: string }) => { calls.push([t, u, to]); return links.accountChanged(t, u, to); };
  const rg = await adminRig({ users: list, keys: {}, service: { ...(onAccountChange ? { onAccountChange } : {}), log: { warn: (m: string) => { warned.push(m); } } } });
  for (const u of list) await rg.login(u._id, u.tenantId);
  const active = (userId: string, tenantId = TA) => seed(store, { tenantId, state: "active", userId, archiverOwnerId: userId.padEnd(24, "0"), activatedAt: "2026-10-01T00:00:00.000Z" });
  const row = (id: string) => store.rows.get(id)!;
  return { ...rg, store, links, calls, warned, active, row, post: (as: string, path: string, body: unknown = {}) => rg.call({ user: as }, "POST", `/admin/users/${path}`, body) };
}

test("R-10 e2e: disabling an owner through /admin suspends their ACTIVE link (account_inactive, system actor); re-enabling does not resume it", async () => {
  const r = await rig();
  try {
    const l = r.active("m1"), bystander = r.active("m2"), other = r.active("m9", TB);
    const res = await r.post("a1", "m1/disable");
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(r.calls, [[TA, "m1", { status: "disabled" }]]);
    assert.deepEqual([r.row(l._id).state, r.row(l._id).suspendedReason, r.row(l._id).suspendedBy], ["suspended", "account_inactive", "system:account"]);
    assert.equal(r.row(bystander._id).state, "active", "another user's link is untouched");
    assert.equal(r.row(other._id).state, "active", "another tenant's link is untouched");
    assert.deepEqual(r.store.events.map(e => [e.eventType, e.linkId]), [["link.suspended", l._id]]);
    assert.equal((await r.post("a1", "m1/enable")).status, 200);
    assert.equal(r.users.find(u => u._id === "m1")!.status, "active");
    assert.equal(r.row(l._id).state, "suspended", "re-enabling the account resumes nothing (R-10)");
    assert.equal(r.store.events.length, 1);
  } finally { await r.close(); }
});

test("R-10 e2e: demoting an owner to viewer suspends the link; member<->admin changes and a no-op role call do not", async () => {
  const r = await rig();
  try {
    const l = r.active("m1"), keep = r.active("m2"), adminLink = r.active("ad1");
    assert.equal((await r.post("a1", "m2/role", { role: "admin" })).status, 200);
    assert.equal(r.row(keep._id).state, "active", "member -> admin keeps the link");
    assert.equal((await r.post("a1", "ad1/role", { role: "member" })).status, 200);
    assert.equal(r.row(adminLink._id).state, "active", "admin -> member keeps the link");
    assert.equal((await r.post("a1", "m1/role", { role: "member" })).status, 200);
    assert.equal(r.row(l._id).state, "active", "no-op role call");
    assert.equal((await r.post("a1", "m1/role", { role: "viewer" })).status, 200);
    assert.deepEqual([r.row(l._id).state, r.row(l._id).suspendedReason], ["suspended", "account_inactive"]);
    assert.equal(r.calls.some(c => (c[2] as { role?: string }).role === "viewer" && c[1] === "m1"), true);
    assert.equal((await r.post("a1", "m1/role", { role: "member" })).status, 200);
    assert.equal(r.row(l._id).state, "suspended", "promoting back resumes nothing");
  } finally { await r.close(); }
});

test("R-10 e2e: rejecting an account passes through the hook too, and approving or enabling never suspends a healthy owner", async () => {
  const r = await rig();
  try {
    const stray = r.active("p1"), healthy = r.active("m3");
    assert.equal((await r.post("a1", "p1/reject")).status, 200);
    assert.equal(r.row(stray._id).state, "suspended", "a rejected account's link is suspended");
    r.calls.length = 0;
    assert.equal((await r.post("a1", "m3/disable")).status, 200);
    assert.equal((await r.post("a1", "m3/enable")).status, 200);
    assert.equal(r.row(healthy._id).state, "suspended");
    assert.deepEqual(r.calls.map(c => (c[2] as { status: string }).status), ["disabled"], "enable and approve are not account-loss events");
  } finally { await r.close(); }
});

test("R-10 e2e: a failing hook is logged and never fails or undoes the committed account change; a refused admin action never reaches the hook", async () => {
  const r = await rig({ hook: "throws" });
  try {
    const res = await r.post("a1", "m1/disable");
    assert.equal(res.status, 200, "the account change committed, so the admin gets 200");
    assert.equal(r.users.find(u => u._id === "m1")!.status, "disabled");
    assert.ok(r.warned.includes("account_change_hook_failed"), JSON.stringify(r.warned));
    r.calls.length = 0;
    assert.equal((await r.post("m2", "m1/disable")).status, 403, "a member cannot disable");
    assert.equal((await r.post("a1", "a1/disable")).status, 403, "self-action guard");
    assert.equal(r.calls.length, 0, "refused actions never call the hook");
  } finally { await r.close(); }
});

test("R-10 e2e: with no hook configured the admin surface behaves as before (the dep is optional)", async () => {
  const r = await rig({ hook: "none" });
  try {
    const l = r.active("m1");
    assert.equal((await r.post("a1", "m1/disable")).status, 200);
    assert.equal(r.row(l._id).state, "active", "nothing is wired: that is exactly the production gap this test pair guards");
  } finally { await r.close(); }
});
