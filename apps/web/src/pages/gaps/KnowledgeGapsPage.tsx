import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { listGaps } from "../../api/gaps.js";
import { ApiError } from "../../api/client.js";
import { emptyGapFilters, gapStatuses, gapsModel, readGaps, type GapFilters, type GapView, type RecordedText } from "./gapsModel.js";

function Field({ label, field }: { label: string; field: RecordedText }) {
  return <p>{label}: {field.state === "recorded" ? field.value : field.state === "missing" ? "Not recorded" : "Invalid recorded value"}</p>;
}
function failure(error: unknown): string {
  return error instanceof ApiError && error.status === 403 ? "This API key needs gaps permission to view knowledge gaps." : "Unable to load knowledge gaps. Try refreshing.";
}
export function KnowledgeGapsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [filters, setFilters] = useState<GapFilters>(emptyGapFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; generation: number; gaps: GapView[]; observedAt: number; error: string | null } | null>(null);
  const current = loaded?.key === apiKey && loaded.generation === generation ? loaded : null;
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setSelectedId(null); setFilters(emptyGapFilters);
    if (apiKey) listGaps(apiKey).then(response => {
      const gaps = readGaps(response);
      if (!cancelled) setLoaded({ key: apiKey, generation, gaps, observedAt: Date.now(), error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key: apiKey, generation, gaps: [], observedAt: Date.now(), error: failure(error) });
    });
    return () => { cancelled = true; };
  }, [apiKey, generation]);
  const model = current && !current.error ? gapsModel(current.gaps, filters, current.observedAt) : null;
  const selected = model?.visible.find(gap => gap.id === selectedId);
  return <>
    <div className="page-header"><h1>Knowledge gaps</h1><p>Inspect the missing recordings, sources and vectors recorded for this tenant.</p></div>
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view knowledge gaps.</p> : <>
      <button type="button" disabled={!current} onClick={() => setGeneration(value => value + 1)}>Refresh</button>
      {!current && <p role="status">Loading knowledge gaps…</p>}
      {current?.error && <p role="alert" className="card error-note">{current.error}</p>}
      {model && <>
        <section className="card" aria-label="Gap summary">
          <p>{model.total} returned gaps: {model.counts.open} open; {model.counts.received} received; {model.counts.expired} expired; {model.counts.unknown} unknown status.</p>
          <p>{model.overdue} overdue among {model.openDated} open gaps with a valid due date; {model.openDueMissing} open gaps have no due date; {model.openDueInvalid} have an invalid due date.</p>
          <p className="row-meta">Snapshot checked at {model.observedAt}. Overdue means an open gap’s recorded due time precedes this snapshot. Refresh to update it.</p>
          <p className="row-meta">These are recorded gaps, not a measurement of all missing knowledge or transcript coverage. No records does not establish complete knowledge.</p>
          <ul aria-label="Gap kinds">{model.kinds.map(([kind, count]) => <li key={kind}>{kind}: {count}</li>)}</ul>
        </section>
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <label>Status <select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value as GapFilters["status"] }))}><option value="all">All statuses</option>{[...gapStatuses, "unknown"].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Kind <select value={filters.kind} onChange={event => setFilters(value => ({ ...value, kind: event.target.value }))}><option value="">All kinds</option>{model.kinds.map(([kind]) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>Search gaps <input value={filters.query} onChange={event => setFilters(value => ({ ...value, query: event.target.value }))} /></label>
          <button type="button" onClick={() => setFilters(emptyGapFilters)}>Clear filters</button>
        </div>
        <p role="status">Showing {model.visible.length} of {model.total} returned gaps.</p>
        {model.total === 0 ? <p className="card empty-note">No gaps were returned for this tenant.</p> : model.visible.length === 0 ? <p className="card empty-note">No returned gaps match these filters.</p> : <ul className="card" aria-label="Recorded gaps">{model.visible.map(gap => <li key={gap.id}>
          <button type="button" aria-pressed={selected?.id === gap.id} onClick={() => setSelectedId(gap.id)}>Inspect {gap.id}</button>
          <span> · {gap.kind} · {gap.status === "unknown" ? `unknown status (${gap.rawStatus})` : gap.status}</span>
          <Field label="Description" field={gap.description} />
        </li>)}</ul>}
        <section className="card" aria-label="Gap inspection">
          {!selected ? <p>{selectedId ? "The selected gap is outside the current returned filters. Select a visible gap to inspect it." : "Select a gap to inspect its recorded request and source details."}</p> : <>
            <h2>{selected.id}</h2><p>Kind: {selected.kind}; status: {selected.status === "unknown" ? `unknown (${selected.rawStatus})` : selected.status}.</p>
            <Field label="Description" field={selected.description} /><Field label="Requested from" field={selected.requestedFrom} /><Field label="Requested at" field={selected.requestedAt} /><Field label="Due at" field={selected.dueAt} /><Field label="Source reference" field={selected.sourceRef} />
            <p className="row-meta">References are recorded identifiers. This dashboard does not infer a source or session link from an identifier.</p>
          </>}
        </section>
      </>}
    </>}
  </>;
}
