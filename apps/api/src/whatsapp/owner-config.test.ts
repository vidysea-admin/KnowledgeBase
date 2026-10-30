import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConfiguredWhatsAppOwnerResolver as createResolver, WhatsAppUnavailableError, WhatsAppNotConfiguredError,
  createDbBackedWhatsAppOwners, createLinkBackedWhatsAppOwnerResolver, parseWhatsAppOwnerMap, seedLegacyWhatsAppLinks,
  whatsAppCallerFromAuth, type ActiveLinkRow, type WhatsAppCaller,
} from "./owner-config.js";
const A = "111111111111111111111111", B = "222222222222222222222222";
test("missing mapping denies, exact authenticated tenant resolves only explicit owner", async () => {
  for (const raw of [undefined, "", "  ", "[]"]) assert.equal(await createResolver(raw)("a"), null);
  const resolve = createResolver(JSON.stringify([{tenantId:"a",ownerUserId:A},{tenantId:"b",ownerUserId:B}]));
  assert.equal(await resolve("a"),A); assert.equal(await resolve("b"),B);
  assert.equal(await resolve("unknown"),null); assert.equal(await resolve(" a"),null);
});
test("invalid grants and duplicate owners refuse without echoing configuration", () => {
  const invalid: unknown[] = [null, {}, [null], [{tenantId:"",ownerUserId:A}], [{tenantId:" a",ownerUserId:A}], [{tenantId:"a",ownerUserId:1}], [{tenantId:"a",ownerUserId:"invalid"}], [{tenantId:"a",ownerUserId:A,extra:true}], [{tenantId:"a",ownerUserId:A},{tenantId:"a",ownerUserId:B}], [{tenantId:"a",ownerUserId:A},{tenantId:"b",ownerUserId:A}]];
  for (const value of invalid) assert.throws(()=>createResolver(JSON.stringify(value)),{message:"Invalid WHATSAPP_TENANT_OWNER_MAP configuration"});
  assert.throws(()=>createResolver("{"),{message:"Invalid WHATSAPP_TENANT_OWNER_MAP configuration"});
  const owner="ABCDEFABCDEFABCDEFABCDEF";
  assert.throws(()=>createResolver(JSON.stringify([{tenantId:"a",ownerUserId:owner},{tenantId:"b",ownerUserId:owner.toLowerCase()}])));
});

// ---- W4 wa-owner-resolver (R-24, R-25): link-backed owner SET; the env map is a boot seed only ----
const OA = "aaaaaaaaaaaaaaaaaaaaaaaa", OB = "bbbbbbbbbbbbbbbbbbbbbbbb", OL = "cccccccccccccccccccccccc", OS = "dddddddddddddddddddddddd", OX = "eeeeeeeeeeeeeeeeeeeeeeee";
const row = (id: string, userId: string | null, owner: string | undefined, over: Partial<ActiveLinkRow> = {}): ActiveLinkRow =>
  ({ _id: id, tenantId: "T", userId, state: "active", archiverOwnerId: owner, ...over });
const ROWS: ActiveLinkRow[] = [
  row("1".repeat(24), "u1", OA), row("2".repeat(24), "u2", OB), row("3".repeat(24), null, OL),
  row("4".repeat(24), "u3", OS, { state: "suspended" }), row("5".repeat(24), "ux", OX, { tenantId: "OTHER" }),
];
const reader = (rows: ActiveLinkRow[] = ROWS) => async (tenant: string) => rows.filter(r => r.tenantId === tenant);
const owners = async (caller: WhatsAppCaller | undefined, tenant = "T", rows?: ActiveLinkRow[]) =>
  (await createLinkBackedWhatsAppOwnerResolver(reader(rows))(tenant, caller)).map(g => g.ownerUserId).sort();

