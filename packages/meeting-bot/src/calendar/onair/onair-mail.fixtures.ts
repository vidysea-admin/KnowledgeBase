/** Synthetic Google Cloud OnAir mails mirroring the real structure. Every token and address is fake; no personal data. */
import type { OnairMail } from "./onair-mail-source.js";
import type { OnairResolution } from "./onair-link-resolver.js";

export const dc = (token: string) => `https://go.cloudplatformonline.com/dc/FAKE-${token}`;
export const SLUG_A = "building-agents-with-gemini", SLUG_B = "data-cloud-summit";
export const URL_A = `https://cloudonair.withgoogle.com/events/${SLUG_A}`, URL_B = `https://cloudonair.withgoogle.com/events/${SLUG_B}`;
const FROM = "Google Cloud Events <cloud-events@google.com>";

const html = (lead: string, token: string, extra = "") => `<html><body><p>${lead}</p>${extra}
<a href="${dc(token)}?utm_source=mail&amp;utm_medium=email">View event</a>
<a href="https://www.example.invalid/unsubscribe?x=1">Unsubscribe</a></body></html>`;
const when = "<p>Tuesday, October 20, 2026 at 9:00 AM - 10:00 AM PT</p>";

export const registered: OnairMail = { messageId: "m-reg", threadId: "t-a", subject: "You're registered: Building agents with Gemini", date: "2026-10-14T08:00:00Z",
  from: FROM, senderAuthenticated: true, html: html("Thanks for registering.", "a1", when) };
export const reminder: OnairMail = { messageId: "m-rem", threadId: "t-a", subject: "Join us tomorrow: Building agents with Gemini", date: "2026-10-19T08:00:00Z",
  from: FROM, senderAuthenticated: true, html: html("See you tomorrow.", "a2", when) };
export const reminder2: OnairMail = { ...reminder, messageId: "m-rem2", html: html("Same event, another link.", "a3", when) };
export const startingSoon: OnairMail = { messageId: "m-soon", threadId: "t-a", subject: "Starting soon: Building agents with Gemini", date: "2026-10-20T15:30:00Z",
  from: FROM, senderAuthenticated: true, html: html("Starts in 30 minutes.", "a4") };
export const onDemand: OnairMail = { messageId: "m-od", threadId: "t-b", subject: "Ready to watch: Data cloud summit", date: "2026-10-18T10:00:00Z",
  from: FROM, senderAuthenticated: true, text: `Watch the recording: ${dc("b1")}` };
export const noWindow: OnairMail = { messageId: "m-nowin", subject: "Join us tomorrow: Data cloud summit", date: "2026-10-17T10:00:00Z",
  from: FROM, senderAuthenticated: true, html: html("No time in this mail.", "b2") };

export const unauthenticated: OnairMail = { ...registered, messageId: "m-unauth", senderAuthenticated: false };
export const unknownAuth: OnairMail = { ...registered, messageId: "m-unk", senderAuthenticated: undefined };
export const lookalike: OnairMail = { ...registered, messageId: "m-look", from: "Google <events@google.com.evil.example>" };
export const subdomain: OnairMail = { ...registered, messageId: "m-sub", from: "Google <events@mail.google.com>" };
export const twoEvents: OnairMail = { ...registered, messageId: "m-two", html: html("Two events", "a1", `<a href="${dc("b1")}">Other</a>`) };
export const noLink: OnairMail = { ...registered, messageId: "m-nolink", html: "<p>No links at all. October 20, 2026 9:00 AM PT</p>" };
export const unrelated: OnairMail = { ...registered, messageId: "m-unrel", subject: "Your monthly Google Cloud invoice" };

/** Injected resolver double: maps fake tokens to slugs; never touches the network. */
export function fakeResolver(calls: string[] = []) {
  const map: Record<string, string> = { a1: SLUG_A, a2: SLUG_A, a3: SLUG_A, a4: SLUG_A, b1: SLUG_B, b2: SLUG_B };
  return async (link: string): Promise<OnairResolution> => {
    calls.push(link);
    const token = /FAKE-(\w+)/.exec(link)?.[1] ?? "";
    const slug = map[token];
    return slug ? { status: "resolved", slug, url: `https://cloudonair.withgoogle.com/events/${slug}` } : { status: "refused", reason: "unknown" };
  };
}
