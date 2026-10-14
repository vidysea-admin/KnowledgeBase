/**
 * Bot alerts over three channels (Umesh decision 2026-10-14): email (gws), the web dashboard feed (bot-events.jsonl) and a private
 * marker event on Umesh's own Google Calendar. One call per bot event; every channel is rate-limited and independent, so one
 * failing channel never blocks the others and never repeats the others.
 *
 * Rate limits (persisted in <stateDir>/autojoin-alert-state.<tenant>.json, so they hold across 5-minute ticks):
 *  - each (session, event kind, channel) fires at most once; a failed attempt is retried on later ticks up to MAX_ATTEMPTS;
 *  - email: at most `emailPerHour` per rolling hour for ordinary events; failure events (stopped early / failed) have their own cap of
 *    `failureEmailPerHour` individual emails per hour, and the rest are rolled into ONE digest email per hour (sent once the oldest has
 *    waited DIGEST_AFTER_MS). Hard bound per hour: emailPerHour + failureEmailPerHour + 1. Dashboard and calendar record every failure;
 *    non-career test-data webinars email only on failure unless `emailTestData` is on;
 *  - calendar: updates to one session's marker event are at least `calendarMinGapSeconds` apart.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AutojoinConfig } from "./config.js";
import { appendBotEvent, cleanBotText, type AlertKind, type BotFeedEvent } from "./bot-events.js";
import { createBotCalendarEvent, sendAlertEmail, updateBotCalendarEvent, type AutojoinGwsRunner } from "./gws-channels.js";

export interface AlertInput {
  kind: AlertKind; sessionKey: string; title: string; startTime?: string; endTime?: string;
  careerGuidance?: boolean; testData?: boolean; matchedKeywords?: string[]; detail?: string; outputPath?: string;
}
export interface AlertDeps { cfg: AutojoinConfig; stateDir: string; tenantId: string; now: () => string; log: (m: string) => void; gws: AutojoinGwsRunner }

interface AlertState {
  version: 1; done: Record<string, string>; failed: Record<string, number>; emailLog: string[];
  failLog: string[]; digestLog: string[]; pending: { sessionKey: string; kind: AlertKind; title: string; at: string }[];
  calendar: Record<string, { eventId: string; lastAt: string; lines: string[] }>;
}
const MAX_ATTEMPTS = 3, HOUR = 3_600_000, KEEP_MS = 14 * 24 * HOUR, DIGEST_AFTER_MS = 5 * 60_000;
const FAILURE: ReadonlySet<AlertKind> = new Set(["capture-stopped-early", "capture-failed"]);
const LABEL: Record<AlertKind, string> = {
  "about-to-join": "Bot will join", "capture-started": "Recording started", "capture-stopped-early": "Recording stopped EARLY",
  "capture-failed": "Recording FAILED", "capture-done": "Recording finished",
};
const COLOR: Record<AlertKind, string> = { "about-to-join": "5", "capture-started": "11", "capture-stopped-early": "6", "capture-failed": "4", "capture-done": "10" };
const STATUS: Record<AlertKind, string> = { "about-to-join": "joining", "capture-started": "recording", "capture-stopped-early": "stopped early", "capture-failed": "failed", "capture-done": "done" };

function statePath(stateDir: string, tenantId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId)) throw new Error("invalid tenant for alert state");
  return path.join(stateDir, `autojoin-alert-state.${tenantId}.json`);
}
function loadState(file: string, now: number): AlertState {
  const fresh: AlertState = { version: 1, done: {}, failed: {}, emailLog: [], failLog: [], digestLog: [], pending: [], calendar: {} };
  if (!existsSync(file)) return fresh;
  try {
    const p = JSON.parse(readFileSync(file, "utf8")) as Partial<AlertState>;
    if (p.version !== 1 || typeof p.done !== "object" || p.done === null) throw new Error("shape");
    const done = Object.fromEntries(Object.entries(p.done).filter(([, at]) => now - Date.parse(String(at)) < KEEP_MS));
    return { version: 1, done, failed: p.failed ?? {}, emailLog: (p.emailLog ?? []).filter((t) => now - Date.parse(t) < HOUR),
      failLog: (p.failLog ?? []).filter((t) => now - Date.parse(t) < HOUR), digestLog: (p.digestLog ?? []).filter((t) => now - Date.parse(t) < HOUR),
      pending: Array.isArray(p.pending) ? p.pending.slice(-50) : [], calendar: p.calendar ?? {} };
  } catch {
    try { renameSync(file, `${file}.corrupt-${now}`); } catch { /* keep going with fresh state */ }
    return fresh; // a corrupt file is kept aside, never silently deleted; worst case one alert repeats
  }
}
function saveState(file: string, s: AlertState): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(s));
  renameSync(`${file}.tmp`, file);
}

