/**
 * T-057 E4 setup wizard model. Pure: turns the results of EXISTING read endpoints into checklist items.
 * Sources: GET /system-status (API + DB + key accepted), GET /setup/status (booleans per integration,
 * never values), GET /calendar/join-rules (scope calendar), GET /watched-sources (scope sources).
 * There is NO endpoint that reports the caller's own scopes or the Google (gws) connection, so those
 * two items are always "unknown" with the command to run, never guessed. Nothing here can hold a
 * secret: the only inputs are booleans, counts and HTTP statuses.
 */
import { ApiError } from "../../api/client.js";
import { looksStored } from "../join-rules/joinRulesClient.js";
import type { JoinRulesView } from "../join-rules/joinRulesModel.js";

export type ItemStatus = "ok" | "todo" | "problem" | "unknown";
export interface SetupItem { id: string; title: string; status: ItemStatus; means: string; action: string; source: string }

/** A settled fetch: its value, or the HTTP status it failed with (0 = could not connect, -1 = malformed body). */
export type Probe<T> = { ok: true; value: T } | { ok: false; status: number };
export interface SetupProbes {
  systemStatus: Probe<{ db: "ok" | "error" }>;
  integrations: Probe<{ gemini: boolean; tavily: boolean; langfuse: boolean }>;
  joinRules: Probe<JoinRulesView>;
  watchedSources: Probe<number>;
}

export const failStatus = (e: unknown): number => (e instanceof ApiError ? e.status : 0);
const granted = (p: Probe<unknown>): string => (p.ok ? "granted" : p.status === 403 ? "denied (403)" : "not observed");

/** Why a failed read cannot answer. `scope` is the scope a 403 means is missing, or null when no scope applies. */
function why(p: { ok: false; status: number }, scope: string | null): string {
  if (p.status === 403) return scope ? `This API key lacks the "${scope}" scope, so this cannot be read.` : "This API key is not permitted to read this.";
  if (p.status === 401) return "The API key was not accepted, so this cannot be read.";
  if (p.status === 0) return "The API could not be reached, so this cannot be read.";
  if (p.status === 404) return "This API version does not offer this check.";
  return `The check failed (HTTP ${p.status}); status unknown.`;
}

const DB_FIX = "Check MONGO_URI in .env and that the database is running (docker compose up -d mongo).";

