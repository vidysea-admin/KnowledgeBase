/**
 * apps/api/src/semantic-search-store.ts — T-008 slice: unstructured (vector) search over the
 * existing `chunks` collection. Reuses `@lkb/index`'s pure brute-force cosine (D-021, contract
 * vector-retrieval) and the same injectable-db shape as `search-store.ts`.
 *
 * TENANT BOUNDARY (ISS-078 precedent): every read goes through `scopedCollection(...)(tenantId)`,
 * so `tenantId` is inside the filter sent to Mongo — it is never applied to results afterwards.
 * `search-store`-style tests capture the filter and assert it on EVERY call.
 *
 * FLAG: `LKB_SEMANTIC_SEARCH=1` (OFF by default); see `semanticSearchEnabled`.
 */
import type { Db } from "mongodb";
import type { Chunks, Sessions } from "@lkb/core";
import { getDb, scopedCollection } from "@lkb/db";
import { rankSessionsByCosine } from "@lkb/index";
import type { EmbedJob, EmbedResult } from "@lkb/ai";
import type { SemanticSearchDeps, SemanticHit } from "./route.js";

export function semanticSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LKB_SEMANTIC_SEARCH === "1";
}

export interface SemanticSearchStoreDeps {
  embed: (job: EmbedJob) => Promise<EmbedResult>;
  db?: Pick<Db, "collection">;
}

export function createMongoSemanticSearchDeps(deps: SemanticSearchStoreDeps): SemanticSearchDeps {
  return {
    async search(tenantId, query, k): Promise<SemanticHit[]> {
      const embedded = await deps.embed({ kind: "embedding", texts: [query], purpose: "query" });
      const qv = embedded.vectors[0];
      if (!qv || qv.length === 0) throw new Error("embedder returned no query vector");
      const db = deps.db ?? getDb();
      // Rows without a vector cannot be ranked; excluded inside the query, tenant pinned by scopedCollection.
      const chunks = (await scopedCollection<Chunks>(db as never, "chunks")(tenantId)
        .find({ vector: { $exists: true } } as never)
        .toArray()) as unknown as { _id: string; sourceRef: string; vector: number[] }[];
      const ranked = rankSessionsByCosine(qv, chunks, k, { skipMismatched: true });
      const sessionsColl = scopedCollection<Sessions>(db as never, "sessions");
      const sessions = await Promise.all(ranked.map((r) => sessionsColl(tenantId).findOne({ _id: r.sessionId })));
      return ranked.map((r, i) => ({
        chunkId: r.chunkId,
        sessionId: r.sessionId,
        score: r.score,
        session: sessions[i] ?? null,
      }));
    },
  };
}
