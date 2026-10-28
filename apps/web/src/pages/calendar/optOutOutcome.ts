/**
 * apps/web/src/pages/calendar/optOutOutcome.ts - did the server STORE a meeting identity for the link the page sent?
 *
 * The POST answers `{ state }`. `state.optedOutMeetings` lists the stored identities (`url:<platform>:<id>`, ...) and is
 * ABSENT when there are none; the router never echoes the raw URL. So "was the link recognised" can only be read from
 * whether the count of `url:` entries grew. Identity strings are counted, never shown.
 */
export type LinkOutcome = "recorded" | "unrecognised" | "not-new";

function stateOf(response: unknown): Record<string, unknown> | null {
  const s = typeof response === "object" && response !== null ? (response as Record<string, unknown>).state : undefined;
  // A modern server always sends optedOutEventIds; without it we cannot tell an old server from a bad answer: make no claim.
  return typeof s === "object" && s !== null && Array.isArray((s as Record<string, unknown>).optedOutEventIds) ? s as Record<string, unknown> : null;
}

/** Number of `url:` identities in a GET/POST state; absent optedOutMeetings counts as 0; null when the shape is not recognised. */
export function urlIdentityCount(response: unknown): number | null {
  const s = stateOf(response);
  if (!s) return null;
  const list = s.optedOutMeetings;
  return Array.isArray(list) ? list.filter((v) => typeof v === "string" && v.startsWith("url:")).length : 0;
}

/** `before` is the count seen on the page's GET (null when unknown). A claim is made only when the evidence supports it. */
export function linkOutcome(response: unknown, sentUrl: boolean, before: number | null): LinkOutcome {
  if (!sentUrl) return "recorded";
  const after = urlIdentityCount(response);
  if (after === null) return "recorded";
  if (after === 0) return "unrecognised";
  // Grown count => recorded; unchanged (and non-zero) => the identity was already stored or not derived; unknown before => no claim.
  return before !== null && after <= before ? "not-new" : "recorded";
}
