/**
 * Bot events feed for the web dashboard: an append-only JSON-lines file in the schedule state dir, written by the schedule tick
 * (alerts.ts) and read by the host's GET /bot-events (scripts/watch/bot-events-host.ts). Rows carry their tenant; a reader only
 * ever returns the asked tenant's rows. Text is sanitized on write: control characters and URLs (join tokens) never enter the file.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const ALERT_KINDS = ["about-to-join", "capture-started", "capture-stopped-early", "capture-failed", "capture-done", "rules-degraded",
  "coverage-deferred", "discovery-degraded", "discovery-recovered"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export interface BotFeedEvent {
  id: string;
  tenantId: string;
  at: string;
  kind: AlertKind;
  sessionKey: string;
  title: string;
  startTime?: string;
  endTime?: string;
  careerGuidance?: boolean;
  testData?: boolean;
  matchedKeywords?: string[];
  detail?: string;
  outputPath?: string;
}

const MAX_BYTES = 2 * 1024 * 1024;
export const botEventsPath = (stateDir: string): string => path.join(stateDir, "bot-events.jsonl");

/** Strips control chars and URLs, collapses whitespace, caps length. */
export function cleanBotText(value: unknown, max: number): string {
  return String(value ?? "").replace(/https?:\/\/\S+/gi, "[link removed]").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function appendBotEvent(stateDir: string, ev: Omit<BotFeedEvent, "id">): BotFeedEvent {
  const row: BotFeedEvent = {
    id: randomUUID(), tenantId: ev.tenantId, at: ev.at, kind: ev.kind, sessionKey: cleanBotText(ev.sessionKey, 120), title: cleanBotText(ev.title, 200),
    ...(ev.startTime ? { startTime: cleanBotText(ev.startTime, 40) } : {}), ...(ev.endTime ? { endTime: cleanBotText(ev.endTime, 40) } : {}),
    ...(ev.careerGuidance !== undefined ? { careerGuidance: ev.careerGuidance } : {}), ...(ev.testData !== undefined ? { testData: ev.testData } : {}),
    ...(ev.matchedKeywords?.length ? { matchedKeywords: ev.matchedKeywords.slice(0, 20).map((k) => cleanBotText(k, 60)) } : {}),
    ...(ev.detail ? { detail: cleanBotText(ev.detail, 300) } : {}), ...(ev.outputPath ? { outputPath: cleanBotText(ev.outputPath, 260) } : {}),
  };
  mkdirSync(stateDir, { recursive: true });
  const file = botEventsPath(stateDir);
  if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`); // one generation kept; the feed is a recent-activity view
  appendFileSync(file, JSON.stringify(row) + "\n");
  return row;
}

/** Newest first, this tenant only, malformed lines skipped, at most `limit` rows. */
export function readBotEvents(stateDir: string, tenantId: string, limit: number): BotFeedEvent[] {
  const out: BotFeedEvent[] = [];
  for (const file of [botEventsPath(stateDir), `${botEventsPath(stateDir)}.1`]) {
    if (!existsSync(file) || statSync(file).size > 2 * MAX_BYTES) continue;
    const rows: BotFeedEvent[] = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const r = JSON.parse(line) as BotFeedEvent;
        if (r && r.tenantId === tenantId && (ALERT_KINDS as readonly string[]).includes(r.kind) && typeof r.at === "string") rows.push(r);
      } catch { /* skip a torn or foreign line */ }
    }
    out.unshift(...rows);
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, Math.max(1, Math.min(limit, 200)));
}
