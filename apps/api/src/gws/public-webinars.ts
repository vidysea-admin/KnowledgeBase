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

/** Shared literal invitation-time parser; public prose remains excluded by parsePublicWebinars. */
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
// Real Ashoka mail uses Sep/Sept abbreviations, including in forwarded subjects.
const MONTH_ALIASES: Record<string, number> = {};
for (const [i, full] of MONTHS.entries()) {
  MONTH_ALIASES[full] = i;
  MONTH_ALIASES[full.slice(0, 3)] = i;
}
MONTH_ALIASES.sept = 8;

// Date selection is explicit and local to the invitation; never borrow a forwarded year.
const MONTH_PATTERN = Object.keys(MONTH_ALIASES).join("|");
const DATE_PATTERN = String.raw`(?:\d{4}-\d{2}-\d{2}|(?:${MONTH_PATTERN})\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTH_PATTERN})\.?(?:,?\s+\d{4})?)`;
const DATE_RE = new RegExp(String.raw`(?<![\w.-])${DATE_PATTERN}(?!\d)`, "gi");
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_NEAR_LABEL_RE = /\b(?:Day\s*&?\s*Date|Date\s*&?\s*Time|Date)\b[\s:*]*/gi;
const TIME_SINGLE_RE = /(?<![\w:.])(\d+(?::\d+)?\s*[AP]M)\b(?:[ \t]*(Pacific(?:[ \t]+Time)?|Eastern(?:[ \t]+Time)?|PDT|PST|EDT|EST|PT|ET|IST|UTC|GMT)\b)?/gi;
const TZ_OFFSET_MINUTES: Record<string, number> = { IST: 330, UTC: 0, GMT: 0 };
const TIME_ZONES: Record<string, string> = { PT: "America/Los_Angeles", PDT: "America/Los_Angeles", PST: "America/Los_Angeles",
  PACIFIC: "America/Los_Angeles", "PACIFIC TIME": "America/Los_Angeles", ET: "America/New_York", EDT: "America/New_York",
  EST: "America/New_York", EASTERN: "America/New_York", "EASTERN TIME": "America/New_York", IST: "Asia/Kolkata", UTC: "UTC", GMT: "UTC" };

export interface SessionTimeProvenance {
  yearSource: "explicit" | "provider-receivedAt" | "reference";
  dateText: string;
  timeZones: string[];
  referenceTime?: string;
}

