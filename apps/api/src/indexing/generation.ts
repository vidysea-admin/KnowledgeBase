import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Claims, Chunks, SessionPages, SessionPageIndexArtifact, SessionIndexAttempt, Sessions, Sources, TreeIndexNode, TreeIndexRootDocument, Turns } from "@lkb/core";
import { runtimeEvidence, assertGroundedTurns, treeIndexRootFilter, buildChunks, runtimeChronologicalTurns } from "@lkb/index";
import { chunkContentId } from "./chunk-integrity.js";
import type { IndexRetrievalMode } from "./types.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";

// Stored metadata derives exclusively from the canonical schema-generated core exports.
export type IndexArtifactBinding = SessionPageIndexArtifact;
export type IndexAttempt = SessionIndexAttempt;
export type IndexArtifactManifest = NonNullable<SessionIndexAttempt["manifest"]> & { retrievalMode?: IndexRetrievalMode };
export type IndexArtifactRef = IndexArtifactManifest["page"];
export function indexAttemptBinding(attempt: IndexAttempt): IndexArtifactBinding {
  return { version: 1, generation: attempt.generation, sessionId: attempt.sessionId, sourceId: attempt.sourceId, turnDigest: attempt.turnDigest };
}
type GenerationSession = Sessions & { indexAttempt?: IndexAttempt };
type GenerationPage = SessionPages & { indexArtifact?: IndexArtifactBinding };
type GenerationClaim = Claims & { indexArtifact?: IndexArtifactBinding };
type GenerationChunk = Chunks & { indexArtifact?: IndexArtifactBinding };
type GenerationNode = TreeIndexNode & { indexArtifact?: IndexArtifactBinding };
type GenerationTree = TreeIndexRootDocument & { _id: string; indexRevision?: number };
export type IndexGenerationDb = Pick<Db, "collection">;
export class IndexGenerationError extends Error {
  constructor(readonly code: string) { super(code); }
}
const collection = <T extends { _id: string; tenantId: string }>(db: IndexGenerationDb, name: string, tenant: string) => scopedCollection<T>(db as Db, name)(tenant);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
}
/** Bind the exact effective transcript, including timing, origin and review-derived fields. */
export function indexTurnDigest(turns: Turns[]): string {
  return sha(canonical([...turns].sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd || a._id.localeCompare(b._id))));
}
export function indexArtifactDigest(doc: object): string {
  const semantic = Object.fromEntries(Object.entries(doc).filter(([key]) => !["indexArtifact", "topicRefs", "orgRefs"].includes(key)));
  return sha(canonical(semantic));
}
export function indexArtifactRef(doc: { _id: string }): IndexArtifactRef { return { id: doc._id, digest: indexArtifactDigest(doc) }; }
function sameBinding(actual: IndexArtifactBinding | undefined, expected: IndexArtifactBinding): boolean {
  return actual?.version === 1 && actual.generation === expected.generation && actual.sessionId === expected.sessionId &&
    actual.sourceId === expected.sourceId && actual.turnDigest === expected.turnDigest;
}
function validBinding(binding: IndexArtifactBinding): boolean {
  return binding.version === 1 && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.generation) && Boolean(binding.sessionId && binding.sourceId) && /^[a-f0-9]{64}$/.test(binding.turnDigest);
}
function validAttempt(attempt: IndexAttempt): boolean {
  return validBinding(attempt) && typeof attempt.strict === "boolean" && Number.isSafeInteger(attempt.turnCount) && attempt.turnCount > 0 &&
    Number.isFinite(Date.parse(attempt.startedAt)) && ["running", "complete", "failed", "uncertain"].includes(attempt.state) &&
    ["preflight", "writing"].includes(attempt.phase) && (attempt.state !== "complete" ||
      (attempt.phase === "writing" && Boolean(attempt.manifest) && typeof attempt.finishedAt === "string" && Number.isFinite(Date.parse(attempt.finishedAt))));
}
async function effective(db: IndexGenerationDb, tenant: string, sessionId: string): Promise<Turns[]> {
  return readEffectiveTurns(db, tenant, await collection<Turns>(db, "turns", tenant).find({ sessionId }).toArray(), sessionId);
}
export async function acquireIndexAttempt(db: IndexGenerationDb, tenant: string, sessionId: string, turns: Turns[], strict: boolean): Promise<IndexAttempt> {
  if (!turns.length) throw new IndexGenerationError("empty_index_transcript");
  const coll = collection<GenerationSession>(db, "sessions", tenant), session = await coll.findOne({ _id: sessionId });
  if (!session || !session.sourceId || !await collection<Sources>(db, "sources", tenant).findOne({ _id: session.sourceId })) throw new IndexGenerationError("index_source_unavailable");
  const prior = session.indexAttempt;
  if (prior && (!validAttempt(prior) || prior.sessionId !== sessionId || prior.sourceId !== session.sourceId ||
      !["complete", "failed"].includes(prior.state) || (prior.state === "failed" && prior.phase !== "preflight"))) {
    throw new IndexGenerationError("index_attempt_requires_recovery");
  }
  if (!prior && session.status.index === "processing") throw new IndexGenerationError("legacy_index_attempt_unconfirmed");
  const attempt: IndexAttempt = { version: 1, generation: randomUUID(), sessionId, sourceId: session.sourceId,
    turnDigest: indexTurnDigest(turns), strict, turnCount: turns.length, state: "running", phase: "preflight", startedAt: new Date().toISOString() };
  const previous = prior ? { "indexAttempt.generation": prior.generation, "indexAttempt.state": prior.state }
    : { indexAttempt: { $exists: false } };
  const saved = await coll.updateOne({ _id: sessionId, sourceId: attempt.sourceId, ...previous }, { $set: { indexAttempt: attempt, "status.index": "processing" } });
  if (saved.acknowledged !== true || saved.matchedCount !== 1) throw new IndexGenerationError("index_attempt_claim_unconfirmed");
  await assertIndexAttemptOwned(db, tenant, attempt);
  return attempt;
}
export async function assertIndexAttemptOwned(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt): Promise<void> {
  const session = await collection<GenerationSession>(db, "sessions", tenant).findOne({ _id: attempt.sessionId, sourceId: attempt.sourceId });
  if (!session || session.indexAttempt?.state !== "running" || !sameBinding(session.indexAttempt, attempt)) throw new IndexGenerationError("index_attempt_claim_lost");
}
export async function enterIndexWrites(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt): Promise<void> {
  await assertIndexAttemptOwned(db, tenant, attempt);
  const saved = await collection<GenerationSession>(db, "sessions", tenant).updateOne(
    { _id: attempt.sessionId, "indexAttempt.generation": attempt.generation, "indexAttempt.state": "running", "indexAttempt.phase": "preflight" },
    { $set: { "indexAttempt.phase": "writing" } });
  if (saved.acknowledged !== true || saved.matchedCount !== 1) throw new IndexGenerationError("index_attempt_write_fence_unconfirmed");
  attempt.phase = "writing";
}
export async function failIndexAttempt(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt): Promise<void> {
  // Once writes may have started, no automatic retry or timeout-based takeover can fence a late Mongo write.
  await collection<GenerationSession>(db, "sessions", tenant).updateOne(
    { _id: attempt.sessionId, "indexAttempt.generation": attempt.generation, "indexAttempt.state": "running" },
    { $set: { "indexAttempt.state": attempt.phase === "preflight" ? "failed" : "uncertain", "indexAttempt.finishedAt": new Date().toISOString(), "status.index": "failed" } });
}
/** Old reviewed claims are consumed by exact identity/digest and fresh source quotes, never stamped as new output. */
export function validatePreservedIndexClaims(claims: Claims[], turns: Turns[]): IndexArtifactRef[] {
  return claims.map(claim => {
    if (!["verified", "conflicting"].includes(claim.status)) throw new IndexGenerationError("preserved_claim_not_reviewed");
    if (claim.tenantId !== turns[0]?.tenantId || !claim._id.trim() || !claim.text.trim()) throw new IndexGenerationError("preserved_claim_source_invalid");
    // Canonical reviewed text may be a paraphrase (goal-T040 C3). Its unchanged review
    // identity/digest and exact current source quotations still bind this generation.
    // The generated-item extractive rule remains in the producer, not on preserved review.
    runtimeEvidence(claim.evidence, turns);
    return indexArtifactRef(claim);
  });
}
/** Stamp at the real tree writer; other session bindings are derived from their actual persisted page. */
export function bindIndexTree(root: TreeIndexNode, binding: IndexArtifactBinding, pages: GenerationPage[], tenantId = root.tenantId): TreeIndexNode {
  const boundedSummary = (text: string): string => {
    let result = "", bytes = 0;
    for (const point of text) {
      const size = Buffer.byteLength(point, "utf8");
      if (bytes + size > 768) break;
      result += point; bytes += size;
    }
    return result;
  };
  const visit = (node: TreeIndexNode): GenerationNode => {
    const output: GenerationNode = { ...node, children: node.children.map(visit) };
    // Routing metadata is produced from accepted pages here, never inherited from an input tree.
    if (node.evidence) {
      output.evidence = { ...node.evidence };
      delete output.evidence.routingSummary;
    }
    if (node.level === "session") {
      const id = node.evidence?.sessionRef;
      const page = pages.find(candidate => candidate.tenantId === tenantId && candidate.sessionId === id && candidate.summary === node.summary);
      const stamp = id === binding.sessionId ? binding : page?.indexArtifact;
      if (stamp && stamp.sessionId === id) output.indexArtifact = { ...stamp };
      else delete output.indexArtifact;
      if (page && stamp && stamp.sessionId === id && output.evidence) output.evidence.routingSummary = boundedSummary(page.summary);
    } else {
      const children = output.children.filter(child => typeof child.evidence?.routingSummary === "string" && child.evidence.routingSummary.length > 0);
      if (children.length) output.evidence = { ...output.evidence,
        routingSummary: boundedSummary(children.slice(0, 8).map(child => `${child.title}: ${child.evidence!.routingSummary}`).join("\n")) };
    }
    return output;
  };
  return visit(root);
}
export async function persistIndexTree(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt, root: TreeIndexRootDocument,
  base: TreeIndexRootDocument | null): Promise<number> {
  await assertIndexAttemptOwned(db, tenant, attempt);
  const coll = collection<GenerationTree>(db, "tree_index", tenant), previous = base as GenerationTree | null;
  const revision = previous?.indexRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) throw new IndexGenerationError("index_tree_revision_invalid");
  const stamped: GenerationTree = { ...root, _id: previous?._id ?? `tenant-root:${encodeURIComponent(tenant)}`, indexRevision: revision + 1 };
  if (previous) {
    const expected = previous.indexRevision === undefined ? { indexRevision: { $exists: false } } : { indexRevision: revision };
    const result = await coll.replaceOne({ ...treeIndexRootFilter(tenant), ...expected }, stamped, { upsert: false });
    if (result.acknowledged !== true || result.matchedCount !== 1) throw new IndexGenerationError("index_tree_cas_unconfirmed");
  } else {
    const result = await coll.insertOne(stamped);
    if (result.acknowledged !== true) throw new IndexGenerationError("index_tree_insert_unconfirmed");
  }
  return revision + 1;
}
function refsMatch<T extends { _id: string }>(rows: T[], refs: IndexArtifactRef[]): boolean {
  return rows.length === refs.length && new Set(rows.map(row => row._id)).size === rows.length && new Set(refs.map(ref => ref.id)).size === refs.length &&
    refs.every(ref => /^[a-f0-9]{64}$/.test(ref.digest) && rows.some(row => row._id === ref.id && indexArtifactDigest(row) === ref.digest));
}
async function actualArtifacts(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt, manifest: IndexArtifactManifest): Promise<boolean> {
  if (!validAttempt(attempt) || !Number.isSafeInteger(manifest.treeRevision) || manifest.treeRevision < 1 ||
      (manifest.retrievalMode !== undefined && !["vectorless", "vector"].includes(manifest.retrievalMode)) ||
      [manifest.chunks, manifest.claims, manifest.preservedClaims].some(refs => refs.length > 20000)) return false;
  const [turns, sources, pages, chunks, claims, roots] = await Promise.all([
    effective(db, tenant, attempt.sessionId), collection<Sources>(db, "sources", tenant).find({ _id: attempt.sourceId }).toArray(),
    collection<GenerationPage>(db, "session_pages", tenant).find({ sessionId: attempt.sessionId }).toArray(),
    collection<GenerationChunk>(db, "chunks", tenant).find({ sourceRef: attempt.sessionId }).toArray(),
    collection<GenerationClaim>(db, "claims", tenant).find({ "evidence.sessionId": attempt.sessionId }).toArray(),
    collection<GenerationTree>(db, "tree_index", tenant).find(treeIndexRootFilter(tenant)).toArray(),
  ]);
  if (sources.length !== 1 || turns.length !== attempt.turnCount || indexTurnDigest(turns) !== attempt.turnDigest) return false;
  try { assertGroundedTurns(turns, tenant, attempt.sessionId); } catch { return false; }
  if (pages.length !== 1 || !refsMatch(pages, [manifest.page]) || !sameBinding(pages[0]!.indexArtifact, attempt) || !pages[0]!.summary.trim()) return false;
  const ids = new Set(turns.map(turn => turn._id));
  if (!pages[0]!.evidence.length || pages[0]!.evidence.some(entry => entry.sessionId !== attempt.sessionId || !ids.has(entry.turnId))) return false;
  if (!chunks.length || !refsMatch(chunks, manifest.chunks) || chunks.some(chunk => !sameBinding(chunk.indexArtifact, attempt) || !chunk.turnRefs.length ||
      chunk.turnRefs.some(id => !ids.has(id))) ||
      new Set(chunks.flatMap(chunk => chunk.turnRefs)).size !== ids.size) return false;
  if (manifest.retrievalMode === "vectorless") {
    // Re-derive the physical lexical inventory from the pinned effective source, including
    // ordered turn references and content IDs; count/child success alone proves nothing.
    const plans = buildChunks(attempt.strict ? runtimeChronologicalTurns(turns) : turns);
    if (plans.length !== chunks.length || plans.some(plan => !chunks.some(chunk =>
      chunk._id === chunkContentId(tenant, attempt.sessionId, plan.turnRefs, plan.text) && chunk.chunkIndex === plan.chunkIndex &&
      JSON.stringify(chunk.turnRefs) === JSON.stringify(plan.turnRefs) &&
      chunk.vector === undefined && chunk.dims === undefined && chunk.embeddingModel === undefined))) return false;
  } else if (chunks.some(chunk => !Array.isArray(chunk.vector) || chunk.vector.length !== chunk.dims || !chunk.vector.length ||
      chunk.vector.some(value => !Number.isFinite(value)))) return false;
  const generated = claims.filter(claim => manifest.claims.some(ref => ref.id === claim._id));
  const preserved = claims.filter(claim => manifest.preservedClaims.some(ref => ref.id === claim._id));
  if (claims.length !== generated.length + preserved.length || !refsMatch(generated, manifest.claims) || !refsMatch(preserved, manifest.preservedClaims) ||
      generated.some(claim => !sameBinding(claim.indexArtifact, attempt))) return false;
  try { validatePreservedIndexClaims(preserved, turns); } catch { return false; }
  if (generated.some(claim => !claim.evidence.length || claim.evidence.some(entry => entry.sessionId !== attempt.sessionId || !ids.has(entry.turnId)))) return false;
  if (roots.length !== 1 || !Number.isSafeInteger(roots[0]!.indexRevision) || roots[0]!.indexRevision! < manifest.treeRevision) return false;
  const stack: TreeIndexNode[] = [roots[0]!], matches: GenerationNode[] = []; let count = 0;
  while (stack.length && count++ < 10000) {
    const node = stack.pop()!;
    if (node.level === "session" && node.evidence?.sessionRef === attempt.sessionId) matches.push(node);
    stack.push(...node.children);
  }
  return !stack.length && matches.length === 1 && sameBinding(matches[0]!.indexArtifact, attempt) && matches[0]!.summary === pages[0]!.summary;
}
export interface VerifiedIndexGeneration { generation: string; sessionId: string; sourceId: string; strict: boolean; turnCount: number; chunkCount: number }
/** Current persisted attempt + exact physical artifact manifest. Read-only, no indexing or receipt mutation. */
export async function verifyIndexGeneration(db: IndexGenerationDb, tenant: string, sessionId: string, generation?: string): Promise<VerifiedIndexGeneration | null> {
  try {
  const coll = collection<GenerationSession>(db, "sessions", tenant), session = await coll.findOne({ _id: sessionId });
  const attempt = session?.indexAttempt;
  if (!session || session.status.index !== "done" || attempt?.state !== "complete" || !attempt.manifest || session.sourceId !== attempt.sourceId ||
      attempt.sessionId !== sessionId || (generation && generation !== attempt.generation) || !await actualArtifacts(db, tenant, attempt, attempt.manifest)) return null;
  // A concurrent new attempt invalidates even a read that began against a formerly complete generation.
  const current = await coll.findOne({ _id: sessionId, "indexAttempt.generation": attempt.generation, "indexAttempt.state": "complete", "status.index": "done" });
  if (!current) return null;
  return { generation: attempt.generation, sessionId, sourceId: attempt.sourceId, strict: attempt.strict, turnCount: attempt.turnCount, chunkCount: attempt.manifest.chunks.length };
  } catch { return null; } // Malformed or unavailable persistence is never a positive receipt.
}
export async function finishIndexAttempt(db: IndexGenerationDb, tenant: string, attempt: IndexAttempt, manifest: IndexArtifactManifest): Promise<VerifiedIndexGeneration> {
  await assertIndexAttemptOwned(db, tenant, attempt);
  if (!await actualArtifacts(db, tenant, attempt, manifest)) throw new IndexGenerationError("index_artifact_generation_incomplete");
  const saved = await collection<GenerationSession>(db, "sessions", tenant).updateOne(
    { _id: attempt.sessionId, sourceId: attempt.sourceId, "indexAttempt.generation": attempt.generation, "indexAttempt.state": "running", "indexAttempt.phase": "writing" },
    { $set: { "indexAttempt.state": "complete", "indexAttempt.finishedAt": new Date().toISOString(), "indexAttempt.manifest": manifest, "status.index": "done" } });
  if (saved.acknowledged !== true || saved.matchedCount !== 1) throw new IndexGenerationError("index_attempt_completion_unconfirmed");
  const verified = await verifyIndexGeneration(db, tenant, attempt.sessionId, attempt.generation);
  if (!verified) throw new IndexGenerationError("index_attempt_completion_unconfirmed");
  return verified;
}
