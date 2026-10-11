/**
 * packages/meeting-bot/src/calendar/join-rules-optout.ts — T-037 unit `t037-optout-meeting-identity-store`
 * (ISS-T037W1-001). Pure helpers that let an opt-out follow the MEETING, not only the record id.
 *
 * STORED FORM: `JoinRuleState.optedOutMeetings` (OPTIONAL; absent in every document written before this unit).
 * Each entry is a tagged string so the two namespaces can never collide:
 *   `url:<platform>:<id>`  the normalised meeting identity from `meetingIdentity(url)` (send-now.ts), e.g. `url:zoom:123456789`
 *   `key:<sessionKey>`     the shared sessionKey of the opted-out record (e.g. a webinar key shared by calendar + gmail copies)
 * Strict: array of strings, <= 500 entries, each <= 200 chars, no whitespace/control characters, deduplicated.
 * Degenerate values (empty, tag only, null/undefined/none literals) are never stored and never match.
 *
 * MATCHING (`optedOutMeetingMatch`) is read by `evaluateJoinRules` only (the single matcher); it can only yield a skip.
 * It runs on the RAW state, before validation, exactly like the id opt-out: skip never widens access.
 *
 * KNOWN LIMIT: a recurring personal-room URL (one Zoom/Meet room reused by different meetings) has ONE identity, so opting
 * out of one occurrence blocks every later meeting on that URL until the entry is removed (no un-opt operation exists yet).
 */
import { meetingIdentity } from "../send-now.js";

export const MAX_OPTED_OUT_MEETINGS = 500;
export const MAX_MEETING_ENTRY_LENGTH = 200;

const ENTRY = /^(url|key):[^\s\u0000-\u001f\u007f]+$/;
const DEGENERATE = new Set(["", "null", "undefined", "none", "unknown", "nan", "0", "-1", "false", "true"]);

/** True for a well-formed, non-degenerate stored entry. */
export function isMeetingEntry(v: unknown): v is string {
  if (typeof v !== "string" || v.length > MAX_MEETING_ENTRY_LENGTH || !ENTRY.test(v)) return false;
  const body = v.slice(v.indexOf(":") + 1).toLowerCase();
  if (DEGENERATE.has(body)) return false;
  // a url entry must itself look like `<platform>:<id>` with a non-empty id
  return !v.startsWith("url:") || /^[a-z]+:[^:\s]+/.test(body) && !DEGENERATE.has(body.slice(body.indexOf(":") + 1));
}

function identityOf(url: unknown): string | undefined {
  try { return typeof url === "string" && url.length <= 2048 ? meetingIdentity(url) : undefined; } catch { return undefined; }
}

/** Entry for a URL, or undefined when no identity can be derived. */
export const urlEntry = (url: unknown): string | undefined => {
  const id = identityOf(url);
  const e = id === undefined ? undefined : `url:${id}`;
  return e !== undefined && isMeetingEntry(e) ? e : undefined;
};
/** Entry for a sessionKey, or undefined when it is empty/degenerate/oversized. */
export const keyEntry = (key: unknown): string | undefined => {
  const e = typeof key === "string" ? `key:${key.trim()}` : undefined;
  return e !== undefined && isMeetingEntry(e) ? e : undefined;
};

/** Meeting hints the caller knows about the opted-out record. Anything underivable is silently ignored (id-only opt-out). */
export interface OptOutMeeting { meetingUrl?: unknown; sessionKey?: unknown }

/** New entries list = old + derived entries (deduped, capped). Returns undefined when nothing needs storing and nothing existed. */
export function addMeetingEntries(existing: readonly string[] | undefined, meeting: OptOutMeeting | undefined): string[] | undefined {
  const out = [...(existing ?? [])];
  const hints = meeting !== null && typeof meeting === "object" ? meeting : {};
  for (const e of [urlEntry(hints.meetingUrl), keyEntry(hints.sessionKey)]) {
    if (e !== undefined && !out.includes(e) && out.length < MAX_OPTED_OUT_MEETINGS) out.push(e);
  }
  return existing === undefined && out.length === 0 ? undefined : out;
}

/** Strict validation for persisted data: returns a deduplicated copy; throws on any malformed entry (fail closed). */
export function normalizeMeetingEntries(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error("must be an array");
  if (input.length > MAX_OPTED_OUT_MEETINGS) throw new Error(`more than ${MAX_OPTED_OUT_MEETINGS} entries`);
  const out: string[] = [];
  input.forEach((v, i) => {
    if (!isMeetingEntry(v)) throw new Error(`entry ${i} is not a valid meeting identity`);
    if (!out.includes(v)) out.push(v);
  });
  return out;
}

/**
 * Matcher used by `evaluateJoinRules` on the raw state: returns the stored entry that covers this event, or undefined.
 * The event id is tested as a sessionKey; the meeting URL is tested by identity. Never throws.
 */
export function optedOutMeetingMatch(rawEntries: unknown, eventId: unknown, meetingUrl: unknown): string | undefined {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return undefined;
  const wanted = [urlEntry(meetingUrl), keyEntry(eventId)];
  return wanted.find((w): w is string => w !== undefined && rawEntries.includes(w));
}
