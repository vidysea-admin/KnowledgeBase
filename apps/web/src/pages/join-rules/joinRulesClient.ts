import { ApiError, apiFetch } from "../../api/client.js";
import { parseView, type JoinRulesView, type MeetingHints, type PendingKind, type RuleSet } from "./joinRulesModel.js";

const BASE = "/calendar/join-rules";

/** A rule set read from the server plus the strong ETag the server sent with it (null when the response carried none). */
export interface LoadedRules { view: JoinRulesView; etag: string | null }
const cleanTag = (t: string | null | undefined): string | null => (typeof t === "string" && t.trim() !== "" ? t : null);
/** GET: scope `calendar`. A response that is not the documented shape is an error, never an empty view. The ETag is kept exactly as received, quotes included. */
export async function getJoinRules(apiKey: string): Promise<LoadedRules> {
  let etag: string | null = null;
  const view = parseView(await apiFetch<unknown>(BASE, apiKey, { onResponseHeaders: h => { etag = h.get("etag"); } }));
  if (!view) throw new ApiError(200, "the server returned an unexpected join-rules response");
  return { view, etag: cleanTag(etag) };
}
/**
 * A rule set is "stored" when it differs from the empty default. The API sends no ETag for an unstored set, so a non-empty set
 * WITHOUT an ETag means the server (or CORS) is not providing the validator: saving must then be unavailable, never unconditional.
 */
export const looksStored = (v: JoinRulesView): boolean => v.ruleSet.rules.length > 0 || v.ruleSet.ownDomains.length > 0 || v.ruleSet.attendanceMode !== undefined || v.ruleSet.purposeGroups !== undefined;
/** The precondition header for a PUT: If-Match with the loaded ETag, or If-None-Match: * to create the first rule set. Exactly one, always. */
export const preconditionHeaders = (etag: string | null): Record<string, string> => etag !== null ? { "If-Match": etag } : { "If-None-Match": "*" };
/** PUT: scope `join-rules`. The body is the rule set ONLY: no tenant, no state. Resolves to the ETag of the new version (null when the response carried none). */
export async function putRuleSet(apiKey: string, ruleSet: RuleSet, etag: string | null): Promise<string | null> {
  let next: string | null = null;
  await apiFetch(BASE, apiKey, { method: "PUT", body: ruleSet, headers: preconditionHeaders(etag), onResponseHeaders: h => { next = h.get("etag"); } });
  return cleanTag(next);
}
/**
 * The opt-out body: the event id plus the router's two optional hints, each only when a non-empty string was supplied.
 * Never fabricated; the editor has no source for them yet (it only knows event ids), so today no caller passes any.
 */
export function optOutBody(eventId: string, hints?: MeetingHints): { eventId: string; meetingUrl?: string; sessionKey?: string } {
  const body: { eventId: string; meetingUrl?: string; sessionKey?: string } = { eventId };
  for (const key of ["meetingUrl", "sessionKey"] as const) {
    const v = hints?.[key];
    if (typeof v === "string" && v.trim() !== "") body[key] = v.trim();
  }
  return body;
}
/** POST approvals / opt-outs: scope `join-rules`. */
export function postPending(apiKey: string, kind: PendingKind, value: string, hints?: MeetingHints): Promise<unknown> {
  return kind === "optout"
    ? apiFetch(`${BASE}/opt-outs`, apiKey, { method: "POST", body: optOutBody(value, hints) })
    : apiFetch(`${BASE}/approvals`, apiKey, { method: "POST", body: { kind, value } });
}

export type Failure = "unauthorized" | "forbidden" | "bad-request" | "unavailable" | "busy" | "failed";
/** The API's structured error code for 503 busy (apps/api/src/join-rules/router.ts). Exact match: a 503 with any other code is "not configured". */
export const BUSY_ERROR_CODE = "join_rules_busy";
export interface Problem { failure: Failure; status: number; serverMessage: string; retryAfterSeconds?: number }

export function classify(error: unknown): Problem {
  const status = error instanceof ApiError ? error.status : 0;
  const serverMessage = error instanceof ApiError ? error.message : "";
  const failure: Failure = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 400 ? "bad-request" : status === 503 ? (error instanceof ApiError && error.code === BUSY_ERROR_CODE ? "busy" : "unavailable") : "failed";
  const retryAfterSeconds = error instanceof ApiError ? error.retryAfterSeconds : undefined;
  return retryAfterSeconds === undefined ? { failure, status, serverMessage } : { failure, status, serverMessage, retryAfterSeconds };
}

export const MESSAGES = {
  unauthorized: "Your API key was rejected. Sign in again.",
  readForbidden: "This API key lacks permission to read join rules.",
  readOnly: "This key can view rules but cannot change them. Use a key with the join-rules scope to edit.",
  unavailable: "Rule editing is not available on this server yet.",
  busy: "Join rules are busy (another change is in progress). Wait a few seconds and try again.",
  loadFailed: "Unable to load join rules.",
  stale: "The rules were changed by someone else since you opened them, so nothing was saved. Your edits are still in the form. Reload the latest rules to see the other change (this discards your unsaved edits), then re-apply them.",
  preconditionRequired: "The editor sent a save without a version check, which the server refuses. This is a bug in the editor, not something you did; nothing was saved and your edits are still in the form. Reload the page and try again.",
  noEtag: "Saving is unavailable: the server did not send a version tag for these rules, so a save could overwrite someone else's change. Nothing will be sent. Reload the page; if this persists the server needs updating.",
  writeFailed: "The change could not be saved. Your edits are still in the form; try again.",
} as const;
