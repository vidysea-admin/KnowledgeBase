/**
 * apps/api/src/route/route-store.ts - D-206 /route. The real `RouteDeps`: vectorless, fast, same hit shape as /search.
 *   A. BM25 over the tree's session/topic nodes (+ derived facets) picks <= 3 sessions (deterministic, no LLM).
 *   B. Only when A is low-confidence: ONE bounded `selectNodes` round on a fast model, hard timeout, falling back to A.
 *   C. Indexed fetch of the selected sessions' turns, in-memory BM25 ranking, visibility checked for the selected
 *      sessions only (withdrawn / index-failed dropped AFTER selection), `safeCitationSession` labels.
 * The tree only routes: answer text is always a `turns` row. The tree is read through the injected trusted `TreeStore`
 * (ineligible sessions already excluded) and cached per tenant; the cache only ever holds routing text.
 * D-208 item 2: the index is also PERSISTED (collection `route_index`, one document per tenant of the API's own database). A cold
 *   in-memory cache first reads that document and serves it only if its stamp (the shared visibility fingerprint + the tree root's
 *   `indexRevision`, both read first) equals the current one; otherwise the tree is rebuilt and the document overwritten. Every
 *   persisted read/write is bounded and best-effort: failure or timeout means the build below, never a hang and never a stale serve.
 */
import type { Db } from "mongodb";
import type { Sessions, TreeIndexNode, Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { selectNodes } from "@lkb/ask";
import { assertValidTenantId, getDb, routeIndex, scopedCollection, withTenant } from "@lkb/db";
import { treeIndexRootFilter, treeSearch } from "@lkb/index";
import { visibilityFingerprint, withReadDeadline, type VisibilityState } from "../search-cache/search-cache.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { createKnowledgeVisibility, type KnowledgeVisibility } from "../visibility/knowledge.js";
import type { SearchHit } from "../routes/search.js";
import { bm25Ceiling, bm25Scores, buildBm25, tokenize } from "./bm25.js";
import { buildRouteIndex, frontierRoot, refsOf, routeIndexFromDoc, routeIndexToDoc, routeStepA, MAX_SESSIONS, type RouteIndex, type RouteStamp } from "./bm25-router.js";

/** `signal` fires when the request's hard deadline passes (or it failed): route() stops reading and the step B model call is aborted. */
export interface RouteControl { deadlineAt: number; signal?: AbortSignal }
export interface RouteStats { stepAMs: number; confident: boolean; usedLlm: boolean; llmFailed: boolean; selectedSessions: string[]; totalMs: number }
export interface RouteDeps {
  route(tenantId: string, query: string, k: number, ctl: RouteControl): Promise<SearchHit[]>;
  /** The shared visibility fingerprint (`search-cache.ts`) the HTTP result cache is bound to (ISS-420). Absent -> constant (fakes only). */
  fingerprint?(tenantId: string, ctl: { deadlineAt: number }): Promise<VisibilityState>;
}
export class RouteTimeout extends Error { constructor() { super("route_timeout"); } }
export class RouteNoTree extends Error { constructor() { super("no_tree"); } }

/** Observable outcome of one persisted-index step (D-208): metrics and tests; never an input to routing. */
export type PersistEvent = "persisted-hit" | "persisted-miss" | "persisted-stale" | "persisted-invalid" | "read-failed" | "written" | "write-failed" | "skipped-oversize";

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
  /** Persist the index in `route_index` (default true). False -> the pre-D-208 behaviour: memory only. */
  persist?: boolean;
  /** Largest serialized document written (default 12 MB, under BSON's 16 MB); a bigger index stays memory-only. */
  maxDocBytes?: number;
  onPersist?: (event: PersistEvent) => void;
  observe?: (stats: RouteStats) => void;
}
const STEP_B_TIMEOUT_MS = 1200, INDEX_TTL_MS = 60_000, CANDIDATE_SESSIONS = 6, MAX_ROUNDS = 3;
const PERSIST_READ_MS = 1000, PERSIST_WRITE_MS = 5000, MAX_DOC_BYTES = 12_000_000;

