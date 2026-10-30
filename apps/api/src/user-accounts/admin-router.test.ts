// user-accounts A6 (D-206) `ua-admin-api`: /admin/* proven THROUGH the real createServer, mounted exactly the way mountUserAccounts mounts it
// (requireAuth + session guards first, then this router). In-memory doubles with Mongo's CAS semantics; the race / TTL-free real-database
// claims live in admin.mongo.test.ts. Each test names the plan A6 acceptance item it proves ([A6-n]).
import assert from "node:assert/strict";
import test from "node:test";
import type { Users } from "@lkb/core";
import { sha256Hex } from "../hash.js";
import { createAdminService, ipPrefixOf, parsePublicOrigin, type AdminStore } from "./admin-service.js";
import { adminRig, ORIGIN, subjectHashFor, user, type Who } from "./admin.testsupport.js";

const T = "2026-10-30T00:00:00.000Z";
const pend = (id: string, tenantId = "tA", createdAt = T): Users => user({ _id: id, tenantId, status: "pending", role: undefined, createdAt });
function seed(): Users[] {
  return [
    user({ _id: "a1", tenantId: "tA", role: "admin" }), user({ _id: "a2", tenantId: "tA", role: "admin" }),
    user({ _id: "m1", tenantId: "tA", role: "member" }), user({ _id: "v1", tenantId: "tA", role: "viewer" }),
    pend("p1", "tA", "2026-10-30T01:00:00.000Z"), pend("p2", "tA", "2026-10-30T02:00:00.000Z"),
    user({ _id: "un1", tenantId: "tA", status: "unverified", role: undefined, createdAt: "2026-10-31T00:00:00.000Z" }),
    user({ _id: "unOld", tenantId: "tA", status: "unverified", role: undefined, createdAt: "2026-10-01T00:00:00.000Z" }),
    user({ _id: "rj", tenantId: "tA", status: "rejected", role: undefined }),
    user({ _id: "dis", tenantId: "tA", status: "disabled", role: "member" }),
    user({ _id: "b1", tenantId: "tB", role: "admin" }), pend("bp", "tB"),
  ];
}
const KEYS = { "key-ua": { tenantId: "tA", scopes: ["user-admin"] }, "key-none": { tenantId: "tA", scopes: ["ask"] } };
const A1: Who = { user: "a1" };
const MUTATIONS: Array<[string, unknown]> = [["approve", { role: "member" }], ["reject", {}], ["role", { role: "viewer" }], ["disable", {}], ["enable", {}], ["revoke-sessions", {}], ["unlock", {}], ["issue-link", { purpose: "password_reset" }]];
const rigOf = async (users = seed(), extra: Partial<Parameters<typeof adminRig>[0]> = {}) => {
  const rig = await adminRig({ users, keys: KEYS, ...extra });
  for (const u of users) await rig.login(u._id, u.tenantId);
  return rig;
};
const byId = (rig: { users: Users[] }, id: string) => rig.users.find((u) => u._id === id)!;
const adminCount = (rig: { users: Users[] }, tenantId = "tA") => rig.users.filter((u) => u.tenantId === tenantId && u.status === "active" && u.role === "admin").length;

test("[A6-1] only an active admin session mutates: member, viewer, pending, keys (with and without user-admin), anonymous and a CSRF-less admin are all refused, state untouched", async () => {
  const rig = await rigOf();
  try {
    const before = JSON.stringify(rig.users);
    const actors: Array<[string, Who, number, string]> = [
      ["member session", { user: "m1" }, 403, "admin_session_required"], ["viewer session", { user: "v1" }, 403, "read_only_role"],
      ["pending session", { user: "p2" }, 403, "account_not_active"], ["key WITH user-admin", { key: "key-ua" }, 403, "admin_session_required"],
      ["key without user-admin", { key: "key-none" }, 403, "admin_session_required"], ["anonymous", null, 401, "unauthorized"],
      ["admin, no csrf header", { user: "a1", csrf: null }, 403, "csrf"], ["admin, wrong origin", { user: "a1", origin: "https://evil.example" }, 403, "csrf"],
    ];
    for (const [action, body] of MUTATIONS) for (const [label, who, status, error] of actors) {
      const r = await rig.call(who, "POST", `/admin/users/p1/${action}`, body);
      assert.deepEqual([label, action, r.status, r.json?.error], [label, action, status, error]);
    }
    assert.equal(JSON.stringify(rig.users), before, "no refused call changed a user");
    assert.equal(rig.state.events.length, 0, "no refused call wrote an audit row");
    const ok = await rig.call(A1, "POST", "/admin/users/p1/approve", { role: "member" });
    assert.equal(ok.status, 200, "the same call by an active admin session succeeds");
  } finally { await rig.close(); }
});

