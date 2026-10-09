/** Insert-only initialization of reviewed source recovery into an explicit isolated work DB. */
import {requireWorkDatabase} from "./transcript-provenance.mjs";
import {assertRecoveryPacketVerified} from "./toc-recovery.mjs";
export const RECOVERY_COLLECTIONS = ["sources", "sessions", "turns", "session_pages", "claims", "gaps", "tree_index"];
function requireTrue(test, message) {if (!test) throw new Error(message);}
export function requireRecoveryDatabase(env) {
  const target = requireWorkDatabase(env), url = new URL(target.url);
  requireTrue(url.protocol === "mongodb:" && url.hostname === "127.0.0.1" && url.port === "27019" &&
    !url.username && !url.password && (!url.pathname || url.pathname === "/") && !url.search &&
    /^lkb_work_[a-zA-Z0-9_-]+$/.test(target.dbName), "recovery requires task-owned isolated loopback database");
  return target;
}
function validateSnapshot(packet) {
  assertRecoveryPacketVerified(packet);
  const documents = structuredClone(packet.documents), manifest = structuredClone(packet.manifest);
  requireTrue(manifest.tenantId === "toc" && manifest.validTurns === 3424 && manifest.sourceTurns === 3427 &&
    manifest.reviewedClaimIds.length === 7 && manifest.unresolvedClaimIds.length === 65, "invalid import disposition");
  for (const name of RECOVERY_COLLECTIONS) {
    const rows = documents[name];
    requireTrue(Array.isArray(rows) && rows.length === manifest.counts[name] && new Set(rows.map(d => d._id)).size === rows.length &&
      rows.every(d => d.tenantId === "toc" && typeof d._id === "string" && d._id && d.recovery?.packetId === manifest.packetId),
      "invalid import ownership/count/identity");
  }
  const root = documents.tree_index[0];
  requireTrue(documents.tree_index.length === 1 && root.node_id === "tenant:toc" && root.level === "tenant", "invalid import root identity");
  const sessions = new Set(documents.sessions.map(s => s._id)), ids = new Set();
  const visit = node => {
    requireTrue(node && typeof node.node_id === "string" && !ids.has(node.node_id) && Array.isArray(node.children), "invalid tree node");
    ids.add(node.node_id);
    if (node.level === "session") requireTrue(sessions.delete(node.evidence?.sessionRef), "unknown/duplicate tree session");
    node.children.forEach(visit);
  };
  visit(root); requireTrue(sessions.size === 0, "tree missing recovered session");
  return {documents, manifest};
}
/** Metadata-only emptiness counts are the admin boundary; content writes always use scoped(). */
export async function importRecoveryPacket(packet, {db, scoped, dbName, record, beforeWrites}) {
  const {documents, manifest} = validateSnapshot(packet);
  requireTrue(db?.databaseName === dbName && /^lkb_work_[a-zA-Z0-9_-]+$/.test(dbName) && typeof scoped === "function" &&
    typeof record === "function", "explicit isolated DB and durable receipt required");
  const counts = Object.fromEntries(RECOVERY_COLLECTIONS.map(name => [name, 0]));
  const receipt = {version: 1, packetId: manifest.packetId, tenantId: "toc", dbName, status: "preflight",
    expectedCounts: manifest.counts, confirmedCounts: counts, semanticAcceptance: false, strictIndexAcceptance: false,
    note: "Insert-only initialization; preflight refusal preserves prior rows; cross-collection writes are not transactional."};
  await record(structuredClone(receipt));
  let preflightPassed = false;
  try {
    for (const name of RECOVERY_COLLECTIONS) {
      requireTrue(await db.collection(name).countDocuments({}) === 0, "destination knowledge not empty; import/retry refused");
    }
    preflightPassed = true;
    // Test seam mutates on-disk packet, not the frozen same-buffer snapshot used below.
    if (beforeWrites) await beforeWrites();
    receipt.status = "writing"; await record(structuredClone(receipt));
    for (const name of RECOVERY_COLLECTIONS) {
      const coll = scoped(db, name)("toc");
      for (let from = 0; from < documents[name].length; from += 250) {
        const batch = documents[name].slice(from, from + 250).map(({tenantId: _owner, ...doc}) => doc);
        const result = await coll.insertMany(batch);
        requireTrue(result.insertedCount === batch.length, "incomplete insert result; recovery receipt requires investigation");
        counts[name] += result.insertedCount;
        await record(structuredClone(receipt));
      }
    }
    receipt.status = "inserted-source-recovery";
    receipt.completedAt = new Date().toISOString(); await record(structuredClone(receipt)); return receipt;
  } catch (error) {
    receipt.status = preflightPassed ? "failed-after-preflight-may-be-partial" : "refused-before-writes";
    receipt.failure = "Recovery refused or interrupted; inspect scoped observed counts and the preserved packet before retry.";
    receipt.observedCounts = {};
    if (preflightPassed) for (const name of RECOVERY_COLLECTIONS) {
      try {receipt.observedCounts[name] = await scoped(db, name)("toc").countDocuments({});}
      catch {receipt.observedCounts[name] = null;}
    }
    await record(structuredClone(receipt)); throw error;
  }
}
