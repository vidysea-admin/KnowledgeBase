/**
 * apps/api/src/search-store.ts — the real `SearchDeps` for `routes/search.ts`. Extracted from
 * `store.ts` when that file crossed its 300-LOC budget; the same separate-store-module convention
 * `ingest-store.ts` and `whatsapp-store.ts` already follow, so this is the established shape
 * rather than a new one.
 */
import type { Db } from "mongodb";
import { assertValidTenantId, getDb, scopedCollection, withTenant } from "@lkb/db";
import { lexicalQueryTokens, lexicalSearchTurns, treeIndexRootFilter, type LexicalHit } from "@lkb/index";
import type { NativeSourceLocator, Turns } from "@lkb/core";
import { buildTurnPrefilter } from "./search-prefilter.js";
import { readSearchCandidateTurns } from "./transcript-review/search-reader.js";
import { createKnowledgeVisibility, newVisibilityRequestMemo, withDeadline, type FilterTurnsOptions } from "./visibility/knowledge.js";
import { searchCacheKey, TenantSearchCache } from "./search-cache/search-cache.js";
import { createHash } from "node:crypto";
import type { NativeSearchHit, NativeSearchResult, SearchCallOptions, SearchDeps, SearchHit } from "./routes/search.js";
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
  /** Per-tenant result cache lifetime in ms; 0 disables it. Default 45s (D-206 K5). Rules: `search-cache.ts`. */
  cacheTtlMs?: number;
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


/**
 * Everything that decides what a tenant may see, hashed: source kind + consent, session -> source binding and index status,
 * and every transcript-review head revision. Read on EVERY cached request (three small tenant-scoped reads), so a consent
 * withdrawal, relabel, new session or transcript correction invalidates the cache immediately instead of after the TTL.
 * `waSessions` are sessions whose source is a whatsapp-batch: results touching them are never cached, because WhatsApp
 * visibility also depends on per-candidate approvals this fingerprint does not read.
 */
async function visibilityFingerprint(db: Pick<Db, "collection">, tenantId: string): Promise<{ fingerprint: string; waSessions: Set<string> }> {
  assertValidTenantId(tenantId, "search.cache");
  const read = async (name: string, projection: Record<string, 1>): Promise<Record<string, unknown>[]> => {
    const rows = await db.collection<Record<string, unknown> & { tenantId: string }>(name).find(withTenant<Record<string, unknown> & { tenantId: string }>(tenantId, {}), { projection }).toArray();
    if (rows.some(row => row.tenantId !== tenantId)) throw new Error("fingerprint scope mismatch");
    return rows;
  };
  // tenantId is part of every projection so the scope check above is a real check, not a vacuous one.
  const [sources, sessions, heads] = await Promise.all([
    read("sources", { _id: 1, tenantId: 1, kind: 1, consent: 1 }), read("sessions", { _id: 1, tenantId: 1, sourceId: 1, status: 1 }),
    read("transcript_reviews", { _id: 1, tenantId: 1, revision: 1 }),
  ]);
  const byId = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const waSources = new Set(sources.filter(row => row.kind === "whatsapp-batch").map(row => String(row._id)));
  const fingerprint = createHash("sha256").update(JSON.stringify([byId(sources), byId(sessions), byId(heads)])).digest("hex");
  return { fingerprint, waSessions: new Set(sessions.filter(row => waSources.has(String(row.sourceId))).map(row => String(row._id))) };
}

const DEFAULT_CACHE_TTL_MS = 45_000;
/** Visibility is judged on the best-scoring candidates first: the first slice is a few multiples of k, then it doubles. */
const FIRST_SLICE_FACTOR = 4, MIN_FIRST_SLICE = 24;

/**
 * K2 (D-206): score candidates first, judge visibility only on the best ones. Scoring is a pure per-turn function (no corpus
 * statistics), so ranking ALL candidates first and walking down the ranking in growing slices until `k` visible hits are
 * found (or the ranking is exhausted) returns exactly what filter-then-score returned: the ranking is stable, visibility
 * only removes rows, and nothing is ever dropped by a cap, only by visibility. Shared by /search and the /ask lexical arm.
 */
