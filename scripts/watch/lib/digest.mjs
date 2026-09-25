/**
 * scripts/watch/lib/digest.mjs — U2 source-watcher. Pure markdown-digest builder
 * (qa/watch/<date>.md), separated from run-watch.mjs so its exact shape is unit-testable without
 * a real Drive/Gmail/Mongo call. Takes the already-computed findings — never re-derives them.
 */

function section(title, lines) {
  if (lines.length === 0) return `## ${title}\n\n_none_\n`;
  return `## ${title}\n\n${lines.join("\n")}\n`;
}

/**
 * @param {{
 *   runAt: string,
 *   mode: "dry-run" | "watch" | "ingest",
 *   driveNew: {id: string, name: string}[],
 *   driveIngested: {id: string, name: string, sessionId: string}[],
 *   driveFailed: {id: string, name: string, reason: string}[],
 *   upcoming: {date: string, agenda: string, source: "toc-calendar" | "gmail", joinLink?: boolean, registrationOnly?: boolean, membersZoom?: boolean}[],
 *   pastRecordingPending: {subject: string, senderEmail: string, recordingUrl?: string}[],
 * }} findings
 */
export function buildDigest(findings) {
  const { runAt, mode, driveNew, driveIngested, driveFailed, upcoming, pastRecordingPending } = findings;

  const driveNewLines = driveNew.map((f) => `- **${f.name}** (\`${f.id}\`)`);
  const driveIngestedLines = driveIngested.map((f) => `- **${f.name}** (\`${f.id}\`) → session \`${f.sessionId}\``);
  const driveFailedLines = driveFailed.map((f) => `- **${f.name}** (\`${f.id}\`) — FAILED: ${f.reason}`);
  const upcomingLines = upcoming.map((e) => {
    const tags = [];
    if (e.registrationOnly) tags.push("registration-only");
    else if (e.joinLink) tags.push("join link present");
    if (e.membersZoom) tags.push("TOC members-only Zoom");
    const tagStr = tags.length ? ` _(${tags.join(", ")})_` : "";
    return `- **${e.date}** — ${e.agenda} [${e.source}]${tagStr}`;
  });
  const pastPendingLines = pastRecordingPending.map(
    (m) => `- "${m.subject}" from ${m.senderEmail}${m.recordingUrl ? ` — ${m.recordingUrl}` : " (no recording link found in body)"}`,
  );

  return (
    `# Source watch — ${runAt}\n\n` +
    `Mode: **${mode}**\n\n` +
    section(`New Drive recordings found (${driveNew.length})`, driveNewLines) +
    "\n" +
    section(`Ingested this run (${driveIngested.length})`, driveIngestedLines) +
    "\n" +
    section(`Failed (${driveFailed.length})`, driveFailedLines) +
    "\n" +
    section(`Upcoming sessions, next 14 days (${upcoming.length})`, upcomingLines) +
    "\n" +
    section(`Past-recording mails not yet ingested (${pastRecordingPending.length})`, pastPendingLines)
  );
}
