#!/usr/bin/env node
/**
 * scripts/mint-key.mjs — mint ONE real API key and print it once. Nothing else.
 *
 * Deliberately separate from `seed-demo-server.mjs`, which also REBUILDS `tree_index` from the
 * live sessions. A verification run must never mutate the content it is about to measure (plan
 * §9 Phase 0a: "the checker may not run seed-demo-server.mjs or seed any data" -- that is the
 * exact bypass that made an earlier 'verified live' claim misleading). Minting a credential is
 * not seeding content, so this script exists to make `live-verify.mjs` runnable without it.
 *
 * Usage: node scripts/mint-key.mjs [--tenant toc] [--label live-verify]
 */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import "dotenv/config";
import { register } from "tsx/esm/api";

register();

const ALL_SCOPES = [
  "ask", "compete", "sources", "sessions", "search", "citations", "webhooks",
  "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest",
  // T-039 dedicated write scope for POST /calendar/send-now (Approver ruling 2026-10-12). Not in any default key; a key must be minted with it.
  "send-now",
];

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const tenantId = argOf("tenant", "toc");
const label = argOf("label", "live-verify");

const { connect, getDb, assertValidTenantId } = await import("../packages/db/src/index.ts");

// Same validator the data accessor uses (ISS-AUTHTENANT-002): refuse BEFORE connecting or touching api_keys, with a clean message and exit 1.
try { assertValidTenantId(tenantId, "mint-key --tenant"); }
catch (err) { console.error(`mint-key: ${err.message}`); process.exit(1); }

const url = process.env.MONGODB_URL;
if (!url) throw new Error("MONGODB_URL not set in environment/.env");
await connect(url, process.env.MONGODB_DB ?? "lkb");

const rawKey = `lv_${randomBytes(24).toString("hex")}`;
const db = getDb();
// Replace any prior key with this same label so repeated verification runs do not accumulate
// credentials; never touches keys with a different label.
await db.collection("api_keys").deleteMany({ tenantId, label });
await db.collection("api_keys").insertOne({
  _id: randomUUID(),
  tenantId,
  keyHash: createHash("sha256").update(rawKey, "utf8").digest("hex"),
  scopes: ALL_SCOPES,
  label,
  createdAt: new Date().toISOString(),
  revokedAt: null,
});

console.log(rawKey);
process.exit(0);
