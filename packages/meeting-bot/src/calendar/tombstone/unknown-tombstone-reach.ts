/**
 * ISS-T036CAL-011 / ISS-TOMBSTONE-008: what an UNKNOWN cancelled event (a tombstone whose live form this client never stored) can still affect.
 *
 * The rule exists (webinar-release-repair-plan, ISS013) because a meeting can be cancelled before the client ever saw its live Calendar event,
 * while a Gmail copy of that same meeting is still schedulable: the bot would join a cancelled meeting. A tombstone can therefore only ever matter
 * for a Gmail row that has NO calendar twin on record, and only for a row it can be MATCHED to. It must never touch a Calendar row or a Gmail row
 * linked to one, and an unrelated cancelled invite must never hold an unrelated meeting.
 *
 * What Google sends (qa/evidence/tombstone-live-shape-2026-10-12/summary.md, 15 cancelled rows): every one carried start, end, iCalUID and updated;
 * only 4 of 15 also carried organizer, title and conference data. So the common tombstone is a bare start; organizer, title and link are the exception.
 *
 * A tombstone holds an unlinked Gmail row only through one of these matches (S = its start, or an instance's original start; T = its cancellation time):
 *   LINK   the tombstone's trusted (Google conference data) link and the row's link name the same meeting, whatever the start. Window [min(S,T)-24h, max(S,T)+30d].
 *   HOST   the tombstone's organiser is the row's sender (an outsider cannot be that) and (same normalised title, or the row starts within 24h of S, or the
 *          tombstone names no start and no title). Same window.
 *   START  the tombstone has a start S and the row starts within +-24h of S (a scraped Gmail start can be misread by up to about 20h), unless the tombstone
 *          names an organiser that is not the row's sender and shares neither its link nor its title (then it is a different party's meeting).
 *   NEAR   a tombstone with NO start and nothing to match on (an id only) holds unlinked rows starting in [T-24h, T+48h] only (the ordinary scheduling lead). Kept solely so the D-060
 *          floor assertion in webinar-policy.test.ts ("available-source coverage": an id-only tombstone holds `orphan-mail`) still stands; D-129/D-130
 *          amend no other assertion. Google sent no id-only tombstone in the live check (0 of 15). Set NEAR_AHEAD_MS and NEAR_BEHIND_MS to 0 to hold nothing.
 * Nothing else is held: a tombstone that matches no row holds nothing (it stays listed as `unknown-tombstone` in the inventory), and each hold
 * ends at the window's end. Renewing it needs a tombstone that matches the SAME row, which an outsider cannot build (no host, no trusted link).
 * One pass over the rows, then O(tombstones) per Gmail row.
 */
import type { WebinarOccurrence as Occurrence } from "@lkb/core";
import { webinarIdentity } from "../auto-record-policy.js";

export const START_WINDOW_MS = 24 * 3600_000;     // covers every timezone misreading of a scraped start (max about 20h)
export const LEAD_SLACK_MS = 24 * 3600_000;
export const MATCHED_HORIZON_MS = 30 * 86_400_000; // ASSUMPTION (policy, Approver may change): how long after S/T a link/host-matched tombstone still holds
export const NEAR_AHEAD_MS = 48 * 3600_000;       // the ordinary schedule lead; 0 (with NEAR_BEHIND_MS 0) holds nothing
export const NEAR_BEHIND_MS = 24 * 3600_000;
const EPOCH = "1970-01-01T00:00:00.000Z";

interface Tomb { start: number; at: number; firstSeen: number; organizer?: string; title?: string; link?: string }
export interface TombstoneReach { tombs: readonly Tomb[]; now: number }
/** A stored tombstone row. `firstSeen` (ISS-TOMBSTONE-001, ruling 3): the first tick that saw the tombstone; stamped by reconcileWebinarSources. */
type TombRow = Occurrence & { firstSeen?: string };

/** The meeting a join link names, independent of start, token, pwd and path form (zoom /j/ vs /w/, meet code). */
export function linkKey(url: string | undefined): string | undefined {
  if (!url || !webinarIdentity(url, EPOCH)) return undefined;
  const u = new URL(url), host = u.hostname.toLowerCase();
  const meet = host === "meet.google.com" ? /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(u.pathname) : null;
  if (meet) return `meet:${meet[1]}`;
  const zoom = host === "zoom.us" || host.endsWith(".zoom.us") ? /^\/(?:j|w|wc\/join|s)\/(\d+)\/?$/.exec(u.pathname) : null;
  if (zoom) return `zoom:${zoom[1]}`;
  const id = webinarIdentity(url, EPOCH)!; return id.slice(0, id.lastIndexOf("|"));
}
const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const ms = (s: string | undefined): number => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : NaN; };

