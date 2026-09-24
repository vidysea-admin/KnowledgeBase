/**
 * apps/web/src/pages/calendar/CalendarToolbar.tsx — view switch, range navigation and filters
 * ([C1]/[C3]/[C5]/[C8]). Everything here writes to the URL, never to component state, which is
 * what makes a view shareable and what makes navigation unable to drop the active filters: prev/
 * next/Today change ONLY the `date` param.
 */
import type { CalendarFilters, CalendarView } from "./calendar-model.js";
import { CALENDAR_VIEWS, activeCalendarFilterCount } from "./calendar-model.js";

export interface CalendarToolbarProps {
  view: CalendarView;
  rangeLabel: string;
  timeZone: string;
  filters: CalendarFilters;
  sourceOptions: readonly string[];
  onView(view: CalendarView): void;
  onShift(direction: 1 | -1): void;
  onToday(): void;
  onFilter(key: keyof CalendarFilters, value: string): void;
  onClearFilters(): void;
}

const CONTROL: React.CSSProperties = {
  padding: "0.25rem 0.5rem", border: "1px solid var(--line)", borderRadius: 6,
  background: "var(--card)", cursor: "pointer", font: "inherit", fontSize: "0.8rem",
};

export function CalendarToolbar(props: CalendarToolbarProps): React.ReactElement {
  const active = activeCalendarFilterCount(props.filters);
  return (
    <div className="card" data-testid="calendar-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      <div role="group" aria-label="Range navigation" style={{ display: "flex", gap: "0.3rem" }}>
        <button type="button" style={CONTROL} aria-label="Previous range" onClick={() => props.onShift(-1)}>&lsaquo;</button>
        <button type="button" style={CONTROL} onClick={props.onToday}>Today</button>
        <button type="button" style={CONTROL} aria-label="Next range" onClick={() => props.onShift(1)}>&rsaquo;</button>
      </div>
      <strong data-testid="range-label" style={{ fontSize: "0.95rem" }}>{props.rangeLabel}</strong>

      <div role="group" aria-label="Calendar view" style={{ display: "flex", gap: "0.3rem", marginLeft: "0.5rem" }}>
        {CALENDAR_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={props.view === v}
            onClick={() => props.onView(v)}
            style={{
              ...CONTROL,
              background: props.view === v ? "var(--accent)" : "var(--card)",
              color: props.view === v ? "var(--accent-ink)" : "var(--ink)",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <span style={{ flex: 1 }} />

      <label style={{ fontSize: "0.78rem" }}>
        Kind&nbsp;
        <select aria-label="Filter by kind" value={props.filters.kind} onChange={(e) => props.onFilter("kind", e.target.value)} style={CONTROL}>
          <option value="">all</option>
          <option value="session">sessions</option>
          <option value="meeting">meetings</option>
        </select>
      </label>
      <label style={{ fontSize: "0.78rem" }}>
        Source&nbsp;
        <select aria-label="Filter by org or source" value={props.filters.source} onChange={(e) => props.onFilter("source", e.target.value)} style={CONTROL}>
          <option value="">all</option>
          {props.sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ fontSize: "0.78rem" }}>
        Search&nbsp;
        <input
          type="search"
          aria-label="Search event titles"
          value={props.filters.query}
          placeholder="title…"
          onChange={(e) => props.onFilter("query", e.target.value)}
          style={CONTROL}
        />
      </label>
      <span className="row-meta" data-testid="calendar-filter-count">{active} filter(s) active</span>
      {active > 0 && (
        <button type="button" style={CONTROL} onClick={props.onClearFilters}>Clear filters</button>
      )}
      <span className="row-meta" data-testid="calendar-timezone" style={{ width: "100%" }}>
        All times shown in {props.timeZone}.
      </span>
    </div>
  );
}
