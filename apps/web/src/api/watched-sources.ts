/**
 * apps/web/src/api/watched-sources.ts — U4c (u4c-watch-page). First UI consumer of A13's
 * watched-sources API (`apps/api/src/routes/watched-sources.ts:67,100,107`); `SourcesPage.tsx`
 * reads the separate static `/sources` list, not this.
 *
 * Types are declared here rather than added to `./types.js`: that file is not in u4c's D-046
 * file grant (exactly `WatchPage.tsx`, `WatchPage.test.tsx`, this file, plus `App.tsx` edited in
 * place), so the shapes stay local rather than touching a fourth file. Mirrors `types.ts`'s own
 * rule of hand-declared shapes, not an `@lkb/core` import.
 *
 * Neither function below takes a tenant id. Tenancy comes only from the `apiKey` that `apiFetch`
 * turns into the `Authorization: Bearer` header — the API derives `req.auth.tenantId` from that
 * key server-side (`watched-sources.ts:96,103,108`). There is no parameter here a caller could
 * use to ask for another tenant's rows (R8).
 */
import { apiFetch } from "./client.js";

export interface WatchedSourceLastFetch {
  fetchedAt: string;
  hash: string;
  diffFrom: string | null;
}

export interface WatchedSource {
  _id: string;
  url: string;
  label?: string;
  reputationTier: "official" | "community" | "blog";
  checkIntervalHours: number;
  active: boolean;
  /** Absent iff this source has never completed a successful check (R4 "never polled" path). */
  lastFetch?: WatchedSourceLastFetch;
}

export interface WatchedSourceRunFailure {
  id: string;
  url: string;
  reason: string;
}

/** The live response of one `POST /watched-sources/run` call — never persisted server-side, so
 * this only ever reflects the most recent manual run this page itself triggered (R6). */
export interface WatchedSourcesRunSummary {
  checked: number;
  changed: number;
  skipped: number;
  failed: WatchedSourceRunFailure[];
  remaining: number;
}

export function listWatchedSources(apiKey: string | null): Promise<{ sources: WatchedSource[] }> {
  return apiFetch("/watched-sources", apiKey);
}

export function runWatchedSources(apiKey: string | null): Promise<WatchedSourcesRunSummary> {
  return apiFetch("/watched-sources/run", apiKey, { method: "POST" });
}
