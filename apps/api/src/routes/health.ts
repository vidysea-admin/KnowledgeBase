/**
 * apps/api/src/routes/health.ts — plan §10 U0.7 (first half). `GET /health`: db ping + real
 * per-collection document counts, for ops monitoring. Deliberately UNAUTHENTICATED (mounted
 * before `requireAuth`, same as the `*-page.ts` routes) — an uptime probe should not need a
 * scoped API key, and the response carries only aggregate counts, never tenant-scoped content.
 *
 * U4b/R2 (D-048) also makes this the WATCHER-SILENCE DETECTOR. That placement is deliberate: R2's
 * failure mode is that scripts/watch/run-watch.mjs stopped running at all, so the detector must live
 * in a different process from the writer or it dies with it — and run-watch.mjs is a one-shot script
 * with no daemon, while this is an already separately-running server with its own liveness job.
 * The detector is injected (`WatchSilenceDeps`) exactly like `checkHealth`, so tests drive it with
 * fakes and never touch Mongo or send a real alert.
 */
import { Router, type Request, type Response } from "express";

export interface HealthReport {
  db: "ok" | "error";
  /** Real `countDocuments` per collection, keyed by name — empty when `db` is "error". */
  collections: Record<string, number>;
  /** U4b/R2: how many (tenant, sourceType) watchers were found silent on this probe. A COUNT only
   * — this route is unauthenticated, so it must never name tenants or source types (the alert,
   * which goes to an operator over a private channel, carries those). Absent when no
   * `WatchSilenceDeps` is wired. */
  watchSilent?: number;
}

/** One `watch_heartbeat` row, as the detector needs to see it. Structural on purpose: it matches
 * `@lkb/core`'s generated `WatchHeartbeat` without this route having to import a Mongo-shaped type. */
export interface HeartbeatRow {
  tenantId: string;
  sourceType: string;
  lastHeartbeatAt?: string | null;
}

/**
 * R2's injected detector. Everything that touches the world is a dependency:
 *  - `tenantIds` is CONFIG-derived (production.ts), never taken from the request — this route has no
 *    authenticated caller to derive a tenant from, and accepting one from the client would be the
 *    ISS-078 hazard class. It is the only way a tenant id enters this detector.
 *  - `listHeartbeats` must be the tenant-scoped accessor (`listHeartbeats` in
 *    packages/db/src/collections/watch-heartbeat.ts), so each read is `withTenant`-merged.
 *  - `notifyWatchSilent` is structurally identical to `TelegramNotifier.notifyWatchSilent`
 *    (packages/meeting-bot/src/capture/telegram-alerts.ts), so a real notifier satisfies it with NO
 *    import — `.dependency-cruiser.cjs` forbids `apps/* -> packages/meeting-bot`, so injection is the
 *    only way this route can reach that notifier at all. See the manifest's HUMAN_GATE section.
 */
export interface WatchSilenceDeps {
  tenantIds: string[];
  listHeartbeats(tenantId: string): Promise<HeartbeatRow[]>;
  /** Milliseconds a heartbeat may age before its watcher counts as silent (1h default lives in
   * scripts/watch/lib/heartbeat.mjs's `watchHeartbeatIntervalMs`, D-048). */
  intervalMs: number;
  notifyWatchSilent(tenantId: string, sourceType: string, lastHeartbeatAt: string | null, intervalMs: number): void;
  /** Injectable clock, so a test does not have to wait an hour. */
  now?(): Date;
  /** The source types that MUST have a heartbeat. A type with no row at all is silent — absence is
   * the whole failure mode, so it cannot be detected by looking only at the rows that exist. */
  expectedSourceTypes?: string[];
}

export interface HealthDeps {
  checkHealth(): Promise<HealthReport>;
  /** Absent = no detector wired; `/health` then behaves exactly as it did before U4b. */
  watchSilence?: WatchSilenceDeps;
}

/**
 * The staleness predicate, byte-for-byte the same rule as `isHeartbeatStale` in
 * scripts/watch/lib/heartbeat.mjs: a missing/unparsable heartbeat is maximally stale, and the exact
 * boundary (`now - last === intervalMs`) is still FRESH (spec R2 says "longer than", not ">=").
 *
 * It is a SECOND implementation on purpose and under protest. The single copy belongs in
 * `packages/core/src/domain/` where both sides could import it, but that is a seventh new file and
 * D-048 authorized exactly six; `apps/api` cannot import a `.mjs` under `scripts/` either (no
 * declaration file, and apps depending on scripts/ inverts ARCHITECTURE §5's direction). So the
 * drift risk is closed by TEST instead of by structure: `health.test.ts`'s "the two
 * implementations agree" case dynamically imports the real `heartbeat.mjs` and asserts both give the
 * same answer over a shared case table, so the copies cannot diverge silently. Recorded as a
 * follow-up in the manifest, not hidden.
 *
 * Exported (U4d, D-047) so `routes/watched-sources.ts`'s `/watch-state` route computes staleness
 * with the EXACT same predicate this detector alerts on, via `heartbeatStatuses` below — the page
 * must never show a source as healthy that this detector would already have alerted on as silent.
 */
