/**
 * packages/meeting-bot/src/calendar/alerts/alert-resolve.ts - r1-alert-id-resolver (W9).
 * PURE. Turns the opaque id printed in an attention alert back into the local meeting(s) it names, on the
 * operator's own machine. The alert itself never carries this information; the candidates come from
 * the scheduler's own local state (see alert-who-command.ts). No I/O, no clock, no sending, no logging.
 *
 * The id is recomputed with the SAME `alertIdFor` the alert formatter uses (imported, never re-implemented),
 * so the two cannot drift. A 20-hex truncation can collide in principle: every match is returned.
 */
import { alertIdFor } from "./attention-alerts.js";

/** A meeting known locally. `sessionKey` is the only field the id depends on; the rest is display data. */
export interface AlertCandidate {
  sessionKey: string;
  title?: string;
  /** ISO start (or best available time) as stored; the caller formats it. */
  start?: string;
  /** Scheduled end (a job file stores only `until`); shown only when no start is known. */
  end?: string;
  platform?: string;
  host?: string;
  source: string;
  status?: string;
}

export type ResolveRefusal = "not-text" | "empty" | "wrong-length" | "not-hex";
export type ResolveResult =
  | { ok: true; id: string; matches: AlertCandidate[] }
  | { ok: false; reason: ResolveRefusal };

const ID_SHAPE = /^[0-9a-f]{20}$/;

/**
 * Strict normalisation of what an operator pastes. Accepted: the bare id, the id in ONE pair of square
 * brackets (exactly as the alert prints it), leading/trailing whitespace, upper-case hex. Refused: any inner
 * whitespace, any other bracket or quote, prefixes ("id:", "0x"), any other length or character.
 */
export function normaliseAlertId(raw: unknown): { ok: true; id: string } | { ok: false; reason: ResolveRefusal } {
  if (typeof raw !== "string") return { ok: false, reason: "not-text" };
  if (raw.length > 64) return { ok: false, reason: "wrong-length" };
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s.length === 0) return { ok: false, reason: "empty" };
  s = s.toLowerCase();
  if (s.length !== 20) return { ok: false, reason: "wrong-length" };
  return ID_SHAPE.test(s) ? { ok: true, id: s } : { ok: false, reason: "not-hex" };
}

/**
 * `hash` is a test seam only (to force a collision at the function boundary); production callers omit it
 * and get the real `alertIdFor`. Never throws: a throwing or non-string hash for one candidate skips it.
 */
export function resolveAlertId(
  rawId: unknown,
  candidates: readonly AlertCandidate[],
  hash: (sessionKey: string) => string = alertIdFor,
): ResolveResult {
  const n = normaliseAlertId(rawId);
  if (!n.ok) return n;
  const matches: AlertCandidate[] = [];
  for (const c of candidates) {
    if (!c || typeof c.sessionKey !== "string") continue;
    let h: unknown;
    try { h = hash(c.sessionKey); } catch { continue; }
    if (h === n.id) matches.push(c);
  }
  return { ok: true, id: n.id, matches };
}