export function unknownTombstoneReach(rows: Iterable<Occurrence>, now?: string): TombstoneReach {
  const tombs: Tomb[] = [], nowMs = ms(now);
  // A row with no (or an invalid) firstSeen is treated as first seen at read time (`now`), so it is never released immediately.
  // With no usable `now` the id-only expiry cannot be evaluated and the hold stays (fail closed).
  for (const row of rows) {
    if (row.source !== "calendar" || row.unresolved !== "unknown-tombstone") continue;
    const s = row.snapshot, orig = s.originalStartTime;
    // An all-day instance (date only) is placed at noon UTC; the 24h window then covers that date in every timezone.
    const start = ms(s.startTime) || ms(orig?.dateTime) || (orig?.date ? ms(`${orig.date}T12:00:00Z`) : NaN);
    const trusted = s.meetingUrlSource === undefined || s.meetingUrlSource === "conference";   // free text is sender-controlled (ISS-T036CAL-010): never an identity
    tombs.push({ start: Number.isFinite(start) ? start : NaN, at: ms(s.providerUpdated), firstSeen: ms((row as TombRow).firstSeen) || nowMs, organizer: norm(s.organizer) || undefined, title: norm(s.title) || undefined,
      link: trusted ? linkKey(s.meetingUrl) : undefined });
  }
  return { tombs, now: nowMs };
}

/** True when an unknown tombstone could be the cancellation of this UNLINKED Gmail row's meeting. */
export function reachesUnlinkedGmail(reach: TombstoneReach, row: Occurrence): boolean {
  const rs = ms(row.snapshot.startTime);
  if (!Number.isFinite(rs)) return false;     // no start: never schedulable (invalid-time review) so there is nothing to protect
  const sender = norm(row.snapshot.senderEmail), domain = norm(row.snapshot.senderDomain), title = norm(row.snapshot.title), link = linkKey(row.snapshot.meetingUrl);
  return reach.tombs.some(t => {
    const hasStart = Number.isFinite(t.start), hasAt = Number.isFinite(t.at);
    const near = hasStart && Math.abs(rs - t.start) <= START_WINDOW_MS;
    const lo = Math.min(...[t.start, t.at].filter(Number.isFinite)) - LEAD_SLACK_MS, hi = Math.max(...[t.start, t.at].filter(Number.isFinite)) + MATCHED_HORIZON_MS;
    const inMatched = (hasStart || hasAt) ? rs >= lo && rs <= hi : true;      // no clock at all: cannot expire, but only a LINK/HOST match gets here
    const linkHit = t.link !== undefined && t.link === link;
    const host = t.organizer !== undefined && t.organizer === sender;
    const titleHit = t.title !== undefined && t.title === title;
    if (linkHit) return inMatched;
    if (host && (titleHit || near || (!hasStart && t.title === undefined))) return inMatched;
    const otherParty = t.organizer !== undefined && !host && !(domain && t.organizer.endsWith(`@${domain}`)) && !titleHit;
    if (hasStart) return near && !otherParty;
    // ISS-TOMBSTONE-001 (ruling 3): the id-only hold is evidence-bounded. It is released 30 days (MATCHED_HORIZON_MS, D-159) after the tick that first saw
    // the tombstone, and when the tombstone predates the Gmail row's message date (the mail was received after the cancellation, so it cannot be the
    // cancelled meeting's copy). The tombstone's age is the earlier of Google's `updated` and the first-seen tick (both are upper bounds of the real cancellation time).
    // Link/host/start matches are identity or start evidence of a real cancellation and are NOT released here.
    if (Number.isFinite(reach.now) && Number.isFinite(t.firstSeen) && reach.now - t.firstSeen > MATCHED_HORIZON_MS) return false;
    const received = ms(row.snapshot.receivedAt), tombAge = Math.min(...[t.at, t.firstSeen].filter(Number.isFinite));
    if (Number.isFinite(received) && Number.isFinite(tombAge) && tombAge < received) return false;
    return hasAt && !otherParty && rs >= t.at - NEAR_BEHIND_MS && rs <= t.at + NEAR_AHEAD_MS && NEAR_AHEAD_MS + NEAR_BEHIND_MS > 0;
  });
}
