/**
 * apps/api/src/search-store.ts — the real `SearchDeps` for `routes/search.ts`. Extracted from
 * `store.ts` when that file crossed its 300-LOC budget; the same separate-store-module convention
 * `ingest-store.ts` and `whatsapp-store.ts` already follow, so this is the established shape
 * rather than a new one.
 */
import type { Db } from "mongodb";
import { assertValidTenantId, getDb, scopedCollection } from "@lkb/db";
import { lexicalQueryTokens, lexicalSearchTurns, treeIndexRootFilter } from "@lkb/index";
import type { NativeSourceLocator } from "@lkb/core";
import { buildTurnPrefilter } from "./search-prefilter.js";
import { readSearchCandidateTurns } from "./transcript-review/search-reader.js";
import { createKnowledgeVisibility } from "./visibility/knowledge.js";
import type { NativeSearchHit, NativeSearchResult, SearchDeps, SearchHit } from "./routes/search.js";
import { parseNativeSourceLocator, type NativeEvidenceResolver, type ResolvedNativeEvidence } from "./native-evidence/resolver.js";

/**
 * Pre-filters candidates in Mongo, scores them with `@lkb/index`'s pure `lexicalSearchTurns`,
 * adds current review-overlay candidates, and checks source eligibility before scoring.
 * Current proof reads are required by the visibility perimeter; each hit uses its own effective
 * turn and final safe session labels are resolved once per distinct returned session.
 *
 * The pre-filter replaces an unbounded `find({})`. Measured against real data 2026-09-08
 * (2118 turns, tenant `toc`): fetching every turn cost a median **1064ms** while scoring them
 * cost **38ms** — i.e. ~75% of a 1.4s search was shipping 1.7MB of transcript text over the
 * wire, and computation was never the bottleneck. A projection was measured first and rejected:
 * limiting to `_id`/`sessionId`/`text` shrank the payload only **8%**, because `text` IS the
 * payload. Filtering server-side moved the fetch to **663ms** on the same query.
 *
 * **Why this is answer-preserving by construction rather than by luck:** the tokens come from
 * `lexicalQueryTokens`, the scorer's OWN tokenizer, and `lexicalSearchTurns` scores a turn above
 * zero only when one of those tokens matches as a whole token. A substring match is strictly more
 * permissive, so this filter returns a superset of everything that could score; the extras score
 * 0 and are dropped. Deriving a separate token list here would silently break that — verified
 * against real data that a plausible `length > 2` token filter turned a 10-hit result for
 * "AI in counselling" into 2, and reduced "is it ok to go" to zero tokens (an empty `$or`, which
 * Mongo rejects outright). `lexical.test.ts` pins the superset property mechanically.
 *
 * Honest ceiling: this is still an unindexed scan (`turns` carries only `_id_`, `tenantId_1`,
 * `tenantId_1_sessionId_1` — no text index), so it is a constant-factor win, not a change in
 * complexity. Plan §10's Phase-1 retrieval layer is where that gets fixed properly; this keeps
 * U1.5 from inheriting a silent 1.4s.
 */
export interface SearchStoreDeps {
  /** Injectable so the FILTER OBJECT this function actually sends to Mongo is testable without a
   * live database. Added for ISS-076: three separate bypasses (mutating the filter after building
   * it, laundering it through a wrapper module, or breaking the builder itself) each kept every
   * source-text assertion satisfied and left all 99 tests green — one of them measurably losing 6
   * of 20 real hits against production. A source pin can only ever pin the previous attack's
   * syntax; asserting on the object that reaches `find()` closes the class instead of the
   * instance. Same shape `indexSession` gained for ISS-056, for the same reason. Defaults to the
   * real db; production callers pass nothing. */
  db?: Pick<Db, "collection">;
  nativeEvidence?: NativeEvidenceResolver;
  /** Current source inventory owned by central publication/head authority. Text/labels are never trusted here. */
  listNativeLocators?(tenantId: string): Promise<{ locators: readonly NativeSourceLocator[]; truncated: boolean }>;
}

