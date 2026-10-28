/** Gmail discovery: literal evidence only; configured intake never grants join approval. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { assessSender, type GmailScanSummary } from "@lkb/core";
import { supportedMeetingUrl, extractSessionDateTime, type SessionTimeProvenance } from "./public-webinars.js";
export { extractSessionDateTime, type SessionTimeProvenance } from "./public-webinars.js";
import { candidateUrls, MAX_CANDIDATES, MAX_SCAN_CHARS, recognise, resolveEventMeetingLink } from "../join-rules/calendar-link-extract.js";
import { youtubeVideoId } from "../join-rules/youtube-live-extract.js";
export interface GmailMeetingCandidate {
  messageId: string; receivedAt?: string; // Actual provider receipt; no Date-header or scan-time fallback.
  threadId?: string; registrationUrl?: string;
  subject: string; senderEmail: string; senderDomain: string;
  /** ISS-322: the receiving provider authenticated this sender (see core sender-authentication). Absent = false. */
  senderAuthenticated?: boolean; meetingUrl?: string; recordingUrl?: string;
  youtubeWatch?: {url: string; videoId: string; source: "body" | "snippet"}; // Separate from attendee admission.
  youtubeWatchIssue?: "ambiguous";
  evidenceIssue?: "unresolved-body" | "unsupported-attachment";
  meetingLinkIssue?: "ambiguous" | "registration-only" | "host-start-link";
  kind?: "past-recording" | "upcoming";
  startTime?: string; endTime?: string;
  timeProvenance?: SessionTimeProvenance;
  /** Advisory join-target + occurrence identity; never grants sender or join authority. */
  canonicalEventIdentity?: string;
  registrationOnly?: boolean;
}
interface GwsMessageListResponse {
  messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number; error?: unknown;
}
interface GwsMessageHeader { name: string; value: string; }
interface GwsMessagePart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GwsMessagePart[];
}
interface GwsMessageFull extends GwsMessagePart {
  id: string;
  internalDate?: unknown;
  threadId?: string; snippet?: string;
  payload?: GwsMessagePart & { headers?: GwsMessageHeader[] };
}
const MEETING_QUERY =
  '(webinar OR seminar OR webcast OR "save my spot" OR "reserve your spot" OR "online seminar" OR "educator dialogues" OR "in focus" OR "in-focus" OR ' +
  '"online workshop" OR "virtual conference" OR invitation OR filename:ics OR ' +
  'meet.google.com OR zoom.us OR teams.microsoft.com OR zoho.in OR zoho.com OR ' +
  'cloudonair.withgoogle.com OR webex.com OR "youtube.com/watch" OR "youtube.com/live" OR "youtu.be" OR "drive.google.com/file" OR ' +
  "from:karunn@vidysea.com OR from:theoutreachcollective.in OR from:ashoka.edu.in)";
