/**
 * packages/ingest/src/sources/zoom-recording.ts — T-045 (Zoom half), cloud-recording URL recognition ONLY.
 * Pure: no fetch, no download, no HTML parsing, no process. Accepted forms:
 *   https://zoom.us/rec/share/<token>   grounded in apps/api/src/gws-gmail.ts:63 (`zoom\.us\/rec`) and
 *                                       qa/contracts/gmail-meeting-candidates-approval.md:128 (`zoom.us/rec/share/...`)
 *   https://zoom.us/rec/play/<token>    path kind UNVERIFIED against the live site (only the `/rec` prefix is grounded)
 *   https://<one-label>.zoom.us/rec/... host subdomains: grounded in packages/meeting-bot/src/platform.ts:29
 *                                       (`.zoom.us`); the canonical URL is rebuilt on bare `zoom.us` (UNVERIFIED that the
 *                                       bare host serves every subdomain's recording)
 * PASSCODES / TOKENS: the query allow-list is EMPTY. `pwd`, `startTime`, `componentName`, any query and the
 * fragment are dropped, never carried into the canonical URL or the id. A recording that REQUIRES a passcode
 * therefore cannot be played from the canonical URL alone; the passcode must travel through a separate
 * secret-handling path that does not exist yet (follow-up). The path token itself is a bearer capability:
 * never log it beyond the id field.
 */

export type ZoomRecordingRefusal =
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
  | "bad-recording-id";

export type ZoomRecordingKind = "share" | "play";

export type ZoomRecordingParse =
  | { ok: true; platform: "zoom-recording"; kind: ZoomRecordingKind; recordingId: string; canonicalUrl: string }
  | { ok: false; reason: ZoomRecordingRefusal };

export const ZOOM_HOST = "zoom.us";
/** Query parameters that may be carried into the canonical URL. Empty by decision: pwd is a passcode. */
export const ZOOM_RECORDING_QUERY_ALLOW: readonly string[] = [];

const MAX_INPUT_LENGTH = 400;
const MIN_ID_LENGTH = 8;
const MAX_ID_LENGTH = 256;
const RECORDING_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.)?zoom\.us$/;

function refuse(reason: ZoomRecordingRefusal): ZoomRecordingParse {
  return { ok: false, reason };
}

function validId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length >= MIN_ID_LENGTH &&
    id.length <= MAX_ID_LENGTH &&
    RECORDING_ID.test(id) &&
    !/^\.+$/.test(id)
  );
}

/** Parses a Zoom cloud-recording URL. Never throws, whatever the input. */
export function parseZoomRecordingUrl(input: unknown): ZoomRecordingParse {
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
  if (!HOST.test(authority.toLowerCase())) return refuse("host-not-allowed");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return refuse("unparseable");
  }
  if (url.protocol !== "https:") return refuse("not-https");
  if (url.username !== "" || url.password !== "") return refuse("credentials");
  if (url.port !== "") return refuse("port");
  if (!HOST.test(url.hostname)) return refuse("host-not-allowed");
  const rawPath = input.slice(m[0].length).split(/[?#]/, 1)[0]!;
  if (rawPath.includes("%")) return refuse("bad-recording-id");
  const pm = /^\/rec\/(share|play)\/([^/]+)\/?$/.exec(rawPath);
  if (!pm) return refuse("path-not-supported");
  const kind = pm[1] as ZoomRecordingKind;
  const recordingId = pm[2]!;
  if (!validId(recordingId)) return refuse("bad-recording-id");
  return { ok: true, platform: "zoom-recording", kind, recordingId, canonicalUrl: canonicalZoomRecordingUrl(kind, recordingId) };
}

/** Returns the validated recording id, or undefined. Never throws. */
export function extractZoomRecordingId(input: unknown): string | undefined {
  const r = parseZoomRecordingUrl(input);
  return r.ok ? r.recordingId : undefined;
}

/** The only URL ever passed onward: rebuilt from a validated kind and id; no query, no fragment. */
export function canonicalZoomRecordingUrl(kind: ZoomRecordingKind, recordingId: string): string {
  if ((kind !== "share" && kind !== "play") || !validId(recordingId)) {
    throw new Error("zoom-recording adapter [bad-recording-id]: not a valid recording kind or id");
  }
  return `https://${ZOOM_HOST}/rec/${kind}/${recordingId}`;
}

/** Descriptor of the (URL-only) Zoom recording adapter. Not a `Source`: it has no fetch/toTurns yet. */
export const zoomRecordingAdapter = {
  name: "zoom-recording",
  host: ZOOM_HOST,
  detect(input: unknown): boolean {
    return parseZoomRecordingUrl(input).ok;
  },
  parse: parseZoomRecordingUrl,
  canonicalUrl: canonicalZoomRecordingUrl,
} as const;
