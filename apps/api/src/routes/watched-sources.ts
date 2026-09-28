/**
 * apps/api/src/routes/watched-sources.ts — A13's missing entrypoint.
 *
 * T-027 built this feature's schema, its tenant-scoped accessors and its pure due-check, all
 * checker-PASSed — and then nothing called them. The module comment in
 * `packages/ingest/src/watched/schedule.ts` still reads "a future scheduler runs `listActive`".
 * The `watched_sources` collection has been empty ever since, which is precisely why catalogue A13
 * scores MISSING: the probe is `collection watched_sources (empty)`.
 *
 * The missing piece was never the logic. It was that no user action could reach it. This is that
 * action: register a URL to watch, and list what is being watched.
 *
 * Validation is deliberately strict, because a watched source is a URL the system will later fetch
 * on a timer. An unvalidated `url` here is a stored server-side request target — so the scheme is
 * checked against http(s) rather than trusted, the same reasoning that made the Ask page refuse a
 * `javascript:` citation.
 *
 * U4d (D-047) ALSO mounts `GET /watch-state` here — a second, genuinely different concern
 * (`watch_state`/`watch_heartbeat`, the U2/U4b Drive-Gmail-Calendar watcher collections R1's alert
 * fires off, disjoint from this file's `watched_sources` URL bookmarks, ISS-358) living in the same
 * file only because `apps/api/src` and `apps/api/src/routes/` are both at/over their `lint-dirsize`
 * budgets; see that route's own comment for the reasoning and the precedent (`routes/health.ts`).
 */
import { Router, type Request, type Response } from "express";
import type { WatchedSources, WatchHeartbeat, WatchState } from "@lkb/core";
import { requireScope } from "../auth.js";
import { heartbeatStatuses, type HeartbeatStatus } from "./health.js";

export interface WatchedRunSummary {
  checked: number;
  changed: number;
  skipped: number;
  failed: { id: string; url: string; reason: string }[];
  /** Sources the run left untouched because its cap or deadline stopped it. */
  remaining: number;
}

export interface WatchedSourceDeps {
  create(tenantId: string, doc: Omit<WatchedSources, "tenantId">): Promise<void>;
  listActive(tenantId: string): Promise<WatchedSources[]>;
  /**
   * Run the due sources: listActive -> isDueForCheck -> guarded fetch -> recordFetch. This is the
   * only thing that makes A13 a working feature rather than a stored intention -- rows prove
   * someone asked for a URL to be watched, a run proves anything was ever watched.
   */
  run(tenantId: string): Promise<WatchedRunSummary>;

  // --- U4d (D-047/D-048/ISS-361/ISS-358): GET /watch-state below --------------------------
  // Three fields, all optional, added to THIS interface rather than as a new file/router: ISS-358
  // found R1's alert (`notifyPollFailed`) fires off `watch_state` and R4's page (`WatchPage.tsx`)
  // reads only `watched_sources` — genuinely disjoint collections. D-047 authorizes closing that
  // gap by extending the page, not by re-scoping it or unifying the collections. A fourth apps/api
  // route file was the obvious shape, but `apps/api/src` is already over its dirsize budget
  // (`node scripts/lint-dirsize.mjs`: "apps/api/src: 32 files (budget 31)", pre-existing) and
  // `routes/` sits exactly AT its own 30-file budget — a new file in either directory turns
  // `lint:structure` newly red. `watched-sources.ts` is already the file `WatchPage.tsx` calls for
  // its other data, so the new read lives here, same precedent D-048 itself used for `health.ts`
  // ("edited rather than added to"). Optional so the A13-only fixtures/tests (`fakeWatchedSourceDeps`
  // in fixtures.ts, itself at 299/300 lines with no room to grow) need no changes at all; the route
  // 501s when they are absent rather than silently rendering an empty page.
  listWatchState?(tenantId: string): Promise<WatchState[]>;
  listHeartbeats?(tenantId: string): Promise<WatchHeartbeat[]>;
  /** The SAME number `apps/api/src/production.ts`'s `watchHeartbeatIntervalMs()` computes for
   * `routes/health.ts`'s detector — required whenever the two functions above are wired, never
   * re-derived or re-defaulted here, or a watcher could show healthy on this page and silent on
   * `/health` at the same instant. */
  heartbeatIntervalMs?: number;
}

