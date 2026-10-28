/**
 * Webinar / masterclass detection for automatic joining (Umesh decision 2026-10-14). Extends the title-only
 * `classifyWebinarInvite` with masterclass / OnAir / Zoom-webinar-link / registration-confirmation signals. It only ever
 * WIDENS "uncertain" to "webinar": a title the base classifier calls "meeting" stays a meeting. Non-webinar meetings are not
 * handled here; they keep the existing policy.
 */
import { classifyWebinarInvite } from "../calendar/auto-record-policy.js";

export interface InviteView { title: string; meetingUrl?: string; sender?: string }

const TITLE_SIGNALS = /\b(master[ -]?class(?:es)?|on[ -]?air|webcast|live (?:session|stream|webinar|workshop)|you['’]?re (?:registered|confirmed)|registration (?:confirmed|confirmation)|thank you for registering|you['’]?ve registered)\b/i;

function urlSignal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url), host = u.hostname.toLowerCase();
    if ((host === "zoom.us" || host.endsWith(".zoom.us")) && /^\/w\/\d+/.test(u.pathname)) return true; // Zoom webinar join link (meetings use /j/)
    if (host === "cloudonair.withgoogle.com") return true;
    return /^webinar\.zoho\.[a-z.]+$/.test(host);
  } catch { return false; }
}

export function classifyInviteExtended(invite: InviteView): "webinar" | "meeting" | "uncertain" {
  const base = classifyWebinarInvite(invite.title);
  if (base !== "uncertain") return base;
  return TITLE_SIGNALS.test(invite.title) || urlSignal(invite.meetingUrl) ? "webinar" : "uncertain";
}
