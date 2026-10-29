/**
 * apps/api/src/route/route-router.ts - D-206. `GET /route?q=<query>&k=<n>`: the vectorless fast path. Same auth, `search` scope,
 * tenant scoping and response shape as `routes/search.ts` (`{ query, hits: SearchHit[] }`) so a client can swap it in.
 * Hard deadline (default 3 s -> 503 `route_timeout`, never a hang; the in-flight work is aborted via `ctl.signal`, ISS-421)
 * and a short-TTL cache that is keyed per tenant first, so one tenant's cached hits can never be served to another.
 * The cache is the SAME `TenantSearchCache` /search uses, bound to the SAME visibility fingerprint (ISS-420): a consent
 * withdrawal, index-status change or any other visibility change takes effect on the very next request, not after the TTL.
 * Retrieval itself lives in `route/route-store.ts`.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { RouteNoTree, RouteTimeout, type RouteDeps } from "./route-store.js";
import type { SearchHit } from "../routes/search.js";
import { searchCacheKey, TenantSearchCache, type VisibilityState } from "../search-cache/search-cache.js";

export const ROUTE_DEFAULT_K = 5;
export const ROUTE_MAX_K = 20;
export const ROUTE_MAX_QUERY_CHARS = 512;
export interface RouteRouterOptions { deadlineMs?: number; cacheTtlMs?: number; cacheMaxPerTenant?: number; now?: () => number }
const DEADLINE_MS = 3000, CACHE_TTL_MS = 20_000, CACHE_MAX = 100;

export function createRouteRouter(deps: RouteDeps, opts: RouteRouterOptions = {}): Router {
  const router = Router();
  const now = opts.now ?? Date.now, deadlineMs = opts.deadlineMs ?? DEADLINE_MS, ttl = opts.cacheTtlMs ?? CACHE_TTL_MS, max = opts.cacheMaxPerTenant ?? CACHE_MAX;
  const cache = new TenantSearchCache<SearchHit[]>({ ttlMs: ttl, maxPerTenant: max, now }); // tenantId -> (query + k) -> hits, bound to a fingerprint

  router.get("/route", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) { res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" }); return; }
    if (Array.from(q).length > ROUTE_MAX_QUERY_CHARS) { res.status(400).json({ error: "bad_request", message: `query parameter 'q' must be at most ${ROUTE_MAX_QUERY_CHARS} characters` }); return; }
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), ROUTE_MAX_K) : ROUTE_DEFAULT_K;
    const tenantId = req.auth!.tenantId, key = searchCacheKey(q, k);
    const deadlineAt = now() + deadlineMs, controller = new AbortController();
    // Cache rule (ISS-420): serve only a same-tenant entry younger than the TTL whose visibility fingerprint, read NOW, is
    // unchanged. Deps without a fingerprint reader (fakes) use a constant; a reader that FAILS bypasses the cache, never a guess.
    let state: VisibilityState | null = { fingerprint: "", waSessions: new Set() };
    if (cache.enabled && deps.fingerprint) state = await deps.fingerprint(tenantId, { deadlineAt }).catch(() => null);
    const cached = state ? cache.get(tenantId, key, state.fingerprint) : undefined;
    if (cached) { res.status(200).json({ query: q, hits: cached }); return; }
    let timer: NodeJS.Timeout | undefined;
    try {
      const hits = await Promise.race([
        deps.route(tenantId, q, k, { deadlineAt, signal: controller.signal }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouteTimeout()), deadlineMs); }),
      ]);
      if (state && !hits.some((h) => state!.waSessions.has(h.sessionId))) cache.set(tenantId, key, state.fingerprint, hits);
      res.status(200).json({ query: q, hits });
    } catch (e) {
      controller.abort(e); // whatever failed, stop any work still running for this request
      if (e instanceof RouteTimeout) res.status(503).json({ error: "route_timeout" });
      else if (e instanceof RouteNoTree) res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" });
      else res.status(503).json({ error: "route_unavailable" });
    } finally { if (timer) clearTimeout(timer); }
  });

  return router;
}