export function describeAlert(a: AlertInput): string {
  const lines = [`${LABEL[a.kind]}: ${cleanBotText(a.title, 200)}`];
  if (a.startTime) lines.push(`Scheduled: ${a.startTime}${a.endTime ? ` to ${a.endTime}` : ""}`);
  if (a.careerGuidance !== undefined) lines.push(a.careerGuidance ? `Topic: career guidance (priority)${a.matchedKeywords?.length ? `; matched: ${a.matchedKeywords.join(", ")}` : ""}` : "Topic: not career guidance (test data, staging only)");
  if (a.detail) lines.push(cleanBotText(a.detail, 300));
  if (a.outputPath) lines.push(`Output: ${cleanBotText(a.outputPath, 260)}`);
  return lines.join("\n");
}

export async function raiseAlert(deps: AlertDeps, a: AlertInput): Promise<{ email: string; calendar: string; dashboard: string }> {
  const { cfg, log } = deps, nowIso = deps.now(), now = Date.parse(nowIso);
  const res = { email: "off", calendar: "off", dashboard: "off" };
  if (!cfg.alerts.email && !cfg.alerts.calendar && !cfg.alerts.dashboard) return res;
  const file = statePath(deps.stateDir, deps.tenantId), st = loadState(file, now);
  const key = (ch: string) => `${a.sessionKey}|${a.kind}|${ch}`;
  const fresh = (ch: string): boolean => !st.done[key(ch)] && (st.failed[key(ch)] ?? 0) < MAX_ATTEMPTS;
  const fail = (ch: string, err: unknown) => {
    st.failed[key(ch)] = (st.failed[key(ch)] ?? 0) + 1;
    log(`  alert ${ch} failed (${a.kind}, attempt ${st.failed[key(ch)]}/${MAX_ATTEMPTS}): ${cleanBotText(err instanceof Error ? err.message : err, 200)}`);
  };
  const text = describeAlert(a);

  if (cfg.alerts.dashboard) {
    if (!fresh("dashboard")) res.dashboard = "duplicate";
    else try {
      const ev: Omit<BotFeedEvent, "id"> = { tenantId: deps.tenantId, at: nowIso, kind: a.kind, sessionKey: a.sessionKey, title: a.title, startTime: a.startTime, endTime: a.endTime,
        careerGuidance: a.careerGuidance, testData: a.testData, matchedKeywords: a.matchedKeywords, detail: a.detail, outputPath: a.outputPath };
      appendBotEvent(deps.stateDir, ev); st.done[key("dashboard")] = nowIso; res.dashboard = "sent";
    } catch (e) { fail("dashboard", e); res.dashboard = "failed"; }
  }
  if (cfg.alerts.email) {
    if (!fresh("email")) res.email = "duplicate";
    else if (a.testData && !cfg.alerts.emailTestData && !FAILURE.has(a.kind)) { st.done[key("email")] = nowIso; res.email = "skipped-test-data"; }
    else if (FAILURE.has(a.kind) && st.failLog.length >= cfg.rateLimit.failureEmailPerHour) {
      st.pending.push({ sessionKey: a.sessionKey, kind: a.kind, title: cleanBotText(a.title, 120), at: nowIso }); st.done[key("email")] = nowIso; res.email = "digest-queued";
      log(`  alert email: failure cap (${cfg.rateLimit.failureEmailPerHour}/hour) reached; ${a.kind} queued for the hourly digest`);
    }
    else if (!FAILURE.has(a.kind) && st.emailLog.length >= cfg.rateLimit.emailPerHour) { res.email = "rate-limited"; log(`  alert email rate-limited (${cfg.rateLimit.emailPerHour}/hour): ${a.kind} not emailed this tick`); }
    else try {
      await sendAlertEmail(deps.gws, cfg.alerts.emailTo, `[LKB bot] ${LABEL[a.kind]}: ${cleanBotText(a.title, 120)}`, text + "\n\n-- LKB bot (automatic alert)\n");
      st.done[key("email")] = nowIso; (FAILURE.has(a.kind) ? st.failLog : st.emailLog).push(nowIso); res.email = "sent";
    } catch (e) { fail("email", e); res.email = "failed"; }
  }
  if (cfg.alerts.calendar) {
    const prev = st.calendar[a.sessionKey];
    if (!fresh("calendar")) res.calendar = "duplicate";
    else if (!a.startTime || !a.endTime || Number.isNaN(Date.parse(a.startTime)) || Number.isNaN(Date.parse(a.endTime))) { st.done[key("calendar")] = nowIso; res.calendar = "skipped-no-times"; }
    else if (prev && now - Date.parse(prev.lastAt) < cfg.rateLimit.calendarMinGapSeconds * 1000) { res.calendar = "rate-limited"; }
    else try {
      const lines = [...(prev?.lines ?? []), `${nowIso.slice(11, 16)}Z ${STATUS[a.kind]}`];
      const description = `STATUS: ${STATUS[a.kind].toUpperCase()}\n${text}\n\nHistory: ${lines.join(" > ")}\n(LKB bot marker, private; safe to ignore)`;
      let eventId = prev?.eventId;
      if (eventId) await updateBotCalendarEvent(deps.gws, eventId, { description, colorId: COLOR[a.kind] });
      else eventId = await createBotCalendarEvent(deps.gws, { summary: `\u{1F916} LKB bot recording: ${cleanBotText(a.title, 150)}`, description, startTime: a.startTime, endTime: a.endTime, colorId: COLOR[a.kind] });
      st.calendar[a.sessionKey] = { eventId, lastAt: nowIso, lines: lines.slice(-8) };
      st.done[key("calendar")] = nowIso; res.calendar = prev ? "updated" : "created";
    } catch (e) { fail("calendar", e); res.calendar = "failed"; }
  }
  await sendDigestIfDue(deps, st, now);
  try { saveState(file, st); } catch (e) { log(`  alert state not saved (${cleanBotText(e instanceof Error ? e.message : e, 120)}); alerts may repeat next tick`); }
  return res;
}

