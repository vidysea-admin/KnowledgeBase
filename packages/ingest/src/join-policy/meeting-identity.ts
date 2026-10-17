import { detectPlatform, type Platform } from "./platform.js";
export function decodeAll(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch { break; }
  }
  return out;
}

/** What an extractor may read: the normalised path (decoded, lower-cased, no trailing slash), host and query. */
interface IdentityInput { path: string; host: string; param: (name: string) => string | undefined }
type Extractor = (i: IdentityInput) => string | undefined;
const match = (path: string, re: RegExp) => re.exec(path);

/** THE one table of per-platform extractors. Each returns the platform's own meeting identifier or undefined.
 * Typed over every non-unknown Platform, so adding a platform without an extractor fails to compile. */
export const PLATFORM_EXTRACTORS: Record<Exclude<Platform, "unknown">, Extractor> = {
  meet: ({ path }) => {
    const code = match(path, /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/)?.[1];
    const lookup = match(path, /^\/lookup\/([a-z0-9_-]+)$/)?.[1];
    return code ?? (lookup && `lookup:${lookup}`) ?? undefined;
  },
  zoom: ({ path }) => {
    const num = match(path, /^\/(?:(?:j|w|s|wc\/join)\/(\d{5,})|wc\/(\d{5,})\/join)$/);
    const personal = match(path, /^\/my\/([a-z0-9._-]+)$/)?.[1];
    return (num && (num[1] ?? num[2])) || (personal && `my:${personal}`) || undefined;
  },
  teams: ({ path }) => {
    const room = match(path, /^\/meet\/(\d{6,})$/)?.[1];
    const thread = match(path, /^\/l\/meetup-join\/(19:[^/]+@thread\.[a-z0-9]+)(?:\/.*)?$/)?.[1];
    return room ? `meet:${room}` : thread && `thread:${thread}`;
  },
  webex: ({ path, host, param }) => {
    const room = match(path, /^\/(?:meet|join)\/([a-z0-9._-]+)$/)?.[1];
    const info = match(path, /\/meeting\/(?:info|download)\/([a-z0-9]+)$/)?.[1];
    const mtid = param("mtid"), mk = param("mk");
    return (room && `room:${host}:${room}`) || (info && `id:${info}`) || (mtid && `mtid:${mtid}`) || (mk && `mk:${mk}`) || undefined;
  },
  zoho: ({ param }) => {
    const key = param("key"), session = param("sessionid");
    return (key && `key:${key}`) || (session && `session:${session}`) || undefined;
  },
  // Only a link naming ONE event: /events/<slug>. Slugs are matched case-insensitively (path is lower-cased:
  // a false "same" refuses a join, a false "different" admits a second bot). No real link with a sub-path
  // exists in the repo, so /events/<slug>/<anything> is refused rather than guessed.
  cloudonair: ({ path }) => {
    const slug = match(path, /^\/events\/([a-z0-9][a-z0-9._~-]*)$/)?.[1];
    return slug && `/events/${slug}`;
  },
};

/** Identity of the meeting a URL names, built ONLY by the platform's extractor in `PLATFORM_EXTRACTORS`
 * (never from a raw path or query), or undefined when the extractor finds none - callers refuse that.
 * Passcodes, `context`, tracking params, fragments, host case, regional subdomains and the host a Teams
 * link was served from never change the key. Identifiers are lower-cased. This is the ONLY place a key
 * is built: a platform with no match cannot fall back to anything. */
export function meetingIdentity(url: string): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const platform = detectPlatform(url);
  if (platform === "unknown") return undefined;
  const extract = PLATFORM_EXTRACTORS[platform];
  const param = (name: string) => {
    for (const [k, v] of u.searchParams) if (k.toLowerCase() === name && v.trim()) return v.trim().toLowerCase();
    return undefined;
  };
  const path = decodeAll(u.pathname).replace(/\/+/g, "/").replace(/\/+$/, "").toLowerCase();
  const id = extract?.({ path, host: u.hostname.toLowerCase(), param });
  return id ? `${platform}:${id}` : undefined;
}

