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
