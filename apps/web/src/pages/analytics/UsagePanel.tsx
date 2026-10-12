import type { KindFigure, UsageResponse } from "../../api/usage.js";

const rate = (f: KindFigure): string => f.errorRate === null ? "n/a (no calls)" : `${Math.round(f.errorRate * 1000) / 10}% (${f.errors} of ${f.total})`;

/** T-057 D4: /ask and /search usage from GET /usage. Counts only; the events hold no query or answer text. */
export function UsageFigures({ usage }: { usage: UsageResponse }): React.ReactElement {
  const { ask, search } = usage.totals;
  const active = usage.byDay.filter(d => d.ask.total + d.search.total > 0);
  if (ask.total + search.total === 0) {
    return <>
      <p className="empty-note">No /ask or /search calls were recorded between {usage.from} and {usage.to}.</p>
      <p className="row-meta">Recording started when usage events were deployed; earlier calls were not recorded.</p>
    </>;
  }
  const max = Math.max(...active.map(d => d.ask.total + d.search.total));
  return <>
    <p>Last {usage.days} days ({usage.from} to {usage.to}, UTC): {ask.total} /ask calls and {search.total} /search calls.</p>
    <p>Error rate (server errors, 5xx): /ask {rate(ask)}; /search {rate(search)}.</p>
    <ul aria-label="Calls per day" style={{ listStyle: "none", padding: 0 }}>{active.map(d => <li key={d.day} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <span style={{ minWidth: "5.5rem" }}>{d.day}</span>
      <span aria-hidden="true" style={{ display: "inline-block", height: "0.7rem", borderRadius: 3, background: "var(--accent)", width: `${Math.max(2, Math.round(((d.ask.total + d.search.total) / max) * 100))}%`, maxWidth: "50%" }} />
      <span>{d.ask.total} ask, {d.search.total} search{d.ask.errors + d.search.errors > 0 ? `, ${d.ask.errors + d.search.errors} failed` : ""}</span>
    </li>)}</ul>
    {usage.truncated && <p className="row-meta" role="note">Very high volume: only part of this window could be read, so the counts above are a lower bound.</p>}
    <p className="row-meta">Source: GET /usage?days={usage.days}, per-request events recorded since usage tracking was deployed. Requests rejected as bad input, unauthorised or out of scope (4xx) are not counted; neither question text nor answers are stored.</p>
  </>;
}
