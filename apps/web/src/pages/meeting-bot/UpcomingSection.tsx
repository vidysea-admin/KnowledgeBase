import { SectionFrame } from "./SectionFrame.js";
import type { Loaded } from "./useLoad.js";
import { ROW_CAP, asRecords, formatInstant, instantMs, platformOf, safeText } from "./model.js";

/**
 * "Upcoming meetings on the calendar" from GET /calendar/upcoming (scope `calendar`). Listing here is NOT a decision to record:
 * the bot's choice depends on settings and on other meetings, none of which this page evaluates, and the endpoint reports no
 * scheduling decision or skip reason, so none is shown. The join link itself is never rendered, only whether one is known.
 */
export function UpcomingSection({ state }: { state: Loaded<{ meetings?: unknown }> }): React.ReactElement {
  const raw = state.data && Array.isArray(state.data.meetings) ? asRecords(state.data.meetings) : null;
  const now = Date.now();
  // Not yet ended (or no usable end time), soonest first; unparseable start times go last with a placeholder.
  const rows = raw && raw.filter(m => { const end = instantMs(m.endTime) ?? instantMs(m.startTime); return end === null || end >= now; })
    .sort((a, b) => (instantMs(a.startTime) ?? Infinity) - (instantMs(b.startTime) ?? Infinity));
  const badShape = state.data !== undefined && raw === null;
  return <SectionFrame title="Upcoming meetings on the calendar" label="upcoming meetings" scope="calendar" state={badShape ? { ...state, error: new Error("shape") } : state}
    hasData={Boolean(rows)} note="Appearing here is not a decision to record. Which meetings the bot joins depends on its settings and on other meetings; this page does not evaluate that.">
    {rows && !rows.length && <div className="card empty-note">No upcoming meetings on the calendar.</div>}
    {rows && rows.length > ROW_CAP && <p>Showing {ROW_CAP} of {rows.length} upcoming meetings.</p>}
    {rows && rows.slice(0, ROW_CAP).map((m, i) => {
      const { platform, linkKnown } = platformOf(m.meetingUrl);
      return <div className="card" key={i}>
        <h3>{safeText(m.title, "Untitled meeting")}</h3>
        <p>Starts: {formatInstant(m.startTime)} · Platform: {platform} · Join link: {linkKnown ? "known" : "not known"}</p>
      </div>;
    })}
  </SectionFrame>;
}
