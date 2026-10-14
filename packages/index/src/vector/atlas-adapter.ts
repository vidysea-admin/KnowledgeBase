/**
 * packages/index/src/vector/atlas-adapter.ts — T-008 adapter seam for MongoDB Atlas `$vectorSearch`.
 *
 * STATUS vs D-021: D-021 chose brute-force cosine because `$vectorSearch` does not exist on the
 * self-hosted mongod. This file does NOT change that: nothing wires it in. It is the pure half of
 * a future injection (D-021's `vectorSearchFn` seam) so a real Atlas deployment is a composition
 * change. PURE: builds the aggregation pipeline and maps returned documents; the caller runs
 * `collection.aggregate(pipeline)` at the edge and loads the turns for `collectTurnIds(docs)`.
 *
 * TENANCY: the `filter` always pins `tenantId` (the field must be declared as a `filter` field in
 * the Atlas index definition), and the mapper re-checks tenant on every doc and turn.
 */
import { attachEvidence, type ChunkEvidenceResult, type EvidenceChunk, type EvidenceTurn } from "./chunk-evidence.js";

export interface AtlasQueryParams {
  indexName: string;
  queryVector: number[];
  tenantId: string;
  limit: number;
  /** Defaults to max(limit * 10, 100) capped at 10000; must be >= limit and <= 10000. */
  numCandidates?: number;
  /** Document field holding the embedding. Default "vector". */
  path?: string;
}

function refuse(msg: string): never {
  throw new Error(`atlas-adapter: ${msg}`);
}

export function buildVectorSearchPipeline(p: AtlasQueryParams): Record<string, unknown>[] {
  if (typeof p.indexName !== "string" || !p.indexName) refuse("indexName required");
  if (typeof p.tenantId !== "string" || !p.tenantId) refuse("tenantId must be a non-empty string (no unscoped search)");
  if (!Array.isArray(p.queryVector) || p.queryVector.length === 0 || p.queryVector.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
    refuse("queryVector must be a non-empty array of finite numbers");
  }
  if (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 1000) refuse(`limit must be an integer 1..1000, got ${p.limit}`);
  const numCandidates = p.numCandidates ?? Math.min(10000, Math.max(p.limit * 10, 100));
  if (!Number.isInteger(numCandidates) || numCandidates < p.limit || numCandidates > 10000) {
    refuse(`numCandidates must be an integer in [limit, 10000], got ${numCandidates}`);
  }
  return [
    {
      $vectorSearch: {
        index: p.indexName,
        path: p.path ?? "vector",
        queryVector: p.queryVector,
        numCandidates,
        limit: p.limit,
        filter: { tenantId: p.tenantId },
      },
    },
    { $project: { _id: 1, tenantId: 1, sourceRef: 1, turnRefs: 1, chunkIndex: 1, score: { $meta: "vectorSearchScore" } } },
  ];
}

export interface AtlasDoc extends EvidenceChunk {
  score: number;
}

/** Turn ids the caller must load before mapping. Refuses malformed docs early. */
export function collectTurnIds(docs: AtlasDoc[]): string[] {
  const ids = new Set<string>();
  for (const d of docs) {
    if (!d || !Array.isArray(d.turnRefs) || d.turnRefs.length === 0) refuse(`result ${d?._id} has missing turnRefs`);
    for (const t of d.turnRefs) ids.add(t);
  }
  return [...ids];
}

/**
 * Maps Atlas results to evidence results, preserving Atlas order (already score-descending).
 * Throws on any doc whose evidence cannot be verified; tenant is re-checked on doc and turns.
 */
export function mapAtlasResults(
  docs: AtlasDoc[],
  turnsById: ReadonlyMap<string, EvidenceTurn>,
  options: { tenantId: string; queryText?: string },
): ChunkEvidenceResult[] {
  if (typeof options.tenantId !== "string" || !options.tenantId) refuse("tenantId required to map results");
  return docs.map((d) => attachEvidence(d, d.score, turnsById, options));
}
