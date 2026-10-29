/**
 * Candidate-loader hook for OnAir mails. DEFAULT ON (D-207): config/autojoin.json `onair.mail` (absent = on), overridden by
 * LKB_ONAIR_MAIL (1/true/on = on, 0/false/off = off). When off, `withOnairMailCandidates` returns the base loader
 * itself, so behaviour is byte-for-byte what it was. When on, OnAir candidates are appended to the base list (an event already present
 * there, by canonical slug, is not duplicated) and any failure on this side is logged and ignored: the base candidates still flow.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFlag } from "../../autojoin/config.js";
import type { AutoRecordCandidateInput } from "../auto-join.js";
import type { CalendarEvent } from "../calendar-client.js";
import { createGwsRunner } from "../../autojoin/gws-channels.js";
import { createOnairGmailLoader } from "./onair-gmail-fetch.js";
import { canonicalOnairEvent, type OnairResolution } from "./onair-link-resolver.js";
import { buildOnairCandidates, type OnairMail } from "./onair-mail-source.js";

type Loader = (refresh?: boolean) => Promise<AutoRecordCandidateInput[]>;
export interface OnairLaneConfig { mail: boolean; watch: boolean }

/** `onair.mail` / `onair.watch` from the autojoin config file (same path rule as autojoin/config.ts: LKB_AUTOJOIN_CONFIG or
 * <repoRoot>/config/autojoin.json), then LKB_ONAIR_MAIL / LKB_ONAIR_WATCH. A missing or unreadable file, or a missing key, means ON. */
export function loadOnairConfig(repoRoot: string, env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = () => undefined): OnairLaneConfig {
  const file = env.LKB_AUTOJOIN_CONFIG?.trim() || path.join(repoRoot, "config", "autojoin.json");
  let onair: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8")), raw = (parsed as { onair?: unknown } | null)?.onair;
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) onair = raw as Record<string, unknown>;
    } catch { warn(`autojoin config ${path.basename(file)} is unreadable; onair lane keeps its default (on)`); }
  }
  const key = (name: "mail" | "watch", e: unknown): boolean => parseFlag(e) ?? (typeof onair[name] === "boolean" ? onair[name] as boolean : true);
  return { mail: key("mail", env.LKB_ONAIR_MAIL), watch: key("watch", env.LKB_ONAIR_WATCH) };
}

/** env first (unknown values do not count), then the config value when given, then the default: on. */
export const onairMailEnabled = (env: NodeJS.ProcessEnv, config?: Partial<OnairLaneConfig>): boolean => parseFlag(env.LKB_ONAIR_MAIL) ?? config?.mail ?? true;

/** The recorder (sb_join_onair.py, watch/onair-watch.ts) reads only the exact string LKB_ONAIR_WATCH=1: write the resolved default into `env`
 * (config on and env unset or a truthy spelling -> "1"). An explicit off value is left alone. */
export function applyOnairWatchDefault(env: NodeJS.ProcessEnv, repoRoot: string): void {
  if (loadOnairConfig(repoRoot, env).watch) env.LKB_ONAIR_WATCH = "1";
}

export interface OnairLoaderDeps {
  env: NodeJS.ProcessEnv;
  loadMails: () => Promise<OnairMail[]>;
  loadCalendarEvents?: () => Promise<CalendarEvent[]>;
  /** Config-file values; env still wins. Absent = default on. */
  config?: Partial<OnairLaneConfig>;
  resolve?: (link: string) => Promise<OnairResolution>;
  log: (msg: string) => void;
}

export function withOnairMailCandidates(base: Loader, deps: OnairLoaderDeps): Loader {
  if (!onairMailEnabled(deps.env, deps.config)) return base;
  return async (refresh) => {
    const existing = await base(refresh);
    try {
      const [mails, calendarEvents] = await Promise.all([deps.loadMails(), deps.loadCalendarEvents?.().catch(() => undefined)]);
      const { candidates, rejected } = await buildOnairCandidates(mails, { resolve: deps.resolve, calendarEvents });
      const have = new Set(existing.map(c => c.meetingUrl && canonicalOnairEvent(c.meetingUrl)?.slug).filter(Boolean));
      const added = candidates.filter(c => !have.has(c.slug));
      deps.log(`onair-mail: ${mails.length} mails, ${added.length} candidates added, ${rejected.length} rejected`);
      return [...existing, ...added];
    } catch (err) {
      deps.log(`onair-mail: skipped this tick (${err instanceof Error ? err.message : String(err)})`);
      return existing;
    }
  };
}

/** Production wiring used by buildRealScheduleTickDeps; builds the gws runner only when the lane is on. */
export function withOnairMailFromEnv(base: Loader, env: NodeJS.ProcessEnv, repoRoot: string, log: (msg: string) => void,
  loadCalendarEvents?: () => Promise<CalendarEvent[]>, inject: Partial<Pick<OnairLoaderDeps, "loadMails" | "resolve">> = {}): Loader {
  applyOnairWatchDefault(env, repoRoot);
  const config = loadOnairConfig(repoRoot, env, log);
  if (!config.mail) return base;
  return withOnairMailCandidates(base, { env, log, loadCalendarEvents, config, resolve: inject.resolve,
    loadMails: inject.loadMails ?? createOnairGmailLoader(createGwsRunner(repoRoot, env)) });
}
