/**
 * apps/web/src/api/watch-state.ts — U4d (u4d-watch-page-state-visibility, D-047/D-048/ISS-361).
 *
 * NEW FILE, justified: `WatchPage.tsx` already has one per-resource API client for
 * `watched_sources` (`watched-sources.ts`, from U4c) and a separate one for `meeting-candidates`
 * (`meeting-candidates.ts`) — this follows that same one-file-per-resource convention for the
 * THIRD, genuinely different resource this page now reads: `watch_state`/`watch_heartbeat`, the
 * U2/U4b Drive-Gmail-Calendar watcher collections R1's alert fires off (ISS-358 found these are
 * disjoint from `watched_sources`, D-047 authorizes surfacing both on one page). No dirsize
 * pressure applies here — `apps/web/src/api/` is well under its 30-file budget (15 files today) —
 * unlike `apps/api/src`, where the matching backend route was added to `watched-sources.ts` IN
 * PLACE instead of as a new file for exactly that budget reason (see that route's own comment).
 *
 * Types are hand-declared here rather than imported from `@lkb/core`'s generated `WatchState`/
 * `WatchHeartbeat`, mirroring `watched-sources.ts`'s own rule: this file is outside this unit's
 * `@lkb/core`-free web surface and the wire shape (a `stale` flag computed server-side by
 * `apps/api/src/routes/health.ts`'s `heartbeatStatuses`) is not identical to either generated type
 * anyway.
 *
 * No tenant id parameter, same as `watched-sources.ts` and `meeting-candidates.ts`: tenancy comes
 * only from the `apiKey` `apiFetch` turns into the `Authorization: Bearer` header (R8).
 */
import { apiFetch } from "./client.js";

export interface WatchStateRow {
  sourceType: "drive" | "gmail" | "calendar";
  sourceId: string;
  status: "seen" | "ingested" | "failed";
  seenAt: string;
  ingestedAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export interface WatchHeartbeatStatus {
  sourceType: string;
  /** `null` means this source type has never completed a single polling run (D-048: absence is
   * treated as maximally stale, never as healthy). */
  lastHeartbeatAt: string | null;
  /** Computed server-side by the SAME predicate R2's `/health` detector alerts on — never
   * recomputed client-side, so this page can never disagree with that alert about which watcher
   * is silent. */
  stale: boolean;
}

export interface WatchStateResponse {
  state: WatchStateRow[];
  heartbeats: WatchHeartbeatStatus[];
}

/** Throws `ApiError` with status 501 when the deployment has not wired the read deps
 * (`apps/api/src/routes/watched-sources.ts`'s `GET /watch-state` — see its own comment); the page
 * must render that distinctly from "unreachable" or "none configured". */
export function getWatchState(apiKey: string | null): Promise<WatchStateResponse> {
  return apiFetch("/watch-state", apiKey);
}
