/**
 * packages/ingest/src/retention-report-text.ts - T-046 dry-run report. Terminal-safe text for
 * strings that come from DATA (titles, ids, planner reasons that embed ids, argv echoes).
 * Join URLs and their queries are replaced, control / format / bidi / surrogate / private-use
 * characters become a visible \u{..} escape, and length is bounded. Pure; no I/O.
 */
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const BARE_MEETING_RE = /\b(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|zoomgov\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com)\/?\S*/gi;
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}\p{Cn}]/u;

export function cleanText(value: unknown, max = 120): string {
  let s = typeof value === "string" ? value : String(value);
  s = s.replace(URL_RE, "[url omitted]").replace(BARE_MEETING_RE, "[url omitted]");
  const chars = Array.from(s);
  const clipped = chars.length > max;
  let out = "";
  for (const ch of chars.slice(0, max)) {
    out += UNSAFE.test(ch) ? "\\u{" +(ch.codePointAt(0) ?? 0).toString(16) + "}" : ch;
  }
  return clipped ? `${out}...` : out;
}
