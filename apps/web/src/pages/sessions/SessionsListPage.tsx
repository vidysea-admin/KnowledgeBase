import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { listSessions } from "../../api/sessions.js";
import { ApiError } from "../../api/client.js";
import { SessionsIcon } from "../../components/icons.js";
import type { SessionSummary } from "../../api/types.js";
import { NO_FILTERS, filterOptions, filterSessions, processedShare, type SessionFilters } from "./sessionsFilterModel.js";

function statusBadgeClass(status: string): string {
  if (status === "done") return "badge badge-good";
  if (status === "processing") return "badge badge-warn";
  if (status === "failed") return "badge badge-bad";
  return "badge";
}

function FilterBar({ rows, value, onChange }: { rows: SessionSummary[]; value: SessionFilters; onChange: (f: SessionFilters) => void }): React.ReactElement {
  const o = filterOptions(rows);
  const share = processedShare(filterSessions(rows, value));
  const sel = (label: string, key: keyof SessionFilters, opts: string[]) => (
    <label>{label}{" "}
      <select aria-label={label} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
        <option value="">All</option>
        {opts.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </label>);
  return (
    <div className="card" role="group" aria-label="Session filters">
      {sel("Month", "month", o.months)}{" "}{sel("Status", "status", ["done", "processing", "failed", "other"])}{" "}
      {sel("Organisation", "org", o.orgs)}{" "}{sel("Participant", "participant", o.participants)}{" "}
      <button type="button" onClick={() => onChange(NO_FILTERS)}>Clear filters</button>
      <div className="row-meta" data-testid="processed-share">
        {share.percent === null ? "No sessions match." : `${share.done} of ${share.total} shown sessions fully processed (${share.percent}%)`}
      </div>
    </div>);
}

/** `enableFilters` is OFF by default; App enables it only when VITE_SESSIONS_FILTERS === "1". Off renders exactly the original list. */
export function SessionsListPage({ enableFilters = false }: { enableFilters?: boolean } = {}): React.ReactElement {
  const { apiKey } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SessionFilters>(NO_FILTERS);

  useEffect(() => {
    let cancelled = false;
    listSessions(apiKey)
      .then((data) => { if (!cancelled) setSessions(data.sessions); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "failed to load sessions"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  const shown = sessions && enableFilters ? filterSessions(sessions, filters) : (sessions ?? []);

  return (
    <>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>Every real ingested session. Click one for its summary, claims, and transcript.</p>
      </div>
      {error && <div className="card error-note">{error}</div>}
      {!error && sessions === null && <div className="card empty-note">Loading&hellip;</div>}
      {sessions && sessions.length === 0 && <div className="card empty-note">No sessions found for this tenant.</div>}
      {enableFilters && sessions && sessions.length > 0 && <FilterBar rows={sessions} value={filters} onChange={setFilters} />}
      {sessions && sessions.length > 0 && shown.length === 0 && <div className="card empty-note">No sessions match the filters.</div>}
      {sessions && shown.length > 0 && (
        <div className="session-grid">
          {shown.map((s) => (
            <Link key={s._id} to={`/sessions/${encodeURIComponent(s._id)}`} className="session-card">
              <div className="session-card-icon"><SessionsIcon /></div>
              <div className="session-card-body">
                <div className="row-title">{s.title}</div>
                <div className="row-meta">
                  {s.date}{s.org ? ` · ${s.org}` : ""}{s.participants?.length ? ` · ${s.participants.length} participant(s)` : ""}
                </div>
                <div style={{ marginTop: "0.4rem" }}>
                  <span className={statusBadgeClass(s.status?.transcribe ?? "unknown")}>transcribe: {s.status?.transcribe ?? "unknown"}</span>
                  {" "}
                  <span className={statusBadgeClass(s.status?.index ?? "unknown")}>index: {s.status?.index ?? "unknown"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