function parseMonthName(dateStr: string): { year?: number; month: number; day: number } | undefined {
  const iso = ISO_DATE_RE.exec(dateStr.trim());
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  const m = /^(?:([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?)(?:,?\s+(\d{4}))?$/i.exec(dateStr.trim());
  if (!m) return undefined;
  const month = MONTH_ALIASES[(m[1] ?? m[4] ?? "").toLowerCase()];
  if (month === undefined) return undefined;
  return { ...(m[5] ? {year: Number(m[5])} : {}), month, day: Number(m[2] ?? m[3]) };
}

function buildIsoDateTime(dateStr: string, timeStr: string, tz: string | undefined, inferredYear?: number): string | undefined {
  const parsedDate = parseMonthName(dateStr);
  const year = parsedDate?.year ?? inferredYear;
  if (!parsedDate || year === undefined || year < 1000 || year > 9999 || !tz) return undefined;
  const t = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i.exec(timeStr.trim());
  if (!t || Number(t[1]) < 1 || Number(t[1]) > 12 || Number(t[2] ?? 0) > 59) return undefined;
  const hour = Number(t[1]) % 12 + (t[3]?.toUpperCase() === "PM" ? 12 : 0), minute = Number(t[2] ?? 0);
  const localMillis = Date.UTC(year, parsedDate.month, parsedDate.day, hour, minute);
  const local = new Date(localMillis);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== parsedDate.month || local.getUTCDate() !== parsedDate.day) return undefined;
  const token = tz.toUpperCase().replace(/\s+/g, " ");
  const zone = TIME_ZONES[token];
  if (!zone) return undefined;
  if (Object.hasOwn(TZ_OFFSET_MINUTES, token)) return new Date(localMillis - TZ_OFFSET_MINUTES[token]! * 60_000).toISOString();
  // Invert event-local civil time against IANA rules. Gaps have zero matches; folds
  // have two unless an explicit daylight/standard token selects exactly one.
  const offsets = zone === "America/Los_Angeles" ? [420, 480] : [240, 300];
  const explicitOffset: Record<string, number> = { PDT: 420, PST: 480, EDT: 240, EST: 300 };
  const formatter = new Intl.DateTimeFormat("en-CA", {timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  const matches = offsets.filter(offset => explicitOffset[token] === undefined || explicitOffset[token] === offset).map(offset => localMillis + offset * 60_000).filter(instant => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Number(parts.year) === year && Number(parts.month) === parsedDate.month + 1 && Number(parts.day) === parsedDate.day && Number(parts.hour) === hour && Number(parts.minute) === minute;
  });
  return matches.length === 1 ? new Date(matches[0]!).toISOString() : undefined;
}

/** Unknown/malformed date, year, zone or conflicting representations stay unscheduled. */
export function extractSessionDateTime(text: string, context: {receivedAt?: string; reference?: Date} = {}): {
  startTime?: string; endTime?: string; timeProvenance?: SessionTimeProvenance;
} {
  const labels = [...text.matchAll(DATE_NEAR_LABEL_RE)];
  if (labels.length > 1) return {};
  let dateStr: string, afterDate: number;
  if (labels[0]) {
    const start = labels[0].index! + labels[0][0].length;
    const match = new RegExp(String.raw`^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(${DATE_PATTERN})(?!\d)`, "i").exec(text.slice(start));
    if (!match?.[1]) return {};
    dateStr = match[1]; afterDate = start + match[0].length;
  } else {
    const dates = [...text.matchAll(DATE_RE)];
    if (!dates.length || dates.some(date => JSON.stringify(parseMonthName(date[0])) !== JSON.stringify(parseMonthName(dates[0]![0])))) return {};
    const date = dates[dates.length - 1]!; dateStr = date[0]; afterDate = date.index! + dateStr.length;
  }
  // Reject a truncated/invalid year and never cross another date or forwarded header.
  if (/^\d/.test(text.slice(afterDate)) || (parseMonthName(dateStr)?.year === undefined && /^\s*,?\s*\d{4,}/.test(text.slice(afterDate)))) return {};
  const scope = text.slice(afterDate, afterDate + 512).split(/\b(?:Sent|From|Subject):|\bForwarded\b/i)[0]!;
  if ([...scope.matchAll(DATE_RE)].length) return {};
  const times = [...scope.matchAll(TIME_SINGLE_RE)];
  if (!times.length || times.length > 4) return {};
  // One range, optionally restated in another zone, or equivalent start instants.
  const groups: {start: string; end?: string; zone: string}[] = [];
  for (let i = 0; i < times.length; i++) {
    const current = times[i]!, next = times[i + 1];
    if (i === 0 && /\d/.test(scope.slice(0, current.index))) return {};
    const between = next ? scope.slice(current.index! + current[0].length, next.index) : "";
    if (next && /^\s*(?:-|–|—|to)\s*$/i.test(between)) {
      const zone = current[2] ?? next[2];
      if (!zone || !next[2] || (current[2] && current[2].toUpperCase() !== next[2].toUpperCase())) return {};
      groups.push({start: current[1]!, end: next[1]!, zone}); i++;
    } else {
      if (!current[2]) return {};
      groups.push({start: current[1]!, zone: current[2]});
    }
  }
  const parsed = parseMonthName(dateStr);
  if (!parsed) return {};
  let referenceTime: string | undefined, yearSource: SessionTimeProvenance["yearSource"] = "explicit";
  let years = parsed.year === undefined ? [] : [parsed.year];
  if (parsed.year === undefined) {
    const ref = context.receivedAt !== undefined ? new Date(context.receivedAt) : context.reference;
    // Provider context must be an actual ISO instant, not JS's overflowing-date parsing.
    if (!ref || !Number.isFinite(ref.getTime())) return {};
    if (context.receivedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(context.receivedAt)) return {};
    if (context.receivedAt !== undefined && ref.toISOString().slice(0, 19) !== context.receivedAt.slice(0, 19)) return {};
    referenceTime = ref.toISOString(); yearSource = context.receivedAt !== undefined ? "provider-receivedAt" : "reference";
    years = [ref.getUTCFullYear() - 1, ref.getUTCFullYear(), ref.getUTCFullYear() + 1];
  }
  const candidates = years.flatMap(year => {
    const resolved = groups.map(group => ({start: buildIsoDateTime(dateStr, group.start, group.zone, year), end: group.end ? buildIsoDateTime(dateStr, group.end, group.zone, year) : undefined}));
    const first = resolved[0]!;
    if (!first.start || resolved.some((row, i) => !row.start || row.start !== first.start || (groups[i]!.end && (!row.end || row.end <= row.start)) || row.end !== first.end)) return [];
    if (referenceTime && Math.abs(Date.parse(first.start) - Date.parse(referenceTime)) > 31 * 86400_000) return [];
    return [{startTime: first.start, ...(first.end ? {endTime: first.end} : {})}];
  });
  if (candidates.length !== 1) return {};
  return {...candidates[0], timeProvenance: {yearSource, dateText: dateStr, timeZones: [...new Set(groups.map(group => TIME_ZONES[group.zone.toUpperCase().replace(/\s+/g, " ")]!))], ...(referenceTime ? {referenceTime} : {})}};
}
