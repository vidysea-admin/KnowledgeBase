/**
 * ISS-T036CAL-011: what an UNKNOWN cancelled event (a tombstone whose live form this client never stored) can still affect.
 *
 * The rule exists (webinar-release-repair-plan, ISS013) because a meeting can be cancelled before the client ever saw its live Calendar event,
 * while a Gmail copy of that same meeting is still schedulable: the bot would join a cancelled meeting. A tombstone can therefore only ever matter
 * for a Gmail row that has NO calendar twin on record. It must never touch a Calendar row or a Gmail row linked to one: those are proven by id /
 * conference identity, and an outsider can create (then cancel) an invite at will.
 *
 * Fail-closed reach (ISS-TOMBSTONE-002/003/004). Gmail starts are scraped from mail text (an unknown timezone is read as IST), so an EXACT start
 * or exact link is never a safe selector. Instead the hold is a WINDOW, and every window is finite:
 *   tombstone with a usable start S   -> unlinked Gmail rows starting within +-START_WINDOW_MS of S (ends once S + window has passed)
 *   tombstone without one (id only, all-day, recurring instance, link only) -> unlinked Gmail rows starting in
 *       [T - LEAD_SLACK_MS, T + HOLD_HORIZON_MS], where T is the tombstone's cancellation time (Google `updated`; when Google sent none,
 *       the first tick that saw it, stamped by calendar-client). The hold therefore lapses by itself HOLD_HORIZON_MS after T.
 * The tombstone's link is never consulted (free text is sender-controlled, ISS-T036CAL-010; a trusted link's start covers the same row).
 * One pass over the rows, then O(tombstones) per Gmail row.
 */
import type { WebinarOccurrence as Occurrence } from "@lkb/core";

export const START_WINDOW_MS = 24 * 3600_000;     // covers every timezone misreading of a scraped start (max about 20h)
export const HOLD_HORIZON_MS = 14 * 86_400_000;   // ASSUMPTION (policy, Approver may change): how long after its cancellation an attribution-less tombstone holds
export const LEAD_SLACK_MS = 24 * 3600_000;

export interface TombstoneReach { anyTime: boolean; starts: readonly number[]; spans: readonly (readonly [number, number])[] }

export function unknownTombstoneReach(rows: Iterable<Occurrence>): TombstoneReach {
  const starts: number[] = [], spans: (readonly [number, number])[] = [];
  let anyTime = false;
  for (const row of rows) {
    if (row.source !== "calendar" || row.unresolved !== "unknown-tombstone") continue;
    const {startTime, providerUpdated} = row.snapshot, start = startTime ? Date.parse(startTime) : NaN;
    if (Number.isFinite(start)) { starts.push(start); continue; }
    const at = providerUpdated ? Date.parse(providerUpdated) : NaN;
    if (Number.isFinite(at)) spans.push([at - LEAD_SLACK_MS, at + HOLD_HORIZON_MS]); else anyTime = true;   // no clock at all: cannot expire, hold (fail closed)
  }
  return {anyTime, starts, spans};
}

/** True when an unknown tombstone could be the cancellation of this UNLINKED Gmail row's meeting. */
export function reachesUnlinkedGmail(reach: TombstoneReach, row: Occurrence): boolean {
  if (reach.anyTime) return true;
  const start = row.snapshot.startTime ? Date.parse(row.snapshot.startTime) : NaN;
  if (!Number.isFinite(start)) return false;     // no start: never schedulable (invalid-time review) so there is nothing to protect
  return reach.starts.some(s => Math.abs(start - s) <= START_WINDOW_MS) || reach.spans.some(([from, to]) => start >= from && start <= to);
}
