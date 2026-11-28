/**
 * apps/api/src/join-rules/send-now-queue.ts - the HOSTED "send bot now" (unit `hosted-send-now`).
 *
 * On Cloud Run the API cannot spawn a recorder; it queues a job in `capture_jobs` (capture-job-queue.ts) and the
 * recorder container's queue worker claims it. Mounted by composition/production.ts only when LKB_SEND_NOW_QUEUE=1.
 *   - Tenants: only those in LKB_SEND_NOW_TENANTS (comma list; default LKB_TENANT_ID, else "vidysea") are served.
 *   - Link: https, no credentials, no port, no embedded redirect, a known meeting identity. The worker re-checks the
 *     link with the meeting-bot's own planSendNow before it joins, and fails the job on any disagreement.
 *   - until: an ISO datetime WITH an offset, in the future, at most 24 h ahead. HH:MM is refused here: the server's
 *     clock zone (UTC on Cloud Run) is not the user's, so the web form converts HH:MM in the browser.
 * 202 means "queued for the server bot", never "joined".
 */
import type { Db } from "mongodb";
import { decodeAll, meetingIdentity } from "../../../../packages/ingest/src/join-policy/meeting-identity.js";
import { CaptureJobDuplicate, CaptureJobQueue, terminalCaptureState } from "./capture-job-queue.js";
import type { SendNowDeps, SendNowPlanValue } from "./send-now.js";

export const MAX_UNTIL_AHEAD_MS = 24 * 60 * 60 * 1000;
const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i;
const REDIRECT_KEY = /^(redirect|redirect_?uri|redirect_?url|return|return_?url|return_?to|next|continue|url|goto|dest|destination|target|callback)$/i;
const URL_VALUE = /^\s*([a-z][a-z0-9+.-]*:|\/\/|\\)/i;

const invalid = (reason: string, message: string): SendNowPlanValue => ({ ok: false, kind: "invalid", reason, message });

/** Parsed `until` as a UTC ISO string, or a refusal message. */
export function parseHostedUntil(until: string, now: Date): { iso: string } | { problem: string } {
  const m = ISO_WITH_OFFSET.exec(until.trim());
  if (!m) return { problem: "until must be an ISO date and time with an offset, e.g. 2026-11-27T18:30:00+05:30" };
  const [, y, mo, d, h, mi, s] = m;
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number(h) > 23 || Number(mi) > 59 || Number(s ?? 0) > 59 || day.getUTCMonth() !== Number(mo) - 1 || day.getUTCDate() !== Number(d)) {
    return { problem: "until is not a real date and time" };
  }
  const at = Date.parse(until.trim());
  if (!Number.isFinite(at)) return { problem: "until is not a real date and time" };
  if (at <= now.getTime()) return { problem: "until is not in the future" };
  if (at - now.getTime() > MAX_UNTIL_AHEAD_MS) return { problem: "until is more than 24 hours ahead" };
  return { iso: new Date(at).toISOString() };
}

