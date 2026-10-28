import type { Db } from "mongodb";
import type { Gaps } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { chunkContentMatches } from "../indexing/chunk-integrity.js";
import { readCurrentSemanticCorpus } from "./current-corpus.js";

export interface SemanticReadiness {
  status: "ready" | "empty" | "reindex-required";
  total: number;
  bound: number;
  legacy: number;
  stale: number;
  invalidVectors: number;
  invalidModels: number;
  modelCount: number;
  dimensionCount: number;
  uncoveredTurns: number;
  pendingGaps: number;
  queryModelCompatibility: "checked-on-search";
}

export class SemanticIndexPendingError extends Error {
  constructor() { super("semantic index needs a source/model-compatible rebuild"); }
}

/** Read-only corpus readiness. Does not call an embedding provider or approve source material. */
export async function inspectSemanticReadiness(tenantId: string, db: Pick<Db, "collection">): Promise<SemanticReadiness> {
  const { chunks, turns, byId, sessions } = await readCurrentSemanticCorpus(tenantId, db);
  // Existing rows alone cannot prove coverage: a failed first write can persist only one chunk.
  const rawGaps = await scopedCollection<Gaps>(db as never, "gaps")(tenantId)
    .find({ kind: "vector-pending", status: "open" } as never).toArray();
  if (rawGaps.some(gap => gap.tenantId !== tenantId || gap.kind !== "vector-pending" || gap.status !== "open"))
    throw new Error("gap scope mismatch");
  const gaps = rawGaps.filter(gap => typeof gap.sourceRef === "string" && sessions.has(gap.sourceRef));
  const sourceSet = new Set(sessions.keys());
  const models = new Set<string>(), dimensions = new Set<number>();
  const coverage = new Map<string, { start: number; end: number }[]>();
  const result: SemanticReadiness = { status: "empty", total: chunks.length, bound: 0, legacy: 0, stale: 0,
    invalidVectors: 0, invalidModels: 0, modelCount: 0, dimensionCount: 0, uncoveredTurns: 0,
    pendingGaps: gaps.length, queryModelCompatibility: "checked-on-search" };
  for (const chunk of chunks) {
    if (!Array.isArray(chunk.vector) || !chunk.vector.length || chunk.vector.some(value => !Number.isFinite(value)) ||
        !Number.isInteger(chunk.dims) || chunk.dims! <= 0 || chunk.dims !== chunk.vector.length) { result.invalidVectors++; continue; }
    dimensions.add(chunk.dims!);
    if (typeof chunk.embeddingModel !== "string" || !chunk.embeddingModel.trim()) { result.invalidModels++; continue; }
    models.add(chunk.embeddingModel);
    if (!chunk._id.startsWith("chunk-v1:") && chunk.sourceSpans === undefined) { result.legacy++; continue; }
    if (!sourceSet.has(chunk.sourceRef) || !chunkContentMatches(chunk, byId, tenantId) || chunk.turnRefs.some(id => {
      const turn = byId.get(id);
      return !turn || typeof turn.speakerRef !== "string" || !turn.speakerRef.trim() || !turn.text.trim() ||
        !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd) || turn.tStart < 0 || turn.tEnd < turn.tStart;
    })) { result.stale++; continue; }
    result.bound++;
    for (const turnId of chunk.turnRefs) {
      const ranges = coverage.get(turnId) ?? [];
      if (Array.isArray(chunk.sourceSpans)) {
        for (const span of chunk.sourceSpans) if (span.turnId === turnId)
          ranges.push({ start: span.charStart, end: span.charEnd });
      } else ranges.push({ start: 0, end: byId.get(turnId)!.text.length });
      coverage.set(turnId, ranges);
    }
  }
  result.modelCount = models.size;
  result.dimensionCount = dimensions.size;
  result.uncoveredTurns = turns.filter(turn => {
    if (!sourceSet.has(turn.sessionId) || !turn.text.trim()) return false;
    let through = 0;
    for (const range of (coverage.get(turn._id) ?? []).sort((a, b) => a.start - b.start)) {
      if (range.start > through) return true;
      through = Math.max(through, range.end);
    }
    return through < turn.text.length;
  }).length;
  result.status = !result.total && !result.uncoveredTurns && !result.pendingGaps ? "empty" :
    result.bound === result.total && models.size === 1 && dimensions.size === 1 && !result.uncoveredTurns && !result.pendingGaps
    ? "ready" : "reindex-required";
  return result;
}
