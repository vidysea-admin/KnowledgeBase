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
 * Usage: node scripts/mint-key.mjs [--tenant toc] [--label live-verify] [--with-scope send-now] [--with-scope join-rules]
 *   Default keys never hold a dedicated write scope; ask for it by name (repeatable, or comma list). Unknown names exit 1.
 *   send-now can launch a recording bot; join-rules lets a key edit the join rules (PUT/POST). Without it /join-rules opens read-only.
 *   Database: no default. An isolated MONGO_WORK_DB (or lkb_staging with LKB_ALLOW_STAGING) is used without a flag; `lkb` needs
 *   --i-know-this-is-production AND MONGODB_DB=lkb exactly (D-150); anything else is refused before connecting.
 *   Editor key:  node scripts/mint-key.mjs --tenant toc --label join-rules-editor --with-scope join-rules
 */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import "dotenv/config";
import { register } from "tsx/esm/api";

register();

const { scopesFromArgv } = await import("./lib/mint-scopes.mjs");
const { requireScriptDatabase } = await import("./lib/transcript-provenance.mjs");

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

let scopes;
try { scopes = scopesFromArgv(process.argv.slice(2)); }
catch (err) { console.error(`mint-key: ${err.message}`); process.exit(1); }
const tenantId = argOf("tenant", "toc");
const label = argOf("label", "live-verify");

const { connect, getDb, assertValidTenantId } = await import("../packages/db/src/index.ts");

// Same validator the data accessor uses (ISS-AUTHTENANT-002): refuse BEFORE connecting or touching api_keys, with a clean message and exit 1.
try { assertValidTenantId(tenantId, "mint-key --tenant"); }
catch (err) { console.error(`mint-key: ${err.message}`); process.exit(1); }

// ISS-LEGACYSEED-002 (D-150): no lkb default. Work/staging DBs only, unless --i-know-this-is-production AND MONGODB_DB=lkb exactly.
// Refuses (exit 1) BEFORE connecting or touching api_keys.
let target;
try { target = requireScriptDatabase(process.env, process.argv.slice(2), {allowProduction: true}); }
catch (err) { console.error(`mint-key: ${err.message}`); process.exit(1); }
await connect(target.url, target.dbName);

const rawKey = `lv_${randomBytes(24).toString("hex")}`;
const db = getDb();
// Replace any prior key with this same label so repeated verification runs do not accumulate
// credentials; never touches keys with a different label.
await db.collection("api_keys").deleteMany({ tenantId, label });
await db.collection("api_keys").insertOne({
  _id: randomUUID(),
  tenantId,
  keyHash: createHash("sha256").update(rawKey, "utf8").digest("hex"),
  scopes,
  label,
  createdAt: new Date().toISOString(),
  revokedAt: null,
});

console.log(rawKey);
process.exit(0);
