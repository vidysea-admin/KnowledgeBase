/**
 * packages/meeting-bot/src/calendar/alerts/title-allowlist.ts — ISS-R1ALERTS-009.
 * ALLOW-LIST title rendering for the `masked` policy. The deny-list in alert-text.ts cannot be closed by
 * listing words (a secret with no keyword and no shape, "Webinar tiger", passes it). Here the direction
 * is inverted: after the existing sanitiser, a title is echoed ONLY if EVERY word in it is on a fixed list
 * of ordinary meeting-title words. One unknown word (a name, a code word, a number, a word in another
 * script, a misspelt keyword) hides the WHOLE title. PURE, linear: split(" ") and set lookups only.
 */
import { neutralizeText, sanitize } from "./alert-text.js";

const HIDDEN = "(hidden)";

/** Lower-case ASCII only. No number words, no colours/animals/names, nothing that doubles as a typical passcode. */
export const SAFE_TITLE_WORDS: ReadonlySet<string> = new Set([
  "webinar", "weekly", "daily", "monthly", "quarterly", "annual", "meeting", "sync", "standup", "review", "planning", "team", "teams",
  "all", "hands", "town", "hall", "demo", "demos", "training", "workshop", "session", "call", "interview", "update", "updates",
  "kickoff", "retro", "retrospective", "intro", "introduction", "class", "lecture", "seminar", "panel", "talk", "office", "hours",
  "product", "project", "sales", "marketing", "engineering", "design", "onboarding", "roadmap", "strategy", "customer", "support",
  "q&a", "qa", "and", "or", "of", "for", "with", "the", "a", "an", "to", "in", "on", "at", "by", "vs", "versus",
  "live", "online", "open", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "overview", "discussion", "briefing", "check-in", "checkin", "finance", "hr", "leadership", "management", "operations", "series", "part",
]);

const EDGE_PUNCT = /^[.,:;'"!?()/\-]+|[.,:;'"!?()/\-]+$/g;

/** True when every word is allow-listed (a token that is pure punctuation, such as " - ", is ignored). */
export function isAllowlistedTitle(s: string): boolean {
  let words = 0;
  for (const tok of s.split(" ")) {
    const w = tok.replace(EDGE_PUNCT, "");
    if (w === "") { if (tok !== "" && !/^[.,:;'"!?()/\-]+$/.test(tok)) return false; continue; }
    if (!/^[a-z&-]+$/i.test(w) || !SAFE_TITLE_WORDS.has(w.toLowerCase())) return false;
    words++;
  }
  return words > 0;
}

/** Sanitise (alert-text.ts), then echo only an all-allow-listed title; anything else is "(hidden)". */
export function allowlistTitle(raw: unknown, max = 80): string {
  const s = sanitize(typeof raw === "string" ? raw.slice(0, 4000) : "");
  if (!s) return "(untitled)";
  return isAllowlistedTitle(s) ? neutralizeText(s, max) : HIDDEN;
}
