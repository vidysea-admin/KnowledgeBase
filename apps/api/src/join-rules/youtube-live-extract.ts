/**
 * apps/api/src/join-rules/youtube-live-extract.ts - T-036 slice: YouTube Live WATCH-link discovery from a Calendar
 * event's location/description. A YouTube link is something to watch/capture, never a meeting a bot can join, so it is
 * returned in its OWN result and never as `url` of resolveEventMeetingLink (nothing can auto-join it).
 * Flag: `opts.enabled` must be exactly true; otherwise the result is {} (output identical to before the slice).
 * Accepted: https only, no userinfo/port, exact hosts youtube.com / www. / m. / youtu.be; shapes
 * /live/<id>, /watch?v=<id>, youtu.be/<id>; id = 11 chars [A-Za-z0-9_-], case preserved. Playlists-only, channel pages,
 * embedded-redirect links and anything else are refused. Distinct ids: one -> it, several -> issue "ambiguous".
 * Location is judged first; description only when location holds none.
 * Output URL is canonical (https://www.youtube.com/watch?v=<id>): tracking params (si, t, feature) are dropped.
 */
import { candidateUrls } from "./calendar-link-extract.js";

export interface YoutubeLiveResult { watch?: { url: string; videoId: string; source: "location" | "description" }; issue?: "ambiguous" }
const ID = /^[A-Za-z0-9_-]{11}$/;
const REDIRECT_KEY = /^(redirect|redirect_?uri|redirect_?url|return|return_?url|return_?to|next|continue|url|goto|dest|destination|target|callback)$/i;

export function youtubeVideoId(raw: string): string | undefined {
  if (raw.length > 2048 || /[\u0000- \u007f\\]/.test(raw)) return undefined;
  let u: URL;
  try { u = new URL(raw); } catch { return undefined; }
  if (u.protocol !== "https:" || !/^https:\/\//i.test(raw) || u.username || u.password || u.port || /^https:\/\/[^/?#]*@/i.test(raw)) return undefined;
  for (const [k] of u.searchParams) if (REDIRECT_KEY.test(k)) return undefined;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, "");
  let id: string | undefined;
  if (host === "youtu.be") id = /^\/([^/]+)$/.exec(path)?.[1];
  else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (path === "/watch") { const vs = u.searchParams.getAll("v"); id = vs.length === 1 ? vs[0] : undefined; }
    else id = /^\/live\/([^/]+)$/.exec(path)?.[1];
  }
  return id && ID.test(id) ? id : undefined;
}

function scanField(field: unknown): string[] {
  const ids: string[] = [];
  for (const c of candidateUrls(field)) { const id = youtubeVideoId(c); if (id && !ids.includes(id)) ids.push(id); }
  return ids;
}

export function resolveYoutubeLive(ev: { location?: unknown; description?: unknown }, opts: { enabled?: boolean } = {}): YoutubeLiveResult {
  if (opts.enabled !== true) return {};
  const loc = scanField(ev.location);
  const [ids, source] = loc.length ? [loc, "location" as const] : [scanField(ev.description), "description" as const];
  if (ids.length === 0) return {};
  if (ids.length > 1) return { issue: "ambiguous" };
  return { watch: { url: `https://www.youtube.com/watch?v=${ids[0]}`, videoId: ids[0]!, source } };
}
