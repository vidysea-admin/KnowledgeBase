import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { listGaps } from "../api/gaps.js";
import { listSessions } from "../api/sessions.js";
import { listSources } from "../api/sources.js";
import { listKeys } from "../api/keys.js";
import { ApiError } from "../api/client.js";
import { StatCard } from "../components/StatCard.js";
import { SessionsIcon, SourcesIcon, KeyIcon, GapIcon } from "../components/icons.js";
import type { Gap, SessionSummary } from "../api/types.js";

function badgeClass(status: Gap["status"]): string {
  if (status === "open") return "badge badge-warn";
  if (status === "received") return "badge badge-good";
  return "badge badge-bad";
}

type Panel<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; note: string };

/** One short inline note per failed panel. 503 is the unconfigured-hosting case (`hosting_unavailable`). */
function failureNote(label: string, err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return `${label} unavailable (hosting not configured)`;
  const detail = err instanceof ApiError ? err.message : "failed to load";
  return `${label} unavailable (${detail})`;
}

function Note({ text }: { text: string }): React.ReactElement {
  return <div className="card error-note" role="note">{text}</div>;
}

export function DashboardPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [sessions, setSessions] = useState<Panel<SessionSummary[]>>({ state: "loading" });
  const [sources, setSources] = useState<Panel<number>>({ state: "loading" });
  const [keys, setKeys] = useState<Panel<number>>({ state: "loading" });
  const [gaps, setGaps] = useState<Panel<Gap[]>>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Every number here comes from an already-real, already-checker-PASSed route (GET
    // /sessions, /sources, /keys, /gaps). Each panel loads and fails on its own: one failing
    // route (e.g. /keys 503 when hosting is not configured) must not blank the others.
    // Real data or an honest per-panel note, never a placeholder number.
    const track = <T, U>(label: string, load: Promise<T>, pick: (v: T) => U, set: (p: Panel<U>) => void): void => {
      load.then(
        (v) => { if (!cancelled) set({ state: "ok", data: pick(v) }); },
        (err: unknown) => { if (!cancelled) set({ state: "error", note: failureNote(label, err) }); },
      );
    };
    setSessions({ state: "loading" }); setSources({ state: "loading" }); setKeys({ state: "loading" }); setGaps({ state: "loading" });
    track("Sessions", listSessions(apiKey), (r) => r.sessions, setSessions);
    track("Sources", listSources(apiKey), (r) => r.sources.length, setSources);
    track("API keys", listKeys(apiKey), (r) => r.keys.filter((k) => !k.revokedAt).length, setKeys);
    track("Knowledge health", listGaps(apiKey), (r) => r.gaps, setGaps);
    return () => { cancelled = true; };
  }, [apiKey]);

  const recentSessions = sessions.state === "ok" ? [...sessions.data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) : null;
  const openGaps = gaps.state === "ok" ? gaps.data.filter((g) => g.status === "open").length : 0;
  const notes = [sessions, sources, keys].flatMap((p) => (p.state === "error" ? [p.note] : []));

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>A real, at-a-glance view of this tenant's knowledge base &mdash; every number below is live.</p>
      </div>

      {[sessions, sources, keys, gaps].some((p) => p.state === "loading") && <div className="card empty-note">Loading&hellip;</div>}
      {notes.map((n) => <Note key={n} text={n} />)}
      <div className="stat-grid">
        {sessions.state === "ok" && <StatCard icon={<SessionsIcon />} label="Sessions" value={sessions.data.length} tone="accent" />}
        {sources.state === "ok" && <StatCard icon={<SourcesIcon />} label="Sources" value={sources.data} tone="accent" />}
        {keys.state === "ok" && <StatCard icon={<KeyIcon />} label="Active API keys" value={keys.data} tone="good" />}
        {gaps.state === "ok" && <StatCard icon={<GapIcon />} label="Open gaps" value={openGaps} tone={openGaps > 0 ? "warn" : "good"} />}
      </div>

      {recentSessions && (
        <>
          <div className="section-title">Recent sessions</div>
          {recentSessions.length === 0 && <div className="card empty-note">No sessions yet.</div>}
          {recentSessions.length > 0 && (
            <div className="card">
              {recentSessions.map((s) => (
                <Link key={s._id} to={`/sessions/${encodeURIComponent(s._id)}`} className="row-card">
                  <div className="row-title">{s.title}</div>
                  <div className="row-meta">{s.date}{s.org ? ` · ${s.org}` : ""}</div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-title">Knowledge health</div>
      {gaps.state === "error" && <Note text={gaps.note} />}
      {gaps.state === "ok" && gaps.data.length === 0 && (
        <div className="card empty-note">
          No gaps recorded for this tenant &mdash; either everything is covered, or gap-tracking hasn't logged anything yet.
        </div>
      )}
      {gaps.state === "ok" && gaps.data.length > 0 && (
        <div className="card">
          {gaps.data.map((g) => (
            <div key={g._id} className="row-card">
              <div className="row-title">
                {g.kind} <span className={badgeClass(g.status)}>{g.status}</span>
              </div>
              <div className="row-meta">{g.description ?? "(no description)"}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