type Settled<T> = { ok: true; value: T } | { ok: false };
/** Runs `run` for at most `ms`. NEVER rejects: a throw, a rejection or a timeout is `{ ok: false }` (the caller falls back). */
function settle<T>(run: () => Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false }), Math.max(1, ms));
    Promise.resolve().then(run).then((value) => { clearTimeout(timer); resolve({ ok: true, value }); }, () => { clearTimeout(timer); resolve({ ok: false }); });
  });
}
/** `indexRevision` of the tenant's tree_index root (null when absent): changes whenever the tree is rewritten, which the visibility fingerprint cannot see. */
async function treeRevision(db: Pick<Db, "collection">, tenantId: string): Promise<number | null> {
  const row = await db.collection<{ tenantId: string; indexRevision?: number }>("tree_index").findOne(withTenant<{ tenantId: string; indexRevision?: number }>(tenantId, treeIndexRootFilter(tenantId)), { projection: { _id: 1, tenantId: 1, indexRevision: 1 } });
  if (row && row.tenantId !== tenantId) throw new Error("tree revision scope mismatch");
  return Number.isSafeInteger(row?.indexRevision) ? row!.indexRevision! : null;
}

/** Rejects with RouteTimeout when `ms` elapse OR `abort` fires, and aborts `abort` on the timeout, so the pending model call is cancelled, not abandoned. */
function withTimeout<T>(p: Promise<T>, ms: number, abort: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => { clearTimeout(t); abort.signal.removeEventListener("abort", onAbort); };
    const onAbort = () => { stop(); reject(new RouteTimeout()); };
    const t = setTimeout(() => { stop(); abort.abort(); reject(new RouteTimeout()); }, ms);
    abort.signal.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { stop(); resolve(v); }, (e) => { stop(); reject(e); });
  });
}

