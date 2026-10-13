/**
 * apps/api/src/indexing/speaker-suggest.ts -- U2.4 / D-141: the production caller of `extractSpeakersGrounded({ suggest: true })`.
 *
 * Runs at the end of `indexSession`, ONLY when the caller opted in (flag OFF by default; see `speakerSuggestEnabled`).
 * It writes `speaker_suggestions` rows (status "suggested") and nothing else: it never touches `speakers`, never reads
 * `resolved` into a write, and so can never make an AI-proposed name final. A human confirms via the suggestions API.
 * Human decisions are honoured: confirmed labels/people are passed as `confirmed`, rejections as `rejected`, and
 * `insertSuggestionsIfAbsent` ($setOnInsert) leaves any existing row in any state untouched.
 * Never throws: a failure here must not fail indexing.
 */
import type { Db } from "mongodb";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { insertSuggestionsIfAbsent, listConfirmed, listRejected } from "@lkb/db";
import { logger, type Logger } from "../composition/logger.js";
import { extractSpeakersGrounded, buildSuggestionDocs } from "@lkb/index";

export type SpeakerSuggestOutcome = { suggested: number; inserted: number; degraded: string | null; error?: string };

/** Upper bound on the awaited hook so a hung local model cannot stall indexing forever. */
export const SPEAKER_SUGGEST_TIMEOUT_MS = 300_000;
export interface SpeakerSuggestOptions { now?: Date; log?: Logger; timeoutMs?: number }

/** The opt-in switch. OFF unless the env value is exactly "1". */
export function speakerSuggestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.KB_SPEAKER_SUGGEST === "1";
}

export async function suggestSpeakersForSession(
  tenantId: string, sessionId: string, turns: Turns[],
  complete: (job: Job) => Promise<CompleteResult>, db: Db, opts: SpeakerSuggestOptions = {},
): Promise<SpeakerSuggestOutcome> {
  const log = opts.log ?? logger;
  const timeoutMs = opts.timeoutMs ?? SPEAKER_SUGGEST_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
  try {
    const won = await Promise.race([run(tenantId, sessionId, turns, complete, db, opts.now ?? new Date()), timeout]);
    if (won === "timeout") {
      // ids only: never transcript text
      log.warn("speaker suggestion timed out; indexing continues", { tenantId, sessionId, timeoutMs });
      return { suggested: 0, inserted: 0, degraded: null, error: "timeout" };
    }
    return won;
  } catch (err) {
    // ids and the error CLASS only: never transcript text, never the message (a provider error can echo a prompt)
    log.warn("speaker suggestion failed; indexing continues", { tenantId, sessionId, errorName: err instanceof Error ? err.name : typeof err });
    return { suggested: 0, inserted: 0, degraded: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run(tenantId: string, sessionId: string, turns: Turns[], complete: (job: Job) => Promise<CompleteResult>, db: Db, now: Date): Promise<SpeakerSuggestOutcome> {
  // chronological, stable: the grounder windows by position
  const ordered = turns.map((t, i) => ({ t, i })).sort((a, b) => (a.t.tStart - b.t.tStart) || (a.i - b.i)).map((x) => x.t);
  const [confirmed, rejected] = await Promise.all([listConfirmed(tenantId, sessionId, db), listRejected(tenantId, sessionId, db)]);
  const out = await extractSpeakersGrounded(ordered, complete, { suggest: true, confirmed, rejected });
  const docs = buildSuggestionDocs(tenantId, sessionId, out.suggested ?? [], now);
  const inserted = docs.length > 0 ? await insertSuggestionsIfAbsent(tenantId, sessionId, docs, db) : 0;
  return { suggested: docs.length, inserted, degraded: out.degraded?.reason ?? null };
}
