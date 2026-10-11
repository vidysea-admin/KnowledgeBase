import { Link } from "react-router-dom";
import { SectionFrame } from "./SectionFrame.js";
import type { Loaded } from "./useLoad.js";
import { ROW_CAP, asRecords, formatInstant, opStatusLabel, reasonLabel, safeText, sessionPath } from "./model.js";

type Ops = { operations?: unknown; omitted?: unknown };

function OperationCard({ row }: { row: Record<string, unknown> }): React.ReactElement {
  const path = row.status === "ready" ? sessionPath(row.id) : null;
  const attempts = typeof row.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts : "unknown";
  return <div className="card">
    <h3>{safeText(row.title, "Untitled webinar")}</h3>
    <p><strong>{opStatusLabel(row.status)}</strong> · Attempts: {attempts}</p>
    {row.reason !== undefined && row.reason !== null && <p>Reason: {reasonLabel(row.reason)}</p>}
    {row.startTime !== undefined && <p>Starts: {formatInstant(row.startTime)}</p>}
    {row.updatedAt !== undefined && <p>Last update: {formatInstant(row.updatedAt)}</p>}
    {path && <Link to={path}>Open recording and knowledge</Link>}
  </div>;
}

function Capped({ rows }: { rows: Record<string, unknown>[] }): React.ReactElement {
  return <>
    {rows.length > ROW_CAP && <p>Showing {ROW_CAP} of {rows.length} operations.</p>}
    {rows.slice(0, ROW_CAP).map((row, i) => <OperationCard key={i} row={row} />)}
  </>;
}

const IN_PROGRESS = new Set(["recording", "processing"]);
/** Both sections read the SAME single GET /webinar-operations state: no second request. */
export function OperationsSections({ state }: { state: Loaded<Ops> }): React.ReactElement {
  const all = state.data && Array.isArray(state.data.operations) ? asRecords(state.data.operations) : state.data ? [] : null;
  const live = all && all.filter(r => typeof r.status === "string" && IN_PROGRESS.has(r.status));
  const rest = all && all.filter(r => !(typeof r.status === "string" && IN_PROGRESS.has(r.status)));
  const omitted = state.data && typeof state.data.omitted === "number" && state.data.omitted > 0 ? state.data.omitted : 0;
  return <>
    <SectionFrame title="Live now" label="webinar status" scope="sessions" state={state} hasData={Boolean(all)}
      note="Operations currently recording or processing, from the runner's own state.">
      {live && !live.length && <div className="card empty-note">Nothing is recording or processing right now.</div>}
      {live && <Capped rows={live} />}
    </SectionFrame>
    {!state.noKey && !state.loading && all && <section aria-labelledby="mb-operations">
      <h2 id="mb-operations">Webinar operations</h2>
      <p>Track capture, processing and coverage gaps for your connected webinars.</p>
      {!state.error && !all.length && <div className="card empty-note">No webinar operations recorded for this tenant yet. Check source discovery status above.</div>}
      {omitted > 0 && <p>Showing the latest 200 operations; {omitted} older operations remain in the runner history.</p>}
      <Capped rows={rest ?? []} />
    </section>}
  </>;
}