export async function rankVisibleTurns(visibility: ReturnType<typeof createKnowledgeVisibility>, tenantId: string, query: string,
  candidates: readonly Turns[], k: number, options: FilterTurnsOptions = {}): Promise<{ scored: LexicalHit[]; turnById: Map<string, Turns> }> {
  const ranked = lexicalSearchTurns(query, candidates.map((t) => ({ _id: t._id, sessionId: t.sessionId, text: t.text })), candidates.length);
  const candidateById = new Map(candidates.map((t) => [t._id, t]));
  const turnById = new Map<string, Turns>(), scored: LexicalHit[] = [];
  let cursor = 0, slice = Math.max(k * FIRST_SLICE_FACTOR, MIN_FIRST_SLICE);
  while (scored.length < k && cursor < ranked.length) {
    const part = ranked.slice(cursor, cursor + slice);
    cursor += part.length; slice *= 2;
    for (const turn of await visibility.filterTurns(tenantId, part.map((hit) => candidateById.get(hit.turnId)!), options)) turnById.set(turn._id, turn);
    for (const hit of part) if (turnById.has(hit.turnId) && scored.length < k) scored.push(hit);
  }
  return { scored, turnById };
}

export function createMongoSearchDeps(deps: SearchStoreDeps = {}): SearchDeps {
  const cache = new TenantSearchCache<SearchHit[]>({ ttlMs: deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS });
  return {
    ...(deps.nativeEvidence ? { searchNative: createNativeSearch({
      nativeEvidence: deps.nativeEvidence, listNativeLocators: deps.listNativeLocators ?? (tenantId => treeNativeLocators(deps.db ?? getDb(), tenantId)),
    }) } : {}),
    async search(tenantId, query, k, options: SearchCallOptions = {}): Promise<SearchHit[]> {
      // Resolved per call, not at construction: production builds these deps at boot, before
      // connect(). Tenant-scoping still runs through scopedCollection on the injected handle.
      const db = deps.db ?? getDb();
      // buildTurnPrefilter owns the superset invariant and is pinned by search-prefilter.test.ts
      // (ISS-072: this construction previously lived inline here, where no test could fail on it).
      const prefilter = buildTurnPrefilter(query);
      if (prefilter === null) return [];
      // Cache rule (D-206 K5): serve only a same-tenant entry younger than the TTL whose visibility fingerprint, read NOW,
      // is unchanged. A failure to compute the fingerprint bypasses the cache; it never serves on a guess.
      let state: { fingerprint: string; waSessions: Set<string> } | null = null;
      const key = searchCacheKey(query, k);
      if (cache.enabled) {
        try { state = await visibilityFingerprint(db, tenantId); } catch { state = null; }
        const cached = state ? cache.get(tenantId, key, state.fingerprint) : undefined;
        if (cached) return cached;
      }
      const visibility = createKnowledgeVisibility(db);
      const candidates = await withDeadline(options.deadlineAt, () => readSearchCandidateTurns(db, tenantId, prefilter));
      const { scored, turnById } = await rankVisibleTurns(visibility, tenantId, query, candidates, k,
        { memo: newVisibilityRequestMemo(), throwOnError: true, ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }) });
      const sessionIds = [...new Set(scored.map((s) => s.sessionId))];
      const sessions = await Promise.all(sessionIds.map((id) => visibility.safeCitationSession(tenantId, id)));
      const sessionById = new Map(sessionIds.map((id, i) => [id, sessions[i] ?? null]));
      const hits = scored.map((hit) => ({
        turnId: hit.turnId,
        sessionId: hit.sessionId,
        score: hit.score,
        turn: turnById.get(hit.turnId) ?? null,
        session: sessionById.get(hit.sessionId) ?? null,
      }));
      if (state && !hits.some((h) => state!.waSessions.has(h.sessionId))) cache.set(tenantId, key, state.fingerprint, hits);
      return hits;
    },
  };
}
