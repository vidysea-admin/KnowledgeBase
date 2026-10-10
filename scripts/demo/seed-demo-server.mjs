#!/usr/bin/env node
/**
 * scripts/demo/seed-demo-server.mjs — one-off setup for actually running apps/api against the real
 * seeded TOC data: (1) builds the tenant "toc" tree index from the real sessions/session_pages
 * already in Mongo and upserts it into tree_index (nobody had ever populated this collection),
 * (2) mints one real API key with every scope the routes check, prints the raw key ONCE (it is
 * never stored, only its sha256). Idempotent: re-running regenerates the tree and reuses/rotates
 * the demo key rather than accumulating duplicates.
 *
 * Usage: node scripts/demo/seed-demo-server.mjs
 */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import "dotenv/config";
import { register } from "tsx/esm/api";

register();

async function main() {
  const { connect, getDb, sessions, sessionPages } = await import("../../packages/db/src/index.ts");
  const { buildTree } = await import("../../packages/index/src/tree/build.ts");

  const url = process.env.MONGODB_URL;
  const dbName = process.env.MONGODB_DB ?? "lkb";
  if (!url) throw new Error("MONGODB_URL not set in environment/.env");
  await connect(url, dbName);

  const tenantId = "toc";
  const allSessions = await sessions(tenantId).find({}).toArray();
  const allPages = await sessionPages(tenantId).find({}).toArray();
  console.log(`loaded ${allSessions.length} sessions, ${allPages.length} session_pages for tenant "${tenantId}"`);

  const roots = buildTree(allSessions, allPages);
  const root = roots[tenantId];
  if (!root) throw new Error(`buildTree produced no root for tenant "${tenantId}" -- check sessions have tenantId="${tenantId}"`);

  const db = getDb();
  await db.collection("tree_index").deleteMany({ node_id: root.node_id, level: "tenant" });
  await db.collection("tree_index").insertOne(root);
  console.log(`wrote tree_index root "${root.node_id}" (${root.children.length} year node(s))`);

  const rawKey = `demo_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");
  await db.collection("api_keys").deleteMany({ tenantId, label: "demo-server" });
  await db.collection("api_keys").insertOne({
    _id: randomUUID(),
    tenantId,
    keyHash,
    scopes: ["ask", "compete", "sources", "sessions", "search", "citations", "webhooks", "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest"],
    label: "demo-server",
    createdAt: new Date().toISOString(),
    revokedAt: null,
  });
  console.log(`\nAPI key (save this, shown once): ${rawKey}`);
  console.log(`tenantId: ${tenantId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
