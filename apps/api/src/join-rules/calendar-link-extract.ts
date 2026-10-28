/**
 * apps/api/src/join-rules/calendar-link-extract.ts - T-036 slice: pure meeting-link resolution for a Calendar
 * event whose join link is NOT in Google's conference fields but in its LOCATION or DESCRIPTION text.
 *
 * RECOGNISER SOURCE (gap, stated): the canonical recognisers are `detectPlatform` (packages/meeting-bot
 * platform.ts) and `PLATFORM_EXTRACTORS` (send-now.ts). `.dependency-cruiser.cjs` forbids apps/* -> meeting-bot,
 * so they cannot be imported here. `recognise()` below mirrors them (same exact-host rules, same path/param
 * shapes) and is a KNOWN second copy; moving the recognisers into packages/core is a separate cross-package
 * unit. gws-gmail.ts's regexes are NOT reused: they are substring matches (a host-in-path trick passes them).
 *
 * Precedence: conference data / hangoutLink (caller-supplied, unchanged) > location > description.
 * Ambiguity rule (deterministic; joining the WRONG meeting is worse than none):
 *   1. Registration links (recognised host whose path/query names "regist") are never join links.
 *   2. Distinct join links are deduplicated by meeting identity (platform:id). Same meeting written twice: the variant
 *      that carries the join passcode wins whatever the order; two DIFFERENT passcodes for one meeting -> ambiguous.
 *   2b. Host/start links (Zoom `/s/`, any `zak=` token) are never join links; alone they give issue "host-start-link".
 *   3. Location is judged first: exactly one distinct join identity -> it; two or more -> ambiguous.
 *   4. Else description: one distinct identity -> it. Several: keep those on the same platform as any recognised
 *      link found in the location; exactly one left -> it; otherwise ambiguous (no url, issue "ambiguous").
 *   5. No join link but a registration link -> no url, issue "registration-only".
 * Pure, no I/O, never throws, never logs, never echoes the text it scans.
 */
export type MeetingLinkIssue = "ambiguous" | "registration-only" | "host-start-link";
export interface EventLinkInput { conferenceUrl?: string; location?: unknown; description?: unknown }
export interface EventLinkResult { url?: string; source?: "conference" | "location" | "description"; issue?: MeetingLinkIssue }

export const MAX_SCAN_CHARS = 100_000;
export const MAX_CANDIDATES = 200;
const MAX_URL_CHARS = 2048;

type Join = { kind: "join"; id: string; platform: string; url: string; pass?: string; conflict?: true };
type Rec = Join | { kind: "registration"; platform: string } | { kind: "host-start"; platform: string } | undefined;

// Mirrors send-now.ts hasEmbeddedRedirect (REDIRECT_KEY, URL_VALUE, up to 3 decodes) rule for rule.
const REDIRECT_KEY = /^(redirect|redirect_?uri|redirect_?url|return|return_?url|return_?to|next|continue|url|goto|dest|destination|target|callback)$/i;
const URL_VALUE = /^\s*([a-z][a-z0-9+.-]*:|\/\/|\\)/i;
const PASS_KEYS = new Set(["pwd", "passcode", "password", "pw"]);

const HOSTS: [string, (h: string) => boolean][] = [
  ["meet", h => h === "meet.google.com" || h.endsWith(".meet.google.com")],
  ["teams", h => ["teams.microsoft.com", "teams.live.com"].some(d => h === d || h.endsWith("." + d))],
  ["zoom", h => ["zoom.us", "zoom.com"].some(d => h === d || h.endsWith("." + d))],
  ["webex", h => h === "webex.com" || h.endsWith(".webex.com")],
  ["zoho", h => /^(webinar|meeting)\.zoho\.(in|com|eu|com\.au|jp)$/.test(h)],
  ["cloudonair", h => h === "cloudonair.withgoogle.com"],
];

/** Same as send-now.ts decodeAll: up to 3 decodes, a malformed escape stops decoding (never throws). */
function decodeAll(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) { try { const next = decodeURIComponent(out); if (next === out) break; out = next; } catch { break; } }
  return out;
}
function hasEmbeddedRedirect(u: URL): boolean {
  for (const [key, value] of u.searchParams) if (REDIRECT_KEY.test(key) || URL_VALUE.test(decodeAll(value))) return true;
  return false;
}