const TIERS = new Set(["official", "community", "blog"]);

/**
 * http(s) only, returning the NORMALISED url rather than a boolean.
 *
 * ISS-C-UNRUN-WRITERS-001: the first version validated a parsed URL and stored the raw string, so
 * the value approved and the value stored could differ under a different parser. That matters
 * precisely because this row is a future outbound fetch target — whatever the fetcher re-parses
 * must be the thing this check actually approved. Returning the parsed `href` makes the two the
 * same object rather than two strings that happen to agree today.
 */
function normalisedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function createWatchedSourcesRouter(deps: WatchedSourceDeps): Router {
  const router = Router();

  router.post("/watched-sources", requireScope("sources"), async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const url = normalisedHttpUrl(body.url);
    if (url === null) {
      res.status(400).json({ error: "bad_request", message: "url must be an absolute http(s) URL" });
      return;
    }
    if (typeof body.reputationTier !== "string" || !TIERS.has(body.reputationTier)) {
      res.status(400).json({ error: "bad_request", message: "reputationTier must be one of: official, community, blog" });
      return;
    }
    // A non-positive interval would make the source permanently due — `isDueForCheck` compares
    // elapsed >= interval, so 0 is "always", and a negative one is meaningless.
    const hours = body.checkIntervalHours;
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
      res.status(400).json({ error: "bad_request", message: "checkIntervalHours must be a positive number" });
      return;
    }

    const doc: Omit<WatchedSources, "tenantId"> = {
      _id: `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      reputationTier: body.reputationTier as WatchedSources["reputationTier"],
      checkIntervalHours: hours,
      active: true,
      ...(typeof body.label === "string" && body.label.trim() !== "" ? { label: body.label } : {}),
    };

    await deps.create(req.auth!.tenantId, doc);
    res.status(201).json({ source: { ...doc, tenantId: req.auth!.tenantId } });
  });

  router.post("/watched-sources/run", requireScope("sources"), async (req: Request, res: Response) => {
    // Per-source failures come back in the summary rather than as a 500: a blocked or dead target
    // is the expected case for unattended fetches of user-supplied URLs, not an error of the run.
    const summary = await deps.run(req.auth!.tenantId);
    res.status(200).json(summary);
  });

  router.get("/watched-sources", requireScope("sources"), async (req: Request, res: Response) => {
    const sources = await deps.listActive(req.auth!.tenantId);
    res.status(200).json({ sources });
  });

  // U4d (D-047/D-048/ISS-361): the ONLY caller of `watch_state`/`watch_heartbeat` from the web
  // tier. Same "sources" scope as the rest of this router (both are read surfaces of the /watch
  // page, R8) rather than a new scope needing its own key-provisioning story. Deliberately its OWN
  // route, never folded into `/health` (that route is unauthenticated and count-only by design,
  // see health.ts's own comment) — this one is authenticated and tenant-scoped, exactly like every
  // other route in this file.
  router.get("/watch-state", requireScope("sources"), async (req: Request, res: Response) => {
    if (!deps.listWatchState || !deps.listHeartbeats || deps.heartbeatIntervalMs === undefined) {
      // Not a 200 with empty arrays: an empty-but-200 body here would be exactly the "looks
      // healthy, isn't" failure R4/R7 exist to prevent, this time for the wiring itself rather
      // than for a watcher. Production always wires all three together (production.ts); only an
      // A13-only test/fixture that never overrides them lands here.
      res.status(501).json({ error: "not_implemented", message: "watch-state read is not wired for this deployment" });
      return;
    }
    const tenantId = req.auth!.tenantId;
    const [state, heartbeatRows] = await Promise.all([
      deps.listWatchState(tenantId),
      deps.listHeartbeats(tenantId),
    ]);
    const heartbeats: HeartbeatStatus[] = heartbeatStatuses(tenantId, heartbeatRows, new Date(), deps.heartbeatIntervalMs);
    res.status(200).json({ state, heartbeats });
  });

  return router;
}