/** Bounded native keyword retrieval scores only current resolver-authorized exact passages. */
export function createNativeSearch(deps: Required<Pick<SearchStoreDeps, "nativeEvidence" | "listNativeLocators">>): NonNullable<SearchDeps["searchNative"]> {
  return async (tenantId, query, k): Promise<NativeSearchResult> => {
    assertValidTenantId(tenantId, "native.search");
    if (!Number.isSafeInteger(k) || k < 1 || k > 50) throw new Error("invalid_native_search_limit");
    if (typeof query !== "string" || Array.from(query).length > 512) throw new Error("invalid_native_search_query");
    const tokens = lexicalQueryTokens(query);
    if (!tokens.length) return { hits: [], truncated: false };
    const inventory = await deps.listNativeLocators(tenantId);
    if (!inventory || !Array.isArray(inventory.locators) || typeof inventory.truncated !== "boolean") throw new Error("invalid_native_inventory");
    const ranked: { evidence: ResolvedNativeEvidence; score: number }[] = [], seen = new Set<string>();
    // Reserve a fresh read for every possible output; the total authority calls remain <=128.
    const candidateLimit = 128 - k;
    for (const locator of inventory.locators.slice(0, candidateLimit)) {
      const evidence = await deps.nativeEvidence.resolve(tenantId, locator);
      if (!evidence) continue;
      const key = JSON.stringify(evidence.sourceLocator);
      if (seen.has(key)) continue;
      seen.add(key);
      const words = new Set(lexicalQueryTokens(evidence.quote));
      const score = tokens.filter(t => words.has(t)).length / tokens.length;
      if (score > 0) ranked.push({ evidence, score });
    }
    const hits: NativeSearchHit[] = [];
    for (const row of ranked.sort((a, b) => b.score - a.score).slice(0, k)) {
      const current = await deps.nativeEvidence.revalidate(tenantId, row.evidence);
      if (current) hits.push({ nativeSourceLocator: current.sourceLocator, score: row.score,
        ...(current.title === undefined ? {} : { title: current.title }) });
    }
    return { hits, truncated: inventory.truncated || inventory.locators.length > candidateLimit };
  };
}

/** Inventory holds references only. Source currentness/eligibility and all text come from the resolver. */
async function treeNativeLocators(db: Pick<Db, "collection">, tenantId: string): Promise<{ locators: NativeSourceLocator[]; truncated: boolean }> {
  const root = await scopedCollection<Record<string, unknown> & { tenantId: string; _id: string }>(db, "tree_index")(tenantId)
    .findOne(treeIndexRootFilter(tenantId));
  if (!root) return { locators: [], truncated: false };
  if (root.tenantId !== tenantId) throw new Error("invalid_native_inventory");
  const stack: { node: unknown; depth: number }[] = [{ node: root, depth: 0 }], ids = new Set<string>(), objects = new Set<object>();
  const locators: NativeSourceLocator[] = [], locatorIds = new Set<string>();
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error("invalid_native_inventory");
    const n = node as Record<string, unknown>;
    if (objects.has(node) || depth > 32 || ids.size >= 10_000 || typeof n.node_id !== "string" || !n.node_id
      || ids.has(n.node_id) || !Array.isArray(n.children) || ids.size + stack.length + n.children.length >= 10_000
      || (n.tenantId !== undefined && n.tenantId !== tenantId)) throw new Error("invalid_native_inventory");
    objects.add(node); ids.add(n.node_id);
    if (n.level === "native-passage" && n.evidence && typeof n.evidence === "object") {
      const locator = parseNativeSourceLocator((n.evidence as Record<string, unknown>).sourceLocator);
      if (!locator) throw new Error("invalid_native_inventory");
      const identity = JSON.stringify(locator);
      if (locatorIds.has(identity)) throw new Error("invalid_native_inventory");
      locatorIds.add(identity);
      locators.push(locator);
    }
    for (let i = n.children.length - 1; i >= 0; i--) stack.push({ node: n.children[i], depth: depth + 1 });
  }
  if (Buffer.byteLength(JSON.stringify(root), "utf8") > 8 * 1024 * 1024) throw new Error("invalid_native_inventory");
  return { locators, truncated: false };
}

export function createMongoSearchDeps(deps: SearchStoreDeps = {}): SearchDeps {
  return {
    ...(deps.nativeEvidence ? { searchNative: createNativeSearch({
      nativeEvidence: deps.nativeEvidence, listNativeLocators: deps.listNativeLocators ?? (tenantId => treeNativeLocators(deps.db ?? getDb(), tenantId)),
    }) } : {}),
    async search(tenantId, query, k): Promise<SearchHit[]> {
      // Resolved per call, not at construction: production builds these deps at boot, before
      // connect(). Tenant-scoping still runs through scopedCollection on the injected handle.
      const db = deps.db ?? getDb();
      const visibility = createKnowledgeVisibility(db);
      // buildTurnPrefilter owns the superset invariant and is pinned by search-prefilter.test.ts
      // (ISS-072: this construction previously lived inline here, where no test could fail on it).
      const prefilter = buildTurnPrefilter(query);
      if (prefilter === null) return [];
      const candidates = await readSearchCandidateTurns(db, tenantId, prefilter);
      const turns = await visibility.filterTurns(tenantId, candidates);
      const scored = lexicalSearchTurns(
        query,
        turns.map((t) => ({ _id: t._id, sessionId: t.sessionId, text: t.text })),
        k,
      );
      const turnById = new Map(turns.map((t) => [t._id, t]));
      const sessionIds = [...new Set(scored.map((s) => s.sessionId))];
      const sessions = await Promise.all(sessionIds.map((id) => visibility.safeCitationSession(tenantId, id)));
      const sessionById = new Map(sessionIds.map((id, i) => [id, sessions[i] ?? null]));
      return scored.map((hit) => ({
        turnId: hit.turnId,
        sessionId: hit.sessionId,
        score: hit.score,
        turn: turnById.get(hit.turnId) ?? null,
        session: sessionById.get(hit.sessionId) ?? null,
      }));
    },
  };
}
