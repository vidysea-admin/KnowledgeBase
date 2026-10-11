import { ApiError, apiFetch } from "../../api/client.js";
import { parseView, type JoinRulesView, type PendingKind, type RuleSet } from "./joinRulesModel.js";

const BASE = "/calendar/join-rules";

/** GET: scope `calendar`. A response that is not the documented shape is an error, never an empty view. */
export async function getJoinRules(apiKey: string): Promise<JoinRulesView> {
  const view = parseView(await apiFetch<unknown>(BASE, apiKey));
  if (!view) throw new ApiError(200, "the server returned an unexpected join-rules response");
  return view;
}
/** PUT: scope `join-rules`. The body is the rule set ONLY: no tenant, no state. */
export const putRuleSet = (apiKey: string, ruleSet: RuleSet): Promise<unknown> => apiFetch(BASE, apiKey, { method: "PUT", body: ruleSet });
/** POST approvals / opt-outs: scope `join-rules`. */
export function postPending(apiKey: string, kind: PendingKind, value: string): Promise<unknown> {
  return kind === "optout"
    ? apiFetch(`${BASE}/opt-outs`, apiKey, { method: "POST", body: { eventId: value } })
    : apiFetch(`${BASE}/approvals`, apiKey, { method: "POST", body: { kind, value } });
}

export type Failure = "unauthorized" | "forbidden" | "bad-request" | "unavailable" | "busy" | "failed";
/** The API's fixed body message for 503 `join_rules_busy` (apps/api/src/join-rules/router.ts); the only way to tell it from the 503 "not configured". */
export const BUSY_SERVER_MESSAGE = "join rules are busy; try again in a few seconds";
export interface Problem { failure: Failure; status: number; serverMessage: string }

export function classify(error: unknown): Problem {
  const status = error instanceof ApiError ? error.status : 0;
  const serverMessage = error instanceof ApiError ? error.message : "";
  const failure: Failure = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 400 ? "bad-request" : status === 503 ? (serverMessage === BUSY_SERVER_MESSAGE ? "busy" : "unavailable") : "failed";
  return { failure, status, serverMessage };
}

export const MESSAGES = {
  unauthorized: "Your API key was rejected. Sign in again.",
  readForbidden: "This API key lacks permission to read join rules.",
  readOnly: "This key can view rules but cannot change them. Use a key with the join-rules scope to edit.",
  unavailable: "Rule editing is not available on this server yet.",
  busy: "Join rules are busy (another change is in progress). Wait a few seconds and try again.",
  loadFailed: "Unable to load join rules.",
  writeFailed: "The change could not be saved. Your edits are still in the form; try again.",
} as const;