export function isStale(lastHeartbeatAt: string | null | undefined, now: Date, intervalMs: number): boolean {
  if (!lastHeartbeatAt) return true;
  const last = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > intervalMs;
}

/** The three source types `scripts/watch/run-watch.mjs` polls. Shared (U4d) so `detectSilentWatchers`'s
 * default and `heartbeatStatuses`' default are the same array, not two hand-typed copies. */
export const EXPECTED_WATCH_SOURCE_TYPES = ["drive", "gmail", "calendar"] as const;

/** One tenant's per-source-type liveness, exactly as both a reader and an alerter need it. */
export interface HeartbeatStatus {
  tenantId: string;
  sourceType: string;
  lastHeartbeatAt: string | null;
  stale: boolean;
}

/**
 * Every EXPECTED (tenantId, sourceType) heartbeat for one tenant, each with `stale` computed by
 * `isStale` — a missing row is synthesised as `lastHeartbeatAt: null` (maximally stale, D-048),
 * never silently dropped. Extracted out of `detectSilentWatchers` (U4d, D-047/ISS-361) so R2's
 * alert and the `/watch-state` page read the identical computation — the exact disjoint-surface
 * gap ISS-358 raised, closed here by construction rather than by convention.
 */
export function heartbeatStatuses(
  tenantId: string,
  rows: HeartbeatRow[],
  now: Date,
  intervalMs: number,
  expected: readonly string[] = EXPECTED_WATCH_SOURCE_TYPES,
): HeartbeatStatus[] {
  const byType = new Map(rows.map((r) => [r.sourceType, r]));
  return expected.map((sourceType) => {
    const row = byType.get(sourceType) ?? { tenantId, sourceType, lastHeartbeatAt: null };
    const lastHeartbeatAt = row.lastHeartbeatAt ?? null;
    return { tenantId, sourceType, lastHeartbeatAt, stale: isStale(lastHeartbeatAt, now, intervalMs) };
  });
}

/**
 * Checks every configured tenant's heartbeats and alerts once per silent (tenant, sourceType).
 * Returns the count for the response body. A row that is missing entirely is synthesised as
 * `lastHeartbeatAt: null`, which `isHeartbeatStale` treats as maximally stale — "this watcher has
 * never proven it is alive" is the loudest version of R2's failure, not an exemption from it.
 * Never throws: a detector that can 503 the health probe by failing would take down the signal it
 * exists to provide.
 */
export async function detectSilentWatchers(deps: WatchSilenceDeps): Promise<number> {
  const now = deps.now ? deps.now() : new Date();
  const expected = deps.expectedSourceTypes ?? EXPECTED_WATCH_SOURCE_TYPES;
  let silent = 0;
  for (const tenantId of deps.tenantIds) {
    let rows: HeartbeatRow[];
    try {
      rows = await deps.listHeartbeats(tenantId);
    } catch {
      continue; // an unreadable heartbeat collection is a db problem, already reported by `db`.
    }
    for (const status of heartbeatStatuses(tenantId, rows, now, deps.intervalMs, expected).filter((s) => s.stale)) {
      silent += 1;
      try {
        deps.notifyWatchSilent(tenantId, status.sourceType, status.lastHeartbeatAt, deps.intervalMs);
      } catch {
        /* a failing alert transport must never break the probe — telegram-alerts.ts is already
           fire-and-forget, this guards a hand-rolled sink that is not. */
      }
    }
  }
  return silent;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    const report = await deps.checkHealth();
    // R2: only probe watcher silence when the db itself is up — otherwise every watcher would look
    // silent for the one reason that is already reported by `db: "error"`, alerting on the wrong bug.
    // Spread rather than assign: `checkHealth` may hand back a shared/cached object (fixtures.ts
    // does), and mutating it would leak this probe's count into the next one.
    const body: HealthReport =
      deps.watchSilence && report.db === "ok"
        ? { ...report, watchSilent: await detectSilentWatchers(deps.watchSilence) }
        : report;
    // 503 (not 200) when the db ping failed — a health probe's whole job is to make an
    // unhealthy backend visible to whatever is watching the HTTP status code, not just the body.
    res.status(body.db === "ok" ? 200 : 503).json(body);
  });

  return router;
}
