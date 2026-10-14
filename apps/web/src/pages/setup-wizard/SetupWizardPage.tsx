/**
 * T-057 E4 first-run setup wizard (the "check" half is /status). Runs existing read calls plus the
 * booleans-only GET /setup/status, then lists each requirement with its live state, what it means and
 * the exact next action. All text is rendered as React text; no secret value is ever in the data.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { apiFetch } from "../../api/client.js";
import { parseView } from "../join-rules/joinRulesModel.js";
import { buildItems, failStatus, summarise, type Probe, type SetupProbes } from "./setupModel.js";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
async function probe<T>(run: () => Promise<T | null>): Promise<Probe<T>> {
  try { const value = await run(); return value === null ? { ok: false, status: -1 } : { ok: true, value }; }
  catch (e) { return { ok: false, status: failStatus(e) }; }
}

export async function loadProbes(apiKey: string): Promise<SetupProbes> {
  const [systemStatus, integrations, joinRules, watchedSources] = await Promise.all([
    probe(async () => { const r = await apiFetch<unknown>("/system-status", apiKey); return isObj(r) && (r.db === "ok" || r.db === "error") ? { db: r.db === "ok" ? ("ok" as const) : ("error" as const) } : null; }),
    probe(async () => {
      const r = await apiFetch<unknown>("/setup/status", apiKey);
      const c = isObj(r) ? r.configured : null;
      return isObj(c) && typeof c.gemini === "boolean" && typeof c.tavily === "boolean" && typeof c.langfuse === "boolean"
        ? { gemini: c.gemini, tavily: c.tavily, langfuse: c.langfuse } : null;
    }),
    probe(async () => parseView(await apiFetch<unknown>("/calendar/join-rules", apiKey))),
    probe(async () => { const r = await apiFetch<unknown>("/watched-sources", apiKey); return isObj(r) && Array.isArray(r.sources) ? r.sources.length : null; }),
  ]);
  return { systemStatus, integrations, joinRules, watchedSources };
}

const LABEL = { ok: "Ready", todo: "To do", problem: "Problem", unknown: "Unknown" } as const;

export function SetupWizardPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; generation: number; probes: SetupProbes } | null>(null);
  const current = loaded && loaded.key === apiKey && loaded.generation === generation ? loaded : null;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    void loadProbes(apiKey).then((probes) => { if (!cancelled) setLoaded({ key: apiKey, generation, probes }); });
    return () => { cancelled = true; };
  }, [apiKey, generation]);

  const items = current ? buildItems(current.probes) : null;
  return (
    <>
      <div className="page-header">
        <h1>Setup wizard</h1>
        <p>What this system needs, and the live state of each item. Secret values are never shown; configuration is reported only as yes or no.</p>
      </div>
      {!apiKey && <div className="card empty-note">Sign in with an API key to run the setup checks.</div>}
      {apiKey && !items && <div className="card empty-note" role="status">Running setup checks&hellip;</div>}
      {items && (
        <section className="card" aria-labelledby="setup-items">
          <h2 id="setup-items">Checklist</h2>
          <p className="row-meta" role="status">{summarise(items)}</p>
          <ol>
            {items.map((i) => (
              <li key={i.id} data-testid={`item-${i.id}`} data-status={i.status}>
                <strong>{i.title}</strong>: <span>{LABEL[i.status]}</span>
                <p>{i.means}</p>
                <p><em>Next action:</em> {i.action}</p>
                <p className="row-meta">Source: {i.source}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setGeneration((g) => g + 1)}>Re-check</button>
        </section>
      )}
    </>
  );
}
