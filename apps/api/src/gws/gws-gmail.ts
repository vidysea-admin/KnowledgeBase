/** Gmail discovery: literal evidence only; configured intake never grants join approval. */
import { execFile } from "node:child_process";
import { assessSender } from "@lkb/core";
import { supportedMeetingUrl } from "./public-webinars.js";
import { candidateUrls, MAX_CANDIDATES, MAX_SCAN_CHARS, recognise, resolveEventMeetingLink } from "../join-rules/calendar-link-extract.js";
import { youtubeVideoId } from "../join-rules/youtube-live-extract.js";

export interface GmailMeetingCandidate {
  messageId: string;
  receivedAt?: string; // Actual provider receipt; no Date-header or scan-time fallback.
  threadId?: string;
  registrationUrl?: string;
  subject: string;
  senderEmail: string;
  senderDomain: string;
  /** ISS-322: the receiving provider authenticated this sender (see core sender-authentication). Absent = false. */
  senderAuthenticated?: boolean;
  meetingUrl?: string;
  /** Literal recording link, distinct from the live join link. */
  recordingUrl?: string;
  youtubeWatch?: {url: string; videoId: string; source: "body" | "snippet"}; // Separate from attendee admission.
  youtubeWatchIssue?: "ambiguous";
  meetingLinkIssue?: "ambiguous" | "registration-only" | "host-start-link";
  /** Best-effort classification from literal body/subject evidence. */
  kind?: "past-recording" | "upcoming";
  startTime?: string;
  endTime?: string;
  /** A registration link without canonical join evidence cannot auto-join. */
  registrationOnly?: boolean;
}

interface GwsMessageListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: unknown;
}

interface GwsMessageHeader { name: string; value: string; }
interface GwsMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GwsMessagePart[];
}
interface GwsMessageFull extends GwsMessagePart {
  id: string;
  internalDate?: unknown;
  threadId?: string;
  snippet?: string;
  headers?: GwsMessageHeader[];
  payload?: GwsMessagePart & { headers?: GwsMessageHeader[] };
}

// Retain older invitations and unknown-platform webinars for conservative classification/review.
// Matching invitation language or an ICS attachment does not prove a join URL or parsed time.
// Pagination must complete; reaching its safety cap is an outage, never complete coverage.
const MEETING_QUERY =
  '(webinar OR seminar OR webcast OR "online seminar" OR "educator dialogues" OR "in focus" OR "in-focus" OR ' +
  '"online workshop" OR "virtual conference" OR invitation OR filename:ics OR ' +
  'meet.google.com OR zoom.us OR teams.microsoft.com OR zoho.in OR zoho.com OR ' +
  'cloudonair.withgoogle.com OR webex.com OR "youtube.com/watch" OR "youtube.com/live" OR "youtu.be" OR "drive.google.com/file" OR ' +
  "from:karunn@vidysea.com OR from:theoutreachcollective.in OR from:ashoka.edu.in)";