export function createRouteDeps(deps: RouteStoreDeps): RouteDeps {
  const now = deps.now ?? Date.now, ttl = deps.indexTtlMs ?? INDEX_TTL_MS;
  const cache = new Map<string, { index: RouteIndex | null; flight?: Promise<RouteIndex> }>(); // key = tenantId, never shared

  const persist = deps.persist !== false, emit = (e: PersistEvent) => { try { deps.onPersist?.(e); } catch { /* an observer never breaks routing */ } };
  /** Persisted index if its stamp is current, else a tree rebuild that is written back. `deadlineAt` only bounds the persisted reads. */
  const load = async (tenantId: string, deadlineAt: number): Promise<RouteIndex> => {
    const raw = deps.db ?? getDb();
    let stamp: RouteStamp | null = null;
    if (persist) {
      // The stamp is read BEFORE the tree, so a change racing the build leaves the stored stamp older, never newer: the next reader rebuilds.
      const db = withReadDeadline(raw, deadlineAt, now), budget = Math.min(PERSIST_READ_MS, Math.floor((deadlineAt - now()) / 2));
      // Two independent bounded reads: a route_index read that fails still leaves a usable stamp, so the rebuild is written back.
      const [state, stored] = await Promise.all([
        settle(async () => { const [fp, revision] = await Promise.all([visibilityFingerprint(db, tenantId), treeRevision(db, tenantId)]); return { fingerprint: fp.fingerprint, treeRevision: revision } as RouteStamp; }, budget),
        settle(() => routeIndex(tenantId, db as Db).findOne({ _id: tenantId }), budget),
      ]);
      if (state.ok) stamp = state.value;
      if (!state.ok || !stored.ok) emit("read-failed");
      if (stamp && stored.ok) {
        const hit = stored.value ? routeIndexFromDoc(stored.value, tenantId, stamp, now()) : null;
        if (hit) { emit("persisted-hit"); return hit; }
        const row = stored.value as { fingerprint?: unknown; treeRevision?: unknown } | null;
        emit(!row ? "persisted-miss" : row.fingerprint !== stamp.fingerprint || row.treeRevision !== stamp.treeRevision ? "persisted-stale" : "persisted-invalid");
      }
    }
    const tree = await deps.tree.load(tenantId);
    if (!tree) throw new RouteNoTree();
    const index = buildRouteIndex(tree, tenantId, now());
    if (stamp) {
      // Best-effort write-through on the API's normal handle; the request never waits for it and never fails because of it.
      const doc = routeIndexToDoc(index, tenantId, stamp);
      if (Buffer.byteLength(JSON.stringify(doc)) > (deps.maxDocBytes ?? MAX_DOC_BYTES)) emit("skipped-oversize");
      else void settle(() => routeIndex(tenantId, raw as Db).replaceOne({ _id: tenantId }, doc, { upsert: true }), PERSIST_WRITE_MS).then((w) => emit(w.ok ? "written" : "write-failed"));
    }
    return index;
  };
  /** Fresh index, or the stale one while a single-flight refresh runs (a failed refresh keeps serving the stale index). */
  const indexFor = async (tenantId: string, deadlineAt: number): Promise<RouteIndex> => {
    const entry = cache.get(tenantId) ?? { index: null };
    cache.set(tenantId, entry);
    if (entry.index && now() - entry.index.builtAt < ttl) return entry.index;
    entry.flight ??= load(tenantId, deadlineAt).then((i) => { entry.index = i; return i; }).finally(() => { entry.flight = undefined; });
    if (entry.index) { entry.flight.catch(() => undefined); return entry.index; }
    return entry.flight;
  };

  return {
    /** The same visibility fingerprint /search binds its cache to (ISS-420); read under the request deadline (ISS-427). */
    fingerprint: async (tenantId, ctl) => visibilityFingerprint(withReadDeadline(deps.db ?? getDb(), ctl.deadlineAt, now), tenantId),
    async route(tenantId, query, k, ctl): Promise<SearchHit[]> {
    assertValidTenantId(tenantId, "route");
    const t0 = now();
    // ISS-427: every read below carries maxTimeMS derived from the deadline. ISS-421: `ctl.signal` stops the work after it.
    const db = withReadDeadline(deps.db ?? getDb(), ctl.deadlineAt, now), visibility = deps.visibility ?? createKnowledgeVisibility(db);
    const left = () => ctl.deadlineAt - now();
    const check = () => { if (ctl.signal?.aborted || left() <= 0) throw new RouteTimeout(); };
    check();
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

    // H-14 / ISS-WARLG-001: step B sends routing text to an EXTERNAL model, and the index (fresh, warm in-process or persisted) is blind to link
    // transitions, so eligibility is re-read per request here. A fresh `createKnowledgeVisibility` (never `deps.visibility`, whose memo could outlive a
    // request); it reads the live whatsapp_links row. Fail closed: a throw, a read error or the half of the remaining budget it is allowed means "not eligible".
    const external = createKnowledgeVisibility(db);
    const externalGate = async (ids: readonly string[]): Promise<Set<string>> => {
      const checked = await Promise.all(ids.map(async (id) => { const r = await settle(() => external.externalModelEligibleSession(tenantId, id), Math.floor(left() / 2)); return [id, r.ok && r.value === true] as const; }));
      return new Set(checked.filter(([, ok]) => ok).map(([id]) => id));
    };

    const index = await indexFor(tenantId, ctl.deadlineAt);
    check();
    const a = routeStepA(index, query);
    const stepAMs = now() - t0;
    let order = a.sessions.map((s) => s.sessionId), usedLlm = false, llmFailed = false;
    if (!a.confident && deps.complete && left() > 100) {
      usedLlm = true;
      try {
        const root = frontierRoot(index, a, await externalGate([...await gate(index.sessionIds)]), tenantId);
        check(); // a request abort that landed during the gate must not start the model call (the listener below would never fire)
        if (!root.children.length) llmFailed = true;
        else {
          const stepB = new AbortController(), onAbort = () => stepB.abort();
          ctl.signal?.addEventListener("abort", onAbort, { once: true });
          try {
            const complete = (job: Job) => deps.complete!({ ...job, signal: stepB.signal }, tenantId);
            const budget = Math.min(deps.stepBTimeoutMs ?? STEP_B_TIMEOUT_MS, Math.max(50, left() - 200));
            const nodes = await withTimeout(selectNodes(query, root, complete, treeSearch), budget, stepB);
            const chosen = nodes.flatMap(refsOf);
            if (chosen.length) order = [...new Set([...chosen, ...order])]; else llmFailed = true;
          } finally { ctl.signal?.removeEventListener("abort", onAbort); }
        }
      } catch { llmFailed = true; } // timeout / provider error / garbage -> step A's result, never a hang (a request abort is re-raised by check())
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
