/** T036: bounded, operator-configured public organizer discovery. Public links never prove personal admission. */
import { createHash } from "node:crypto";
import { createGuardedFetcher, resolveAll, httpRequest, type GuardedFetchDeps } from "@lkb/ingest";

export interface PublicWebinarSource { id: string; url: string; }
export interface PublicWebinarCandidate {
  id: string; sourceId: string; sourceUrl: string; title: string; startTime: string;
  endTime?: string; eventUrl: string; registrationUrl?: string; registrationOnly?: true;
  reviewRequired: true; personalJoinVerified: false;
}
export interface PublicWebinarAcquisition {
  version: 1; checkedAt: string; complete: boolean; candidates: PublicWebinarCandidate[];
  gaps: { sourceId: string; reason: "unavailable" | "invalid-event" | "no-structured-events" }[];
}

/** Only the configured connected-source owner may invoke this feed; callers cannot supply organizer URLs. */
export function createPublicWebinarDiscovery(owner: string | undefined, sources: PublicWebinarSource[],
  deps?: Pick<GuardedFetchDeps, "lookup" | "request">): (tenantId: string) => Promise<PublicWebinarAcquisition & {tenantId: string}> {
  const configured = sources.map(source => ({...source}));
  return async tenantId => {
    if (!owner || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(owner) || owner !== tenantId) throw new Error("Connected public discovery owner mismatch");
    return {...await discoverPublicWebinars(configured, deps), tenantId};
  };
}

const HOSTS = ["meet.google.com", "zoom.us", "teams.microsoft.com", "zoho.in", "zoho.com", "cloudonair.withgoogle.com", "webex.com", "youtube.com", "youtu.be"];
/** A hostname boundary is required: URL text containing a platform hostname is not platform evidence. */
export function supportedMeetingUrl(value: string): boolean {
  try {
    if (value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) return false;
    const url = new URL(value);
    for (const [key, raw] of url.searchParams) {
      let decoded = raw;
      for (let n = 0; n < 3; n++) {try {const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next;} catch {break;}}
      if (/^(redirect|redirect_?uri|redirect_?url|return|return_?url|return_?to|next|continue|url|goto|dest|destination|target|callback|zak)$/i.test(key) || /^\s*([a-z][a-z0-9+.-]*:|\/\/|\\)/i.test(decoded)) return false;
    }
    if (/^\/s\//i.test(url.pathname) && (url.hostname === "zoom.us" || url.hostname.endsWith(".zoom.us"))) return false;
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function publicUrl(value: unknown, base?: string): URL | undefined {
  if (typeof value !== "string" || !value || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return undefined;
    return url;
  } catch { return undefined; }
}

function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)) return undefined;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : undefined;
}

