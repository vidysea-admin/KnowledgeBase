/**
 * scripts/watch/lib/session-skeleton.mjs — U2 source-watcher `--ingest`. Builds the
 * data/toc-migrated/<id>/{source,session,turns,session_page,claims}.json set for a Drive
 * recording that was JUST auto-transcribed (no hand-authored `meta.json` roster exists for it —
 * that is the input `scripts/webinar/session-rows.mjs`'s `buildSessionFiles` needs, and building
 * one automatically would mean resolving real people/orgs from raw transcript text with no
 * review, which this unit does not attempt).
 *
 * HONEST LIMITATION (stated once here, repeated in the manifest): `summary`/`keyInsights` are
 * MECHANICAL placeholders — a turn/speaker count, not an LLM- or human-written synopsis. They
 * satisfy `session_pages.schema.json`'s `required: ["summary", "evidence"]` without fabricating
 * content U1's own manifest explicitly avoided guessing at (org/people resolution). `evidence[]`
 * is built from the session's own turns — one entry per DISTINCT `speakerRef` the diarizer
 * produced (first turn each), which is schema-valid (`evidence` only requires `{turnId,
 * sessionId}` pairs) without inventing a people/org roster.
 */
import { randomUUID } from "node:crypto";

/**
 * @param {{
 *   sessionId: string, tenantId: string, title: string, date: string,
 *   driveFileId: string, audioPath: string, turns: {_id: string, speakerRef: string}[],
 * }} opts
 */
export function buildAutoSessionSkeleton({ sessionId, tenantId, title, date, driveFileId, audioPath, turns }) {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error(`buildAutoSessionSkeleton(${sessionId}): no turns — nothing to seed`);
  }

  const sourceId = `gdrive-${driveFileId}`;
  const source = {
    _id: sourceId,
    tenantId,
    kind: "recording",
    captureMode: "provided", // H8: organizer-provided, TOC's own members Drive folder
    path: audioPath,
    hash: sourceId,
    consent: {
      given: true,
      recordedBy: "u2-source-watcher",
      note: "organizer-provided TOC Drive recording, auto-detected by scripts/watch/run-watch.mjs",
    },
    createdAt: new Date().toISOString(),
  };

  const session = {
    _id: sessionId,
    tenantId,
    sourceId,
    title,
    date,
    org: "toc",
    status: { transcribe: "done", index: "pending" },
  };

  const seenSpeakers = new Set();
  const evidence = [];
  for (const t of turns) {
    if (t.speakerRef && !seenSpeakers.has(t.speakerRef)) {
      seenSpeakers.add(t.speakerRef);
      evidence.push({ turnId: t._id, sessionId });
    }
  }
  if (evidence.length === 0) {
    throw new Error(`buildAutoSessionSkeleton(${sessionId}): no turn carries a speakerRef — evidence would be empty`);
  }

  const speakerList = [...seenSpeakers];
  const summary =
    `${title} — TOC session recorded ${date}, auto-ingested by the source watcher (U2). ` +
    `${turns.length} transcript turns across ${speakerList.length} distinct speaker label(s): ${speakerList.join(", ")}. ` +
    "This summary is a MECHANICAL placeholder (turn/speaker counts only) — no LLM or human enrichment pass has run on this session yet.";

  const sessionPage = {
    _id: `${sessionId}-page`,
    tenantId,
    sessionId,
    summary,
    keyInsights: [],
    evidence,
  };

  return { source, session, sessionPage, claims: [] };
}

/** Deterministic-enough session id from a title + date — matches the `<YYYY-MM-DD>-<slug>`
 * shape every existing `data/toc-migrated/` directory already uses. `randomUUID` is used only as
 * a last-resort tiebreak when the slug alone collides with an existing directory (caller checks). */
