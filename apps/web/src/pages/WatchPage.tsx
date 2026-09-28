/**
 * apps/web/src/pages/WatchPage.tsx — /watch (U4c, u4c-watch-page, docs/features/u4-watch-dashboard).
 * Answers three questions in under five seconds without reading a log: is the watching alive
 * (R4), what is it about to do (R5), can I intervene right now (R6) — with plain language on
 * every state (R7) and every read tenant-scoped via the apiKey alone (R8, see api/watched-sources.js).
 *
 * Two gaps found against the real, currently-served API while building this (documented instead
 * of quietly worked around, and instead of adding an unauthorized new apps/api route or a fourth
 * new file):
 *
 * 1. [R4] `WatchedSource` (schema/watched_sources.schema.json) has no persisted failure state —
 *    only `lastFetch: {fetchedAt, hash, diffFrom}` on a SUCCESSFUL check
 *    (`packages/ingest/src/watched/run.ts`'s catch branch never calls `recordFetch` on failure).
 *    So a `failureReason` can only ever be shown for the run this page itself just triggered via
 *    "Poll now" (`POST /watched-sources/run`'s live response) — never for a scheduled run that
 *    failed before this page was opened. That is a real product gap (a failure between visits is
 *    invisible here), not a rendering choice; noted below in "what this unit does NOT do" and in
 *    the manifest.
 * 2. [R5] "why it was selected" for an auto-record lives in `selectAutoRecordItems`
 *    (packages/meeting-bot/src/calendar/auto-join.ts) and `schedule-state.json`, both CLI/local-
 *    file only (schedule-state.ts's own header: "a local JSON file... single-poller-instance
 *    data") — no API route serves either. "Next up" below therefore lists real, already-served
 *    Gmail meeting candidates (`GET /meeting-candidates`) with status `approved`/`auto_approved`
 *    — genuinely real "this will be auto-recorded" signals — and states their REAL status as the
 *    reason, rather than fabricating the richer selection reason nothing exposes.
 *
 * U4d (D-047/D-048/ISS-361/ISS-358) adds a THIRD section, "Watcher liveness": R1's alert
 * (`notifyPollFailed`) fires off `watch_state`, and R2's (once wired) off `watch_heartbeat` — both
 * genuinely disjoint from `watched_sources` above, with zero code overlap (the U4c checker verified
 * this by reading shipped code). Before this section existed, following the alert's deep link here
 * landed on a page with zero visibility into the failure that triggered it — worse than no page,
 * because it invited the reader to conclude nothing was wrong. `GET /watch-state`
 * (apps/api/src/routes/watched-sources.ts) is the new read; a stale flag on each heartbeat is
 * computed server-side by the exact same predicate R2's `/health` detector alerts on
 * (`heartbeatStatuses` in routes/health.ts), so this page can never show a watcher as healthy that
 * the alert already fired on as silent.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { listWatchedSources, runWatchedSources, type WatchedSource, type WatchedSourcesRunSummary } from "../api/watched-sources.js";
import { listMeetingCandidates } from "../api/meeting-candidates.js";
import { getWatchState, type WatchStateResponse } from "../api/watch-state.js";
import { ApiError } from "../api/client.js";
import type { MeetingCandidate } from "../api/types.js";

function relativeAge(ms: number): string {
  const clamped = Math.max(0, ms);
  const s = Math.floor(clamped / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type SourceStatus = "healthy" | "stale" | "never";

/** A source past its own `checkIntervalHours` renders as its OWN status ("stale") rather than
 * merely an old timestamp the reader has to do arithmetic on (R4's "visibly wrong in its own
 * right"). */
function statusOf(source: WatchedSource, nowMs: number): SourceStatus {
  if (!source.lastFetch) return "never";
  const ageMs = nowMs - new Date(source.lastFetch.fetchedAt).getTime();
  return ageMs > source.checkIntervalHours * 3_600_000 ? "stale" : "healthy";
}

const PLAIN_LANGUAGE: Record<SourceStatus, string> = {
  healthy: "Checked within its expected interval. No action needed.",
  stale: "Overdue for a check past its own interval — the watcher may have stopped for this source. Try “Poll now” below; if it stays overdue, the source's credentials or reachability likely need attention.",
  never: "Has never completed a successful check since it was added. Try “Poll now”; if it keeps failing, the URL or its access may be wrong.",
};

const CANDIDATE_REASON: Record<string, string> = {
  auto_approved: "Sender auto-approved after 3 prior approvals — will be recorded without asking again.",
  approved: "You approved this meeting — it will be recorded.",
};