test("[A6-1] reads need the user-admin scope: admin session and a key holding it read; member, viewer, key without it do not", async () => {
  const rig = await rigOf();
  try {
    for (const path of ["/admin/users", "/admin/users/p1", "/admin/audit"]) {
      assert.equal((await rig.call(A1, "GET", path)).status, 200, path);
      assert.equal((await rig.call({ key: "key-ua" }, "GET", path)).status, 200, `${path} key with user-admin (UA-28)`);
      for (const who of [{ user: "m1" }, { user: "v1" }, { key: "key-none" }] as Who[]) { const r = await rig.call(who, "GET", path); assert.deepEqual([path, r.status, r.json?.error], [path, 403, "forbidden"]); }
      assert.equal((await rig.call({ user: "p2" }, "GET", path)).json?.error, "account_not_active");
      assert.equal((await rig.call(null, "GET", path)).status, 401);
    }
  } finally { await rig.close(); }
});

test("[A6-2] approve needs a role and writes one event with actor and target; reject / role / disable / enable / revoke / unlock likewise", async () => {
  const rig = await rigOf();
  try {
    for (const bad of [{}, { role: "root" }, { role: "" }, { role: null }, { role: { $ne: "" } }, { role: ["admin"] }]) {
      const r = await rig.call(A1, "POST", "/admin/users/p1/approve", bad);
      assert.deepEqual([r.status, r.json?.error], [400, "invalid_body"], JSON.stringify(bad));
    }
    assert.equal(byId(rig, "p1").status, "pending");
    const approve = await rig.call(A1, "POST", "/admin/users/p1/approve", { role: "viewer" });
    assert.equal(approve.status, 200);
    assert.deepEqual([approve.json?.user.status, approve.json?.user.role], ["active", "viewer"]);
    assert.equal(rig.state.events.length, 1);
    assert.deepEqual([rig.state.events[0]!.type, rig.state.events[0]!.actorUserId, rig.state.events[0]!.targetUserId, rig.state.events[0]!.outcome, rig.state.events[0]!.tenantId], ["approved", "a1", "p1", "ok", "tA"]);

    assert.equal((await rig.call(A1, "POST", "/admin/users/p2/reject", { reason: "not a customer, sorry" })).status, 200);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/role", { role: "viewer" })).status, 200);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/disable", {})).status, 200);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/enable", {})).status, 200);
    assert.equal((await rig.call(A1, "POST", "/admin/users/v1/revoke-sessions", {})).status, 200);
    rig.state.throttles.push({ tenantId: "tA", subjectHash: subjectHashFor("tA", "m1@example.org") });
    const unlock = await rig.call(A1, "POST", "/admin/users/m1/unlock", {});
    assert.deepEqual([unlock.status, unlock.json?.cleared], [200, true]);
    assert.deepEqual(rig.state.events.map((e) => e.type), ["approved", "rejected", "role_changed", "disabled", "enabled", "session_revoked", "unlocked"], "exactly one event per effective action");
    for (const e of rig.state.events) assert.deepEqual([e.actorUserId, e.detail, e.outcome], ["a1", "admin_action", "ok"]);
    assert.deepEqual(rig.state.events.slice(1).map((e) => e.targetUserId), ["p2", "m1", "m1", "m1", "v1", "m1"]);
    assert.ok(!JSON.stringify(rig.state.events).includes("not a customer"), "the reject reason (client free text) is never stored in the audit log");
  } finally { await rig.close(); }
});