test("R-25: admin session resolves every active link of the tenant, none from other tenants or non-active states", async () => {
  assert.deepEqual(await owners({ kind: "session", userId: "boss", admin: true }), [OA, OB, OL]);
});
test("R-25: member session resolves only its own link; legacy and others' links are never included", async () => {
  assert.deepEqual(await owners({ kind: "session", userId: "u1", admin: false }), [OA]);
  assert.deepEqual(await owners({ kind: "session", userId: "u2", admin: false }), [OB]);
});
test("R-25: a Bearer key (or no caller) resolves legacy links only; with whatsapp-admin it resolves all", async () => {
  assert.deepEqual(await owners({ kind: "key", admin: false }), [OL]);
  assert.deepEqual(await owners(undefined), [OL]);
  assert.deepEqual(await owners({ kind: "key", admin: true }), [OA, OB, OL]);
});
test("empty sets are refused (not_configured), never widened to other owners", async () => {
  await assert.rejects(() => owners({ kind: "session", userId: "nobody", admin: false }), WhatsAppNotConfiguredError);
  await assert.rejects(() => owners({ kind: "session", userId: "u3", admin: false }), WhatsAppNotConfiguredError); // only a suspended link
  await assert.rejects(() => owners({ kind: "session", userId: "ux", admin: false }), WhatsAppNotConfiguredError); // link lives in another tenant
  await assert.rejects(() => owners({ kind: "session", userId: "boss", admin: true }, "NO-LINKS"), WhatsAppNotConfiguredError);
  await assert.rejects(() => owners({ kind: "key", admin: true }, "NO-LINKS"), WhatsAppNotConfiguredError);
  await assert.rejects(() => owners({ kind: "key", admin: false }, "T", ROWS.filter(r => r.userId !== null)), WhatsAppNotConfiguredError);
});
test("a reader returning other tenants' rows, unprovisioned rows or malformed owner ids cannot widen the set", async () => {
  const dirty = [...ROWS, row("6".repeat(24), "u1", undefined), row("7".repeat(24), "u1", "not-hex"), row("8".repeat(24), "u1", OA.toUpperCase())];
  const leaky = createLinkBackedWhatsAppOwnerResolver(async () => dirty); // ignores the tenant entirely
  const ids = async (caller: WhatsAppCaller) => (await leaky("T", caller)).map(g => g.ownerUserId).sort();
  assert.deepEqual(await ids({ kind: "session", userId: "boss", admin: true }), [OA, OB, OL]); // OX is tenant OTHER: dropped by the row tenant check
  assert.deepEqual(await ids({ kind: "session", userId: "u1", admin: false }), [OA]);
  assert.deepEqual(await ids({ kind: "session", userId: "ux", admin: false }).then(() => "leaked", () => "refused"), "refused");
});
test("whatsAppCallerFromAuth: session needs a userId; admin only from the exact whatsapp-admin scope; a session without userId fails closed", () => {
  assert.deepEqual(whatsAppCallerFromAuth({ tenantId: "T", scopes: ["whatsapp"], principal: "session", userId: "u1" }), { kind: "session", userId: "u1", admin: false });
  assert.deepEqual(whatsAppCallerFromAuth({ tenantId: "T", scopes: ["whatsapp", "whatsapp-admin"], principal: "session", userId: "u1" }), { kind: "session", userId: "u1", admin: true });
  assert.deepEqual(whatsAppCallerFromAuth({ tenantId: "T", scopes: ["whatsapp-admin"] }), { kind: "key", admin: true });
  assert.deepEqual(whatsAppCallerFromAuth({ tenantId: "T", scopes: ["whatsapp"] }), { kind: "key", admin: false });
  assert.deepEqual(whatsAppCallerFromAuth({ tenantId: "T", scopes: ["whatsapp-admin"], principal: "session" }), { kind: "key", admin: false });
  assert.deepEqual(whatsAppCallerFromAuth(undefined), { kind: "key", admin: false });
});

