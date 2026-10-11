/**
 * packages/ingest/src/sources/onair.ts — T-045 (Google Cloud OnAir half), URL recognition ONLY.
 * Pure: no fetch, no download, no HTML parsing, no process. Accepted forms are an ASSUMPTION
 * grounded in the repo only (packages/meeting-bot/src/{platform,send-now}.ts and their tests):
 *   https://cloudonair.withgoogle.com/events/<slug>   (slug lower-cased, optional trailing "/")
 * Everything else is refused with a typed reason. Query and fragment never reach the canonical
 * URL or the id: the query allow-list is EMPTY (a tracking/utm/token parameter is dropped, not kept).
 */

export type OnairRefusal =
  | "not-a-string"
  | "empty"
  | "too-long"
  | "bad-characters"
  | "not-https"
  | "credentials"
  | "port"
  | "unparseable"
  | "host-not-allowed"
  | "path-not-supported"
  | "bad-event-id";

export type OnairParse =
  | { ok: true; platform: "cloudonair"; eventId: string; canonicalUrl: string }
  | { ok: false; reason: OnairRefusal };

export const ONAIR_HOST = "cloudonair.withgoogle.com";
/** Query parameters that may be carried into the canonical URL. Empty by decision. */
export const ONAIR_QUERY_ALLOW: readonly string[] = [];

const MAX_INPUT_LENGTH = 200;
const MAX_ID_LENGTH = 100;
const EVENT_ID = /^[a-z0-9][a-z0-9._~-]*$/;

function refuse(reason: OnairRefusal): OnairParse {
  return { ok: false, reason };
}

/** Parses an OnAir event URL. Never throws, whatever the input. */
export function parseOnairUrl(input: unknown): OnairParse {
  if (typeof input !== "string") return refuse("not-a-string");
  if (input.length === 0) return refuse("empty");
  if (input.length > MAX_INPUT_LENGTH) return refuse("too-long");
  // whitespace, control chars, DEL, backslashes, non-ASCII (lone surrogates, IDN) never pass
  if (/[^!-~]/.test(input) || input.includes("\\")) return refuse("bad-characters");
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)/.exec(input);
  if (!m) return refuse(/^https:/i.test(input) ? "unparseable" : "not-https");
  if (m[1]!.toLowerCase() !== "https") return refuse("not-https");
  const authority = m[2]!;
  if (authority.includes("@")) return refuse("credentials");
  if (authority.includes(":")) return refuse("port");
  if (authority.toLowerCase() !== ONAIR_HOST) return refuse("host-not-allowed");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return refuse("unparseable");
  }
  if (url.protocol !== "https:") return refuse("not-https");
  if (url.username !== "" || url.password !== "") return refuse("credentials");
  if (url.port !== "") return refuse("port");
  if (url.hostname !== ONAIR_HOST) return refuse("host-not-allowed");
  // raw path must not carry encoding tricks: no %, no dot segments
  const rawPath = input.slice(m[0].length).split(/[?#]/, 1)[0]!;
  if (rawPath.includes("%")) return refuse("bad-event-id");
  const pm = /^\/events\/([^/]+)\/?$/.exec(rawPath);
  if (!pm) return refuse("path-not-supported");
  const eventId = pm[1]!.toLowerCase();
  if (eventId.length > MAX_ID_LENGTH || !EVENT_ID.test(eventId) || /^\.+$/.test(eventId)) {
    return refuse("bad-event-id");
  }
  return { ok: true, platform: "cloudonair", eventId, canonicalUrl: canonicalOnairUrl(eventId) };
}

/** Returns the validated event id, or undefined. Never throws. */
export function extractOnairEventId(input: unknown): string | undefined {
  const r = parseOnairUrl(input);
  return r.ok ? r.eventId : undefined;
}

/** The only URL ever passed onward: rebuilt from a validated id; no query, no fragment. */
export function canonicalOnairUrl(eventId: string): string {
  if (typeof eventId !== "string" || eventId.length > MAX_ID_LENGTH || !EVENT_ID.test(eventId)) {
    throw new Error("onair adapter [bad-event-id]: not a valid event id");
  }
  return `https://${ONAIR_HOST}/events/${eventId}`;
}

/** Descriptor of the (URL-only) OnAir adapter. Not a `Source`: it has no fetch/toTurns yet. */
export const onairAdapter = {
  name: "cloudonair",
  host: ONAIR_HOST,
  detect(input: unknown): boolean {
    return parseOnairUrl(input).ok;
  },
  parse: parseOnairUrl,
  canonicalUrl: canonicalOnairUrl,
} as const;
