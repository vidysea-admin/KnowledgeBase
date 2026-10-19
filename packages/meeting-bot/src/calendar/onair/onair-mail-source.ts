/**
 * Google Cloud OnAir mails -> scheduler candidates (platform "cloudonair", source "gmail").
 * Mails ("You're registered", "join tomorrow", "starting soon", "ready to watch") carry only Marketo tracking links; the event slug
 * comes from onair-link-resolver. The live window comes from a matching calendar event, else from the mail text. One candidate per
 * event slug, however many mails mention it. Senders must be authenticated google.com (D-178 ruling 1).
 */
import type { AutoRecordCandidateInput } from "../auto-join.js";
import type { CalendarEvent } from "../calendar-client.js";
import { canonicalOnairEvent, resolveOnairLink, MARKETO_HOST, ONAIR_EVENT_HOST, type OnairResolution } from "./onair-link-resolver.js";
import { calendarWindow, parseMailWindow, type OnairWindow } from "./onair-mail-window.js";

export type OnairMailKind = "registered" | "reminder" | "starting-soon" | "on-demand";
export interface OnairMail {
  messageId: string; threadId?: string; subject: string;
  /** Provider internalDate (ISO or RFC 2822) of the mail. */
  date: string; from: string;
  /** True only when the authenticated Gmail scan verified the sender (existing senderAuthenticated field). */
  senderAuthenticated?: boolean;
  html?: string; text?: string;
}
export interface OnairCandidate extends AutoRecordCandidateInput {
  platform: "cloudonair"; source: "gmail"; slug: string;
  mailKind: OnairMailKind; windowSource: "calendar" | "mail" | "none"; mailCount: number;
}
export interface OnairBuildOptions {
  resolve?: (link: string) => Promise<OnairResolution>;
  calendarEvents?: CalendarEvent[];
}
export interface OnairBuildResult { candidates: OnairCandidate[]; rejected: { messageId: string; reason: string }[] }

const MAX_MAILS = 200, MAX_LINKS = 8;
const SENDER_DOMAIN = "google.com";

