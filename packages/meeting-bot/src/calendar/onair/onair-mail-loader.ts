/**
 * Candidate-loader hook for OnAir mails. OFF unless LKB_ONAIR_MAIL=1: when off, `withOnairMailCandidates` returns the base loader
 * itself, so behaviour is byte-for-byte what it was. When on, OnAir candidates are appended to the base list (an event already present
 * there, by canonical slug, is not duplicated) and any failure on this side is logged and ignored: the base candidates still flow.
 */
import type { AutoRecordCandidateInput } from "../auto-join.js";
import type { CalendarEvent } from "../calendar-client.js";
import { createGwsRunner } from "../../autojoin/gws-channels.js";
import { createOnairGmailLoader } from "./onair-gmail-fetch.js";
import { canonicalOnairEvent, type OnairResolution } from "./onair-link-resolver.js";
import { buildOnairCandidates, type OnairMail } from "./onair-mail-source.js";

type Loader = (refresh?: boolean) => Promise<AutoRecordCandidateInput[]>;
export const onairMailEnabled = (env: NodeJS.ProcessEnv): boolean => env.LKB_ONAIR_MAIL === "1";

export interface OnairLoaderDeps {
  env: NodeJS.ProcessEnv;
  loadMails: () => Promise<OnairMail[]>;
  loadCalendarEvents?: () => Promise<CalendarEvent[]>;
  resolve?: (link: string) => Promise<OnairResolution>;
  log: (msg: string) => void;
}

export function withOnairMailCandidates(base: Loader, deps: OnairLoaderDeps): Loader {
  if (!onairMailEnabled(deps.env)) return base;
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

/** Production wiring used by buildRealScheduleTickDeps; builds the gws runner only when the flag is on. */
export function withOnairMailFromEnv(base: Loader, env: NodeJS.ProcessEnv, repoRoot: string, log: (msg: string) => void,
  loadCalendarEvents?: () => Promise<CalendarEvent[]>): Loader {
  if (!onairMailEnabled(env)) return base;
  return withOnairMailCandidates(base, { env, log, loadCalendarEvents, loadMails: createOnairGmailLoader(createGwsRunner(repoRoot, env)) });
}
