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
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { listWatchedSources, runWatchedSources, type WatchedSource, type WatchedSourcesRunSummary } from "../api/watched-sources.js";
import { listMeetingCandidates } from "../api/meeting-candidates.js";
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