test("[A6-2] state machine: approve only pending|rejected (re-open), reject only pending, enable only disabled, disable only active; failures write no event", async () => {
  const rig = await rigOf();
  try {
    const cases: Array<[string, string, unknown, number, string?]> = [
      ["m1", "approve", { role: "member" }, 409, "invalid_state"], ["un1", "approve", { role: "member" }, 409, "invalid_state"], ["dis", "approve", { role: "member" }, 409, "invalid_state"],
      ["m1", "reject", {}, 409, "invalid_state"], ["rj", "reject", {}, 409, "invalid_state"], ["p1", "enable", {}, 409, "invalid_state"], ["rj", "disable", {}, 409, "invalid_state"],
      ["p1", "role", { role: "admin" }, 409, "invalid_state"],
    ];
    for (const [id, action, body, status, error] of cases) { const r = await rig.call(A1, "POST", `/admin/users/${id}/${action}`, body); assert.deepEqual([id, action, r.status, r.json?.error], [id, action, status, error]); }
    assert.equal(rig.state.events.length, 0);
    const reopen = await rig.call(A1, "POST", "/admin/users/rj/approve", { role: "member" });
    assert.deepEqual([reopen.status, reopen.json?.user.status], [200, "active"], "an admin re-opens a rejection by approving");
    byId(rig, "dis").role = undefined;
    assert.equal((await rig.call(A1, "POST", "/admin/users/dis/enable", {})).json?.error, "role_required", "no role to restore: approve with a role instead");
  } finally { await rig.close(); }
});

test("[A6-2] a role change applies on the very next request: a promoted member approves immediately, a demoted admin is refused immediately", async () => {
  const rig = await rigOf();
  try {
    assert.equal((await rig.call({ user: "m1" }, "POST", "/admin/users/p1/approve", { role: "member" })).json?.error, "admin_session_required");
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/role", { role: "admin" })).status, 200);
    assert.equal((await rig.call({ user: "m1" }, "POST", "/admin/users/p1/approve", { role: "member" })).status, 200, "promotion is effective on the next request");
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/role", { role: "viewer" })).status, 200);
    assert.equal((await rig.call({ user: "m1" }, "POST", "/admin/users/p2/approve", { role: "member" })).json?.error, "read_only_role", "demotion is effective on the next request");
    const same = await rig.call(A1, "POST", "/admin/users/v1/role", { role: "viewer" });
    assert.deepEqual([same.status, same.json?.changed], [200, false], "setting the role a user already has is a no-op");
    assert.equal(rig.state.events.filter((e) => e.type === "role_changed").length, 2, "the no-op wrote no event");
  } finally { await rig.close(); }
});

test("[A6-2] tenant isolation: an admin of tenant B gets 404 for tenant A user ids on list, detail and every mutation, and a swapped tenant in the body is refused", async () => {
  const rig = await rigOf();
  try {
    const B: Who = { user: "b1" };
    const list = await rig.call(B, "GET", "/admin/users?limit=200");
    assert.deepEqual(list.json?.users.map((u: { id: string }) => u.id).sort(), ["b1", "bp"], "tenant A users are not listed");
    assert.equal(list.json?.pendingCount, 1);
    const unknown = await rig.call(B, "GET", "/admin/users/definitely-not-a-user");
    const cross = await rig.call(B, "GET", "/admin/users/p1");
    assert.deepEqual([cross.status, cross.json?.error], [404, "not_found"]);
    assert.equal(cross.text, unknown.text, "cross-tenant and non-existent ids are indistinguishable (404, byte-equal body)");
    const before = JSON.stringify(rig.users.filter((u) => u.tenantId === "tA"));
    for (const [action, body] of MUTATIONS) { const r = await rig.call(B, "POST", `/admin/users/p1/${action}`, body); assert.deepEqual([action, r.status, r.json?.error], [action, 404, "not_found"]); }
    for (const body of [{ role: "admin", tenantId: "tA" }, { role: "admin", tenant: "tA" }]) assert.equal((await rig.call(B, "POST", "/admin/users/bp/approve", body)).status, 400, "tenant in a body is rejected, never honoured");
    assert.equal(JSON.stringify(rig.users.filter((u) => u.tenantId === "tA")), before);
    assert.equal(rig.state.events.filter((e) => e.tenantId === "tA").length, 0);
    await rig.call(A1, "POST", "/admin/users/p1/approve", { role: "member" });
    assert.equal((await rig.call(B, "GET", "/admin/audit")).json?.events.length, 0, "tenant A events are invisible to tenant B");
    assert.equal((await rig.call(A1, "GET", "/admin/users/b1")).status, 404);
  } finally { await rig.close(); }
});

