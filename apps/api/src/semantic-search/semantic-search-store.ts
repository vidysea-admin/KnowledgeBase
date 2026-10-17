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
import { getDb } from "@lkb/db";
import { rankByCosine, rankSessionsByCosine, attachEvidence, type EvidenceChunk, type SourceSpan } from "@lkb/index";
import type { EmbedJob, EmbedResult } from "@lkb/ai";
import type { SemanticSearchDeps, SemanticHit } from "./route.js";
import { chunkContentMatches } from "../indexing/chunk-integrity.js";
import { selectSourceQuote } from "./source-quote.js";
import { inspectSemanticReadiness, SemanticIndexPendingError } from "./readiness.js";
import { readCurrentSemanticCorpus, publicSemanticSession } from "./current-corpus.js";

export function semanticSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LKB_SEMANTIC_SEARCH === "1";
}

export interface SemanticSearchStoreDeps {
  embed: (job: EmbedJob) => Promise<EmbedResult>;
  db?: Pick<Db, "collection">;
}

export function createMongoSemanticSearchDeps(deps: SemanticSearchStoreDeps): SemanticSearchDeps {
  return {
    readiness: tenantId => inspectSemanticReadiness(tenantId, deps.db ?? getDb()),
    async search(tenantId, query, k, mode = "sessions"): Promise<SemanticHit[]> {
      const embedded = await deps.embed({ kind: "embedding", texts: [query], purpose: "query" });
      const qv = embedded.vectors[0];
      if (!qv || qv.length === 0) throw new Error("embedder returned no query vector");
      if (qv.some(value => !Number.isFinite(value)) || qv.length !== embedded.dims)
        throw new Error("embedder returned malformed query vector");
      if (typeof embedded.model !== "string" || !embedded.model.trim())
        throw new Error("embedder returned no embedding model identity");
      const db = deps.db ?? getDb();
      const corpus = await readCurrentSemanticCorpus(tenantId, db);
      const chunks = corpus.chunks.filter(chunk => Array.isArray(chunk.vector)) as unknown as (EvidenceChunk & { vector: number[]; embeddingModel?: string;
          sourceSpans?: SourceSpan[]; rawTextSha256?: string })[];
      // Equal dimensions do not mean equal vector spaces (including provider fallback).
      // Refuse mixed/unknown models rather than publish plausible but meaningless scores.
      if (chunks.some(chunk => chunk.embeddingModel !== embedded.model))
        throw new SemanticIndexPendingError();
      if (chunks.some(chunk => !chunkContentMatches(chunk, corpus.byId, tenantId)))
        throw new SemanticIndexPendingError();
      const rank = mode === "chunks" ? rankByCosine : rankSessionsByCosine;
      const ranked = rank(qv, chunks, k, { skipMismatched: true });
      // Evidence resolves against the current reviewed, visible corpus, then is checked again at publication.
      const byId = new Map(chunks.map((c) => [c._id, c]));
      const best = ranked.map((r) => byId.get(r.chunkId)!);
      const turnsById = corpus.byId;
      if (best.some(chunk => !chunkContentMatches(chunk, turnsById, tenantId)))
        throw new SemanticIndexPendingError();
      const evidence = new Map(
        best.map((chunk, i) => attachEvidence(chunk, ranked[i]!.score, turnsById, { tenantId, queryText: query,
          selectQuote: turns => selectSourceQuote(chunk.sourceSpans, turns, query) }))
          .map(e => [e.chunkId, e]),
      );
      const sessions = await Promise.all(ranked.map((r) => corpus.visibility.safeCitationSession(tenantId, r.sessionId)));
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        if (!session) throw new SemanticIndexPendingError();
        if (session && (session.tenantId !== tenantId || session._id !== ranked[i]!.sessionId))
          throw new Error("source session identity mismatch");
      }
      const publicationTurns = await corpus.visibility.filterTurns(tenantId,
        [...new Set(best.flatMap(chunk => chunk.turnRefs ?? []))].map(id => turnsById.get(id)!));
      const publicationById = new Map(publicationTurns.map(turn => [turn._id, turn]));
      if (best.some(chunk => !chunkContentMatches(chunk, publicationById, tenantId))) throw new SemanticIndexPendingError();
      return ranked.map((r, i) => ({
        chunkId: r.chunkId,
        sessionId: r.sessionId,
        score: r.score,
        session: publicSemanticSession(sessions[i] ?? null),
        ...(best[i]!.sourceSpans ? { sourceSpans: best[i]!.sourceSpans, rawTextSha256: best[i]!.rawTextSha256 } : {}),
        ...(() => {
          const e = evidence.get(r.chunkId);
          if (!e) throw new Error("ranked chunk has no verified evidence");
          const turn = turnsById.get(e.quote.turnId)!;
          if (mode === "chunks" && (typeof turn.speakerRef !== "string" || !turn.speakerRef.trim()))
            throw new Error("source turn has no speaker attribution");
          return { turnIds: e.turnIds, tStart: e.tStart, tEnd: e.tEnd, quote: {
            ...e.quote, tStart: turn.tStart, tEnd: turn.tEnd,
            ...(typeof turn.speakerRef === "string" ? { speakerRef: turn.speakerRef } : {}),
            ...(typeof turn.speakerLabel === "string" ? { speakerLabel: turn.speakerLabel } : {}),
            ...(typeof turn.occurredAt === "string" ? { occurredAt: turn.occurredAt } : {}),
          } };
        })(),
      }));
    },
  };
}
