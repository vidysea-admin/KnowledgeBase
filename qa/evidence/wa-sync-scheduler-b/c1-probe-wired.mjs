// checker B cycle-1 probes (scratch copy only, private local replica set). Wired createWiredDeps on real Mongo.
// S1 flags: another writer's flag survives a run; needs-relink added then pulled; a clean run keeps an explicit [].
// S2 mid-run: link suspended between two groups of one run -> second group never fetched, run partial/link_inactive.
// S3 lock: held lock (live holder) -> skipped/null; ENOTDIR lock dir -> failed/unknown and run row passes the strict validator.
// S4 unlink: revoked-only tenant, owner_not_found counts as confirmed, non-pending terminal row is never visited, repeated cycle makes no further calls.
import { MongoClient } from "mongodb";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { createRequire } from "node:module";
import { runCycle, createWiredDeps, createFileLock } from "./sync-links.mjs";
const { applyWhatsappLinks } = createRequire(import.meta.url)("../../migrations/20261029120000-whatsapp-links.cjs");
const URL_ = process.env.W9_TEST_MONGO_URL;
const client = await new MongoClient(URL_).connect();
const at = "2026-10-30T10:00:00.000Z";
const OA = "1".repeat(24), OB = "2".repeat(24), OC = "3".repeat(24), LA = "a".repeat(24), LB = "b".repeat(24), LC = "c".repeat(24), LD = "d".repeat(24);
const link = (tenantId, _id, state, owner, extra = {}) => ({ tenantId, _id, userId: "u-" + _id[0], label: "t", state, live: ["active", "suspended"].includes(state), studentData: "no", archiverOwnerId: owner,
  approvedBy: "admin", approvedAt: at, activatedAt: at, createdAt: at, updatedAt: at, ...extra });
const term = (tenantId, _id, state, owner, pending) => link(tenantId, _id, state, owner, { ...(state === "unlinked" ? { unlinkedAt: at, unlinkedBy: "u", unlinkedReason: "owner_request" } : { revokedAt: at, revokedBy: "admin", revokedReason: "admin_action" }), ...(pending === undefined ? {} : { archiverUnlinkPending: pending }) });
const ins = async (db, row) => { try { await db.collection("whatsapp_links").insertOne(row); } catch { await db.collection("whatsapp_links").insertOne(row, { bypassDocumentValidation: true }); } };
const mk = async () => { const db = client.db(`lkb_test_w9_${Date.now()}_${Math.floor(Math.random() * 1e6)}`); await applyWhatsappLinks(db); await db.collection("whatsapp_candidates").createIndex({ tenantId: 1, _id: 1 }); return db; };
const msg = (owner, n) => ({ messageId: `m-${owner}-${n}`, personId: `p-${owner}`, displayName: "Expert", text: `Scholarship ${n} closes Friday for ${owner.slice(0, 4)}.`, ts: "2026-10-14T10:00:00.000Z" });
const results = {}; const ok = (k, v) => { results[k] = v; console.log(k, v ? "OK" : "**FAIL**"); };
const alerts = [];
const origErr = console.error; console.error = (...a) => { alerts.push(a.join(" ")); };

