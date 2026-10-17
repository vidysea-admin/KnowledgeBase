import { Link } from "react-router-dom";
import { SectionFrame } from "./SectionFrame.js";
import type { Loaded } from "./useLoad.js";
import { ROW_CAP, asRecords, formatBytes, formatInstant, instantMs, pipelineLabel, safeText, sessionPath } from "./model.js";

/**
 * "Past recordings" from GET /sessions (scope `sessions`): title, date, transcript and index status, and a router link to the
 * session page. The sessions list returns no video size, duration or retention state, so size is shown as unknown (never 0)
 * and retention state is not shown at all; nothing is computed or implied about purge dates.
 */
export function PastSection({ state }: { state: Loaded<{ sessions?: unknown }> }): React.ReactElement {
  const raw = state.data && Array.isArray(state.data.sessions) ? asRecords(state.data.sessions) : null;
  const rows = raw && [...raw].sort((a, b) => (instantMs(b.date) ?? -Infinity) - (instantMs(a.date) ?? -Infinity));
  const badShape = state.data !== undefined && raw === null;
  return <SectionFrame title="Past recordings" label="past recordings" scope="sessions" state={badShape ? { ...state, error: new Error("shape") } : state}
    hasData={Boolean(rows)} note="Video size and retention state are not reported by the sessions list yet, so size shows as unknown and no retention state or date is shown.">
    {rows && !rows.length && <div className="card empty-note">No past recordings or sessions found for this tenant.</div>}
    {rows && rows.length > ROW_CAP && <p>Showing the {ROW_CAP} most recent of {rows.length} past recordings.</p>}
    {rows && rows.slice(0, ROW_CAP).map((s, i) => {
      const title = safeText(s.title, "Untitled session"), path = sessionPath(s._id);
      const status = typeof s.status === "object" && s.status !== null ? s.status as Record<string, unknown> : {};
      return <div className="card" key={i}>
        <h3>{title}</h3>
        <p>Date: {formatInstant(s.date, true)} · Video size: {formatBytes(undefined /* GET /sessions returns no size */)}</p>
        <p>Transcript: {pipelineLabel(status.transcribe)} · Index: {pipelineLabel(status.index)}</p>
        {path ? <Link to={path} aria-label={`Open session and transcript: ${title}`}>Open session and transcript</Link> : <p>No session page available.</p>}
      </div>;
    })}
  </SectionFrame>;
}