const RECORDING_URL_RE =
  /https?:\/\/[^\s"'<>]*(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|youtube\.com\/watch|youtu\.be\/|youtube\.com\/live|zoom\.us\/rec)[^\s"'<>]*/i;
const REGISTER_URL_RE = /https?:\/\/[^\s"'<>]*(?:register|registrant|webinar\/register)[^\s"'<>]*/i;
const DIRECT_JOIN_RE =
  /https?:\/\/[^\s"'<>]*(?:zoom\.us\/j\/|zoom\.us\/w\/|meet\.google\.com\/[a-z0-9-]+|teams\.microsoft\.com\/l\/meetup-join)[^\s"'<>]*/i;
const RECORDING_HINT_RE = /\b(recording|recap|watch again|shared a recording)\b/i;
function parseGwsJson(stdout: string): unknown {
  const lines = stdout.split("\n");
  const startIdx = lines.findIndex((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
  if (startIdx === -1) throw new Error("gws produced no JSON output");
  return JSON.parse(lines.slice(startIdx).join("\n"));
}
function runGws(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.platform === "win32" ? "cmd" : "gws", process.platform === "win32" ? ["/c", "gws", ...args] : args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolve(stdout);
    });
  });
}
function header(headers: GwsMessageHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function base64UrlDecode(data: string): string {
  if (typeof data !== "string" || data.length > 1_400_000 || !/^[A-Za-z0-9_-]*={0,2}$/.test(data) || data.replace(/=+$/, "").length % 4 === 1) throw new Error("Gmail body unresolved");
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.toString("base64url") !== data.replace(/=+$/, "")) throw new Error("Gmail body unresolved");
  return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
}
function findPart(part: GwsMessagePart | undefined): GwsMessagePart[] {
  const found: GwsMessagePart[] = []; let count = 0, bytes = 0;
  const visit = (item: GwsMessagePart, depth: number): void => {
    if (!item || typeof item !== "object" || Array.isArray(item) || depth > 12 || ++count > 64 ||
      (item.parts !== undefined && (!Array.isArray(item.parts) || item.parts.length > 64)) ||
      (item.body !== undefined && (!item.body || typeof item.body !== "object" || Array.isArray(item.body))) ||
      (item.mimeType !== undefined && typeof item.mimeType !== "string")) throw new Error("Gmail MIME acquisition incomplete");
    if (item.body?.size !== undefined && (!Number.isSafeInteger(item.body.size) || item.body.size < 0 || item.body.size > MAX_SCAN_CHARS * 10 || item.body.data !== undefined && Buffer.byteLength(base64UrlDecode(item.body.data)) !== item.body.size)) throw new Error("Gmail body size unresolved");
    const mime = item.mimeType?.split(";")[0]!.trim().toLowerCase();
    if (mime === "text/plain" || mime === "text/html" || !mime && item.body) {
      if (item.body?.data !== undefined) { bytes += Buffer.byteLength(base64UrlDecode(item.body.data)); if (bytes > MAX_SCAN_CHARS * 10) throw new Error("Gmail content acquisition incomplete"); }
      found.push({...item, mimeType: mime});
    } else if (item.body?.data || item.body?.attachmentId || mime === "text/calendar") throw new Error("Gmail unsupported attachment evidence");
    for (const child of item.parts ?? []) visit(child, depth + 1);
  };
  if (part) visit(part, 0);
  return found;
}
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}
/** All relevant inline text, including HTML alternatives; unresolved evidence fails closed. */
export function decodeGmailBody(payload: GwsMessagePart | undefined): string {
  return findPart(payload).map(part => {
    if (part.body?.attachmentId && part.body.data === undefined || part.body?.data === undefined && part.body?.size !== 0) throw new Error("Gmail body unresolved");
    const text = base64UrlDecode(part.body?.data ?? "");
    return part.mimeType === "text/html" ? stripHtml(text) : text;
  }).join("\n");
}
/** Recording evidence/past time implies past-recording; other invitation evidence remains upcoming. */
export function classifyMeetingKind(opts: {
  subject: string;
  bodyText: string;
  recordingUrl?: string;
  startTime?: string;
  now: Date;
}): "past-recording" | "upcoming" {
  if (opts.recordingUrl) return "past-recording";
  if (RECORDING_HINT_RE.test(opts.subject) || (!opts.startTime && RECORDING_HINT_RE.test(opts.bodyText))) return "past-recording";
  if (opts.startTime) {
    return new Date(opts.startTime).getTime() >= opts.now.getTime() ? "upcoming" : "past-recording";
  }
  return "upcoming";
}
/** True when the body carries a registration link but no DIRECT join link — the case that must
 * never auto-join (plan U0/U5: "registration forms stay human"). */
