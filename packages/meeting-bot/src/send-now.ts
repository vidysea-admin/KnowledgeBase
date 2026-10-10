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

/** Job states that mean the bot is, or is about to be, in the meeting. Anything else (processing,
 * ready, failed, ended, action_required) has left the meeting and does not block a new join. */
export const LIVE_JOB_STATUSES = ["queued", "joining", "recording"] as const;
export type LiveJobStatus = (typeof LIVE_JOB_STATUSES)[number];

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

const TRACKING_KEY = /^(utm_.*|fbclid|gclid|mc_.*|_ga|tk|token|access_token|pwd|password|authuser|pli|hl)$/i;
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

/** Normalised identity of a meeting, or undefined when the URL is not an accepted meeting URL.
 * Case of host, trailing slashes, fragments, tracking/credential params and the zoom regional
 * subdomain never change it. Meet codes and zoom ids collapse across URL variants; other platforms
 * use host + path + remaining sorted query. */
export function meetingIdentity(url: string): string | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  const platform = detectPlatform(url);
  if (platform === "unknown") return undefined;
  const path = decodeAll(u.pathname).replace(/\/+/g, "/").replace(/\/+$/, "");
  if (platform === "meet") {
    const code = path.split("/").filter(Boolean)[0];
    if (code) return `meet:${code.toLowerCase()}`;
  }
  if (platform === "zoom") {
    const m = /^\/(?:(?:j|w|s|wc\/join)\/(\d{5,})|wc\/(\d{5,})\/join)$/i.exec(path);
    const id = m && (m[1] ?? m[2]);
    if (id) return `zoom:${id}`;
  }
  const params = [...u.searchParams].filter(([k]) => !TRACKING_KEY.test(k)).map(([k, v]) => `${k.toLowerCase()}=${v}`).sort();
  const keepCase = platform === "teams" || platform === "webex" ? path : path.toLowerCase();
  return `${platform}:${u.hostname.toLowerCase()}${keepCase}${params.length ? `?${params.join("&")}` : ""}`;
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

  const meetingKey = meetingIdentity(trimmed)!;
  for (const job of Array.isArray(liveJobs) ? liveJobs : []) {
    if (!job || typeof job.meetingUrl !== "string" || !(LIVE_JOB_STATUSES as readonly string[]).includes(job.status)) continue;
    if (meetingIdentity(job.meetingUrl) === meetingKey) return refuse("duplicate-live-job", meetingKey);
  }
  return { ok: true, request: { source: "manual", meetingUrl: trimmed, platform, strategy: selectJoinStrategy(platform), startTime, meetingKey } };
}