/** Mirror of planSendNow + detectPlatform + PLATFORM_EXTRACTORS, plus host-start refusal (stricter than canonical). */
export function recognise(raw: string): Rec {
  if (raw.length > MAX_URL_CHARS || /[\u0000- \u007f\\]/.test(raw)) return undefined;
  let u: URL;
  try { u = new URL(raw); } catch { return undefined; }
  if (u.protocol !== "https:" || !/^https:\/\//i.test(raw)) return undefined; // `https:/host` is normalised by URL; canonical refuses it
  if (u.username || u.password || /^https:\/\/[^/?#]*@/i.test(raw) || u.port) return undefined;
  if (hasEmbeddedRedirect(u)) return undefined;
  const host = u.hostname.toLowerCase();
  const platform = HOSTS.find(([, ok]) => ok(host))?.[0];
  if (!platform) return undefined;
  const path = decodeAll(u.pathname).replace(/\/+/g, "/").replace(/\/+$/, "").toLowerCase();
  if (path.split("/").includes("..")) return undefined;
  const param = (name: string) => { for (const [k, v] of u.searchParams) if (k.toLowerCase() === name && v.trim()) return v.trim().toLowerCase(); return undefined; };
  if ((platform === "zoom" && /^\/s\//.test(path)) || /(?:^|[?&#;])zak\s*(?:[=&#;]|$)/i.test(decodeAll(u.search + u.hash))) return { kind: "host-start", platform };
  if (/regist/.test(path) || [...u.searchParams.keys()].some(k => /regist/i.test(k))) return { kind: "registration", platform };
  const m = (re: RegExp) => re.exec(path);
  let id: string | undefined;
  if (platform === "meet") id = m(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/)?.[1] ?? (m(/^\/lookup\/([a-z0-9_-]+)$/)?.[1] && `lookup:${m(/^\/lookup\/([a-z0-9_-]+)$/)![1]}`);
  else if (platform === "zoom") { const n = m(/^\/(?:(?:j|w|wc\/join)\/(\d{5,})|wc\/(\d{5,})\/join)$/); const p = m(/^\/my\/([a-z0-9._-]+)$/)?.[1]; id = (n && (n[1] ?? n[2])) || (p && `my:${p}`) || undefined; }
  else if (platform === "teams") { const r = m(/^\/meet\/(\d{6,})$/)?.[1]; const t = m(/^\/l\/meetup-join\/(19:[^/]+@thread\.[a-z0-9]+)(?:\/.*)?$/)?.[1]; id = r ? `meet:${r}` : t && `thread:${t}`; }
  else if (platform === "webex") { const r = m(/^\/(?:meet|join)\/([a-z0-9._-]+)$/)?.[1]; const i = m(/\/meeting\/(?:info|download)\/([a-z0-9]+)$/)?.[1]; const t = param("mtid"), k = param("mk"); id = (r && `room:${host}:${r}`) || (i && `id:${i}`) || (t && `mtid:${t}`) || (k && `mk:${k}`) || undefined; }
  else if (platform === "zoho") { const k = param("key"), s = param("sessionid"); id = (k && `key:${k}`) || (s && `session:${s}`) || undefined; }
  else { const s = m(/^\/events\/([a-z0-9][a-z0-9._~-]*)$/)?.[1]; id = s && `/events/${s}`; }
  if (!id) return undefined;
  let pass: string | undefined;
  for (const [k, v] of u.searchParams) if (PASS_KEYS.has(k.toLowerCase()) && v.trim()) { pass = v.trim(); break; }
  return { kind: "join", platform, id: `${platform}:${id}`, url: u.href, ...(pass ? { pass } : {}) };
}

/** Entities decoded exactly once (single replace pass: `&amp;amp;` -> `&amp;`). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi, (all, e: string) => {
    const l = e.toLowerCase();
    if (l === "amp") return "&"; if (l === "lt") return "<"; if (l === "gt") return ">"; if (l === "quot") return '"'; if (l === "apos") return "'";
    const cp = l[1] === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : all;
  });
}

/** One linear pass: hrefs of anchors (visible text dropped) + tag-stripped text. */
function splitHtml(src: string): { hrefs: string[]; text: string } {
  const hrefs: string[] = []; const out: string[] = [];
  const lower = src.replace(/[A-Z]/g, c => c.toLowerCase()); // ASCII-only: indices stay aligned
  let i = 0, noClose = false, noAClose = false;
  while (i < src.length) {
    const lt = noClose ? -1 : src.indexOf("<", i);
    if (lt === -1) { out.push(src.slice(i)); break; }
    out.push(src.slice(i, lt));
    if (/^<https?:\/\//i.test(src.slice(lt, lt + 9))) { out.push("<"); i = lt + 1; continue; } // angle-bracket URL form
    if (!/^<\/?[a-z!]/i.test(src.slice(lt, lt + 3))) { out.push("<"); i = lt + 1; continue; }
    const gt = src.indexOf(">", lt);
    if (gt === -1) { noClose = true; i = lt; out.push(src.slice(i)); break; }
    const tag = src.slice(lt, gt + 1);
    if (/^<a[\s/]/i.test(tag)) {
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      if (h) hrefs.push(h[1] ?? h[2] ?? "");
      const close = noAClose ? -1 : lower.indexOf("</a", gt); // anchor body is visible text: dropped, href judged instead
      if (close === -1) noAClose = true;
      const next = close === -1 ? gt + 1 : src.indexOf(">", close);
      i = close === -1 || next === -1 ? gt + 1 : next + 1;
      out.push(" ");
    } else { out.push(" "); i = gt + 1; }
  }
  return { hrefs, text: out.join("") };
}

const TRAIL = /[.,;:!?)\]}>'"*_]+$/;
function bareUrls(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f]+/gi)) {
    let t = m[0]; const md = t.lastIndexOf("](");
    if (md !== -1) t = t.slice(md + 2);
    found.push(t.replace(TRAIL, ""));
    if (found.length >= MAX_CANDIDATES) break;
  }
  return found;
}

/** Unwrap ONLY https://www.google.com/url?q=<real> (one level); the target must itself be recognised. */
function judge(candidate: string): Rec {
  const direct = recognise(candidate);
  if (direct) return direct;
  let u: URL; try { u = new URL(candidate); } catch { return undefined; }
  if (u.protocol !== "https:" || u.hostname !== "www.google.com" || u.pathname !== "/url" || u.username || u.password || u.port) return undefined;
  const q = u.searchParams.get("q");
  return q ? recognise(q) : undefined;
}

/** Candidate URLs (anchor hrefs first, then bare URLs) of a free-text field; same bounds as scan(). Pure. */
export function candidateUrls(field: unknown): string[] {
  if (typeof field !== "string" || !field) return [];
  const { hrefs, text } = splitHtml(field.slice(0, MAX_SCAN_CHARS));
  return [...hrefs.slice(0, MAX_CANDIDATES).map(h => decodeEntities(h).trim()), ...bareUrls(decodeEntities(text))].slice(0, MAX_CANDIDATES);
}

function scan(field: unknown): { joins: Join[]; regs: string[]; hosts: string[]; platforms: Set<string> } {
  const res = { joins: [] as Join[], regs: [] as string[], hosts: [] as string[], platforms: new Set<string>() };
  if (typeof field !== "string" || !field) return res;
  const { hrefs, text } = splitHtml(field.slice(0, MAX_SCAN_CHARS));
  const cands = [...hrefs.slice(0, MAX_CANDIDATES).map(h => decodeEntities(h).trim()), ...bareUrls(decodeEntities(text))].slice(0, MAX_CANDIDATES);
  for (const c of cands) {
    const r = judge(c);
    if (!r) continue;
    res.platforms.add(r.platform);
    if (r.kind === "registration") res.regs.push(r.platform);
    else if (r.kind === "host-start") res.hosts.push(r.platform);
    else {
      const prev = res.joins.find(j => j.id === r.id);
      if (!prev) res.joins.push({ ...r });
      else if (r.pass) { // keep the passcode-bearing variant; two different passcodes for one meeting are ambiguous
        if (prev.pass && prev.pass !== r.pass) prev.conflict = true;
        else if (!prev.pass) { prev.url = r.url; prev.pass = r.pass; }
      }
    }
  }
  return res;
}

export function resolveEventMeetingLink(ev: EventLinkInput): EventLinkResult {
  if (ev.conferenceUrl !== undefined && ev.conferenceUrl !== "") return { url: ev.conferenceUrl, source: "conference" };
  const loc = scan(ev.location), desc = scan(ev.description);
  const pick = (j: Join, source: "location" | "description"): EventLinkResult => j.conflict ? { issue: "ambiguous" } : { url: j.url, source };
  if (loc.joins.length === 1) return pick(loc.joins[0]!, "location");
  if (loc.joins.length > 1) return { issue: "ambiguous" };
  if (desc.joins.length === 1) return pick(desc.joins[0]!, "description");
  if (desc.joins.length > 1) {
    const same = desc.joins.filter(j => loc.platforms.has(j.platform));
    return same.length === 1 ? pick(same[0]!, "description") : { issue: "ambiguous" };
  }
  if (loc.hosts.length + desc.hosts.length > 0) return { issue: "host-start-link" };
  return loc.regs.length + desc.regs.length > 0 ? { issue: "registration-only" } : {};
}