// In-memory equality-only Db: exercises the real scoped link accessors (tenant pin included).
function fakeLinkDb(failFind = false) {
  const table: Array<Record<string, unknown>> = [];
  const match = (r: Record<string, unknown>, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db = { collection: () => ({
    find: (f: Record<string, unknown>) => ({ toArray: async () => { if (failFind) throw new Error("secret-host:27017 down"); return table.filter(r => match(r, f)); } }),
    insertOne: async (doc: Record<string, unknown>) => {
      if (table.some(r => r.archiverOwnerId === doc.archiverOwnerId)) throw Object.assign(new Error("dup"), { code: 11000 });
      table.push(doc); return { acknowledged: true };
    },
  }) } as never;
  return { db, table };
}
const quietLog = () => { const lines: string[] = []; return { lines, log: { info: (m: string) => { lines.push(`info:${m}`); }, warn: (m: string) => { lines.push(`warn:${m}`); } } }; };
const MAP = JSON.stringify([{ tenantId: "a", ownerUserId: A }, { tenantId: "b", ownerUserId: B }]);
const KEY: WhatsAppCaller = { kind: "key", admin: false };

test("parseWhatsAppOwnerMap: no map -> no entries; an invalid map still fails with the same message", () => {
  assert.deepEqual(parseWhatsAppOwnerMap(undefined), []); assert.deepEqual(parseWhatsAppOwnerMap("  "), []);
  assert.deepEqual(parseWhatsAppOwnerMap(MAP), [{ tenantId: "a", ownerUserId: A }, { tenantId: "b", ownerUserId: B }]);
  assert.throws(() => parseWhatsAppOwnerMap("{"), { message: "Invalid WHATSAPP_TENANT_OWNER_MAP configuration" });
  assert.throws(() => createDbBackedWhatsAppOwners({ rawMap: '[{"tenantId":"a"}]', db: fakeLinkDb().db }), { message: "Invalid WHATSAPP_TENANT_OWNER_MAP configuration" });
});
test("first boot seeds one active legacy link per map entry and logs it; second boot creates nothing", async () => {
  const { db, table } = fakeLinkDb(); const { lines, log } = quietLog();
  const first = createDbBackedWhatsAppOwners({ rawMap: MAP, db, log });
  assert.deepEqual((await first("a", KEY)).map(g => g.ownerUserId), [A]);
  assert.deepEqual((await first("b", KEY)).map(g => g.ownerUserId), [B]);
  assert.equal(table.length, 2);
  for (const l of table) { assert.equal(l.userId, null); assert.equal(l.state, "active"); assert.equal(l.live, true); assert.equal(l.approvedBy, "system:env-seed"); }
  assert.equal(lines.filter(l => l.startsWith("info:")).length, 2);
  assert.ok(lines.every(l => !l.includes(A) && !l.includes(B)), "owner ids are redacted in logs");
  await createDbBackedWhatsAppOwners({ rawMap: MAP, db, log })("a", KEY);
  assert.equal(table.length, 2, "second boot creates nothing");
});
test("an env map that disagrees with existing links is ignored with a warning; links stay authoritative", async () => {
  const { db, table } = fakeLinkDb(); const { lines, log } = quietLog();
  table.push({ _id: "9".repeat(24), tenantId: "a", userId: "u1", state: "active", live: true, archiverOwnerId: OA });
  const resolve = createDbBackedWhatsAppOwners({ rawMap: JSON.stringify([{ tenantId: "a", ownerUserId: A }]), db, log });
  assert.deepEqual((await resolve("a", { kind: "session", userId: "u1", admin: false })).map(g => g.ownerUserId), [OA]);
  await assert.rejects(() => resolve("a", KEY), WhatsAppNotConfiguredError); // the map owner is never granted
  assert.equal(table.length, 1); assert.ok(lines.some(l => l.startsWith("warn:") && l.includes("ignored")));
});
test("a seed colliding with an owner already linked elsewhere warns and creates nothing", async () => {
  const { lines, log } = quietLog();
  const created = await seedLegacyWhatsAppLinks([{ tenantId: "a", ownerUserId: A }], {
    listLinks: async () => [], insertLegacyLink: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); },
  }, log);
  assert.equal(created, 0); assert.ok(lines.some(l => l.startsWith("warn:")));
});
test("no map and no links -> not_configured as today; a DB failure is unavailable and does not leak the cause", async () => {
  await assert.rejects(() => createDbBackedWhatsAppOwners({ rawMap: undefined, db: fakeLinkDb().db })("a", KEY), WhatsAppNotConfiguredError);
  const err = await createDbBackedWhatsAppOwners({ rawMap: undefined, db: fakeLinkDb(true).db, log: quietLog().log })("a").then(() => null, (e: unknown) => e) as Error;
  assert.ok(err instanceof WhatsAppUnavailableError && !(err instanceof WhatsAppNotConfiguredError));
  assert.doesNotMatch(err.message, /secret-host/);
});