test("[A6-3] last-admin guard: the sole admin cannot demote, disable or revoke the sessions of themself (409 last_admin); with two admins it succeeds for one", async () => {
  const users = seed().filter((u) => u._id !== "a2");
  const rig = await rigOf(users);
  try {
    assert.equal(adminCount(rig), 1);
    for (const [action, body] of [["role", { role: "member" }], ["disable", {}], ["revoke-sessions", {}]] as Array<[string, unknown]>) {
      const r = await rig.call(A1, "POST", `/admin/users/a1/${action}`, body);
      assert.deepEqual([action, r.status, r.json?.error], [action, 409, "last_admin"]);
    }
    assert.equal(rig.state.events.length, 0);
    assert.deepEqual([byId(rig, "a1").status, byId(rig, "a1").role], ["active", "admin"]);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/role", { role: "admin" })).status, 200, "a second admin is made by an existing admin");
    assert.equal(adminCount(rig), 2);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/role", { role: "member" })).status, 200, "with two admins demoting the other succeeds");
    assert.equal(adminCount(rig), 1);
    assert.equal((await rig.call(A1, "POST", "/admin/users/a1/disable", {})).json?.error, "last_admin", "...and the survivor is protected again");
  } finally { await rig.close(); }
});

test("[A6-3] a concurrent demotion of both admins (each demoting the other) leaves exactly one admin", async () => {
  for (let round = 0; round < 10; round++) {
    const rig = await rigOf();
    try {
      const [x, y] = await Promise.all([rig.call({ user: "a1" }, "POST", "/admin/users/a2/role", { role: "member" }), rig.call({ user: "a2" }, "POST", "/admin/users/a1/role", { role: "member" })]);
      assert.equal(adminCount(rig), 1, `round ${round}: statuses ${x.status}/${y.status}`);
      assert.ok([x.status, y.status].includes(200) && [x.status, y.status].some((s) => s === 403 || s === 409));
    } finally { await rig.close(); }
  }
});

test("[A6-3] a second API instance racing this one (its own lock) can never leave zero admins: the post-check reverts the write", async () => {
  let activeAdminCalls = 0;
  const rig = await rigOf(seed(), { storeWrap: (s): AdminStore => ({ ...s, async countActiveAdmins(t) {
    activeAdminCalls++;
    if (activeAdminCalls === 2) await s.cas(t, "a1", { status: "active", role: "admin" }, { status: "active", role: "member", statusChangedAt: T, statusChangedBy: "other-instance", updatedAt: T }); // the other instance lands between our write and our post-check
    return s.countActiveAdmins(t);
  } }) });
  try {
    const r = await rig.call(A1, "POST", "/admin/users/a2/role", { role: "member" });
    assert.deepEqual([r.status, r.json?.error], [409, "last_admin"]);
    assert.deepEqual([byId(rig, "a2").role, byId(rig, "a2").status], ["admin", "active"], "our write was reverted");
    assert.equal(adminCount(rig), 1, "an admin remains");
    assert.equal(rig.state.events.length, 0, "a reverted change writes no event");
  } finally { await rig.close(); }
});

test("[A6-3] a stale session whose admin was demoted a moment ago is refused by the service itself (re-read of the actor under the lock)", async () => {
  const users = seed();
  const rig = await rigOf(users);
  try {
    const svc = createAdminService({ store: rig.store, subjectHash: subjectHashFor, publicOrigin: ORIGIN, now: rig.clock.now });
    byId(rig, "a2").role = "member";
    const r = await svc.approve({ tenantId: "tA", userId: "a2" }, "p1", { role: "member" });
    assert.deepEqual([r.ok, !r.ok && r.error], [false, "forbidden"]);
    assert.equal(byId(rig, "p1").status, "pending");
  } finally { await rig.close(); }
});

