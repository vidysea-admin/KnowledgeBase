/**
 * [C6]/[C1] live probe — builds the REAL GET /graph payload through the same
 * createMongoGraphReadDeps() the route uses, and asserts the 2026-09-24 webinar reaches it.
 * Run: node qa/evidence/brain-knowledge-graph-2026-09-24/c06-live-graph.mjs [tenantId]
 */
import "dotenv/config";
import { register } from "tsx/esm/api";
register();
const tenantId = process.argv[2] || "toc";
const { connect, close } = await import("../../../packages/db/src/client.js");
const { createMongoGraphReadDeps } = await import("../../../apps/api/src/store.js");
await connect(process.env.MONGODB_URL || "mongodb://localhost:27017", process.env.MONGODB_DB || "lkb");
try {
  const g = await createMongoGraphReadDeps().loadGraph(tenantId);
  if (!g) { console.log(`tenant ${tenantId}: loadGraph -> null (route would 404)`); }
  else {
    const byKind = {};
    for (const n of g.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    const byType = {};
    for (const e of g.edges) byType[e.type] = (byType[e.type] ?? 0) + 1;
    console.log(`tenant ${tenantId}: ${g.nodes.length} nodes / ${g.edges.length} edges`);
    console.log("  node kinds:", JSON.stringify(byKind));
    console.log("  edge types:", JSON.stringify(byType));
    console.log("  stats:", JSON.stringify(g.stats).slice(0, 400));
    console.log("  labelled nodes:", g.nodes.filter((n) => n.label && n.label.length > 0).length, "of", g.nodes.length);
    const zoho = g.nodes.find((n) => n.id.includes("zoho-next-european-study-destinations"));
    console.log("  [C6] 2026-09-24 zoho node:", zoho ? JSON.stringify(zoho) : "ABSENT");
    const withEvidence = g.edges.filter((e) => (e.evidence?.length ?? 0) > 0);
    console.log("  [C3] edges carrying evidence turnIds:", withEvidence.length, withEvidence[0] ? JSON.stringify(withEvidence[0]).slice(0, 220) : "");
    console.log("  [C4] inferred edges:", g.edges.filter((e) => e.inferred).length, "of", g.edges.length);
  }
} finally { await close(); }