/** Only publisher Event records qualify. Arbitrary page prose cannot become a timed meeting. */
export function parsePublicWebinars(html: string, source: PublicWebinarSource, now = new Date()): {
  candidates: PublicWebinarCandidate[]; incomplete: boolean; foundEvents: boolean;
} {
  const candidates = new Map<string, PublicWebinarCandidate>();
  let incomplete = false, foundEvents = false, count = 0;
  const inspect = (record: unknown, depth = 0): void => {
    if (depth > 5 || ++count > 500) { incomplete = true; return; }
    if (Array.isArray(record)) { for (const item of record) inspect(item, depth + 1); return; }
    if (!record || typeof record !== "object") return;
    const event = record as Record<string, unknown>;
    if (event["@graph"]) inspect(event["@graph"], depth + 1);
    const types = Array.isArray(event["@type"]) ? event["@type"] : [event["@type"]];
    if (!types.some(type => type === "Event" || type === "EducationEvent" || type === "BusinessEvent")) return;
    foundEvents = true;
    if (typeof event.eventStatus === "string" && /EventCancelled|EventPostponed/.test(event.eventStatus)) return;
    const title = typeof event.name === "string" ? event.name.trim() : "";
    const startTime = timestamp(event.startDate), endTime = event.endDate === undefined ? undefined : timestamp(event.endDate);
    const location = event.location && typeof event.location === "object" ? event.location as Record<string, unknown> : undefined;
    const offers = event.offers && typeof event.offers === "object" && !Array.isArray(event.offers) ? event.offers as Record<string, unknown> : undefined;
    const registration = publicUrl(offers?.url ?? event.url ?? location?.url, source.url);
    const sourceUrl = publicUrl(source.url);
    if (!title || title.length > 2000 || /[\u0000-\u001f\u007f]/.test(title) || !startTime ||
      (event.endDate !== undefined && (!endTime || endTime <= startTime)) || !registration || !sourceUrl ||
      (registration.hostname !== sourceUrl.hostname && !supportedMeetingUrl(registration.href))) { incomplete = true; return; }
    if (Date.parse(startTime) <= now.valueOf() || !/career|counsell?ing|guidance|educat|stud(?:y|ies)|universit|college|admission|scholarship/i.test(title)) return;
    const id = `public-${createHash("sha256").update(`${registration.href}\n${startTime}`).digest("hex")}`;
    const registrationOnly = /regist/i.test(registration.pathname) || [...registration.searchParams.keys()].some(key => /regist/i.test(key));
    candidates.set(id, { id, sourceId: source.id, sourceUrl: source.url, title, startTime, ...(endTime ? {endTime} : {}),
      eventUrl: registration.href, ...(registrationOnly ? {registrationUrl: registration.href, registrationOnly: true} : {}),
      reviewRequired: true, personalJoinVerified: false });
  };
  for (const script of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { inspect(JSON.parse(script[1]!)); } catch { incomplete = true; }
  }
  return { candidates: [...candidates.values()], incomplete, foundEvents };
}

export async function discoverPublicWebinars(sources: PublicWebinarSource[], deps?: Pick<GuardedFetchDeps, "lookup" | "request">,
  now = new Date()): Promise<PublicWebinarAcquisition> {
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 10 || !Number.isFinite(now.valueOf())) throw new Error("Invalid public discovery configuration");
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(source.id) || ids.has(source.id) || !publicUrl(source.url)) throw new Error("Invalid public discovery configuration");
    ids.add(source.id);
  }
  const candidates = new Map<string, PublicWebinarCandidate>(), gaps: PublicWebinarAcquisition["gaps"] = [];
  for (const source of sources) {
    const approvedHost = new URL(source.url).hostname;
    const deadline = Date.now() + 3000;
    const fetch = createGuardedFetcher({ lookup: async hostname => {
      if (hostname !== approvedHost) throw new Error("Public organizer redirect refused");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Public discovery deadline exceeded");
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([deps ? deps.lookup(hostname) : resolveAll(hostname, {timeoutMs: remaining}), new Promise<string[]>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Public discovery deadline exceeded")), remaining);
      })]).finally(() => {if (timer) clearTimeout(timer);});
    }, maxBytes: 512_000, timeoutMs: 3000, maxRedirects: 3,
      request: async (url, options) => {
        const target = publicUrl(url);
        if (!target || target.hostname !== approvedHost) throw new Error("Public organizer redirect refused");
        const response = await (deps?.request ?? httpRequest)(url, options);
        if ((response.status < 200 || response.status >= 300) && !(response.status >= 300 && response.status < 400 && response.location)) throw new Error("Public organizer unavailable");
        return response;
      },
    });
    try {
      const parsed = parsePublicWebinars(await fetch(source.url), source, now);
      if (!parsed.foundEvents) gaps.push({sourceId: source.id, reason: "no-structured-events"});
      else if (parsed.incomplete) gaps.push({sourceId: source.id, reason: "invalid-event"});
      for (const candidate of parsed.candidates) candidates.set(candidate.id, candidate);
    } catch { gaps.push({sourceId: source.id, reason: "unavailable"}); }
  }
  return { version: 1, checkedAt: now.toISOString(), complete: gaps.length === 0, candidates: [...candidates.values()], gaps };
}