export function isRegistrationOnly(bodyText: string): boolean {
  return REGISTER_URL_RE.test(bodyText) && ![...bodyText.matchAll(new RegExp(DIRECT_JOIN_RE.source, "gi"))].some(match => recognise(match[0])?.kind === "join");
}
async function fetchOne(messageId: string, run = runGws, onFetched = () => {}, ownDomains: readonly string[] = []): Promise<GmailMeetingCandidate | null | "excludedInternal" | "excludedNonMeeting"> {
  const params = JSON.stringify({ userId: "me", id: messageId, format: "full" });
  const stdout = await run(["gmail", "users", "messages", "get", "--params", params, "--format", "json"]);
  onFetched();
  const msg = parseGwsJson(stdout) as GwsMessageFull;
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || "error" in msg || msg.id !== messageId ||
      !msg.payload || typeof msg.payload !== "object" || Array.isArray(msg.payload) ||
      !Array.isArray(msg.payload.headers) || msg.payload.headers.some(h => !h || typeof h.name !== "string" || typeof h.value !== "string")) throw new Error("Invalid Gmail message");
  const headers = msg.payload?.headers;
  const sender = assessSender(headers); // ISS-322/CAPTURE-003: strict From + Authentication-Results verdict
  if (!sender) return null;
  if (ownDomains.some(domain => sender.senderDomain === domain || sender.senderDomain.endsWith("." + domain))) return "excludedInternal";
  const subject = header(headers, "Subject") || "(no subject)";
  let parts: GwsMessagePart[];
  try { parts = findPart(msg.payload); } catch (error) {
    if (!(error instanceof Error) || error.message !== "Gmail unsupported attachment evidence") throw error;
    if (!/\b(?:invit(?:ation|ed|e)|webinar|seminar|webcast|workshop|conference|meeting|session)\b/i.test(subject) || /\b(?:newsletter|digest|roundup|recording|recap|product update)\b/i.test(subject)) return "excludedNonMeeting";
    return {messageId: msg.id, subject, ...sender, kind: "upcoming", evidenceIssue: "unsupported-attachment"};
  }
  if (!parts.length) throw new Error("Gmail body unresolved");
  let acquiredBytes = parts.reduce((sum, part) => sum + Buffer.byteLength(base64UrlDecode(part.body?.data ?? "")), 0);
  for (const part of parts) if (part.body?.attachmentId !== undefined) {
    if (typeof part.body.attachmentId !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(part.body.attachmentId) || part.body.data !== undefined) throw new Error("Gmail body unresolved");
    const attachment = parseGwsJson(await run(["gmail", "users", "messages", "attachments", "get", "--params",
      JSON.stringify({userId: "me", messageId, id: part.body.attachmentId}), "--format", "json"])) as {data?: string; size?: number; error?: unknown};
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment) || "error" in attachment || typeof attachment.data !== "string") throw new Error("Gmail body unresolved");
    const size = Buffer.byteLength(base64UrlDecode(attachment.data));
    if (part.body.size !== undefined && part.body.size !== size || attachment.size !== undefined && attachment.size !== size) throw new Error("Gmail body size unresolved");
    acquiredBytes += size;
    if (acquiredBytes > MAX_SCAN_CHARS * 10) throw new Error("Gmail content acquisition incomplete");
    part.body = {data: attachment.data};
  }
  const resolved = {mimeType: "multipart/mixed", parts}, bodyText = decodeGmailBody(resolved);
  if (msg.snippet !== undefined && typeof msg.snippet !== "string") throw new Error("Invalid Gmail snippet");
  const fields = parts.map(part => [base64UrlDecode(part.body?.data ?? ""), part.mimeType === "text/html"] as const);
  const links = new Set<string>(), htmlLinks = new Set<string>();
  for (const [field, isHtml] of [...fields, [msg.snippet ?? "", false] as const]) {
    if (field.length > MAX_SCAN_CHARS * 10) throw new Error("Gmail content acquisition incomplete");
    for (let offset = 0; offset < field.length;) {
      let end = Math.min(offset + MAX_SCAN_CHARS, field.length);
      if (end < field.length) while (end > offset && !/[\s"'<>]/.test(field[end - 1]!)) end--;
      if (end === offset) throw new Error("Gmail content boundary unresolved");
      const batch = candidateUrls(field.slice(offset, end));
      if (batch.length >= MAX_CANDIDATES) throw new Error("Gmail link acquisition incomplete");
      batch.forEach(url => {links.add(url); if (isHtml) htmlLinks.add(url);});
      if (links.size >= MAX_CANDIDATES) throw new Error("Gmail link acquisition incomplete");
      offset = end;
    }
  }
  const linkText = `${bodyText}\n${[...htmlLinks].join("\n")}`, evidenceText = [...links].join("\n");
  if (evidenceText.length > MAX_SCAN_CHARS) throw new Error("Gmail link acquisition incomplete");
  if (msg.threadId !== undefined && (typeof msg.threadId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(msg.threadId))) throw new Error("Invalid Gmail thread");
  const registrationUrl = REGISTER_URL_RE.exec(evidenceText)?.[0];
  const link = resolveEventMeetingLink({description: evidenceText});
  const meetingUrl = link.url;
  const literalRecording = [...linkText.matchAll(new RegExp(RECORDING_URL_RE.source, "gi"))].map(match => match[0]).find(url =>
    supportedMeetingUrl(url) || /^https:\/\/drive\.google\.com\//.test(url));
  const receivedAt = typeof msg.internalDate === "string" && /^\d{1,16}$/.test(msg.internalDate) && Number.isSafeInteger(Number(msg.internalDate)) &&
    Number(msg.internalDate) <= Date.now() ? new Date(Number(msg.internalDate)).toISOString() : undefined;
  const times = fields.map(([text, isHtml]) => extractSessionDateTime(isHtml ? stripHtml(text) : text, {receivedAt})), parsed = times.filter(time => time.startTime);
  if (parsed.length && times.some((time, i) => !time.startTime && /\b(?:date|time):/i.test(stripHtml(fields[i]![0])))) throw new Error("Gmail time evidence unresolved");
  if (parsed.some(time => time.timeProvenance?.yearSource !== "explicit" || time.startTime !== parsed[0]!.startTime || time.endTime !== parsed[0]!.endTime)) { const registrationOnly = !meetingUrl && Boolean(registrationUrl || /\b(?:save (?:my|your) spot|register anyway|reserve (?:my|your) spot)\b/i.test(bodyText));
    return {messageId: msg.id, subject, ...sender, receivedAt, ...(msg.threadId ? {threadId: msg.threadId} : {}), meetingUrl, registrationUrl, evidenceIssue: "unresolved-body", ...(registrationOnly ? {registrationOnly: true} : {}), ...(link.issue || registrationOnly ? {meetingLinkIssue: link.issue ?? "registration-only"} : {})}; }
  const { startTime, endTime, timeProvenance } = parsed.length && parsed.every(time => time.startTime === parsed[0]!.startTime && time.endTime === parsed[0]!.endTime)
    ? parsed[0]! : {};
  const target = meetingUrl ? recognise(meetingUrl) : undefined;
  const canonicalEventIdentity = target?.kind === "join" && startTime ? "gmail-event:" + createHash("sha256").update(JSON.stringify([target.platform, target.id, startTime])).digest("hex") : undefined;
  const youtube = [linkText, msg.snippet ?? ""].flatMap((text, index) => [...text.matchAll(/https:\/\/[^\s"'<>]+/gi)]
    .map(match => ({videoId: supportedMeetingUrl(match[0]) ? youtubeVideoId(match[0]) : undefined, source: index === 0 ? "body" as const : "snippet" as const}))).filter(item => item.videoId);
  const youtubeIds = new Set(youtube.map(item => item.videoId));
  const watch = youtubeIds.size === 1 ? youtube[0] : undefined;
  const youtubeWatch = watch?.videoId ? {url: `https://www.youtube.com/watch?v=${watch.videoId}`, videoId: watch.videoId, source: watch.source} : undefined;
  const recordingUrl = literalRecording && youtubeVideoId(literalRecording) && (youtubeIds.size > 1 ||
    (youtubeWatch && (!startTime || Date.parse(startTime) > Date.now()) && !RECORDING_HINT_RE.test(`${subject}\n${bodyText}`))) ? undefined : literalRecording;
  const kind = classifyMeetingKind({ subject, bodyText, recordingUrl, startTime, now: new Date() });
  const invitationText = [subject, bodyText, msg.snippet ?? ""].join("\n");
  const directJoin = [...links].some(url => recognise(url)?.kind === "join"), eventTopic = /\b(?:webinar|seminar|webcast|online workshop|virtual conference|meeting|session)\b/i.test(invitationText);
  const invitation = /\binvit(?:ation|ed|e)\b/i.test(invitationText) && (directJoin || eventTopic) || eventTopic && /\b(?:join|register|attend|registration|reminder|confirmation|confirmed|reserve|watch live)\b/i.test(invitationText);
  const timedRegistration = Boolean(startTime && /\b(?:save (?:my|your) spot|register anyway|reserve (?:my|your) spot)\b/i.test(invitationText));
  if (kind === "past-recording" || !(directJoin || registrationUrl || youtubeIds.size || timedRegistration) ||
      !(invitation || startTime) || (!startTime && /\b(?:newsletter|digest|roundup|promotional|weekly update|account verification|activate your account|product update)\b/i.test(invitationText))) return "excludedNonMeeting";
  const registrationOnly = (timedRegistration || REGISTER_URL_RE.test(`${linkText}\n${msg.snippet ?? ""}`)) && !meetingUrl;
  return {
    messageId: msg.id, ...(!startTime ? {evidenceIssue: "unresolved-body" as const} : {}),
    ...(receivedAt ? {receivedAt} : {}),
    ...(timeProvenance ? {timeProvenance} : {}),
    ...(canonicalEventIdentity ? {canonicalEventIdentity} : {}),
    ...(msg.threadId ? {threadId: msg.threadId} : {}),
    ...(registrationUrl ? {registrationUrl} : {}),
    subject,
    ...sender,
    ...(meetingUrl ? { meetingUrl } : {}),
    ...(recordingUrl ? { recordingUrl } : {}),
    ...(youtubeWatch ? {youtubeWatch} : {}),
    ...(youtubeIds.size > 1 ? {youtubeWatchIssue: "ambiguous" as const} : {}),
    ...(link.issue || registrationOnly ? {meetingLinkIssue: link.issue ?? "registration-only" as const} : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    kind,
    ...(registrationOnly ? { registrationOnly } : {}),
  };
}
export async function scanGmailForMeetingCandidates(maxMessages = 100, run = runGws, intake: {aliases?: string; labelIds?: string; lookbackDays?: number; batchSize?: number; ownDomains?: readonly string[]; onSummary?: (summary: GmailScanSummary) => void} = {
  aliases: process.env.LKB_GMAIL_ALIASES, labelIds: process.env.LKB_GMAIL_LABEL_IDS,
}): Promise<GmailMeetingCandidate[]> {
  if (!Number.isInteger(maxMessages) || maxMessages <= 0 || maxMessages > 500) throw new Error("Invalid Gmail page size");
  const summary: GmailScanSummary = {listed: 0, fetched: 0, candidates: 0, excludedNonMeeting: 0, excludedInternal: 0, refusedSender: 0, incompleteMessages: 0, complete: false};
  try {
    const parse = (value: string | undefined, pattern: RegExp) => {
      if (value === undefined || value === "") return [];
      if (typeof value !== "string" || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid intake");
      const entries = value.split(",").map(v => v.trim());
      if (entries.length > 20 || entries.some(v => !pattern.test(v))) throw new Error("Invalid intake");
      return [...new Set(entries)];
    };
    const lookbackDays = intake.lookbackDays ?? 30, batchSize = intake.batchSize ?? 10;
    if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) throw new Error("Invalid Gmail scan bounds");
    if (intake.ownDomains !== undefined && (!Array.isArray(intake.ownDomains) || intake.ownDomains.length > 20 || intake.ownDomains.some(domain =>
      typeof domain !== "string" || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)))) throw new Error("Invalid owned domains");
    const ownDomains = [...new Set((intake.ownDomains ?? []).map(domain => domain.toLowerCase()))];
    const recent = `newer_than:${lookbackDays}d`;
    const aliases = parse(intake.aliases, /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
    const labels = parse(intake.labelIds, /^[A-Za-z0-9_-]{1,128}$/);
    const scopes = [{q: `${aliases.length ? `(${MEETING_QUERY} OR ${aliases.map(a => `deliveredto:${a}`).join(" OR ")})` : MEETING_QUERY} ${recent}`},
      ...labels.map(id => ({labelIds: [id], q: recent}))];
    const ids = new Set<string>();
    for (const scope of scopes) {
    let pageToken: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const list = parseGwsJson(await run(["gmail", "users", "messages", "list", "--params",
        JSON.stringify({userId: "me", ...scope, maxResults: maxMessages, pageToken}), "--format", "json"])) as GwsMessageListResponse;
      if (!list || typeof list !== "object" || Array.isArray(list) || "error" in list ||
          (list.messages !== undefined && (!Array.isArray(list.messages) || list.messages.length > maxMessages)) ||
          (list.messages === undefined && Object.keys(list).some(k => !["resultSizeEstimate", "nextPageToken"].includes(k))) ||
          (list.messages === undefined && list.resultSizeEstimate !== undefined && list.resultSizeEstimate !== 0) ||
          (list.resultSizeEstimate !== undefined && (!Number.isInteger(list.resultSizeEstimate) || list.resultSizeEstimate < 0))) throw new Error("Invalid Gmail list");
      for (const m of list.messages ?? []) { if (!m || typeof m.id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(m.id)) throw new Error("Invalid Gmail id"); ids.add(m.id); if (ids.size > 10000) throw new Error("Gmail discovery incomplete"); summary.listed = ids.size; }
      pageToken = list.nextPageToken;
      if (pageToken === undefined) break;
      if (typeof pageToken !== "string" || !/^[A-Za-z0-9._~+/=-]+$/.test(pageToken) || pageToken.length > 2048 || seen.has(pageToken) || page === 19) throw new Error("Gmail discovery incomplete");
      seen.add(pageToken);
    }
    }
    const results: (GmailMeetingCandidate | null)[] = [], ordered = [...ids];
    for (let start = 0; start < ordered.length; start += batchSize) {
      const batch = await Promise.allSettled(ordered.slice(start, start + batchSize).map(id => fetchOne(id, run, () => {summary.fetched++;}, ownDomains)));
      for (const row of batch) {
        if (row.status === "rejected") summary.incompleteMessages++;
        else if (!row.value) summary.refusedSender++;
        else if (typeof row.value === "string") summary[row.value]++;
        else { if (row.value.evidenceIssue) summary.incompleteMessages++; results.push(row.value); }
      }
      if (batch.some(row => row.status === "rejected")) throw new Error("Gmail acquisition incomplete");
    }
    const candidates = results.filter((c): c is GmailMeetingCandidate => c !== null);
    summary.candidates = candidates.length; summary.complete = true;
    return candidates;
  } catch {
    throw new Error("Gmail discovery unavailable");
  } finally {
    try {intake.onSummary?.({...summary});} catch {throw new Error("Gmail discovery unavailable");}
  }
}
