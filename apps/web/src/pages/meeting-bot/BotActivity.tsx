import { SectionFrame } from "./SectionFrame.js";
import type { Loaded } from "./useLoad.js";
import { asRecords, formatInstant, safeText } from "./model.js";

const LABEL: Record<string, string> = {
  "about-to-join": "Will join", "capture-started": "Recording", "capture-stopped-early": "Stopped early",
  "capture-failed": "Failed", "capture-done": "Done", "rules-degraded": "Join rules degraded",
  "coverage-deferred": "Coverage deferred", "discovery-degraded": "Discovery degraded", "discovery-recovered": "Discovery recovered",
};
const BAD = new Set(["capture-stopped-early", "capture-failed", "rules-degraded", "discovery-degraded"]);

/** "Bot activity" from GET /bot-events (scope `jobs`): what the automatic poller decided and how each capture went, newest first. Text only; no links are rendered. */
export function BotActivity({ state }: { state: Loaded<{ events?: unknown }> }): React.ReactElement {
  const rows = state.data && Array.isArray(state.data.events) ? asRecords(state.data.events) : null;
  return <SectionFrame title="Bot activity" label="bot activity" scope="jobs" state={state} hasData={Boolean(rows)}
    note="Automatic joins, recordings and problems reported by the poller. Career guidance is joined first; other webinars are recorded as test data.">
    {rows && !rows.length && <div className="card empty-note">No bot activity yet.</div>}
    {rows && rows.map((e, i) => {
      const kind = typeof e.kind === "string" ? e.kind : "";
      const kws = Array.isArray(e.matchedKeywords) ? e.matchedKeywords.filter((k): k is string => typeof k === "string") : [];
      return <div className="card" key={i} role={BAD.has(kind) ? "alert" : undefined}>
        <h3>{LABEL[kind] ?? "Event"}: {safeText(e.title, "Untitled")}</h3>
        <p>{formatInstant(e.at)}{e.careerGuidance === true ? " · Career guidance (priority)" : e.testData === true ? " · Test data (staging only)" : ""}</p>
        {kws.length > 0 && <p>Matched: {kws.map(k => safeText(k, "", 60)).join(", ")}</p>}
        {typeof e.detail === "string" && e.detail && <p>{safeText(e.detail, "", 300)}</p>}
        {typeof e.outputPath === "string" && e.outputPath && <p>Output: {safeText(e.outputPath, "", 260)}</p>}
      </div>;
    })}
  </SectionFrame>;
}
