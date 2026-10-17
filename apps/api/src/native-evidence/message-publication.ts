/** DB-only approval callback: candidate, claim and bounded tree publication share one transaction. */
import { isDeepStrictEqual } from "node:util";
import type { Db, ClientSession } from "mongodb";
import type { Claims, Sources, Turns } from "@lkb/core";
import { withTenant } from "@lkb/db";
import { treeIndexRootFilter } from "../../../../packages/index/src/tree/build.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { checkEvidence } from "../whatsapp/review/store.js";
import type { WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { messageBranch, messageRevision } from "./message-revision.js";

interface Node { node_id: string; level: string; title: string; summary: string; children: Node[]; evidence?: Record<string, unknown>; [key: string]: unknown }
interface Root extends Node { _id: string; tenantId: string; indexRevision?: number }
const fail = (): never => { throw new Error("whatsapp_native_publication_unavailable"); };

function validate(root: Root, tenantId: string) {
  const expected = treeIndexRootFilter(tenantId);
  if (root.tenantId !== tenantId || root.node_id !== expected.node_id || root.level !== expected.level || typeof root._id !== "string"
    || Buffer.byteLength(JSON.stringify(root), "utf8") > 8_000_000
    || (root.indexRevision !== undefined && (!Number.isSafeInteger(root.indexRevision) || root.indexRevision < 0 || root.indexRevision >= Number.MAX_SAFE_INTEGER))) fail();
  const seen = new Set<string>(), stack = [{ node: root as Node, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node.node_id !== "string" || typeof node.title !== "string" || typeof node.summary !== "string"
      || !Array.isArray(node.children) || seen.has(node.node_id) || seen.size >= 10000 || depth > 64
      || (node.tenantId !== undefined && node.tenantId !== tenantId)) fail();
    seen.add(node.node_id); for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
}

export async function publishApprovedMessage({ candidate, db, session }: {
  candidate: Readonly<WhatsAppReviewCandidate>; db: Db; session: ClientSession;
}): Promise<void> {
  if (candidate.kind === "attachment") return;
  const tenantId = candidate.tenantId;
  const stored = await db.collection<WhatsAppReviewCandidate>("whatsapp_candidates")
    .findOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: candidate._id }), { session });
  // Legacy direct materializer calls cannot upgrade a still-pending persisted decision.
  if (!stored || stored.status !== "approved") return;
  if (!session || typeof session.inTransaction !== "function" || !session.inTransaction()) fail();
  if (!isDeepStrictEqual(stored, candidate)) fail();
  await checkEvidence(db, tenantId, stored, session);
  if (stored.evidence.length !== 1) fail();
  const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: stored.sourceId }), { session });
  const turn = await db.collection<Turns>("turns").findOne(withTenant<Turns>(tenantId, { _id: stored.evidence[0]!.turnId, sessionId: stored.sessionId }), { session });
  if (!source || !turn) return fail();
  if (source.consent?.given !== true) return fail();
  const reads = new Proxy(db, { get(target, key) {
    if (key !== "collection") fail();
    return (name: string) => {
      const coll = target.collection(name);
      return { findOne: (filter: object, options: object = {}) => coll.findOne(filter, { ...options, session }),
        find: (filter: object, options: object = {}) => coll.find(filter, { ...options, session }) };
    };
  } });
  const claim = await db.collection<Claims>("claims").findOne(withTenant<Claims>(tenantId, { _id: `wa-claim:${candidate._id.replace(/^wa-review:/u, "")}` }), { session });
  if (!claim || !await createKnowledgeVisibility(reads).claimVisible(tenantId, claim)) fail();
  const revisionHash = messageRevision(tenantId, source, stored, turn);
  const identity = { sourceId: source._id, revisionHash, threadId: turn.sessionId, messageId: turn._id };
  const branch: Node = messageBranch(tenantId, candidate._id, identity, turn.text), node_id = branch.node_id;
  if (!branch.children.length) fail();
  const filter = treeIndexRootFilter(tenantId), collection = db.collection<Root>("tree_index");
  const roots = await collection.find(filter, { session, limit: 2 }).toArray(); if (roots.length > 1) fail();
  const previous = roots[0]; if (previous) validate(previous, tenantId);
  const existing = previous?.children.find(node => node.node_id === node_id);
  if (existing) { if (!isDeepStrictEqual(existing, branch)) fail(); return; }
  const root: Root = { ...(previous ?? { _id: `tenant-root:${encodeURIComponent(tenantId)}`, ...filter, title: "Knowledge", summary: "", children: [] }),
    indexRevision: (previous?.indexRevision ?? 0) + 1, children: [...(previous?.children ?? []), branch] };
  validate(root, tenantId);
  const result = await collection.updateOne({ ...filter, _id: root._id,
    ...(previous ? { indexRevision: previous.indexRevision === undefined ? { $exists: false } : previous.indexRevision } : { indexRevision: { $exists: false } }) },
  { $set: root }, { session, upsert: !previous });
  if (!result.acknowledged || (previous ? result.matchedCount !== 1 || result.modifiedCount !== 1 : result.upsertedCount !== 1)) fail();
  const persisted = await collection.findOne({ ...filter, _id: root._id }, { session });
  if (!persisted || !isDeepStrictEqual(persisted, root)) fail();
}

export async function revokeNativeMessage(candidateId: string, tenantId: string, db: Db, session: ClientSession): Promise<void> {
  if (!session || typeof session.inTransaction !== "function" || !session.inTransaction()) fail();
  const filter = treeIndexRootFilter(tenantId), collection = db.collection<Root>("tree_index");
  const roots = await collection.find(filter, { session, limit: 2 }).toArray(); if (roots.length > 1) fail();
  const previous = roots[0]; if (!previous) return; validate(previous, tenantId);
  const children = previous.children.filter(node => !(node.level === "native-source"
    && (node.nativePublication as { kind?: string; candidateId?: string } | undefined)?.kind === "message"
    && (node.nativePublication as { candidateId?: string }).candidateId === candidateId));
  if (children.length === previous.children.length) return;
  const root = { ...previous, children, indexRevision: (previous.indexRevision ?? 0) + 1 }; validate(root, tenantId);
  const result = await collection.updateOne({ ...filter, _id: root._id,
    indexRevision: previous.indexRevision === undefined ? { $exists: false } : previous.indexRevision }, { $set: root }, { session });
  if (!result.acknowledged || result.matchedCount !== 1 || result.modifiedCount !== 1) fail();
  const after = await collection.findOne({ ...filter, _id: root._id }, { session });
  if (!isDeepStrictEqual(after, root)) fail();
}
