/**
 * Glue between the schedule tick and the autojoin pieces (config, topic classifier, alerts, capture watcher), kept out of
 * schedule-tick.ts so that file stays under its size budget. Everything here is optional: a tick built without `autojoin`
 * deps never reaches this module and behaves exactly as before.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { CalendarEvent } from "../calendar/calendar-client.js";
import type { AutoRecordCandidateInput, AutoRecordItem } from "../calendar/auto-join.js";
import type { SelectAutoRecordItemsInput } from "@lkb/core";
import type { AutojoinConfig } from "./config.js";
import { classifyTopic, type TopicConfig, type TopicVerdict } from "./topic-priority.js";
import { classifyInviteExtended } from "./webinar-kind.js";
import { flushFailureDigest, raiseAlert, type AlertInput } from "./alerts.js";
import { loadAutojoinConfig } from "./config.js";
import { loadTopicConfig } from "./topic-priority.js";
import { createGwsRunner } from "./gws-channels.js";
import { watchCaptures } from "./capture-watch.js";
import { writeCaptureTags, type CaptureTags } from "./capture-tags.js";

export const BOT_EVENT_TITLE_PREFIX = "\u{1F916} LKB bot recording:";

export interface AutojoinTickDeps {
  cfg: AutojoinConfig;
  /** Absent = the classifier is unavailable (config missing or malformed): nothing is prioritised or tagged, and a loud line says so. */
  topic?: TopicConfig;
  raise: (a: AlertInput) => Promise<unknown>;
  /** Raises capture lifecycle alerts for jobs scheduled earlier (alerts only; see capture-watch.ts). */
  watchCaptures?: () => Promise<number>;
  /** Directory the recorder reads per-session tags from (record-finalize.ts): <recordDir>/capture-tags. */
  tagsDir: string;
}

export type ItemTags = CaptureTags;
export { writeCaptureTags };

/** The marker events this bot puts on Umesh's calendar must never be fed back in as meetings to join. */
export const dropOwnMarkerEvents = (events: CalendarEvent[]): CalendarEvent[] => events.filter((e) => !(e.title ?? "").startsWith(BOT_EVENT_TITLE_PREFIX));

export function createTopicLookup(ad: AutojoinTickDeps, events: CalendarEvent[], candidates: AutoRecordCandidateInput[]) {
  const text = (source: "calendar" | "gmail", id: string, title: string, sender?: string) => {
    const e = source === "calendar" ? events.find((x) => x.id === id) : undefined;
    return { title, sender, description: (e as { description?: string } | undefined)?.description
      ?? (candidates.find((x) => source === "gmail" && x.id === id) as { description?: string } | undefined)?.description };
  };
  const cache = new Map<string, TopicVerdict>();
  const verdict = (item: { source: "calendar" | "gmail"; sourceId: string; title: string; sender?: string }): TopicVerdict | undefined => {
    if (!ad.topic) return undefined;
    const k = `${item.source}:${item.sourceId}`;
    if (!cache.has(k)) cache.set(k, classifyTopic(text(item.source, item.sourceId, item.title, item.sender), ad.topic));
    return cache.get(k);
  };
  return {
    verdict,
    hooks: {
      ...(ad.cfg.webinarAutoJoin ? { classifyInvite: classifyInviteExtended } : {}),
      ...(ad.cfg.careerPriority && ad.topic ? { priorityOf: (i) => (verdict(i)?.careerGuidance ? 1 : 0) } : {}),
    } satisfies Partial<SelectAutoRecordItemsInput>,
    tagsFor(item: AutoRecordItem): ItemTags {
      const v = verdict(item);
      if (!v || !ad.cfg.testDataRouting) return v ? { careerGuidance: v.careerGuidance, matchedKeywords: v.keywords } : {};
      return { careerGuidance: v.careerGuidance, testData: !v.careerGuidance, matchedKeywords: v.keywords };
    },
  };
}

/** Raises the "bot will join" alert for a freshly scheduled item. Alert failures never affect scheduling. */
export async function announceScheduled(ad: AutojoinTickDeps | undefined, item: AutoRecordItem, tags: ItemTags, log: (m: string) => void): Promise<void> {
  if (!ad) return;
  const how = tags.careerGuidance === undefined ? "" : tags.careerGuidance ? " [career guidance: priority]" : " [not career guidance: test data]";
  log(`  autojoin: ${item.sessionKey}${how}${tags.matchedKeywords?.length ? ` matched: ${tags.matchedKeywords.join(", ")}` : ""}`);
  try { await ad.raise({ kind: "about-to-join", sessionKey: item.sessionKey, title: item.title, startTime: item.startTime, endTime: item.endTime, ...tags }); }
  catch (e) { log(`  autojoin: alert not raised: ${e instanceof Error ? e.message : String(e)}`); }
}

/** Real-run wiring: undefined (= legacy behaviour) when no autojoin config exists. A missing/invalid topic config disables only the topic features, loudly. */
export function buildAutojoinTickDeps(repoRoot: string, stateDir: string, env: NodeJS.ProcessEnv, log: (m: string) => void): AutojoinTickDeps | undefined {
  const cfg = loadAutojoinConfig(repoRoot, env, log);
  if (!cfg.present) return undefined;
  let topic: TopicConfig | undefined;
  try { topic = loadTopicConfig(repoRoot, env); }
  catch (e) { log(`  WARNING: career topic classifier unavailable (${e instanceof Error ? e.message : String(e)}); no topic priority and no test-data tagging this tick`); }
  const tenantId = env.LKB_TENANT_ID ?? "";
  const alertDeps = { cfg, stateDir, tenantId, now: () => new Date().toISOString(), log, gws: createGwsRunner(repoRoot, env) };
  const raise = (a: AlertInput) => raiseAlert(alertDeps, a);
  return {
    cfg, topic, raise, tagsDir: path.join(stateDir, "capture-tags"),
    watchCaptures: async () => { const n = await watchCaptures({ stateDir, tenantId, now: alertDeps.now, log, raise,
      outputFor: (sid) => (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sid) && existsSync(path.join(repoRoot, "data", "toc-migrated", sid, "source.json")) ? `data/toc-migrated/${sid}` : undefined) });
      await flushFailureDigest(alertDeps).catch(() => false); return n; },
  };
}