export function WatchPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [sources, setSources] = useState<WatchedSource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MeetingCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<WatchStateResponse | null>(null);
  const [watchStateError, setWatchStateError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<WatchedSourcesRunSummary | null>(null);

  const loadSources = useCallback((): Promise<void> => {
    return listWatchedSources(apiKey)
      .then((data) => { setSources(data.sources); setLoadError(null); })
      .catch((err: unknown) => { setLoadError(err instanceof ApiError ? err.message : "failed to reach the watched-sources API"); });
  }, [apiKey]);

  useEffect(() => { loadSources(); }, [loadSources]);

  useEffect(() => {
    let cancelled = false;
    listMeetingCandidates(apiKey)
      .then((data) => { if (!cancelled) setCandidates(data.candidates); })
      .catch((err: unknown) => { if (!cancelled) setCandidatesError(err instanceof ApiError ? err.message : "failed to load upcoming auto-records"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  // U4d: a third, independent lane — a failure here must not blank the watched-sources lane
  // above it, same rule as the candidates lane's own degraded-fetch handling just above.
  useEffect(() => {
    let cancelled = false;
    getWatchState(apiKey)
      .then((data) => { if (!cancelled) setWatchState(data); })
      .catch((err: unknown) => { if (!cancelled) setWatchStateError(err instanceof ApiError ? err.message : "failed to reach the watch-state API"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  function handlePollNow(): void {
    setPolling(true);
    setPollError(null);
    runWatchedSources(apiKey)
      .then((summary) => { setLastRun(summary); return loadSources(); })
      .catch((err: unknown) => setPollError(err instanceof ApiError ? err.message : "Poll now failed — the request did not complete."))
      .finally(() => setPolling(false));
  }

  const now = Date.now();
  const failedJustNow = new Map((lastRun?.failed ?? []).map((f) => [f.id, f.reason]));
  const nextUp = (candidates ?? []).filter((c) => c.status === "approved" || c.status === "auto_approved");
  // U4d: only the most recent 20 failures surface here — the API already caps watch_state at 200
  // rows per tenant (packages/db/src/collections/watch-state.ts), this trims further for the UI.
  const recentFailures = (watchState?.state ?? []).filter((s) => s.status === "failed").slice(0, 20);

  return (
    <>
      <div className="page-header">
        <h1>Watch</h1>
        <p>
          Is the watching alive, and what is it about to do &mdash; answered without reading a
          log. Everything here is read-only except &ldquo;Poll now&rdquo;.
        </p>
      </div>

      <div className="card">
        <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Watched sources</span>
          <button type="button" onClick={handlePollNow} disabled={polling} data-testid="poll-now-button">
            {polling ? "Polling…" : "Poll now"}
          </button>
        </div>

        {pollError && <div className="error-note" data-testid="poll-now-error">{pollError}</div>}
        {lastRun && !pollError && (
          <div className="row-meta" data-testid="poll-now-summary">
            Last manual poll: {lastRun.checked} checked, {lastRun.changed} changed, {lastRun.skipped} skipped, {lastRun.failed.length} failed, {lastRun.remaining} left for next run.
          </div>
        )}

        {loadError && (
          <div className="error-note" data-testid="watch-unreachable">
            Can&rsquo;t reach the watched-sources API right now ({loadError}). This is NOT the same
            as &ldquo;all healthy&rdquo; &mdash; the watcher&rsquo;s state is simply unknown until
            this loads.
          </div>
        )}

        {!loadError && sources === null && <div className="empty-note" data-testid="watch-loading">Loading&hellip;</div>}

        {!loadError && sources !== null && sources.length === 0 && (
          <div className="empty-note" data-testid="watch-none-configured">
            No watched sources are configured yet. That is different from every source being
            healthy &mdash; there is simply nothing being watched.
          </div>
        )}

        {!loadError && sources !== null && sources.map((source) => {
          const status = statusOf(source, now);
          const failReason = failedJustNow.get(source._id);
          const badgeClass = failReason ? "badge-bad" : status === "healthy" ? "badge-good" : status === "stale" ? "badge-warn" : "badge-bad";
          const badgeText = failReason ? "failed just now" : status;
          return (
            <div className="row-card" key={source._id} data-testid="watch-row" data-status={failReason ? "failed" : status}>
              <div className="row-title">
                {source.label ?? source.url} <span className={`badge ${badgeClass}`}>{badgeText}</span>
              </div>
              <div className="row-meta">
                {source.lastFetch
                  ? `Last checked ${new Date(source.lastFetch.fetchedAt).toLocaleString()} (${relativeAge(now - new Date(source.lastFetch.fetchedAt).getTime())})`
                  : "Never checked successfully"}
                {" · "}every {source.checkIntervalHours}h
              </div>
              {failReason && <div className="row-meta error-note" data-testid="watch-row-failure-reason">{failReason}</div>}
              <div className="row-meta" data-testid="watch-row-plain-language">{PLAIN_LANGUAGE[status]}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="section-title">Watcher liveness (Drive &middot; Gmail &middot; Calendar)</div>
        <p className="row-meta" style={{ marginTop: "-0.2rem" }}>
          The watchers R1&rsquo;s alert fires on &mdash; a different collection from the watched
          sources above (they can fail independently of each other). If an alert brought you here,
          this is what it was about.
        </p>

        {watchStateError && (
          <div className="error-note" data-testid="watch-state-unreachable">
            Can&rsquo;t reach the watcher-liveness API right now ({watchStateError}). This is NOT
            the same as &ldquo;all healthy&rdquo; &mdash; watcher state is simply unknown until this
            loads. The watched sources above are unaffected.
          </div>
        )}

        {!watchStateError && watchState === null && <div className="empty-note" data-testid="watch-state-loading">Loading&hellip;</div>}

        {!watchStateError && watchState !== null && watchState.heartbeats.map((hb) => {
          const badgeClass = hb.stale ? "badge-bad" : "badge-good";
          return (
            <div className="row-card" key={hb.sourceType} data-testid="watch-heartbeat-row" data-status={hb.stale ? "stale" : "healthy"}>
              <div className="row-title">
                {hb.sourceType} <span className={`badge ${badgeClass}`}>{hb.stale ? "silent" : "alive"}</span>
              </div>
              <div className="row-meta">
                {hb.lastHeartbeatAt
                  ? `Last completed run ${new Date(hb.lastHeartbeatAt).toLocaleString()} (${relativeAge(now - new Date(hb.lastHeartbeatAt).getTime())})`
                  : "Has never completed a single polling run"}
              </div>
              <div className="row-meta" data-testid="watch-heartbeat-plain-language">
                {hb.stale
                  ? "This watcher has stopped polling entirely — it may be dead, not just slow. Check the run-watch.mjs process or its scheduled task, not a single source's credential."
                  : "Completed a run within its expected interval. No action needed."}
              </div>
            </div>
          );
        })}

        {!watchStateError && watchState !== null && recentFailures.length === 0 && (
          <div className="empty-note" data-testid="watch-state-no-failures">
            No recent poll failures recorded for Drive, Gmail, or Calendar items.
          </div>
        )}

        {!watchStateError && watchState !== null && recentFailures.map((row) => (
          <div className="row-card" key={`${row.sourceType}:${row.sourceId}`} data-testid="watch-state-failure-row">
            <div className="row-title">
              {row.sourceType}: {row.sourceId} <span className="badge badge-bad">failed</span>
            </div>
            <div className="row-meta">{new Date(row.failedAt ?? row.seenAt).toLocaleString()}</div>
            {row.failureReason && (
              <div className="row-meta error-note" data-testid="watch-state-failure-reason">{row.failureReason}</div>
            )}
          </div>
        ))}
      </div>

      <div className="section-title">Next up (read-only)</div>
      <p className="row-meta" style={{ marginTop: "-0.4rem" }}>
        Meetings that will be auto-recorded. There is no cancel or force here &mdash; use{" "}
        <a href="/calendar">Calendar</a> to change a decision before it is acted on.
      </p>
      {candidatesError && (
        <div className="empty-note" data-testid="watch-next-up-degraded">
          Upcoming auto-records are unavailable right now ({candidatesError}). Watched-source
          status above is unaffected.
        </div>
      )}
      {!candidatesError && candidates === null && <div className="empty-note">Loading&hellip;</div>}
      {!candidatesError && candidates !== null && nextUp.length === 0 && (
        <div className="empty-note" data-testid="watch-next-up-empty">Nothing is queued to be auto-recorded right now.</div>
      )}
      {nextUp.map((c) => (
        <div className="row-card" key={c._id} data-testid="watch-next-up-row">
          <div className="row-title">{c.subject}</div>
          <div className="row-meta">{c.senderEmail}</div>
          <div className="row-meta" data-testid="watch-next-up-reason">{CANDIDATE_REASON[c.status] ?? c.status}</div>
        </div>
      ))}
    </>
  );
}
