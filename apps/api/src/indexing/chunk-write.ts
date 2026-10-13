import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Chunks, Turns } from "@lkb/core";
import { buildChunks } from "@lkb/index";
import type { IndexEmbedFn, ChunkWriteResult } from "./types.js";
import { toEvidenceTuple } from "./evidence-tuples.js";


/** Shared validated vector/document preparation; callers choose their persistence policy. */
export function prepareChunkDocuments(
  tenantId: string, sessionId: string, plans: ReturnType<typeof buildChunks>,
  embedded: Awaited<ReturnType<IndexEmbedFn>>,
  /** D-149 (pending append): carried from a `legacy-unbound` session onto its chunks; omitted otherwise. */
  provenance?: { status: "legacy-unbound"; reason: string },
): Chunks[] {
  // The correlation JSON Schema cannot express (the U1.2 verdict's finding): `vector` and
  // `dims` are independently optional there, so `{vector: [3 items], dims: 99}` validates.
  // Asserted at the only place that can see both — the write.
  if (embedded.vectors.length !== plans.length) {
    throw new Error(
      `indexSession: embedder returned ${embedded.vectors.length} vector(s) for ${plans.length} chunk(s)`,
    );
  }
  if (!Number.isInteger(embedded.dims) || embedded.dims <= 0 || embedded.vectors.some((v) => v.some((n) => !Number.isFinite(n)))) throw new Error("invalid embedding dimensions/values");
  const chunkDocs: Chunks[] = plans.map((plan, i) => {
    const vector = embedded.vectors[i] ?? [];
    if (vector.length !== embedded.dims) {
      throw new Error(
        `indexSession: chunk ${plan.chunkIndex} has ${vector.length} dims, batch reports ${embedded.dims}`,
      );
    }
    return {
      _id: randomUUID(),
      tenantId,
      sourceRef: sessionId,
      turnRefs: toEvidenceTuple(plan.turnRefs),
      chunkIndex: plan.chunkIndex,
      vector: toEvidenceTuple(vector),
      dims: embedded.dims,
      embeddingModel: embedded.model,
      ...(provenance ? { provenance: { ...provenance } } : {}),
    } as Chunks;
  });
  return chunkDocs;
}

export async function writeSessionChunks(
  tenantId: string,
  sessionId: string,
  turns: Turns[],
  embed: IndexEmbedFn,
  db: Pick<Db, "collection">,
  persist = true,
  provenance?: { status: "legacy-unbound"; reason: string },
): Promise<ChunkWriteResult> {
  const chunksColl = scopedCollection<Chunks>(db as never, "chunks");
  const plans = buildChunks(turns);
  if (plans.length === 0) {
    console.warn(`indexSession(${tenantId}/${sessionId}): no chunkable turns — chunks left unchanged`);
    return { written: 0, skipped: "no-chunkable-turns" };
  }
  // ISS-112: the C8 assertions below MUST sit inside this try. They previously followed it, so a
  // contradictory batch threw past the catch and skipped `tree_index` and the status flip as well
  // — exactly the "no vectors this run becomes no summary, no claims, no tree" trade the comment
  // below says it refuses. A guarantee stated in a comment and contradicted by the line numbering
  // is worse than no comment, because it stops the next reader checking.
  try {
    const embedded = await embed({ kind: "embedding", texts: plans.map((p) => p.text), purpose: "document" });

    const chunkDocs = prepareChunkDocuments(tenantId, sessionId, plans, embedded, provenance);
    // Clean replace, never accumulate — a re-index must not double the corpus. Reached only
    // after every assertion above has passed, so the delete never runs without its replacement.
    if (!persist) return { written: chunkDocs.length, skipped: null };
    await chunksColl(tenantId).deleteMany({ sourceRef: sessionId } as never);
    await chunksColl(tenantId).insertMany(chunkDocs);
    return { written: chunkDocs.length, skipped: null };
  } catch (err) {
    // Never rethrow: the rest of indexing already succeeded, and failing the whole call would
    // turn "no vectors this run" into "no summary, no claims, no tree" too. This now also
    // covers the C8 assertions (ISS-112), which used to throw past it.
    console.warn(
      `indexSession(${tenantId}/${sessionId}): embedding failed — chunks left unchanged: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return { written: 0, skipped: "embedding-failed" };
  }
}