test("[A6-4] an admin cannot change their own role or disable themself when another admin exists (403 self_action_forbidden)", async () => {
  const rig = await rigOf();
  try {
    for (const [action, body] of [["role", { role: "member" }], ["role", { role: "admin" }], ["disable", {}]] as Array<[string, unknown]>) {
      const r = await rig.call(A1, "POST", `/admin/users/a1/${action}`, body);
      assert.deepEqual([action, JSON.stringify(body), r.status, r.json?.error], [action, JSON.stringify(body), 403, "self_action_forbidden"]);
    }
    assert.deepEqual([byId(rig, "a1").status, byId(rig, "a1").role], ["active", "admin"]);
    assert.equal(rig.state.events.length, 0);
  } finally { await rig.close(); }
});

test("[A6-5] disable and revoke-sessions take effect on the target's very next request (401) in the same run", async () => {
  const rig = await rigOf();
  try {
    assert.equal((await rig.call({ user: "m1" }, "GET", "/admin/users")).status, 403, "m1 is authenticated before (403 = no scope, not 401)");
    const d = await rig.call(A1, "POST", "/admin/users/m1/disable", {});
    assert.deepEqual([d.status, d.json?.revokedSessions], [200, 1]);
    const after = await rig.call({ user: "m1" }, "GET", "/admin/users");
    assert.deepEqual([after.status, after.json?.error], [401, "session_revoked"]);
    assert.ok(rig.state.events.some((e) => e.type === "disabled" && e.targetUserId === "m1"));

    assert.equal((await rig.call({ user: "v1" }, "GET", "/admin/users")).status, 403);
    assert.equal((await rig.call(A1, "POST", "/admin/users/v1/revoke-sessions", {})).json?.revokedSessions, 1);
    assert.deepEqual([(await rig.call({ user: "v1" }, "GET", "/admin/users")).status], [401]);
    assert.equal((await rig.call(A1, "POST", "/admin/users/m1/enable", {})).status, 200);
    assert.equal((await rig.call({ user: "m1" }, "GET", "/admin/users")).status, 401, "enabling does not resurrect a revoked session");
  } finally { await rig.close(); }
});