/** One digest email listing the failures that exceeded the per-hour cap; at most one per rolling hour, and only once the oldest has waited DIGEST_AFTER_MS. */
async function sendDigestIfDue(deps: AlertDeps, st: AlertState, now: number): Promise<boolean> {
  const { cfg } = deps;
  if (!cfg.alerts.email || st.pending.length === 0 || st.digestLog.length > 0 || now - Date.parse(st.pending[0]!.at) < DIGEST_AFTER_MS) return false;
  const lines = st.pending.map((p) => `- ${LABEL[p.kind]}: ${p.title} (${p.at})`);
  try {
    const text = [`These failures exceeded the ${cfg.rateLimit.failureEmailPerHour}/hour individual email limit. Each is also on the dashboard and calendar.`, "", ...lines, "", "-- LKB bot (automatic alert)", ""].join("\n");
    await sendAlertEmail(deps.gws, cfg.alerts.emailTo, `[LKB bot] ${st.pending.length} more recording problem(s) (digest)`, text);
    st.digestLog.push(new Date(now).toISOString()); st.pending = [];
    return true;
  } catch (e) { deps.log(`  alert digest email failed: ${cleanBotText(e instanceof Error ? e.message : e, 160)}`); return false; }
}

/** Sends the pending failure digest if due, without raising a new alert (called by the tick after the capture watch). */
export async function flushFailureDigest(deps: AlertDeps): Promise<boolean> {
  if (!deps.cfg.alerts.email) return false;
  const file = statePath(deps.stateDir, deps.tenantId), now = Date.parse(deps.now()), st = loadState(file, now);
  const sent = await sendDigestIfDue(deps, st, now);
  if (sent) saveState(file, st);
  return sent;
}
