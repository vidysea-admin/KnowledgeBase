/**
 * Resolves a Google Cloud Marketo tracking link (go.cloudplatformonline.com/dc/<token>) to the canonical OnAir event URL.
 * The link answers 302, but the body redirects with JavaScript (`redirecturl = '...'`) to
 * https://cloudonair.withgoogle.com/events/<slug>?mkt_tok=... . GET only, no cookies, DNS pinned with private-address refusal,
 * byte cap, deadline, bounded redirects. The OnAir host itself is never fetched; the result is accepted ONLY when its host is
 * exactly cloudonair.withgoogle.com and its path is /events/<slug>; every query/fragment (mkt_tok included) is dropped.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pinnedRegistrationGet, publicRegistrationAddress, type PinnedResponse } from "../registration-link-resolver.js";

export const MARKETO_HOST = "go.cloudplatformonline.com";
export const ONAIR_EVENT_HOST = "cloudonair.withgoogle.com";
const MAX_BYTES = 256 * 1024, DEADLINE_MS = 15_000, MAX_HOPS = 3;
const TOKEN_PATH = /^\/dc\/[A-Za-z0-9_.~%-]{1,1024}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;

export type OnairResolution =
  | { status: "resolved"; slug: string; url: string }
  | { status: "refused"; reason: string };
export interface OnairResolverOptions {
  dns?: (host: string) => Promise<{ address: string; family: number }[]>;
  get?: (url: URL, pinned: { address: string; family: number }, remainingMs: number, remainingBytes: number) => Promise<PinnedResponse>;
  now?: () => number;
}

/** Canonical form of an OnAir event URL, or undefined. Pure; used for the mail's direct links as well. */
export function canonicalOnairEvent(candidate: string): { slug: string; url: string } | undefined {
  if (typeof candidate !== "string" || candidate.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(candidate)) return undefined;
  let u: URL;
  try { u = new URL(candidate); } catch { return undefined; }
  if (u.protocol !== "https:" || u.hostname !== ONAIR_EVENT_HOST || u.port || u.username || u.password) return undefined;
  const m = /^\/events\/([^/]+)\/?$/.exec(u.pathname);
  const slug = m?.[1]?.toLowerCase();
  if (!slug || !SLUG.test(slug)) return undefined;
  return { slug, url: `https://${ONAIR_EVENT_HOST}/events/${slug}` };
}

/** Reads `redirecturl = '...'` out of the Marketo interstitial body (JS escapes decoded). */
export function extractRedirectUrl(body: Uint8Array): string | undefined {
  const text = Buffer.from(body).toString("utf8");
  const m = /\bredirecturl\s*=\s*(?:'((?:[^'\\\r\n]|\\.)*)'|"((?:[^"\\\r\n]|\\.)*)")/.exec(text);
  if (!m) return undefined;
  return (m[1] ?? m[2])!.replace(/\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\(.)/g,
    (_a, x, u, c) => x ? String.fromCharCode(parseInt(x, 16)) : u ? String.fromCharCode(parseInt(u, 16)) : c).replace(/&amp;/g, "&");
}

async function bounded<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([pending, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("deadline")), ms); })]); }
  finally { clearTimeout(timer!); }
}
const refuse = (reason: string): OnairResolution => ({ status: "refused", reason });

function marketoUrl(link: string): URL | undefined {
  if (typeof link !== "string" || link.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(link)) return undefined;
  try {
    const u = new URL(link);
    if (u.protocol !== "https:" || u.hostname !== MARKETO_HOST || u.port || u.username || u.password || isIP(u.hostname) || !TOKEN_PATH.test(u.pathname)) return undefined;
    u.hash = "";
    return u;
  } catch { return undefined; }
}

export async function resolveOnairLink(link: string, options: OnairResolverOptions = {}): Promise<OnairResolution> {
  const direct = canonicalOnairEvent(link);
  if (direct) return { status: "resolved", ...direct };
  let url = marketoUrl(link);
  if (!url) return refuse("link-invalid");
  const now = options.now ?? Date.now, deadline = now() + DEADLINE_MS;
  const dns = options.dns ?? (host => lookup(host, { all: true, verbatim: true })), get = options.get ?? pinnedRegistrationGet;
  const seen = new Set<string>(); let totalBytes = 0;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (seen.has(url.href)) return refuse("loop");
      seen.add(url.href);
      const remaining = deadline - now(); if (remaining <= 0) return refuse("deadline");
      const addresses = await bounded(dns(url.hostname), remaining);
      if (!addresses.length || addresses.length > 20 || addresses.some(r => !publicRegistrationAddress(r.address) || isIP(r.address) !== r.family)) return refuse("address");
      const left = deadline - now(); if (left <= 0) return refuse("deadline");
      const res = await bounded(get(url, addresses[0]!, left, MAX_BYTES - totalBytes), left);
      totalBytes += res.body.byteLength;
      if (totalBytes > MAX_BYTES || now() > deadline) return refuse("bytes");
      const js = extractRedirectUrl(res.body);
      if (js !== undefined) {
        const target = canonicalOnairEvent(js);
        return target ? { status: "resolved", ...target } : refuse("target");
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.locations.length === 1 ? res.locations[0]! : "";
        if (!loc || loc.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(loc)) return refuse("redirect");
        const next = new URL(loc, url).href;
        const target = canonicalOnairEvent(next);
        if (target) return { status: "resolved", ...target };
        const again = marketoUrl(next);
        if (!again) return refuse("target");
        url = again; continue;
      }
      return refuse("no-redirect");
    }
  } catch { return refuse("resolution-failed"); }
  return refuse("too-many-redirects");
}