test("[A6-7] adversarial: mass assignment, role escalation by editing own record, id guessing, operator injection, replay with swapped tenant", async () => {
  const rig = await rigOf();
  try {
    const before = JSON.stringify(rig.users);
    // mass assignment on every body-taking route
    for (const [path, body] of [["approve", { role: "member", status: "active" }], ["approve", { role: "member", tenantId: "tB" }], ["approve", { role: "admin", passwordHash: "$argon2id$x" }], ["approve", { role: "member", userId: "a1" }],
      ["role", { role: "viewer", status: "active" }], ["reject", { reason: "x", status: "active" }], ["disable", { role: "admin" }], ["enable", { status: "active" }], ["revoke-sessions", { tenantId: "tB" }], ["unlock", { x: 1 }],
      ["issue-link", { purpose: "password_reset", tenantId: "tB" }]] as Array<[string, unknown]>) {
      const r = await rig.call(A1, "POST", `/admin/users/p1/${path}`, body);
      assert.deepEqual([path, JSON.stringify(body), r.status, r.json?.error], [path, JSON.stringify(body), 400, "invalid_body"]);
    }
    for (const raw of ["[]", "\"admin\"", "null", "42"]) assert.equal((await rig.call(A1, "POST", "/admin/users/p1/approve", raw)).status, 400, raw);
    // role escalation by editing one's own record (member, viewer, pending, key)
    for (const who of [{ user: "m1" }, { user: "v1" }, { user: "p2" }, { key: "key-ua" }] as Who[]) for (const id of ["m1", "v1", "p2"]) assert.ok((await rig.call(who, "POST", `/admin/users/${id}/role`, { role: "admin" })).status >= 400);
    assert.equal(JSON.stringify(rig.users), before, "no adversarial call changed any user");
    // id guessing / injection: all the same 404 shape, never a different oracle
    const nf = await rig.call(A1, "GET", "/admin/users/nope");
    for (const id of ["..%2f..%2fadmin", "%24ne", "a".repeat(65), "a1%00", "A1", "a1%20"]) { const r = await rig.call(A1, "GET", `/admin/users/${id}`); assert.deepEqual([id, r.status, r.text], [id, 404, nf.text]); }
    for (const q of ["status[$ne]=x", "status=bogus", "limit=0", "limit=abc", "limit=201", "cursor=%%%", "extra=1", `cursor=${Buffer.from("{\"createdAt\":1}").toString("base64url")}`]) assert.equal((await rig.call(A1, "GET", `/admin/users?${q}`)).status, 400, q);
    for (const q of ["targetUserId[$ne]=x", "limit=-1", "extra=1"]) assert.equal((await rig.call(A1, "GET", `/admin/audit?${q}`)).status, 400, q);
    // replay of an approve with a swapped tenant: tenant B's admin cannot approve tenant A's pending user, nor can A approve B's
    assert.equal((await rig.call({ user: "b1" }, "POST", "/admin/users/p1/approve", { role: "member" })).status, 404);
    assert.equal((await rig.call(A1, "POST", "/admin/users/bp/approve", { role: "member" })).status, 404);
    assert.equal(byId(rig, "p1").status, "pending");
    assert.equal(byId(rig, "bp").status, "pending");
    assert.equal(rig.state.events.length, 0);
  } finally { await rig.close(); }
});

test("[A6-1] unlock deletes exactly the throttle row keyed by the injected subject hash, for this tenant only; no row is a no-op that still audits", async () => {
  const rig = await rigOf();
  try {
    const mine = subjectHashFor("tA", "m1@example.org");
    rig.state.throttles.push({ tenantId: "tA", subjectHash: mine }, { tenantId: "tA", subjectHash: subjectHashFor("tA", "v1@example.org") }, { tenantId: "tB", subjectHash: mine });
    const r = await rig.call(A1, "POST", "/admin/users/m1/unlock", {});
    assert.deepEqual([r.status, r.json?.cleared], [200, true]);
    assert.equal(rig.state.throttles.length, 2);
    assert.ok(rig.state.throttles.some((x) => x.tenantId === "tB" && x.subjectHash === mine), "another tenant's row is untouched");
    const again = await rig.call(A1, "POST", "/admin/users/m1/unlock", {});
    assert.deepEqual([again.status, again.json?.cleared], [200, false]);
    assert.equal(rig.state.events.filter((e) => e.type === "unlocked").length, 2);
  } finally { await rig.close(); }
});

