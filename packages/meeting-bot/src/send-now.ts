/**
 * packages/meeting-bot/src/send-now.ts — T-039 (planner only). Pure "Send bot now" planning: validate
 * an operator-supplied meeting URL, refuse a duplicate of a meeting that is already live, otherwise
 * return a join request. No I/O, no clock reads, no entry point calls this yet (CLI/API/web are later
 * units). Platform recognition is `detectPlatform` (platform.ts) — there is no second platform parser;
 * `new URL` is used here only for the structural checks (scheme, credentials, port) detectPlatform
 * deliberately does not make.
 */
import { detectPlatform, type Platform } from "./platform.js";
import { selectJoinStrategy, type JoinStrategy } from "./strategy.js";

export const MAX_SEND_NOW_URL_LENGTH = 2048;

/** Job states that mean the bot is, or is about to be, in the meeting. */
export const LIVE_JOB_STATUSES = ["queued", "joining", "recording"] as const;
export type LiveJobStatus = (typeof LIVE_JOB_STATUSES)[number];
/** Job states that have left the meeting (calendar/schedule-state.ts:63 minus queued/recording; a test
 * pins that literal so this cannot drift). ONLY these exact values stop blocking: an unknown, missing or
 * differently cased status counts as LIVE (fail closed - this guard exists to prevent a second bot). */
export const TERMINAL_JOB_STATUSES = ["processing", "ready", "failed", "action_required"] as const;

/** Minimal view of an existing job the planner needs. `status` is a plain string so the scheduler's
 * `Operation.status` values (calendar/schedule-state.ts) can be passed through unconverted. */
export interface SendNowJob {
  meetingUrl: string;
  status: string;
}

export type SendNowRefusal =
  | "invalid-input"
  | "invalid-clock"
  | "empty-url"
  | "url-too-long"
  | "malformed-url"
  | "not-https"
  | "credentials-in-url"
  | "unexpected-port"
  | "embedded-redirect"
  | "unsupported-host"
  | "not-a-meeting-url"
  | "duplicate-live-job";

/** Same fields the existing join path consumes (`AutoRecordItem`: sessionKey/meetingUrl/startTime),
 * plus the detected platform and `selectJoinStrategy` result. `endTime` is unknown for an ad-hoc join. */
export interface SendNowJoinRequest {
  source: "manual";
  meetingUrl: string;
  platform: Exclude<Platform, "unknown">;
  strategy: JoinStrategy;
  startTime: string;
  /** Normalised meeting identity (see `meetingIdentity`); the dedupe key. */
  meetingKey: string;
}

export type SendNowPlan =
  | { ok: true; request: SendNowJoinRequest }
  | { ok: false; reason: SendNowRefusal; detail?: string };

const refuse = (reason: SendNowRefusal, detail?: string): SendNowPlan => ({ ok: false, reason, ...(detail ? { detail } : {}) });

const REDIRECT_KEY = /^(redirect|redirect_?uri|redirect_?url|return|return_?url|return_?to|next|continue|url|goto|dest|destination|target|callback)$/i;
const URL_VALUE = /^\s*([a-z][a-z0-9+.-]*:|\/\/|\\)/i;

function decodeAll(value: string): string {
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

function hasEmbeddedRedirect(u: URL): boolean {
  for (const [key, value] of u.searchParams) {
    if (REDIRECT_KEY.test(key)) return true;
    if (URL_VALUE.test(decodeAll(value))) return true;
  }
  return false;
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

function toIso(now: Date | string): string | undefined {
  const d = now instanceof Date ? now : typeof now === "string" ? new Date(now) : undefined;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

/** Plan a "send bot now" join. Never throws for bad input: every failure is a typed refusal. */
export function planSendNow(url: string, now: Date | string, liveJobs: readonly SendNowJob[] = []): SendNowPlan {
  if (typeof url !== "string") return refuse("invalid-input");
  const trimmed = url.trim();
  if (!trimmed) return refuse("empty-url");
  if (trimmed.length > MAX_SEND_NOW_URL_LENGTH) return refuse("url-too-long");
  if (/[\x00-\x20\x7f\\]/.test(trimmed)) return refuse("malformed-url", "whitespace, control or backslash character");
  const startTime = toIso(now);
  if (!startTime) return refuse("invalid-clock");

  let u: URL;
  try { u = new URL(trimmed); } catch { return refuse("malformed-url"); }
  if (u.protocol !== "https:" || !/^https:\/\//i.test(trimmed)) return refuse("not-https", u.protocol);
  if (u.username || u.password || /^https:\/\/[^/?#]*@/i.test(trimmed)) return refuse("credentials-in-url");
  if (u.port) return refuse("unexpected-port", u.port);
  if (hasEmbeddedRedirect(u)) return refuse("embedded-redirect");

  const platform = detectPlatform(trimmed);
  if (platform === "unknown") return refuse("unsupported-host", u.hostname);

  const meetingKey = meetingIdentity(trimmed);
  if (!meetingKey) return refuse("not-a-meeting-url", u.hostname);
  for (const job of Array.isArray(liveJobs) ? liveJobs : []) {
    if (!job || typeof job.meetingUrl !== "string" || (TERMINAL_JOB_STATUSES as readonly unknown[]).includes(job.status)) continue;
    if (meetingIdentity(job.meetingUrl) === meetingKey) return refuse("duplicate-live-job", meetingKey);
  }
  // `u.href` (WHATWG-normalised), not the raw string: the join path (capture/Joiner.join take a URL string and
  // re-parse it with `new URL`) sees the same destination that was validated here.
  return { ok: true, request: { source: "manual", meetingUrl: u.href, platform, strategy: selectJoinStrategy(platform), startTime, meetingKey } };
}