/** Link checks that need no meeting-bot code. Returns the normalised URL, meeting key and platform, or a refusal. */
export function checkHostedLink(raw: string): SendNowPlanValue {
  const url = raw.trim();
  if (!url || url.length > 2048 || /[\x00-\x20\x7f\\]/.test(url)) return invalid("malformed-url", "the meeting link is empty, too long or has spaces or control characters");
  let u: URL;
  try { u = new URL(url); } catch { return invalid("malformed-url", "the meeting link is not a URL"); }
  if (u.protocol !== "https:" || !/^https:\/\//i.test(url)) return invalid("not-https", "the meeting link must start with https://");
  if (u.username || u.password || /^https:\/\/[^/?#]*@/i.test(url)) return invalid("credentials-in-url", "the meeting link carries a user name or password");
  if (u.port) return invalid("unexpected-port", "the meeting link names a port");
  for (const [key, value] of u.searchParams) {
    if (REDIRECT_KEY.test(key) || URL_VALUE.test(decodeAll(value))) return invalid("embedded-redirect", "the meeting link carries a redirect");
  }
  const meetingKey = meetingIdentity(u.href);
  if (!meetingKey) return invalid("not-a-meeting-url", `not a supported meeting link (${u.hostname.slice(0, 100)})`);
  return { ok: true, meetingUrl: u.href, meetingKey, platform: meetingKey.slice(0, meetingKey.indexOf(":")) };
}

export function servedTenants(env: Record<string, string | undefined>): string[] {
  const listed = (env.LKB_SEND_NOW_TENANTS ?? "").split(",").map(t => t.trim()).filter(Boolean);
  const tenants = listed.length ? listed : [env.LKB_TENANT_ID?.trim() || "vidysea"];
  return tenants.filter(t => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(t));
}

export function createQueuedSendNowDeps(options: { db: Db; env: Record<string, string | undefined>; now?: () => Date }): SendNowDeps {
  const now = options.now ?? (() => new Date());
  const queue = new CaptureJobQueue(options.db, now);
  const tenants = servedTenants(options.env);
  let indexes: Promise<void> | undefined;
  const ready = () => (indexes ??= queue.ensureIndexes().catch(error => { indexes = undefined; throw error; }));
  const notServed = () => Object.assign(new Error("tenant not served"), { code: "tenant_not_served" });
  const owner = (tenantId: string) => { if (!tenants.includes(tenantId)) throw notServed(); };
  const forbidden: SendNowPlanValue = { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "the server bot does not capture for your tenant" };

  async function plan(tenantId: string, request: { meetingUrl: string; until: string }): Promise<SendNowPlanValue> {
    if (!tenants.includes(tenantId)) return forbidden;
    const until = parseHostedUntil(request.until, now());
    if ("problem" in until) return invalid("invalid-until", until.problem);
    const link = checkHostedLink(request.meetingUrl);
    if (!link.ok) return link;
    try {
      await ready();
      if (await queue.hasLiveJob(tenantId, link.meetingKey)) return { ok: false, kind: "duplicate", reason: "duplicate-live-job", message: "a server bot job already covers this meeting" };
    } catch { return { ok: false, kind: "unreadable", reason: "capture-jobs-unreadable", message: "the capture queue cannot be read; nothing was queued" }; }
    return link;
  }

  return {
    durableDispatch: true,
    plan,
    async launch(tenantId, checked, until) {
      owner(tenantId);
      const parsed = parseHostedUntil(until, now());
      if ("problem" in parsed) throw new Error("until refused at launch");
      await ready();
      try { return { jobId: (await queue.create(tenantId, checked, parsed.iso))._id }; }
      catch (error) { if (error instanceof CaptureJobDuplicate) throw error; throw new Error("capture job could not be queued"); }
    },
    async status(tenantId, jobId) {
      if (!tenants.includes(tenantId)) return { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "the server bot does not capture for your tenant" };
      try {
        const job = await queue.detail(tenantId, jobId);
        if (!job) return { ok: true, status: "not-running" };
        if (job.state === "unknown") return { ok: false, kind: "unreadable", reason: "capture-owner-silent", message: "the server bot has stopped reporting on this job" };
        const status = terminalCaptureState(job.state) ? "not-running" : job.state === "queued" || job.state === "launching" ? "launching" : "running";
        return { ok: true, status, startedAt: job.requestedAt, joined: job.joined };
      } catch { return { ok: false, kind: "unreadable", reason: "capture-jobs-unreadable", message: "capture jobs are unavailable" }; }
    },
    manualJobs: {
      async list(tenantId) { owner(tenantId); return queue.list(tenantId); },
      async detail(tenantId, jobId) { owner(tenantId); return queue.detail(tenantId, jobId); },
      async cancel(tenantId, jobId) { owner(tenantId); return queue.cancel(tenantId, jobId); },
    },
  };
}

/** Production wiring: adds the queued send-now to the calendar deps only when LKB_SEND_NOW_QUEUE=1; otherwise unchanged (503 route). */
export function withHostedSendNow<T extends { sendNow?: SendNowDeps }>(calendar: T, db: Db, env: Record<string, string | undefined>): T {
  if (env.LKB_SEND_NOW_QUEUE !== "1" || calendar.sendNow) return calendar;
  return { ...calendar, sendNow: createQueuedSendNowDeps({ db, env }) };
}
