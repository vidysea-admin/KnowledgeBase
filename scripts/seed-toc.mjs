#!/usr/bin/env node
/**
 * scripts/seed-toc.mjs — T-002 C6. Reads data/toc-migrated/<sessionId>/{source,session,
 * turns,session_page,claims}.json (produced by the T-002 migration) and upserts them into
 * the sources/sessions/turns/session_pages/claims Mongo collections via packages/db's
 * coll(tenantId) accessors — never a raw driver call (ARCHITECTURE §5 tenant-scoping rule).
 *
 * `--dry-run` (required to PASS T-002 C6) reads every file, computes per-collection insert
 * counts, and prints them WITHOUT ever calling packages/db's connect() — same
 * unreachable-DB fallback precedent as T-018's `migrate-mongo status`. A live run (no flag)
 * connects using MONGODB_URL / MONGODB_DB (same env vars as migrate-mongo-config.cjs) and
 * inserts for real; it is not required to PASS this unit.
 *
 * packages/db is TypeScript with no build step (package.json main is src/index.ts) — this
 * plain .mjs script loads it at runtime via tsx's programmatic register() API so `node
 * scripts/seed-toc.mjs --dry-run` works with no separate compile step.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { register } from "tsx/esm/api";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const DRY_RUN = process.argv.includes("--dry-run");
// --sessions <id1,id2,...> (u1-toc-sept-catchup): scope the run to exactly the named session
// directories instead of every directory under data/toc-migrated/. seed-toc.mjs uses plain
// insertOne (no upsert, by design — T-002), so re-running it over the WHOLE directory once
// sessions are already live would throw on the first duplicate _id. This is what makes it safe
// to onboard a small new batch without touching sessions already seeded. Omitted, behavior is
// unchanged: every directory, exactly as before.
const sessionsArgIdx = process.argv.indexOf("--sessions");
const ONLY_SESSIONS = sessionsArgIdx >= 0 && process.argv[sessionsArgIdx + 1]
  ? process.argv[sessionsArgIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
  : null;

register(); // let subsequent dynamic import()s of packages/db's .ts sources resolve

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Strips tenantId — coll(tenantId).insertOne(doc) re-adds it, per scopedCollection's contract. */
function withoutTenant(doc) {
  const { tenantId, ...rest } = doc;
  return rest;
}

function loadSessionDocs() {
  let sessionIds = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (ONLY_SESSIONS) {
    const missing = ONLY_SESSIONS.filter((id) => !sessionIds.includes(id));
    if (missing.length > 0) {
      throw new Error(`--sessions named ${missing.length} id(s) with no data/toc-migrated/ directory: ${missing.join(", ")}`);
    }
    sessionIds = ONLY_SESSIONS;
  }

  const docs = { sources: [], sessions: [], turns: [], session_pages: [], claims: [] };
  for (const sessionId of sessionIds) {
    const dir = join(DATA_DIR, sessionId);
    docs.sources.push(loadJson(join(dir, "source.json")));
    docs.sessions.push(loadJson(join(dir, "session.json")));
    docs.turns.push(...loadJson(join(dir, "turns.json")));
    docs.session_pages.push(loadJson(join(dir, "session_page.json")));
    docs.claims.push(...loadJson(join(dir, "claims.json")));
  }
  return { sessionIds, docs };
}

async function seedLive(docs) {
  const { connect, close } = await import("../packages/db/src/client.js");
  const { sources } = await import("../packages/db/src/collections/sources.js");
  const { sessions } = await import("../packages/db/src/collections/sessions.js");
  const { turns } = await import("../packages/db/src/collections/turns.js");
  const { claims } = await import("../packages/db/src/collections/claims.js");
  const { sessionPages } = await import("../packages/db/src/collections/session-pages.js");

  const url = process.env.MONGODB_URL || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB || "lkb";
  await connect(url, dbName);
  try {
    const tenantId = "toc";
    const counts = {};
    for (const doc of docs.sources) { await sources(tenantId).insertOne(withoutTenant(doc)); }
    counts.sources = docs.sources.length;
    for (const doc of docs.sessions) { await sessions(tenantId).insertOne(withoutTenant(doc)); }
    counts.sessions = docs.sessions.length;
    for (const doc of docs.turns) { await turns(tenantId).insertOne(withoutTenant(doc)); }
    counts.turns = docs.turns.length;
    for (const doc of docs.session_pages) { await sessionPages(tenantId).insertOne(withoutTenant(doc)); }
    counts.session_pages = docs.session_pages.length;
    for (const doc of docs.claims) { await claims(tenantId).insertOne(withoutTenant(doc)); }
    counts.claims = docs.claims.length;
    return counts;
  } finally {
    await close();
  }
}

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.error(`FAIL: ${DATA_DIR} does not exist`);
    process.exit(1);
  }
  const { sessionIds, docs } = loadSessionDocs();

  if (DRY_RUN) {
    console.log(`seed-toc --dry-run: ${sessionIds.length} session(s)${ONLY_SESSIONS ? " (--sessions scoped)" : " under data/toc-migrated/"}`);
    console.log(`  sources:       ${docs.sources.length}`);
    console.log(`  sessions:      ${docs.sessions.length}`);
    console.log(`  turns:         ${docs.turns.length}`);
    console.log(`  session_pages: ${docs.session_pages.length}`);
    console.log(`  claims:        ${docs.claims.length}`);
    console.log("No Mongo connection attempted (--dry-run).");
    return;
  }

  console.log("Connecting to Mongo for a live seed (no --dry-run flag given)...");
  const counts = await seedLive(docs);
  console.log("Inserted:", counts);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