export function slugSessionId(date, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${date}-${slug || randomUUID().slice(0, 8)}`;
}

// ---- ISS-306: date + title derivation for a Drive recording -------------------------------
//
// `ingestOneDriveFile` used to take the session date from `file.createdTime` (when the
// organizer's file landed in Drive) and the title from a filesystem-safe `stem` that had ALSO
// been mangled by an off-by-one in its own extension-stripping (see ingest-chain.mjs's `stem`
// fix, same unit). Both were wrong on this unit's own first live file: "24th Sep : InFocus",
// uploaded to Drive a day later, became session `2026-09-25-infocu` instead of
// `2026-09-24-in-focus`. The fix below prefers the file's OWN stated date (TOC's Drive naming
// convention is "<day><suffix> <Mon>: <title>" — every hand-named recording in this Drive folder
// follows it) and, when that date matches a TOC calendar row, uses the CALENDAR's own agenda
// text as the title — which is exactly how the existing hand-authored `data/toc-migrated/`
// directories are named (e.g. calendar agenda "UniAccess : Japan" -> `uniaccess-japan`), so a
// watcher-derived id lands on the same slug a human curating U1 would have picked.

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Extracts `{day, monthIndex}` from a Drive title that starts with TOC's own naming convention
 * ("24th Sep : InFocus", "2nd Sep: India Test Series..."). Returns `null` for a title with no
 * such prefix (e.g. a Drive-generated "video1968958572.mp4") — the caller falls back to
 * `createdTime`. */
export function parseDayMonthFromTitle(rawName) {
  const m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/i.exec(rawName || "");
  if (!m) return null;
  const day = Number(m[1]);
  const monthIndex = MONTH_ABBR.indexOf(m[2].slice(0, 3).toLowerCase());
  if (monthIndex === -1 || day < 1 || day > 31) return null;
  return { day, monthIndex };
}

/** TOC's membership/program year: April(index 3)..December is `firstYear`, January..March is
 * `firstYear + 1` — the same rule `packages/ingest/src/sources/toc-calendar.ts`'s own
 * `yearForMonth` encodes. Re-stated here (3 lines) rather than imported: that module is a
 * `packages/ingest` source adapter and this one is a `scripts/watch` lib — crossing that
 * boundary for a rule this small would add a dependency edge for no real reuse benefit. */
export function yearForProgramMonth(monthIndex, firstYear) {
  return monthIndex >= 3 ? firstYear : firstYear + 1;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Strips a leading "<day><suffix> <Mon>[.]<sep>" prefix, same shape `parseDayMonthFromTitle`
 * recognizes — used only as the title fallback when no TOC calendar row matches the derived
 * date. */
function stripDatePrefix(rawName) {
  return (rawName || "").replace(/^\s*\d{1,2}(?:st|nd|rd|th)?\s*[a-z]{3,9}\.?\s*[-:–—]?\s*/i, "").trim();
}

/**
 * @param {{
 *   rawName: string, createdTime?: string,
 *   calendarEvents?: {date: string, agenda: string}[], programYearFirstYear?: number,
 * }} opts
 * @returns {{date: string, title: string}}
 */
export function deriveSessionDateAndTitle({ rawName, createdTime, calendarEvents = [], programYearFirstYear }) {
  const parsed = parseDayMonthFromTitle(rawName);
  let date;
  if (parsed) {
    const firstYear = programYearFirstYear ?? new Date(createdTime || Date.now()).getUTCFullYear();
    const year = yearForProgramMonth(parsed.monthIndex, firstYear);
    date = `${year}-${pad2(parsed.monthIndex + 1)}-${pad2(parsed.day)}`;
  } else {
    // No day/month pattern in the title at all — createdTime is the best signal left, and it is
    // usually the UPLOAD, one day after the real session on this unit's own first live file.
    const created = new Date(createdTime || Date.now());
    created.setUTCDate(created.getUTCDate() - 1);
    date = created.toISOString().slice(0, 10);
  }

  const calendarMatch = calendarEvents.find((e) => e.date === date);
  if (calendarMatch) return { date, title: calendarMatch.agenda.trim() };

  const stripped = stripDatePrefix(rawName);
  return { date, title: stripped || (rawName || "").trim() || date };
}