test("[A5-replacement] issue-link: single-use token for verify/reset, link from APP_PUBLIC_ORIGIN + base path (never Host), hash only stored, earlier link superseded", async () => {
  const rig = await rigOf();
  try {
    const first = await rig.call(A1, "POST", "/admin/users/un1/issue-link", { purpose: "verify_email" }, { "x-forwarded-host": "evil.example", host: "evil.example" });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const link: string = first.json?.link;
    assert.match(link, /^https:\/\/kb\.example\.org\/knowledgebase\/verify#token=[A-Za-z0-9_-]{43}$/);
    const token = link.split("#token=")[1]!;
    assert.equal(rig.state.tokens.length, 1);
    const row = rig.state.tokens[0]!;
    assert.deepEqual([row.tokenHash, row.purpose, row.userId, row.issuedVia, row.issuedBy, row.tenantId], [sha256Hex(token), "verify_email", "un1", "admin", "a1", "tA"]);
    assert.ok(!JSON.stringify([rig.state.tokens, rig.state.events]).includes(token), "the raw token is stored nowhere");
    assert.equal(first.json?.expiresAt, row.expiresAt);
    const second = await rig.call(A1, "POST", "/admin/users/un1/issue-link", { purpose: "verify_email" });
    assert.notEqual(second.json?.link, link);
    assert.ok(rig.state.tokens[0]!.usedAt && !rig.state.tokens[1]!.usedAt, "re-issuing voids the previous link");
    const reset = await rig.call(A1, "POST", "/admin/users/m1/issue-link", { purpose: "password_reset" });
    assert.match(reset.json?.link, /^https:\/\/kb\.example\.org\/knowledgebase\/reset#token=/);
    assert.equal((await rig.call(A1, "POST", "/admin/users/p1/issue-link", { purpose: "password_reset" })).status, 200, "pending users may reset (UA-21)");
    assert.deepEqual(rig.state.events.filter((e) => e.type === "link_issued").map((e) => e.targetUserId), ["un1", "un1", "m1", "p1"]);
    // wrong state for the purpose
    for (const [id, purpose] of [["p1", "verify_email"], ["m1", "verify_email"], ["un1", "password_reset"], ["rj", "password_reset"], ["dis", "password_reset"]]) {
      const r = await rig.call(A1, "POST", `/admin/users/${id}/issue-link`, { purpose });
      assert.deepEqual([id, purpose, r.status, r.json?.error], [id, purpose, 409, "invalid_state"]);
    }
    for (const bad of [{}, { purpose: "session" }, { purpose: "VERIFY_EMAIL" }]) assert.equal((await rig.call(A1, "POST", "/admin/users/un1/issue-link", bad)).status, 400);
    assert.equal(rig.state.tokens.length, 4, "refused calls issued nothing");
  } finally { await rig.close(); }
});

test("[A5-replacement] issue-link without a valid APP_PUBLIC_ORIGIN is 503 and issues nothing (no fallback to the request Host); only an admin session may call it", async () => {
  for (const publicOrigin of [undefined, "", "not a url", "ftp://kb.example.org", "https://kb.example.org/app", "https://user:pw@kb.example.org", "https://kb.example.org/?x=1"]) {
    const rig = await rigOf(seed(), { service: { publicOrigin } });
    try {
      const r = await rig.call(A1, "POST", "/admin/users/un1/issue-link", { purpose: "verify_email" }, { "x-forwarded-host": "evil.example" });
      assert.deepEqual([String(publicOrigin), r.status, r.json?.error], [String(publicOrigin), 503, "link_origin_not_configured"]);
      assert.equal(rig.state.tokens.length, 0);
    } finally { await rig.close(); }
  }
  const rig = await rigOf();
  try {
    for (const who of [{ key: "key-ua" }, { user: "m1" }, null] as Who[]) assert.ok((await rig.call(who, "POST", "/admin/users/un1/issue-link", { purpose: "verify_email" })).status >= 401);
    assert.equal(rig.state.tokens.length, 0);
  } finally { await rig.close(); }
  assert.equal(parsePublicOrigin("https://kb.example.org/"), "https://kb.example.org");
  assert.equal(parsePublicOrigin("http://localhost:5173"), "http://localhost:5173");
});

test("[A6-2] listing: default queue hides unverified, ?status=unverified hides those older than 7 days, pendingCount, cursor paging, no secrets in any response", async () => {
  const rig = await rigOf();
  try {
    const all = await rig.call(A1, "GET", "/admin/users?limit=200");
    const ids = (r: { json: Record<string, any> | null }) => r.json?.users.map((u: { id: string }) => u.id);
    assert.ok(!ids(all).includes("un1") && !ids(all).includes("unOld"), "unverified never in the default queue");
    assert.equal(all.json?.pendingCount, 2);
    assert.deepEqual(ids(await rig.call(A1, "GET", "/admin/users?status=unverified")), ["un1"], "a fresh unverified account is listed on request, a >7 day old one never");
    assert.deepEqual(ids(await rig.call(A1, "GET", "/admin/users?status=pending")), ["p1", "p2"]);
    const page1 = await rig.call(A1, "GET", "/admin/users?status=pending&limit=1");
    assert.deepEqual([ids(page1), typeof page1.json?.next], [["p1"], "string"]);
    const page2 = await rig.call(A1, "GET", `/admin/users?status=pending&limit=1&cursor=${page1.json?.next}`);
    assert.deepEqual([ids(page2), page2.json?.next], [["p2"], null]);
    const detail = await rig.call(A1, "GET", "/admin/users/a2");
    assert.deepEqual([detail.status, detail.json?.activeSessionCount, detail.json?.user.email], [200, 1, "a2@example.org"]);
    for (const r of [all, page1, detail]) { assert.ok(!/argon2|passwordHash|tenantId|"_id"/.test(r.text), "no hash, tenant id or storage id leaks"); }
  } finally { await rig.close(); }
});

test("[A6-2] audit: newest first, cursor paged, tenant scoped, filter by target, closed fields only", async () => {
  const rig = await rigOf();
  try {
    await rig.call(A1, "POST", "/admin/users/p1/approve", { role: "member" }); rig.clock.advance(1000);
    await rig.call(A1, "POST", "/admin/users/p2/reject", {}); rig.clock.advance(1000);
    await rig.call(A1, "POST", "/admin/users/m1/disable", {});
    const p1 = await rig.call(A1, "GET", "/admin/audit?limit=2");
    assert.deepEqual(p1.json?.events.map((e: { type: string }) => e.type), ["disabled", "rejected"]);
    const p2 = await rig.call({ key: "key-ua" }, "GET", `/admin/audit?limit=2&cursor=${p1.json?.next}`);
    assert.deepEqual([p2.json?.events.map((e: { type: string }) => e.type), p2.json?.next], [["approved"], null]);
    assert.deepEqual((await rig.call(A1, "GET", "/admin/audit?targetUserId=p2")).json?.events.map((e: { targetUserId: string }) => e.targetUserId), ["p2"]);
    assert.ok(!/purgeAt|tenantId|subjectHash|"_id"/.test(p1.text));
    assert.deepEqual(Object.keys(p1.json?.events[0]).sort(), ["actorUserId", "at", "detail", "id", "ipPrefix", "outcome", "targetUserId", "type"].sort());
  } finally { await rig.close(); }
});

test("a store failure is a generic 503 and never an authorisation or a write", async () => {
  const rig = await rigOf(seed(), { storeWrap: (s): AdminStore => ({ ...s, cas: async () => { throw new Error("mongo down"); } }) });
  try {
    const r = await rig.call(A1, "POST", "/admin/users/p1/approve", { role: "member" });
    assert.deepEqual([r.status, r.json?.error], [503, "admin_unavailable"]);
    assert.ok(!r.text.includes("mongo down"));
    assert.equal(byId(rig, "p1").status, "pending");
  } finally { await rig.close(); }
});

test("helpers: ipPrefixOf truncates to /24 and /48 and rejects junk", () => {
  assert.equal(ipPrefixOf("203.0.113.77"), "203.0.113.0/24");
  assert.equal(ipPrefixOf("::ffff:203.0.113.77"), "203.0.113.0/24");
  assert.equal(ipPrefixOf("2001:db8:1:2::9"), "2001:db8:1::/48");
  assert.equal(ipPrefixOf("2001:DB8:0001:0002:0:0:0:9"), "2001:db8:1::/48");
  for (const bad of [undefined, "", "999.1.1.1", "1.2.3", "gggg::1", "1::2::3", "a.b.c.d"]) assert.equal(ipPrefixOf(bad), undefined, String(bad));
});

test("[A6 wiring] buildUserAccounts builds the /admin router, so the production mount is no longer the 503 placeholder", async () => {
  const { buildUserAccounts } = await import("../composition/integrations/user-accounts.js");
  const fakeDb = { collection: () => ({}) } as unknown as import("mongodb").Db;
  const ua = buildUserAccounts({ AUTH_CSRF_SECRET: "x".repeat(40), USER_SIGNUP_TENANT: "toc", APP_PUBLIC_ORIGIN: ORIGIN }, fakeDb, { warn: () => {} });
  assert.ok(ua, "a usable AUTH_CSRF_SECRET enables user accounts");
  assert.equal(typeof ua.adminRouter, "function", "adminRouter is built, not left to the placeholder");
});