export function buildItems(p: SetupProbes): SetupItem[] {
  const s = p.systemStatus;
  const items: SetupItem[] = [];
  const SS = "GET /system-status";

  items.push(s.ok || s.status !== 0
    ? { id: "api", title: "API reachable", status: "ok", means: "The web app reached the API and it answered.", action: "Nothing to do.", source: SS }
    : { id: "api", title: "API reachable", status: "problem", means: "The web app could not connect to the API.", action: "Start the API (pnpm --filter @lkb/api dev) or set VITE_API_BASE_URL to its address, then press Re-check.", source: SS });

  if (s.ok) {
    items.push(s.value.db === "ok"
      ? { id: "db", title: "Database ping", status: "ok", means: "MongoDB answered the ping.", action: "Nothing to do.", source: SS }
      : { id: "db", title: "Database ping", status: "problem", means: "The API is up but MongoDB did not answer.", action: DB_FIX, source: SS });
  } else if (s.status === 503) {
    items.push({ id: "db", title: "Database ping", status: "problem", means: "The API is up but the status reader reports the database as down or not wired.", action: DB_FIX, source: SS });
  } else {
    items.push({ id: "db", title: "Database ping", status: "unknown", means: "Not checked: the status call did not succeed.", action: "Fix the API and key items, then Re-check.", source: SS });
  }

  items.push(s.ok
    ? { id: "key", title: "API key valid", status: "ok", means: "The API accepted your key.", action: "Nothing to do.", source: SS }
    : s.status === 401
      ? { id: "key", title: "API key valid", status: "problem", means: "The API rejected your key (or none is set).", action: "Sign in with a valid key; mint one with the seed script or POST /keys from a key with the \"keys\" scope.", source: SS }
      : { id: "key", title: "API key valid", status: "unknown", means: "Not checked: the status call could not confirm the key.", action: "Fix the API item, then Re-check.", source: SS });

  items.push({
    id: "scopes", title: "API key scopes", status: "unknown",
    means: `No endpoint reports the calling key's own scopes, so they are not listed. Observed from this page's reads: calendar ${granted(p.joinRules)}, sources ${granted(p.watchedSources)}.`,
    action: "A scope shown as denied needs a key that carries it; the key list (scope \"keys\") shows the tenant's keys and their scopes.",
    source: "no endpoint (observed from the reads below)",
  });

  const ig = p.integrations;
  const integ = (id: string, title: string, key: "gemini" | "tavily" | "langfuse", required: boolean, on: string, off: string, action: string): SetupItem => {
    if (!ig.ok) return { id, title, status: "unknown", means: why(ig, null), action: "Re-check once the API is reachable and up to date.", source: "GET /setup/status" };
    return ig.value[key]
      ? { id, title, status: "ok", means: on, action: "Nothing to do.", source: "GET /setup/status" }
      : { id, title, status: required ? "problem" : "todo", means: off, action, source: "GET /setup/status" };
  };
  items.push(integ("gemini", "Gemini configured (optional)", "gemini", false, "A Gemini key is set (its value is never shown). This does not verify a working provider or model.", "No Gemini key is set. Other configured providers may support AI jobs; this check does not report their availability.", "If Gemini is needed, set GEMINI_API_KEY in .env (see .env.example), restart the API, then Re-check."));
  items.push({
    id: "ai-readiness", title: "AI provider and model readiness", status: "unknown",
    means: "These checks report optional integration configuration only. They do not test model access, local provider runtime, job routing or successful AI output.",
    action: "Confirm the provider and model configured for the intended job, then verify an authorized sample job. A configured key alone does not establish readiness.",
    source: "not tested by these setup endpoints",
  });
  items.push(integ("tavily", "Tavily configured (optional)", "tavily", false, "A Tavily key is set (its value is never shown).", "No Tavily key: Ask cannot fall back to web search.", "Optional: set TAVILY_API_KEY in .env, restart the API, then Re-check."));
  items.push(integ("langfuse", "Langfuse configured (optional)", "langfuse", false, "All Langfuse tracing variables are set (values never shown).", "Langfuse tracing is off.", "Optional: set LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env, restart the API, then Re-check."));

  const jr = p.joinRules;
  items.push(jr.ok
    ? looksStored(jr.value)
      ? { id: "join-rules", title: "Join rules present", status: "ok", means: `${jr.value.ruleSet.rules.length} rule(s) and ${jr.value.ruleSet.ownDomains.length} own domain(s) stored.`, action: "Nothing to do.", source: "GET /calendar/join-rules" }
      : { id: "join-rules", title: "Join rules present", status: "todo", means: "No join rules are stored yet, so the meeting bot has no rule for who it may join.", action: "Open Join rules (/join-rules) and save a first rule set.", source: "GET /calendar/join-rules" }
    : { id: "join-rules", title: "Join rules present", status: "unknown", means: why(jr, "calendar"), action: "Open Join rules (/join-rules) with a key that has the calendar scope.", source: "GET /calendar/join-rules" });

  const ws = p.watchedSources;
  items.push(ws.ok
    ? ws.value > 0
      ? { id: "sources", title: "Watched sources", status: "ok", means: `${ws.value} active watched source(s).`, action: "Nothing to do.", source: "GET /watched-sources" }
      : { id: "sources", title: "Watched sources", status: "todo", means: "No watched sources: nothing is being monitored for change.", action: "Open Watch (/watch) and add a source URL.", source: "GET /watched-sources" }
    : { id: "sources", title: "Watched sources", status: "unknown", means: why(ws, "sources"), action: "Open Watch (/watch) with a key that has the sources scope.", source: "GET /watched-sources" });

  items.push({
    id: "google", title: "Google Calendar / Gmail connection", status: "unknown",
    means: "The API has no endpoint that reports the Google (gws) connection, so this page cannot tell. It is not guessed.",
    action: "On the API host run: gws auth status   (if not signed in: gws auth login)", source: "no endpoint",
  });
  return items;
}

export function summarise(items: SetupItem[]): string {
  const n = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  return `${n("ok")} ready, ${n("todo")} to do, ${n("problem")} problem(s), ${n("unknown")} unknown`;
}
