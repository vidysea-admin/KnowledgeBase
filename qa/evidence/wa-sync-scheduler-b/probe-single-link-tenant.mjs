// checker probe (scratch copy only): tenant whose ONLY link is unlinked with a pending archiver unlink
import { MongoClient } from "mongodb";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { createRequire } from "node:module";
import { runCycle, createWiredDeps } from "./sync-links.mjs";
const { applyWhatsappLinks } = createRequire(import.meta.url)("../../migrations/20261029120000-whatsapp-links.cjs");
const client = await new MongoClient("mongodb://127.0.0.1:27199/?replicaSet=w9bchk").connect();
const db = client.db(`lkb_test_w9_${Date.now()}`);
try {
  await applyWhatsappLinks(db);
  const at = "2026-10-30T10:00:00.000Z", OA = "1".repeat(24), LA = "a".repeat(24);
  const calls = [];
  const archiver = { getSession: async () => null, unlinkSession: async (o) => { calls.push(["unlink", o]); return {}; } };
  const row = { tenantId: "solo-tenant", _id: LA, userId: "u1", label: "t", state: "unlinked", live: false, studentData: "no", archiverOwnerId: OA, approvedBy: "admin", approvedAt: at, activatedAt: at, unlinkedAt: at, unlinkedBy: "u1", unlinkedReason: "owner_request", createdAt: at, updatedAt: at, archiverUnlinkPending: true };
  try { await db.collection("whatsapp_links").insertOne(row); } catch (e) { console.log("strict insert rejected:", e.message.slice(0, 80)); await db.collection("whatsapp_links").insertOne(row, { bypassDocumentValidation: true }); }
  const deps = await createWiredDeps({ db, env: {}, root: mkdtempSync(join(tmpdir(), "w9chk-")), log: (l) => console.log("log:", l), archiver, storeOptions: { listGroups: async () => [], fetchMessages: async () => [] } });
  console.log("tenants listed:", JSON.stringify(await deps.listTenantIds()));
  console.log("pendingUnlinks(solo-tenant) directly:", JSON.stringify(await deps.pendingUnlinks("solo-tenant")));
  await runCycle(deps);
  console.log("unlink calls after a full cycle:", JSON.stringify(calls));
  console.log("flag still set:", (await db.collection("whatsapp_links").findOne({ _id: LA })).archiverUnlinkPending);
} finally { await db.dropDatabase(); await client.close(); }