const RECORDING_URL_RE =
  /https?:\/\/[^\s"'<>]*(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|youtube\.com\/watch|youtu\.be\/|youtube\.com\/live|zoom\.us\/rec)[^\s"'<>]*/i;

const REGISTER_URL_RE = /https?:\/\/[^\s"'<>]*(?:register|registrant|webinar\/register)[^\s"'<>]*/i;
const DIRECT_JOIN_RE =
  /https?:\/\/[^\s"'<>]*(?:zoom\.us\/j\/|zoom\.us\/w\/|meet\.google\.com\/[a-z0-9-]+|teams\.microsoft\.com\/l\/meetup-join)[^\s"'<>]*/i;

const RECORDING_HINT_RE = /\b(recording|recap|watch again|now available|shared a recording)\b/i;

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

// --- U2: body decode + date/time/kind extraction. Each is a pure function on already-fetched
// text, so it is directly unit-testable against the real example strings from the task brief
// without a `gws` call. ---

function base64UrlDecode(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findPart(part: GwsMessagePart | undefined, mimeType: string): GwsMessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
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

/** Plain body preferred; stripped HTML/unstructured body are fallbacks. */
export function decodeGmailBody(payload: GwsMessagePart | undefined): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return base64UrlDecode(plain.body.data);
  const html = findPart(payload, "text/html");
  if (html?.body?.data) return stripHtml(base64UrlDecode(html.body.data));
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  return "";
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
// Real Ashoka mail uses Sep/Sept abbreviations, including in forwarded subjects.
const MONTH_ALIASES: Record<string, number> = {};
for (const [i, full] of MONTHS.entries()) {
  MONTH_ALIASES[full] = i;
  MONTH_ALIASES[full.slice(0, 3)] = i;
}
MONTH_ALIASES.sept = 8;

const DATE_RE = /([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/;
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;
// Prefer labelled session dates to forwarded dates. Weekdays require a comma so backtracking cannot swallow a month prefix.
const DATE_NEAR_LABEL_RE = /(?:Day\s*&?\s*Date|Date\s*&?\s*Time|Date)\s*:?\*?\s*:?\s*(?:[A-Za-z]+,\s*)?([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
const TIME_RANGE_RE = /(\d{1,2}:\d{2}\s*[AP]M)\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(IST|UTC|GMT)?/i;
const TIME_SINGLE_RE = /(\d{1,2}:\d{2}\s*[AP]M)\s*(IST|UTC|GMT)?/i;
const TZ_OFFSET_MINUTES: Record<string, number> = { IST: 5 * 60 + 30, UTC: 0, GMT: 0 };

function parseMonthName(dateStr: string): { year: number; month: number; day: number } | undefined {
  const iso = ISO_DATE_RE.exec(dateStr.trim());
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(dateStr.trim());
  if (!m) return undefined;
  const monthIdx = MONTH_ALIASES[(m[1] ?? "").toLowerCase()];
  if (monthIdx === undefined) return undefined;
  return { year: Number(m[3]), month: monthIdx, day: Number(m[2]) };
}

function buildIsoDateTime(dateStr: string, timeStr: string, tz: string | undefined): string | undefined {
  const parsedDate = parseMonthName(dateStr);
  if (!parsedDate) return undefined;
  const t = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(timeStr.trim());
  if (!t) return undefined;
  let hour = Number(t[1]) % 12;
  if ((t[3] ?? "").toUpperCase() === "PM") hour += 12;
  const minute = Number(t[2]);
  const offsetMinutes = TZ_OFFSET_MINUTES[(tz ?? "IST").toUpperCase()] ?? TZ_OFFSET_MINUTES.IST!;
  const utcMillis = Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day, hour, minute) - offsetMinutes * 60_000;
  return new Date(utcMillis).toISOString();
}

/** Extract explicit session date plus range/single time; absent date remains unknown. */
export function extractSessionDateTime(text: string): { startTime?: string; endTime?: string } {
  const labeledMatch = DATE_NEAR_LABEL_RE.exec(text);
  const dateMatch = labeledMatch ?? DATE_RE.exec(text) ?? ISO_DATE_RE.exec(text);
  if (!dateMatch) return {};
  const dateStr = labeledMatch ? (labeledMatch[1] ?? labeledMatch[0]) : dateMatch[0];
  const rangeMatch = TIME_RANGE_RE.exec(text);
  if (rangeMatch) {
    const [, startT, endT, tz] = rangeMatch;
    const startTime = buildIsoDateTime(dateStr, startT ?? "", tz);
    const endTime = buildIsoDateTime(dateStr, endT ?? "", tz);
    return { ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}) };
  }
  const singleMatch = TIME_SINGLE_RE.exec(text);
  if (singleMatch) {
    const [, startT, tz] = singleMatch;
    const startTime = buildIsoDateTime(dateStr, startT ?? "", tz);
    return startTime ? { startTime } : {};
  }
  return {};
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
  if (RECORDING_HINT_RE.test(opts.subject) || RECORDING_HINT_RE.test(opts.bodyText)) return "past-recording";
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

async function fetchOne(messageId: string, run = runGws): Promise<GmailMeetingCandidate | null> {
  const params = JSON.stringify({ userId: "me", id: messageId, format: "full" });
  const stdout = await run(["gmail", "users", "messages", "get", "--params", params, "--format", "json"]);
  const msg = parseGwsJson(stdout) as GwsMessageFull;
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || "error" in msg || msg.id !== messageId ||
      !msg.payload || typeof msg.payload !== "object" || Array.isArray(msg.payload) ||
      !Array.isArray(msg.payload.headers) || msg.payload.headers.some(h => !h || typeof h.name !== "string" || typeof h.value !== "string")) throw new Error("Invalid Gmail message");
  const headers = msg.payload?.headers;
  const sender = assessSender(headers); // ISS-322/CAPTURE-003: strict From + Authentication-Results verdict
  if (!sender) return null;
  const subject = header(headers, "Subject") || "(no subject)";

  const bodyText = decodeGmailBody(msg.payload) || "";
  if (msg.snippet !== undefined && typeof msg.snippet !== "string") throw new Error("Invalid Gmail snippet");
  const htmlData = findPart(msg.payload, "text/html")?.body?.data;
  const htmlBody = htmlData ? base64UrlDecode(htmlData) : "";
  if (htmlBody.length > MAX_SCAN_CHARS) throw new Error("Gmail HTML acquisition incomplete");
  const htmlLinks = candidateUrls(htmlBody);
  if (htmlLinks.length >= MAX_CANDIDATES) throw new Error("Gmail HTML acquisition incomplete");
  const linkText = `${bodyText}\n${htmlLinks.join("\n")}`;
  const evidenceText = `${linkText}\n${msg.snippet ?? ""}`;
  if (evidenceText.length > MAX_SCAN_CHARS || candidateUrls(evidenceText).length >= MAX_CANDIDATES) throw new Error("Gmail link acquisition incomplete");
  if (msg.threadId !== undefined && (typeof msg.threadId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(msg.threadId))) throw new Error("Invalid Gmail thread");
  const registrationUrl = REGISTER_URL_RE.exec(evidenceText)?.[0];
  const link = resolveEventMeetingLink({description: evidenceText});
  const meetingUrl = link.url;
  const literalRecording = [...linkText.matchAll(new RegExp(RECORDING_URL_RE.source, "gi"))].map(match => match[0]).find(url =>
    supportedMeetingUrl(url) || /^https:\/\/drive\.google\.com\//.test(url));
  const { startTime, endTime } = extractSessionDateTime(bodyText || msg.snippet || "");
  const youtube = [linkText, msg.snippet ?? ""].flatMap((text, index) => [...text.matchAll(/https:\/\/[^\s"'<>]+/gi)]
    .map(match => ({videoId: supportedMeetingUrl(match[0]) ? youtubeVideoId(match[0]) : undefined, source: index === 0 ? "body" as const : "snippet" as const}))).filter(item => item.videoId);
  const youtubeIds = new Set(youtube.map(item => item.videoId));
  const watch = youtubeIds.size === 1 ? youtube[0] : undefined;
  const youtubeWatch = watch?.videoId ? {url: `https://www.youtube.com/watch?v=${watch.videoId}`, videoId: watch.videoId, source: watch.source} : undefined;
  const recordingUrl = literalRecording && youtubeVideoId(literalRecording) && (youtubeIds.size > 1 ||
    (youtubeWatch && startTime && Date.parse(startTime) > Date.now() && !RECORDING_HINT_RE.test(`${subject}\n${bodyText}`))) ? undefined : literalRecording;
  const kind = classifyMeetingKind({ subject, bodyText, recordingUrl, startTime, now: new Date() });
  const registrationOnly = REGISTER_URL_RE.test(`${linkText}\n${msg.snippet ?? ""}`) && !meetingUrl;

  return {
    messageId: msg.id,
    ...(typeof msg.internalDate === "string" && /^\d{1,16}$/.test(msg.internalDate) && Number.isSafeInteger(Number(msg.internalDate)) &&
      Number(msg.internalDate) <= Date.now() ? {receivedAt: new Date(Number(msg.internalDate)).toISOString()} : {}),
    ...(msg.threadId ? {threadId: msg.threadId} : {}),
    ...(registrationUrl ? {registrationUrl} : {}),
    subject,
    ...sender,
    ...(meetingUrl ? { meetingUrl } : {}),
    ...(recordingUrl ? { recordingUrl } : {}),
    ...(youtubeWatch ? {youtubeWatch} : {}),
    ...(youtubeIds.size > 1 ? {youtubeWatchIssue: "ambiguous" as const} : {}),
    ...(link.issue ? {meetingLinkIssue: link.issue} : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    kind,
    ...(registrationOnly ? { registrationOnly } : {}),
  };
}

export async function scanGmailForMeetingCandidates(maxMessages = 100, run = runGws, intake: {aliases?: string; labelIds?: string} = {
  aliases: process.env.LKB_GMAIL_ALIASES, labelIds: process.env.LKB_GMAIL_LABEL_IDS,
}): Promise<GmailMeetingCandidate[]> {
  if (!Number.isInteger(maxMessages) || maxMessages <= 0 || maxMessages > 500) throw new Error("Invalid Gmail page size");
  try {
    const parse = (value: string | undefined, pattern: RegExp) => {
      if (value === undefined || value === "") return [];
      if (typeof value !== "string" || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid intake");
      const entries = value.split(",").map(v => v.trim());
      if (entries.length > 20 || entries.some(v => !pattern.test(v))) throw new Error("Invalid intake");
      return [...new Set(entries)];
    };
    const aliases = parse(intake.aliases, /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
    const labels = parse(intake.labelIds, /^[A-Za-z0-9_-]{1,128}$/);
    const scopes = [{q: aliases.length ? `(${MEETING_QUERY} OR ${aliases.map(a => `deliveredto:${a}`).join(" OR ")})` : MEETING_QUERY},
      ...labels.map(id => ({labelIds: [id]}))];
    const ids = new Set<string>();
    for (const scope of scopes) {
    let pageToken: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const list = parseGwsJson(await run(["gmail", "users", "messages", "list", "--params",
        JSON.stringify({userId: "me", ...scope, maxResults: maxMessages, pageToken}), "--format", "json"])) as GwsMessageListResponse;
      if (!list || typeof list !== "object" || Array.isArray(list) || "error" in list ||
          (list.messages !== undefined && !Array.isArray(list.messages)) ||
          (list.messages === undefined && Object.keys(list).some(k => !["resultSizeEstimate", "nextPageToken"].includes(k))) ||
          (list.messages === undefined && list.resultSizeEstimate !== undefined && list.resultSizeEstimate !== 0) ||
          (list.resultSizeEstimate !== undefined && (!Number.isInteger(list.resultSizeEstimate) || list.resultSizeEstimate < 0))) throw new Error("Invalid Gmail list");
      for (const m of list.messages ?? []) { if (!m || typeof m.id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(m.id)) throw new Error("Invalid Gmail id"); ids.add(m.id); }
      pageToken = list.nextPageToken;
      if (pageToken === undefined) break;
      if (typeof pageToken !== "string" || !/^[A-Za-z0-9._~+/=-]+$/.test(pageToken) || pageToken.length > 2048 || seen.has(pageToken) || page === 19) throw new Error("Gmail discovery incomplete");
      seen.add(pageToken);
    }
    }
    const results: (GmailMeetingCandidate | null)[] = [], ordered = [...ids];
    for (let start = 0; start < ordered.length; start += 10) results.push(...await Promise.all(ordered.slice(start, start + 10).map(id => fetchOne(id, run))));
    return results.filter((c): c is GmailMeetingCandidate => c !== null);
  } catch {
    throw new Error("Gmail discovery unavailable");
  }
}
