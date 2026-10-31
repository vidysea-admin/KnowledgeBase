/**
 * wa-composition-wiring (ISS-WASEL-001, ISS-WAEF-002, ISS-WALINKS-004 wiring part): the three multi-user WhatsApp routers are composed by the REAL
 * `buildKnowledgeIntegrations` (not injected by hand) and mounted by the real `createServer` perimeter. Configured (archiver service API env set) ->
 * the real links, selection and events routers answer; unconfigured -> each surface answers 503 AFTER its scope check; no route opens without auth.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { memoryDb } from "../../transcript-review/memdb.testsupport.js";
import { user } from "../../user-accounts/sessions.testsupport.js";
import { linksRig } from "../../whatsapp/links/links.rig.testsupport.js";
import { startFakeArchiver } from "../../whatsapp/archiver/fake-archiver.js";
import { buildKnowledgeIntegrations } from "./knowledge.js";

const T1 = "tenant-1";
const U = [
  user({ _id: "u-admin", tenantId: T1, role: "admin" }), user({ _id: "u-member", tenantId: T1 }), user({ _id: "u-viewer", tenantId: T1, role: "viewer" }),
  user({ _id: "t2-admin", tenantId: "tenant-2", role: "admin" }),
];
const KEYS = { "k-admin-only": { tenantId: T1, keyId: "key-1", scopes: ["whatsapp-admin"] } }; // an admin session also holds whatsapp-link, so owner-only refusals use a key
const fake = await startFakeArchiver();
after(async () => { await fake.stop(); });
const CONFIGURED = { WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" };

async function composed(env: Record<string, string | undefined>) {
  const m = memoryDb();
  m.seed("whatsapp_events", { _id: "a".repeat(24), tenantId: T1, eventType: "link.requested", actorKind: "user", at: "2026-10-30T00:00:00.000Z", data: {} });
  m.seed("whatsapp_events", { _id: "b".repeat(24), tenantId: "tenant-2", eventType: "link.requested", actorKind: "user", at: "2026-10-30T00:00:01.000Z", data: {} });
  const integrations = buildKnowledgeIntegrations({ db: m.db as unknown as Db, env, root: "C:/nonexistent", index: undefined as never, ask: {} as never, routing: { chains: {}, providers: {}, jobWrite: async () => {} } as never });
  const rig = await linksRig({ users: U, keys: KEYS, noLinks: true, deps: { ...integrations } });
  for (const u of U) await rig.login(u._id, u.tenantId);
  return rig;
}
const as = (userId: string) => ({ user: userId });

test("C1/C3 configured: events, links and selection are served by their real routers behind their existing scopes", async () => {
  const rig = await composed(CONFIGURED); try {
    assert.equal((await rig.call(null, "GET", "/whatsapp/events")).status, 401, "no route opens without auth");
    const ev = await rig.call(as("u-admin"), "GET", "/whatsapp/events");
    assert.equal(ev.status, 200, ev.text); assert.deepEqual(ev.json!.events.map((e: { id: string }) => e.id), ["a".repeat(24)], "tenant-1 events only");
    assert.equal((await rig.call(as("u-member"), "GET", "/whatsapp/events")).status, 403, "member refused on the admin feed");
    assert.equal((await rig.call(as("u-viewer"), "GET", "/whatsapp/events")).status, 403, "viewer refused on the admin feed");

    const notice = await rig.call(as("u-member"), "GET", "/whatsapp/links/notice");
    assert.equal(notice.status, 200, "the repo notice file is read by the production composition: " + notice.text);
    const made = await rig.call(as("u-member"), "POST", "/whatsapp/links", { label: "My phone", noticeVersion: notice.json!.version });
    assert.equal(made.status, 201, made.text);
    const id = made.json!.link.id as string;
    assert.equal((await rig.call(as("u-member"), "GET", "/whatsapp/links")).status, 200);
    assert.equal((await rig.call(as("u-viewer"), "GET", "/whatsapp/links")).status, 403);
    for (const verb of ["approve", "reject", "suspend", "revoke", "resume"]) {
      assert.equal((await rig.call(as("u-member"), "POST", `/whatsapp/links/${id}/${verb}`, {})).status, 403, `member refused on ${verb}`);
      assert.equal((await rig.call(as("u-viewer"), "POST", `/whatsapp/links/${id}/${verb}`, {})).status, 403, `viewer refused on ${verb}`);
    }
    assert.equal((await rig.call(as("t2-admin"), "GET", `/whatsapp/links/${id}`)).status, 404, "tenant-2 admin cannot see a tenant-1 link");

    // selection: the real router answers (the link is only requested, so the selection SERVICE says 409 link_not_active), never a 503 fallback
    const groups = await rig.call(as("u-member"), "GET", `/whatsapp/links/${id}/groups`);
    assert.deepEqual([groups.status, groups.json?.error], [409, "link_not_active"], groups.text);
    assert.equal((await rig.call(as("u-viewer"), "GET", `/whatsapp/links/${id}/groups`)).status, 403);
    assert.equal((await rig.call({ key: "k-admin-only" }, "PUT", `/whatsapp/links/${id}/groups/120363000000000001@g.us`, { marked: true })).status, 403, "marking is owner-only (whatsapp-link)");
    assert.equal((await rig.call({ key: "k-admin-only" }, "GET", `/whatsapp/links/${id}/groups`)).status, 409, "an admin-scoped caller passes the READ scope; the service answers");
    assert.equal((await rig.call(null, "GET", `/whatsapp/links/${id}/groups`)).status, 401);
  } finally { await rig.close(); }
});

test("C2 unconfigured (no archiver env, invalid config): every surface is 503 after its scope check, never open", async () => {
  for (const env of [{}, { WHATSAPP_ARCHIVER_API_URL: "not a url", WHATSAPP_ARCHIVER_API_TOKEN: "short" }]) {
    const rig = await composed(env); try {
      const jid = "120363000000000001@g.us", id = "c".repeat(24);
      for (const [who, method, path, want] of [
        [null, "GET", "/whatsapp/events", 401], ["u-admin", "GET", "/whatsapp/events", 503], [{ key: "k-admin-only" }, "GET", "/whatsapp/events", 503], ["u-member", "GET", "/whatsapp/events", 403], ["u-viewer", "GET", "/whatsapp/events", 403],
        [null, "GET", "/whatsapp/links", 401], ["u-member", "GET", "/whatsapp/links", 503], ["u-admin", "GET", "/whatsapp/links", 503], ["u-viewer", "GET", "/whatsapp/links", 403],
        ["u-member", "GET", "/whatsapp/links/notice", 503], [{ key: "k-admin-only" }, "GET", "/whatsapp/links/notice", 403], ["u-viewer", "GET", "/whatsapp/links/notice", 403],
        ["u-member", "POST", "/whatsapp/links", 503], ["u-viewer", "POST", "/whatsapp/links", 403],
        ["u-member", "GET", `/whatsapp/links/${id}/connect`, 503], [{ key: "k-admin-only" }, "GET", `/whatsapp/links/${id}/connect`, 403],
        ["u-admin", "POST", `/whatsapp/links/${id}/approve`, 503], ["u-member", "POST", `/whatsapp/links/${id}/approve`, 403], ["u-viewer", "POST", `/whatsapp/links/${id}/revoke`, 403],
        ["u-member", "GET", `/whatsapp/links/${id}/groups`, 503], ["u-viewer", "GET", `/whatsapp/links/${id}/groups`, 403], [null, "GET", `/whatsapp/links/${id}/groups`, 401],
        ["u-member", "PUT", `/whatsapp/links/${id}/groups/${jid}`, 503], [{ key: "k-admin-only" }, "PUT", `/whatsapp/links/${id}/groups/${jid}`, 403], [{ key: "k-admin-only" }, "GET", `/whatsapp/links/${id}/groups`, 503],
        ["u-member", "GET", `/whatsapp/links/${id}/groups/${jid}/people`, 503], ["u-member", "PUT", `/whatsapp/links/${id}/groups/${jid}/people`, 503], [{ key: "k-admin-only" }, "PUT", `/whatsapp/links/${id}/groups/${jid}/people`, 403],
      ] as const) {
        const r = await rig.call(who === null ? null : typeof who === "string" ? as(who) : who, method, path, method === "GET" ? undefined : {});
        assert.equal(r.status, want, `${who ?? "anon"} ${method} ${path} -> ${r.status} ${r.text}`);
        if (want === 503) assert.equal(r.json?.error, "workflow_unavailable");
      }
    } finally { await rig.close(); }
  }
});