export function classifyOnairMail(subject: string): OnairMailKind | undefined {
  const s = (subject ?? "").toLowerCase();
  if (/ready to watch|available on[- ]demand|watch (?:the )?(?:recording|on[- ]demand|now)|recording (?:is )?(?:now )?available/.test(s)) return "on-demand";
  if (/starting soon|starts in \d|starting in \d|live now|is about to start|starts now/.test(s)) return "starting-soon";
  if (/you['’]?re (?:registered|confirmed)|registration (?:confirmed|confirmation)|thank you for registering|you['’]?ve registered/.test(s)) return "registered";
  if (/tomorrow|reminder|today|join us|don['’]?t forget|starts (?:soon|on)/.test(s)) return "reminder";
  return undefined;
}

export function senderIsGoogle(from: string, authenticated: boolean | undefined): { ok: boolean; email: string } {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from ?? "") ?? /^\s*([^\s<>"]+@[^\s<>"]+)\s*$/.exec(from ?? "");
  const email = (m?.[1] ?? "").toLowerCase();
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return { ok: authenticated === true && email.includes("@") && domain === SENDER_DOMAIN, email };
}

const decodeEntities = (s: string) => s.replace(/&amp;/gi, "&").replace(/&#x3d;|&#61;/gi, "=").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")).replace(/&nbsp;/gi, " ").replace(/[ \t]+/g, " ");
}

/** Marketo and OnAir links in a mail, de-duplicated, capped. Only these two exact hosts are ever considered. */
export function extractOnairLinks(mail: Pick<OnairMail, "html" | "text">): string[] {
  const blob = decodeEntities(`${mail.html ?? ""}\n${mail.text ?? ""}`);
  const found = new Set<string>();
  for (const m of blob.matchAll(/https:\/\/[^\s"'<>)\]]+/gi)) {
    const raw = m[0].replace(/[.,;]+$/, "");
    try {
      const host = new URL(raw).hostname;
      if (host === MARKETO_HOST || host === ONAIR_EVENT_HOST) found.add(raw);
    } catch { /* not a URL */ }
    if (found.size >= MAX_LINKS) break;
  }
  return [...found];
}

const TITLE_PREFIX = /^\s*(?:re:\s*|fwd?:\s*)*(?:reminder|you['’]?re registered|registration confirm(?:ed|ation)|starting soon|join us tomorrow|join us today|ready to watch|watch now|starts? in [^:]{1,20}|live now)\s*[:\-–—]\s*/i;
export const onairTitle = (subject: string): string => (subject ?? "").replace(TITLE_PREFIX, "").trim().slice(0, 200) || subject;

interface Slot { slug: string; url: string; mails: { mail: OnairMail; kind: OnairMailKind; at: number; window?: OnairWindow; email: string }[] }

export async function buildOnairCandidates(mails: OnairMail[], options: OnairBuildOptions = {}): Promise<OnairBuildResult> {
  const resolve = options.resolve ?? ((link: string) => resolveOnairLink(link));
  const rejected: OnairBuildResult["rejected"] = [], slots = new Map<string, Slot>(), linkCache = new Map<string, Promise<OnairResolution>>();
  const ordered = mails.slice(0, MAX_MAILS).map(mail => ({ mail, at: Date.parse(mail?.date) })).filter(x => {
    if (!x.mail || typeof x.mail.messageId !== "string" || !Number.isFinite(x.at)) { rejected.push({ messageId: String(x.mail?.messageId), reason: "invalid-mail" }); return false; }
    return true;
  }).sort((a, b) => a.at - b.at);
  for (const { mail, at } of ordered) {
    const sender = senderIsGoogle(mail.from, mail.senderAuthenticated);
    if (!sender.ok) { rejected.push({ messageId: mail.messageId, reason: "sender-not-authenticated-google" }); continue; }
    const kind = classifyOnairMail(mail.subject);
    if (!kind) { rejected.push({ messageId: mail.messageId, reason: "unclassified" }); continue; }
    const links = extractOnairLinks(mail);
    const slugs = new Map<string, string>();
    for (const link of links) {
      if (!linkCache.has(link)) linkCache.set(link, resolve(link).catch((): OnairResolution => ({ status: "refused", reason: "resolver-error" })));
      const r = await linkCache.get(link)!;
      if (r.status === "resolved" && canonicalOnairEvent(r.url)?.slug === r.slug) slugs.set(r.slug, r.url);
    }
    if (slugs.size === 0) { rejected.push({ messageId: mail.messageId, reason: "no-event-link" }); continue; }
    if (slugs.size > 1) { rejected.push({ messageId: mail.messageId, reason: "ambiguous-event" }); continue; }
    const [[slug, url]] = [...slugs.entries()] as [[string, string]];
    const text = `${mail.subject}\n${htmlToText(mail.html ?? "")}\n${mail.text ?? ""}`;
    const slot = slots.get(slug) ?? { slug, url, mails: [] };
    slot.mails.push({ mail, kind, at, window: parseMailWindow(text, mail.date), email: sender.email });
    slots.set(slug, slot);
  }
  const candidates: OnairCandidate[] = [];
  for (const slot of slots.values()) {
    const latest = slot.mails[slot.mails.length - 1]!;
    const cal = calendarWindow(slot.slug, options.calendarEvents);
    const mailWin = [...slot.mails].reverse().find(m => m.window)?.window;
    const window = cal ?? mailWin;
    const past = latest.kind === "on-demand";
    if (!window && !past) { for (const m of slot.mails) rejected.push({ messageId: m.mail.messageId, reason: "no-window" }); continue; }
    const titled = slot.mails.find(m => onairTitle(m.mail.subject));
    candidates.push({
      id: `onair:${slot.slug}`, title: cal?.title ?? onairTitle(titled?.mail.subject ?? slot.slug),
      senderEmail: latest.email, senderDomain: SENDER_DOMAIN, senderAuthenticated: true, status: "pending",
      meetingUrl: slot.url, kind: past ? "past-recording" : "upcoming", registrationOnly: false,
      ...(window ? { startTime: window.startTime, endTime: window.endTime } : {}),
      messageId: latest.mail.messageId, ...(latest.mail.threadId ? { threadId: latest.mail.threadId } : {}),
      receivedAt: new Date(latest.at).toISOString(),
      platform: "cloudonair", source: "gmail", slug: slot.slug, mailKind: latest.kind,
      windowSource: cal ? "calendar" : mailWin ? "mail" : "none", mailCount: slot.mails.length,
    });
  }
  return { candidates, rejected };
}