// S1 flags
{
  const db = await mk(), root = mkdtempSync(join(tmpdir(), "w9b-")); let status = "logged_out";
  await ins(db, link("t1", LA, "active", OA, { health: { flags: ["quiet"] } }));
  const archiver = { getSession: async () => ({ status }), unlinkSession: async () => ({}) };
  const deps = await createWiredDeps({ db, env: {}, root, log: () => {}, archiver, storeOptions: { listGroups: async (o) => [{ groupJid: "111111-1@g.us", ownerUserId: o, subject: "S", trackedPersonCount: 1 }], fetchMessages: async (_j, o) => [msg(o, 1)] } });
  const flagsNow = async () => (await db.collection("whatsapp_links").findOne({ _id: LA })).health.flags;
  await runCycle(deps); const f1 = await flagsNow();
  ok("S1a logged_out: quiet kept, needs-relink added", f1.includes("quiet") && f1.includes("needs-relink") && new Set(f1).size === f1.length);
  ok("S1a one needs-relink alert", alerts.filter((a) => a.includes("needs-relink")).length === 1);
  await runCycle(deps); ok("S1b second logged_out cycle raises no second alert", alerts.filter((a) => a.includes("needs-relink")).length === 1);
  // another writer adds `stale`... emulate during the next run via getStatus hook
  archiver.getSession = async () => { await db.collection("whatsapp_links").updateOne({ _id: LA }, { $addToSet: { "health.flags": "stale" } }); return { status: "connected" }; };
  await runCycle(deps); const f2 = await flagsNow();
  console.log("  flags after reconnect with concurrent 'stale' writer:", JSON.stringify(f2));
  ok("S1c needs-relink pulled, quiet kept, concurrent writer's 'stale' kept or cleared only by a successful run's own logic", !f2.includes("needs-relink") && f2.includes("quiet"));
  rmSync(root, { recursive: true, force: true }); await db.dropDatabase();
}
// S2 mid-run suspension
{
  const db = await mk(), root = mkdtempSync(join(tmpdir(), "w9b-")); const fetched = [];
  await ins(db, link("t2", LB, "active", OB));
  const J1 = "111111-1@g.us", J2 = "222222-2@g.us";
  const storeOptions = { listGroups: async (o) => [J1, J2].map((g) => ({ groupJid: g, ownerUserId: o, subject: "S", trackedPersonCount: 1 })),
    fetchMessages: async (jid, o) => { fetched.push(jid); if (jid === J1) await db.collection("whatsapp_links").updateOne({ _id: LB }, { $set: { state: "suspended", live: true, suspendedAt: at, suspendedBy: "admin", suspendedReason: "admin_action" } }); return [msg(o, jid === J1 ? 1 : 2)]; } };
  const deps = await createWiredDeps({ db, env: {}, root, log: () => {}, archiver: null, storeOptions });
  const runs = await runCycle(deps);
  console.log("  S2 fetched:", JSON.stringify(fetched), "run:", JSON.stringify(runs.map((r) => [r.status, r.errorCode, r.groups.length])));
  ok("S2 second group never fetched after suspension", fetched.length === 1 && fetched[0] === J1);
  ok("S2 run partial/link_inactive and persisted", runs.length === 1 && runs[0].status === "partial" && runs[0].errorCode === "link_inactive" && (await db.collection("whatsapp_sync_runs").countDocuments({ linkId: LB })) === 1);
  rmSync(root, { recursive: true, force: true }); await db.dropDatabase();
}
// S3 lock held vs lock fault
{
  const db = await mk(), root = mkdtempSync(join(tmpdir(), "w9b-")), logs = [];
  await ins(db, link("t3", LC, "active", OC));
  const storeOptions = { listGroups: async (o) => [{ groupJid: "111111-1@g.us", ownerUserId: o, subject: "S", trackedPersonCount: 1 }], fetchMessages: async (_j, o) => [msg(o, 1)] };
  const deps = await createWiredDeps({ db, env: {}, root, log: (l) => logs.push(l), archiver: null, storeOptions });
  const lockPath = join(deps.lockDir, `link-${LC}.lock`); const other = await createFileLock(); const tok = other.acquire(lockPath);
  const r1 = await runCycle(deps); other.release(lockPath, tok);
  console.log("  S3 held:", JSON.stringify(r1.map((r) => [r.status, r.errorCode])), "logs:", JSON.stringify(logs));
  ok("S3a held lock => skipped, errorCode null, no log", r1.length === 1 && r1[0].status === "skipped" && r1[0].errorCode === null && logs.length === 0);
  // lock-dir fault: replace dir with a file
  rmSync(deps.lockDir, { recursive: true, force: true }); writeFileSync(deps.lockDir, "x");
  const r2 = await runCycle(deps);
  console.log("  S3 fault:", JSON.stringify(r2.map((r) => [r.status, r.errorCode])), "logs:", JSON.stringify(logs));
  ok("S3b ENOTDIR lock dir => failed/unknown, logged by code only", r2.length === 1 && r2[0].status === "failed" && r2[0].errorCode === "unknown" && logs.some((l) => /lock acquire failed \(/.test(l)) && !logs.some((l) => l.includes(root)));
  ok("S3c both run rows persisted under the strict validator", (await db.collection("whatsapp_sync_runs").countDocuments({ linkId: LC })) === 2);
  rmSync(root, { recursive: true, force: true }); await db.dropDatabase();
}
// S4 unlink retries
{
  const db = await mk(), root = mkdtempSync(join(tmpdir(), "w9b-")), logs = []; const calls = []; let mode = "fail";
  await ins(db, term("t4", LA, "revoked", OA, true));          // revoked-only, pending, first fail then owner_not_found
  await ins(db, term("t5", LB, "unlinked", OB, false));        // pending false -> never visited
  await ins(db, term("t6", LC, "unlinked", OC));               // flag absent -> never visited
  await ins(db, link("t7", LD, "active", "4".repeat(24)));     // active tenant, no pending
  const archiver = { getSession: async () => null, unlinkSession: async (o) => { calls.push(o); if (mode === "fail") throw Object.assign(new Error("boom upstream text"), { name: "ArchiverError", code: "archiver_api_unavailable" }); if (mode === "gone") throw Object.assign(new Error("x"), { code: "owner_not_found" }); return {}; } };
  const deps = await createWiredDeps({ db, env: {}, root, log: (l) => logs.push(l), archiver, storeOptions: { listGroups: async () => [], fetchMessages: async () => [] } });
  console.log("  S4 tenants:", JSON.stringify(await deps.listTenantIds()));
  await runCycle(deps); const still = (await db.collection("whatsapp_links").findOne({ _id: LA })).archiverUnlinkPending;
  ok("S4a failing unlink keeps the flag and logs by code only", still === true && calls.length === 1 && logs.some((l) => /retry later \(archiver_api_unreachable\)/.test(l)) && !logs.some((l) => /upstream text/.test(l)));
  mode = "gone"; await runCycle(deps); const gone = (await db.collection("whatsapp_links").findOne({ _id: LA })).archiverUnlinkPending;
  ok("S4b owner_not_found counts as confirmed, flag unset", gone === undefined && calls.length === 2);
  await runCycle(deps); ok("S4c no further calls once confirmed; non-pending terminal rows never unlinked", calls.length === 2 && !calls.includes(OB) && !calls.includes(OC));
  ok("S4d tenant no longer listed once confirmed", !(await deps.listTenantIds()).includes("t4"));
  rmSync(root, { recursive: true, force: true }); await db.dropDatabase();
}
console.error = origErr;
await client.close();
const bad = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? "FAILED: " + bad.join(", ") : "ALL PROBES OK");
