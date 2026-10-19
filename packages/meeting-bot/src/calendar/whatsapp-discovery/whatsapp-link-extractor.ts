/**
 * whatsapp-link-extractor.ts (w27-walinks). PURE: WhatsApp message text -> meeting-link candidates.
 * Privacy: the output carries ONLY {url, ts, groupIdHash, messageIdHash, needsRegistration}. The message text,
 * the sender and any other field of the input are never copied, logged or returned (D-178 minimal read path).
 * Not wired anywhere on its own; the loader and the LKB_WA_DISCOVERY=1 tick hook consume it.
 */
import { createHash } from "node:crypto";

export interface WaMessageInput { text: string; ts: string | number; groupId: string; messageId?: string }
export interface WaLinkCandidate { url: string; ts: string; groupIdHash: string; messageIdHash: string; needsRegistration: boolean }

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
/** Tracking-only parameters. Everything else (meeting ids, pwd, tk, MTID...) is kept. */
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|ref|ref_src|ref_url|referrer|src|source|si|feature|pp|from|campaign|cmpid|trk|s_cid|wa_.+|share|sharer)$/i;
const FORM_HOSTS = /(^|\.)(forms\.gle|typeform\.com|jotform\.com|eventbrite\.[a-z.]+|airtable\.com|tally\.so|forms\.zohopublic\.[a-z.]+|forms\.zoho\.[a-z.]+|formstack\.com)$/i;

export const hashId = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);

const isHost = (host: string, ...roots: string[]): boolean => roots.some(r => host === r || host.endsWith(`.${r}`));

/** Meeting-link provider recognised for this URL, or undefined (not a meeting link). */
function classify(u: URL): { needsRegistration: boolean } | undefined {
  const host = u.hostname.toLowerCase(), p = u.pathname;
  const registerPath = /\/(register|registration|signup|sign-up|rsvp)(\/|$)/i.test(p);
  if (FORM_HOSTS.test(host) || (host === "docs.google.com" && /^\/forms\//.test(p))) return { needsRegistration: true };
  if (isHost(host, "zoom.us", "zoomgov.com")) {
    if (/^\/(j|w)\/\d{6,}/.test(p) || /^\/wc\/join\/\d{6,}/.test(p)) return { needsRegistration: false };
    if (/^\/(webinar|meeting)\/register\//.test(p)) return { needsRegistration: true };
    return undefined;
  }
  if (host === "meet.google.com") return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(p) ? { needsRegistration: false } : undefined;
  if (host === "teams.microsoft.com" || host === "teams.live.com") return /^\/(l\/meetup-join\/|meet\/|l\/meeting)/.test(p) ? { needsRegistration: false } : undefined;
  if (isHost(host, "webex.com")) return registerPath ? { needsRegistration: true } : /\/(meet|join|webappng|wbxmjs)\b|MTID|\.php/i.test(p + u.search) ? { needsRegistration: false } : undefined;
  if (/^webinar\.zoho\.[a-z.]+$/.test(host) || /^meeting\.zoho\.[a-z.]+$/.test(host) || /(^|\.)zohomeeting\.[a-z.]+$/.test(host)) {
    return registerPath ? { needsRegistration: true } : p.length > 1 ? { needsRegistration: false } : undefined;
  }
  if (isHost(host, "airmeet.com")) return p.length > 1 ? { needsRegistration: registerPath || /\/e\//.test(p) && !/\/(live|join)/.test(p) } : undefined;
  if (isHost(host, "streamyard.com")) return p.length > 1 ? { needsRegistration: registerPath } : undefined;
  if (host === "youtu.be") return /^\/[\w-]{6,}/.test(p) ? { needsRegistration: false } : undefined;
  if (isHost(host, "youtube.com")) return /^\/live\/[\w-]{6,}/.test(p) || (p === "/watch" && u.searchParams.has("v")) ? { needsRegistration: false } : undefined;
  return undefined;
}

/** Trims chat punctuation, drops the fragment and tracking parameters; keeps meeting ids and passwords. Undefined = not a usable https URL. */
export function normalizeUrl(raw: string): string | undefined {
  let s = raw.trim().replace(/^[<(\[*_~]+/, "");
  for (;;) {
    const t = s.replace(/[.,;:!?)\]}>*_~'"]+$/, "");
    if (t === s) break;
    s = t;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (u.username || u.password) return undefined;
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const host = u.hostname;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
      if (v) u.searchParams.set("v", v);
    } else {
      for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
    }
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch { return undefined; }
}

/** Canonical meeting id (zoom numeric id, meet code) used for cross-source dedup; undefined for providers without a stable id. */
export function canonicalMeetingId(url: string): string | undefined {
  try {
    const u = new URL(url), host = u.hostname.toLowerCase();
    if (isHost(host, "zoom.us", "zoomgov.com")) {
      const m = /^\/(?:j|w|wc\/join)\/(\d{6,})/.exec(u.pathname);
      return m ? `zoom:${m[1]}` : undefined;
    }
    if (host === "meet.google.com") {
      const m = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(u.pathname);
      return m ? `meet:${m[1]}` : undefined;
    }
    return undefined;
  } catch { return undefined; }
}

/** Extracts meeting-link candidates from one message. Never returns or retains the text. */
export function extractWhatsappLinks(input: WaMessageInput): WaLinkCandidate[] {
  const tsMs = typeof input.ts === "number" ? input.ts : Date.parse(input.ts);
  if (typeof input.text !== "string" || typeof input.groupId !== "string" || !Number.isFinite(tsMs)) return [];
  const ts = new Date(tsMs).toISOString(), groupIdHash = hashId(input.groupId), seen = new Set<string>(), out: WaLinkCandidate[] = [];
  for (const m of input.text.match(URL_RE) ?? []) {
    const url = normalizeUrl(m);
    if (!url || seen.has(url)) continue;
    let kind: { needsRegistration: boolean } | undefined;
    try { kind = classify(new URL(url)); } catch { kind = undefined; }
    if (!kind) continue;
    seen.add(url);
    const messageIdHash = hashId(`${input.groupId}|${input.messageId ?? ts}|${url}`);
    out.push({ url, ts, groupIdHash, messageIdHash, needsRegistration: kind.needsRegistration });
  }
  return out;
}
