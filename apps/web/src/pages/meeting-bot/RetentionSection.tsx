import { apiFetch } from "../../api/client.js";
import { SectionFrame } from "./SectionFrame.js";
import { formatInstant } from "./model.js";
import type { Loaded } from "./useLoad.js";
export interface RetentionView {
  status: "never-run" | "available";
  summary?: { mode: "dry-run" | "execute"; ok: boolean; exitCode: number; finishedAt: string;
    candidates: number | null; deleted: number | null; bytes: number | null;
    vetoed: number | null; failed: number | null; clipsRetained: number | null };
}
export const loadRetentionStatus = (key: string): Promise<RetentionView> => apiFetch("/retention/status", key);
const count = (value: number | null) => value === null ? "unknown" : value.toLocaleString();
export function RetentionSection({ state }: { state: Loaded<RetentionView> }): React.ReactElement {
  const summary = state.data?.status === "available" ? state.data.summary : undefined;
  return <SectionFrame title="Recording retention" label="retention status" scope="sessions" state={state}
    hasData={Boolean(state.data)} note="Raw recordings follow the 90-day policy and verification gates. Evidence clips and knowledge are retained.">
    {state.data?.status === "never-run" && <p>No retention run has been recorded for this tenant.</p>}
    {summary && <div className="card">
      <h3>{summary.mode === "dry-run" ? "Last dry run" : "Last execution"}</h3>
      {!summary.ok && <p role="alert">The retention run failed (code {summary.exitCode}). Counts may be incomplete.</p>}
      <p>Finished: {formatInstant(summary.finishedAt)}</p>
      <p>{summary.mode === "dry-run" ? "Candidates assessed" : "Candidates"}: {count(summary.candidates)}</p>
      {summary.mode === "dry-run" ? <p>This was a dry run. No recordings were deleted.</p> : <>
        <p>Deleted: {count(summary.deleted)} recordings · Bytes removed: {count(summary.bytes)}</p>
        <p>Evidence clips retained: {count(summary.clipsRetained)}</p>
      </>}
      <p>Kept by safety checks: {count(summary.vetoed)} · Failed items: {count(summary.failed)}</p>
    </div>}
  </SectionFrame>;
}
