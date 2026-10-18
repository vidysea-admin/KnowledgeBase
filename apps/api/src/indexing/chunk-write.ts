import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Chunks, Turns } from "@lkb/core";
import { buildChunks } from "@lkb/index";
import type { IndexEmbedFn, ChunkWriteResult } from "./types.js";
import { toEvidenceTuple } from "./evidence-tuples.js";
import { chunkContentId } from "./chunk-integrity.js";
import type { IndexArtifactBinding } from "./generation.js";

export interface ChunkGenerationWrite {
  binding: IndexArtifactBinding;
  assertOwned(): Promise<void>;
  prepared(docs: Chunks[]): void;
}

/** ISS-LEGACYSEED-008: the stamp a legacy-unbound session carries onto its chunks (same shape backfill writes); else undefined. */
export function legacyChunkProvenance(session: unknown): { status: "legacy-unbound"; reason: string } | undefined {
  const p = (session as { provenance?: { status?: unknown; reason?: unknown } } | null | undefined)?.provenance;
  return p?.status === "legacy-unbound" && typeof p.reason === "string" ? { status: "legacy-unbound", reason: p.reason } : undefined;
}

/** Lexical evidence inventory: source references only, with no embedding provider call. */
export async function writeSessionLexicalChunks(
  tenantId: string, sessionId: string, turns: Turns[], db: Pick<Db, "collection">,
  generation: ChunkGenerationWrite,
  provenance?: { status: "legacy-unbound"; reason: string },
): Promise<ChunkWriteResult> {
  const plans = buildChunks(turns);
  if (!plans.length) return { written: 0, skipped: "no-chunkable-turns" };
  const docs: Chunks[] = plans.map(plan => ({
    _id: chunkContentId(tenantId, sessionId, plan.turnRefs, plan.text), tenantId, sourceRef: sessionId,
    turnRefs: toEvidenceTuple(plan.turnRefs), chunkIndex: plan.chunkIndex, indexArtifact: { ...generation.binding },
    ...(provenance ? { provenance: { ...provenance } } : {}),
  }));
  generation.prepared(docs);
  const coll = scopedCollection<Chunks>(db as never, "chunks")(tenantId);
  for (const doc of docs) {
    await generation.assertOwned();
    // Replace, rather than $set: a previous vector with the same content ID must not survive.
    const saved = await coll.replaceOne({ _id: doc._id, sourceRef: sessionId }, doc, { upsert: true });
    if (saved.acknowledged !== true || saved.matchedCount + (saved.upsertedCount ?? 0) !== 1) throw new Error("lexical chunk write unconfirmed");
  }
  await generation.assertOwned();
  const pruned = await coll.deleteMany({ sourceRef: sessionId, _id: { $nin: docs.map(doc => doc._id) } });
  if (pruned.acknowledged !== true) throw new Error("lexical chunk prune unconfirmed");
  return { written: docs.length, skipped: null };
}


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
  if (typeof embedded.model !== "string" || !embedded.model.trim()) throw new Error("invalid embedding model identity");
  const chunkDocs: Chunks[] = plans.map((plan, i) => {
    const vector = embedded.vectors[i] ?? [];
    if (vector.length !== embedded.dims) {
      throw new Error(
        `indexSession: chunk ${plan.chunkIndex} has ${vector.length} dims, batch reports ${embedded.dims}`,
      );
    }
    return {
      _id: chunkContentId(tenantId, sessionId, plan.turnRefs, plan.text),
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
  generation?: ChunkGenerationWrite,
): Promise<ChunkWriteResult> {
  const chunksColl = scopedCollection<Chunks>(db as never, "chunks");
  const plans = buildChunks(turns);
  if (plans.length === 0) {
    if (persist) {
      try { await chunksColl(tenantId).deleteMany({ sourceRef: sessionId } as never); }
      catch { return { written: 0, skipped: "embedding-failed" }; }
    }
    return { written: 0, skipped: "no-chunkable-turns" };
  }
  // ISS-112: the C8 assertions below MUST sit inside this try. They previously followed it, so a
  // contradictory batch threw past the catch and skipped `tree_index` and the status flip as well
  // — exactly the "no vectors this run becomes no summary, no claims, no tree" trade the comment
  // below says it refuses. A guarantee stated in a comment and contradicted by the line numbering
  // is worse than no comment, because it stops the next reader checking.
  try {
    const embedded = await embed({ kind: "embedding", texts: plans.map((p) => p.text), purpose: "document" });

    const chunkDocs = prepareChunkDocuments(tenantId, sessionId, plans, embedded, provenance).map(chunk => ({ ...chunk,
      ...(generation ? { indexArtifact: { ...generation.binding } } : {}) }));
    // Persist replacements before pruning. Stable content identities make unchanged reruns
    // idempotent and partial write failure cannot erase the previous index. Current-source
    // integrity checks refuse old vectors after source changes even when embedding fails.
    if (!persist) return { written: chunkDocs.length, skipped: null };
    generation?.prepared(chunkDocs);
    for (const chunk of chunkDocs) {
      await generation?.assertOwned();
      const saved = await chunksColl(tenantId).updateOne({ _id: chunk._id, sourceRef: sessionId } as never,
        { $set: chunk } as never, { upsert: true });
      if (generation && (saved.acknowledged !== true || saved.matchedCount + (saved.upsertedCount ?? 0) !== 1)) throw new Error("chunk generation write unconfirmed");
    }
    await generation?.assertOwned();
    const pruned = await chunksColl(tenantId).deleteMany({ sourceRef: sessionId, _id: { $nin: chunkDocs.map(chunk => chunk._id) } } as never);
    if (generation && pruned.acknowledged !== true) throw new Error("chunk generation prune unconfirmed");
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
