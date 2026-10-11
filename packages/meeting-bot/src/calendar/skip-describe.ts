/**
 * packages/meeting-bot/src/calendar/skip-describe.ts — T-037 unit `t037-veto-skip-reasons-and-optout-identity`.
 * Operator-facing text for a skipped item. `describeSkip` moved here verbatim from schedule-tick.ts (that file is
 * at its 300-line budget). SKIP_REASON_MEANING is a TOTAL record over SkipReason: adding a reason without
 * deciding what it means to an operator no longer compiles.
 */
import type { SkippedItem, SkipReason } from "@lkb/core";

export const SKIP_REASON_MEANING: Record<SkipReason, string> = {
  "no-join-link": "no join link on the invite",
  "past": "the meeting already ended",
  "untrusted-sender": "the sender is not trusted, or the invite was rejected",
  "needs-registration": "registration is required first",
  "duplicate-session": "the same meeting is already scheduled",
  "overlap-lost": "another meeting overlaps and wins",
  "not-webinar": "not classified as a webinar",
  "needs-review": "needs a human review",
  "cancelled": "the meeting was cancelled",
  "invalid-time": "the start or end time is invalid",
  "unsafe-join-link": "the join link is not safe to open",
  "opted-out": "the owner opted out of this meeting, so the bot will not join it",
  "rule-denied": "a join rule denies this meeting, so the bot will not join it",
  "rules-unevaluable": "the join rules could not be read or evaluated, so the bot did not join (failing closed)",
};

/** Reasons produced by the join-rules veto layer; only these get the explanatory sentence (older log lines unchanged). */
export const VETO_SKIP_REASONS: readonly SkipReason[] = ["opted-out", "rule-denied", "rules-unevaluable"];

export function describeSkip(s: SkippedItem): string {
  const detail = s.detail ? ` (${s.detail})` : "";
  const meaning = VETO_SKIP_REASONS.includes(s.reason) ? ` — ${SKIP_REASON_MEANING[s.reason]}` : "";
  return `  skip [${s.reason}]${detail} — ${s.source}:${s.sourceId} "${s.title}"${meaning}`;
}
