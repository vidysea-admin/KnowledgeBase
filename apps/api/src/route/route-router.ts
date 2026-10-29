/**
 * apps/api/src/route/route-router.ts - D-206. `GET /route?q=<query>&k=<n>`: the vectorless fast path. Same auth, `search` scope,
 * tenant scoping and response shape as `routes/search.ts` (`{ query, hits: SearchHit[] }`) so a client can swap it in.
 * Hard deadline (default 3 s -> 503 `route_timeout`, never a hang) and a short-TTL cache that is keyed per tenant first,
 * so one tenant's cached hits can never be served to another. Retrieval itself lives in `route/route-store.ts`.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { RouteNoTree, RouteTimeout, type RouteDeps } from "./route-store.js";
import type { SearchHit } from "../routes/search.js";

export const ROUTE_DEFAULT_K = 5;
export const ROUTE_MAX_K = 20;
export const ROUTE_MAX_QUERY_CHARS = 512;
export interface RouteRouterOptions { deadlineMs?: number; cacheTtlMs?: number; cacheMaxPerTenant?: number; now?: () => number }
const DEADLINE_MS = 3000, CACHE_TTL_MS = 20_000, CACHE_MAX = 100;

export function createRouteRouter(deps: RouteDeps, opts: RouteRouterOptions = {}): Router {
  const router = Router();
  const now = opts.now ?? Date.now, deadlineMs = opts.deadlineMs ?? DEADLINE_MS, ttl = opts.cacheTtlMs ?? CACHE_TTL_MS, max = opts.cacheMaxPerTenant ?? CACHE_MAX;
  const cache = new Map<string, Map<string, { at: number; hits: SearchHit[] }>>(); // tenantId -> (k + query) -> hits

  router.get("/route", requireScope("search"), async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) { res.status(400).json({ error: "bad_request", message: "query parameter 'q' is required and must be non-empty" }); return; }
    if (Array.from(q).length > ROUTE_MAX_QUERY_CHARS) { res.status(400).json({ error: "bad_request", message: `query parameter 'q' must be at most ${ROUTE_MAX_QUERY_CHARS} characters` }); return; }
    const kParam = Number(req.query.k);
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(Math.floor(kParam), ROUTE_MAX_K) : ROUTE_DEFAULT_K;
    const tenantId = req.auth!.tenantId, key = `${k}\u0000${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
    const mine = cache.get(tenantId), hit = mine?.get(key);
    if (hit && now() - hit.at < ttl) { res.status(200).json({ query: q, hits: hit.hits }); return; }
    const deadlineAt = now() + deadlineMs;
    let timer: NodeJS.Timeout | undefined;
    try {
      const hits = await Promise.race([
        deps.route(tenantId, q, k, { deadlineAt }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouteTimeout()), deadlineMs); }),
      ]);
      const store = mine ?? new Map(); cache.set(tenantId, store);
      if (store.size >= max) store.delete(store.keys().next().value as string);
      store.set(key, { at: now(), hits });
      res.status(200).json({ query: q, hits });
    } catch (e) {
      if (e instanceof RouteTimeout) res.status(503).json({ error: "route_timeout" });
      else if (e instanceof RouteNoTree) res.status(404).json({ error: "not_found", message: "no tree index built for this tenant yet" });
      else res.status(503).json({ error: "route_unavailable" });
    } finally { if (timer) clearTimeout(timer); }
  });

  return router;
}
