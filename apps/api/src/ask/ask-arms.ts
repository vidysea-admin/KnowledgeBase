/**
 * apps/api/src/ask-arms.ts — U1.5 part 2. The vector and lexical retrieval arms for `askV2`.
 *
 * THIS FILE EXISTS BECAUSE OF C6, and its shape is the criterion rather than an implementation
 * detail. It exports a **factory taking `tenantId`**, not a bound function — so a caller
 * *structurally cannot* build the arms once at boot and reuse them across tenants.
 *
 * That matters here specifically: `buildProductionDeps()` has no tenant, and its router-level id is
 * the literal string `"system"`. A retrieval arm bound at that moment would query one tenant's
 * vectors for every tenant's questions — which is ISS-078's shape (a cross-tenant read that
 * survived four PASSes and 102 green tests), aimed this time at the corpus rather than the API.
 * The per-request tenant comes from the verified API key in `routes/ask.ts`, and this factory is
 * the only way to reach the arms.
 *
 * It lives in `apps/api` and not `packages/ask` because it needs `@lkb/index` (cosine, lexical) and
 * `@lkb/db`, and `packages/ask` may import neither (hybrid-retrieval C10, dep-cruiser enforced).
 */
import type { Db } from "mongodb";
import { getDb, scopedCollection } from "@lkb/db";
import type { Chunks, TreeIndexNode, Turns } from "@lkb/core";
import { rankSessionsByCosine, lexicalSearchTurns } from "@lkb/index";
import type { EmbedJob, EmbedResult } from "@lkb/ai";

export type ArmsEmbedFn = (job: EmbedJob) => Promise<EmbedResult>;

export interface AskArmsDeps {
  /** Absent = no vector arm. An install with no embedding provider degrades to tree + lexical. */
  embed?: ArmsEmbedFn;
  /** Injectable so the arms' QUERY decisions are testable without a live Mongo — the same reason
   * `indexSession` gained one after ISS-056 shipped a guard nothing could pin. */
  db?: Pick<Db, "collection">;
  /** How many sessions each arm proposes. Deliberately small: the arms feed a candidate set the
   * evaluator then re-scores, so a long tail costs LLM tokens without adding recall. */
  k?: number;
}

/**
 * Maps a `sessions._id` to the tree node that represents it.
 *
 * Built by walking the tree rather than by re-deriving `buildTree`'s `…/session:<id>` path
 * convention — one definition, not two that agree until somebody edits one. (That exact drift is
 * why `promote-entities.ts` reads slugs out of `node_id` instead of re-slugifying titles.)
 */
function sessionNodesById(root: TreeIndexNode): Map<string, TreeIndexNode> {
  const bySession = new Map<string, TreeIndexNode>();
  const stack: TreeIndexNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.level === "session") {
      const i = n.node_id.lastIndexOf("/session:");
      if (i !== -1) bySession.set(n.node_id.slice(i + "/session:".length), n);
    }
    for (const c of n.children ?? []) stack.push(c);
  }
  return bySession;
}

/**
 * @returns a factory. `createAskArmsFor(deps)(tenantId)` yields the `extraCandidateArmsFn` that
 *          `askV2` accepts — bound to exactly one tenant, per request.
 *
 * NEITHER ARM MAY THROW. A failed arm returns nothing and reports a reason, because `/ask` must
 * still answer from the tree: this project has shipped three separate silent-degradation bugs, and
 * hybrid-retrieval C5 requires the degradation to be visible rather than merely survivable.
 */
export function createAskArmsFor(deps: AskArmsDeps = {}) {
  const k = deps.k ?? 5;
  return (tenantId: string) =>
    async (query: string, tree: TreeIndexNode): Promise<{ arms: TreeIndexNode[][]; degraded: string | null }> => {
      const db = deps.db ?? getDb();
      const bySession = sessionNodesById(tree);
      const arms: TreeIndexNode[][] = [];
      const failures: string[] = [];

      // ---- vector arm -------------------------------------------------------------------------
      if (deps.embed) {
        try {
          const embedded = await deps.embed({ kind: "embedding", texts: [query], purpose: "query" });
          const qv = embedded.vectors[0];
          if (!qv || qv.length === 0) throw new Error("embedder returned no query vector");
          // Tenant-scoped read: `scopedCollection` merges the tenantId, so this cannot see another
          // tenant's chunks even if one somehow shared a sessionId.
          const chunks = (await scopedCollection<Chunks>(db as never, "chunks")(tenantId)
            .find({})
            .toArray()) as unknown as { _id: string; sourceRef: string; vector: number[] }[];
          const hits = rankSessionsByCosine(qv, chunks, k, { skipMismatched: true });
          arms.push(hits.map((h) => bySession.get(h.sessionId)).filter((n): n is TreeIndexNode => n !== undefined));
        } catch (err) {
          failures.push(`vector: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ---- lexical arm ------------------------------------------------------------------------
      try {
        const turns = (await scopedCollection<Turns>(db as never, "turns")(tenantId)
          .find({})
          .toArray()) as unknown as { _id: string; sessionId: string; text: string }[];
        const hits = lexicalSearchTurns(query, turns as never, k);
        const seen = new Set<string>();
        const nodes: TreeIndexNode[] = [];
        for (const h of hits as unknown as { sessionId: string }[]) {
          if (seen.has(h.sessionId)) continue;
          seen.add(h.sessionId);
          const node = bySession.get(h.sessionId);
          if (node) nodes.push(node);
        }
        arms.push(nodes);
      } catch (err) {
        failures.push(`lexical: ${err instanceof Error ? err.message : String(err)}`);
      }

      return { arms, degraded: failures.length > 0 ? failures.join("; ") : null };
    };
}
