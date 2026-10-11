/**
 * ISS-T036CAL-011: what an UNKNOWN cancelled event (a tombstone whose live form this client never stored) can still affect.
 *
 * The rule exists (webinar-release-repair-plan, ISS013) because a meeting can be cancelled before the client ever saw its live Calendar event,
 * while a Gmail copy of that same meeting is still schedulable: the bot would join a cancelled meeting. A tombstone can therefore only ever matter
 * for a Gmail row that has NO calendar twin on record. It must never touch a Calendar row or a Gmail row linked to one: those are proven by id /
 * conference identity, and an outsider can create (then cancel) an invite at will.
 *
 * Reach, by what the tombstone itself carries (never a free-text link: that is sender-controlled text, see ISS-T036CAL-010):
 *   identity  trusted join link + start  -> only unlinked Gmail rows holding that exact meeting identity
 *   start     a start but no trusted link -> only unlinked Gmail rows starting at that exact instant
 *   none      neither (id only)           -> every unlinked Gmail row (the residual: nothing can attribute it; ISS-TOMBSTONE-001)
 * One pass over the rows, then O(1) per Gmail row.
 */
import type { WebinarOccurrence as Occurrence } from "@lkb/core";
import { webinarIdentity } from "../auto-record-policy.js";

export interface TombstoneReach { unattributed: boolean; identities: ReadonlySet<string>; starts: ReadonlySet<string> }

export function unknownTombstoneReach(rows: Iterable<Occurrence>): TombstoneReach {
  const identities = new Set<string>(), starts = new Set<string>();
  let unattributed = false;
  for (const row of rows) {
    if (row.source !== "calendar" || row.unresolved !== "unknown-tombstone") continue;
    const {startTime, meetingUrl, meetingUrlSource} = row.snapshot;
    const trusted = meetingUrlSource === undefined || meetingUrlSource === "conference";
    const identity = trusted && meetingUrl && startTime ? webinarIdentity(meetingUrl, startTime) : undefined;
    if (identity) identities.add(identity); else if (startTime) starts.add(startTime); else unattributed = true;
  }
  return {unattributed, identities, starts};
}

/** True when an unknown tombstone could be the cancellation of this UNLINKED Gmail row's meeting. */
export function reachesUnlinkedGmail(reach: TombstoneReach, row: Occurrence): boolean {
  return reach.unattributed || row.aliases.some(alias => reach.identities.has(alias.identity)) ||
    Boolean(row.snapshot.startTime && reach.starts.has(row.snapshot.startTime));
}
