/**
 * apps/api/src/route/route-store.ts - D-206 /route. The real `RouteDeps`: vectorless, fast, same hit shape as /search.
 *   A. BM25 over the tree's session/topic nodes (+ derived facets) picks <= 3 sessions (deterministic, no LLM).
 *   B. Only when A is low-confidence: ONE bounded `selectNodes` round on a fast model, hard timeout, falling back to A.
 *   C. Indexed fetch of the selected sessions' turns, in-memory BM25 ranking, visibility checked for the selected
 *      sessions only (withdrawn / index-failed dropped AFTER selection), `safeCitationSession` labels.
 * The tree only routes: answer text is always a `turns` row. The tree is read through the injected trusted `TreeStore`
 * (ineligible sessions already excluded) and cached per tenant; the cache only ever holds routing text.
 */
import type { Db } from "mongodb";
import type { Sessions, TreeIndexNode, Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { selectNodes } from "@lkb/ask";
import { assertValidTenantId, getDb, scopedCollection } from "@lkb/db";
import { treeSearch } from "@lkb/index";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { createKnowledgeVisibility, type KnowledgeVisibility } from "../visibility/knowledge.js";
import type { SearchHit } from "../routes/search.js";
import { bm25Ceiling, bm25Scores, buildBm25, tokenize } from "./bm25.js";
import { buildRouteIndex, frontierRoot, refsOf, routeStepA, MAX_SESSIONS, type RouteIndex } from "./bm25-router.js";

export interface RouteControl { deadlineAt: number }
export interface RouteStats { stepAMs: number; confident: boolean; usedLlm: boolean; llmFailed: boolean; selectedSessions: string[]; totalMs: number }
export interface RouteDeps { route(tenantId: string, query: string, k: number, ctl: RouteControl): Promise<SearchHit[]> }
export class RouteTimeout extends Error { constructor() { super("route_timeout"); } }
export class RouteNoTree extends Error { constructor() { super("no_tree"); } }

export interface RouteStoreDeps {
  db?: Pick<Db, "collection">;
  /** Trusted tree reader (production: `createMongoTreeStore`). */
  tree: { load(tenantId: string): Promise<TreeIndexNode | null> };
  /** Step B model call (production: the `ask` provider chain). Absent -> step B disabled, step A answers alone. */
  complete?: (job: Job, tenantId: string) => Promise<CompleteResult>;
  visibility?: KnowledgeVisibility;
  now?: () => number;
  stepBTimeoutMs?: number;
  indexTtlMs?: number;
  observe?: (stats: RouteStats) => void;
}
const STEP_B_TIMEOUT_MS = 1200, INDEX_TTL_MS = 60_000, CANDIDATE_SESSIONS = 6, MAX_ROUNDS = 3;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RouteTimeout()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function createRouteDeps(deps: RouteStoreDeps): RouteDeps {
  const now = deps.now ?? Date.now, ttl = deps.indexTtlMs ?? INDEX_TTL_MS;
  const cache = new Map<string, { index: RouteIndex | null; flight?: Promise<RouteIndex> }>(); // key = tenantId, never shared

  const load = async (tenantId: string): Promise<RouteIndex> => {
    const tree = await deps.tree.load(tenantId);
    if (!tree) throw new RouteNoTree();
    return buildRouteIndex(tree, tenantId, now());
  };
  /** Fresh index, or the stale one while a single-flight refresh runs (a failed refresh keeps serving the stale index). */
  const indexFor = async (tenantId: string): Promise<RouteIndex> => {
    const entry = cache.get(tenantId) ?? { index: null };
    cache.set(tenantId, entry);
    if (entry.index && now() - entry.index.builtAt < ttl) return entry.index;
    entry.flight ??= load(tenantId).then((i) => { entry.index = i; return i; }).finally(() => { entry.flight = undefined; });
    if (entry.index) { entry.flight.catch(() => undefined); return entry.index; }
    return entry.flight;
  };

  return { async route(tenantId, query, k, ctl): Promise<SearchHit[]> {
    assertValidTenantId(tenantId, "route");
    const t0 = now();
    const db = deps.db ?? getDb(), visibility = deps.visibility ?? createKnowledgeVisibility(db);
    const left = () => ctl.deadlineAt - now();
    const check = () => { if (left() <= 0) throw new RouteTimeout(); };
    const gates = new Map<string, Promise<boolean>>(); // per-request memo: one gate per session
    const gate = async (ids: readonly string[]): Promise<Set<string>> => {
      const missing = ids.filter((id) => !gates.has(id));
      if (missing.length) {
        const rows = scopedCollection<Sessions>(db as Db, "sessions")(tenantId).find({ _id: { $in: missing } }).toArray();
        for (const id of missing) gates.set(id, rows.then(async (all) => {
          const s = all.find((r) => r._id === id);
          return !!s && s.tenantId === tenantId && s.status?.index === "done" && await visibility.sessionVisible(tenantId, id);
        }).catch(() => false));
      }
      const checked = await Promise.all(ids.map(async (id) => [id, await gates.get(id)!] as const));
      return new Set(checked.filter(([, ok]) => ok).map(([id]) => id));
    };

    const index = await indexFor(tenantId);
    check();
    const a = routeStepA(index, query);
    const stepAMs = now() - t0;
    let order = a.sessions.map((s) => s.sessionId), usedLlm = false, llmFailed = false;
    if (!a.confident && deps.complete && left() > 100) {
      usedLlm = true;
      try {
        const root = frontierRoot(index, a, await gate(index.sessionIds), tenantId);
        if (!root.children.length) llmFailed = true;
        else {
          const complete = (job: Job) => deps.complete!(job, tenantId);
          const budget = Math.min(deps.stepBTimeoutMs ?? STEP_B_TIMEOUT_MS, Math.max(50, left() - 200));
          const nodes = await withTimeout(selectNodes(query, root, complete, treeSearch), budget);
          const chosen = nodes.flatMap(refsOf);
          if (chosen.length) order = [...new Set([...chosen, ...order])]; else llmFailed = true;
        }
      } catch { llmFailed = true; } // timeout / provider error / garbage -> step A's result, never a hang
    }
    check();
    const live = await gate(order.slice(0, Math.max(CANDIDATE_SESSIONS, MAX_SESSIONS * 2)));
    const selected = order.filter((id) => live.has(id)).slice(0, MAX_SESSIONS);
    deps.observe?.({ stepAMs, confident: a.confident, usedLlm, llmFailed, selectedSessions: selected, totalMs: now() - t0 });
    if (!selected.length) return [];

    const raw = await scopedCollection<Turns>(db as Db, "turns")(tenantId).find({ sessionId: { $in: selected } }).toArray();
    check();
    const effective = (await Promise.all(selected.map((sid) => readEffectiveTurns(db, tenantId, raw.filter((t) => t.sessionId === sid), sid)))).flat();
    const q = tokenize(query);
    const ix = buildBm25(effective.map((t) => tokenize(t.text)));
    const scores = bm25Scores(ix, q), ceiling = bm25Ceiling(ix, q) || 1;
    const ranked = effective.map((turn, i) => ({ turn, score: scores[i]! })).filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score || (x.turn._id < y.turn._id ? -1 : 1));
    // Visibility only on the best-ranked slice, refilled in rounds if some are dropped (rank first, check after).
    const kept: { turn: Turns; score: number }[] = [], batch = Math.min(60, Math.max(12, k * 3));
    for (let round = 0, at = 0; round < MAX_ROUNDS && at < ranked.length && kept.length < k; round++, at += batch) {
      check();
      const slice = ranked.slice(at, at + batch);
      const ok = new Set((await visibility.filterTurns(tenantId, slice.map((r) => r.turn))).map((t) => t._id));
      kept.push(...slice.filter((r) => ok.has(r.turn._id)));
    }
    const top = kept.slice(0, k);
    const sids = [...new Set(top.map((r) => r.turn.sessionId))];
    const labels = await Promise.all(sids.map((id) => visibility.safeCitationSession(tenantId, id)));
    const labelOf = new Map(sids.map((id, i) => [id, labels[i] ?? null]));
    return top.map((r) => ({ turnId: r.turn._id, sessionId: r.turn.sessionId, score: Math.round(Math.min(1, r.score / ceiling) * 10_000) / 10_000,
      turn: r.turn, session: labelOf.get(r.turn.sessionId) ?? null }));
  } };
}
