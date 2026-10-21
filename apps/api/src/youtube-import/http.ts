/**
 * apps/api/src/youtube-import/http.ts — the one HTTP seam for the owner-captions import. Only Google's official
 * OAuth and YouTube Data API v3 hosts are reachable: no timedtext, innertube, youtube.com page or media host, so a
 * scraping route cannot be added by accident. Tests inject a fake `Http`; nothing here runs in tests.
 */
export interface HttpRequest { url: string; method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }
export interface HttpResponse { status: number; body: string }
export type Http = (req: HttpRequest) => Promise<HttpResponse>;

export const OFFICIAL_HOSTS: readonly string[] = ["www.googleapis.com", "oauth2.googleapis.com"];

export function assertOfficialUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:" || !OFFICIAL_HOSTS.includes(u.hostname)) throw new Error(`youtube-import: host ${u.hostname} is not an official Google API host`);
  if (u.hostname === "www.googleapis.com" && !u.pathname.startsWith("/youtube/v3/")) throw new Error("youtube-import: only YouTube Data API v3 paths are allowed");
  return u;
}

export const fetchHttp: Http = async (req) => {
  const url = assertOfficialUrl(req.url);
  const res = await fetch(url, { method: req.method ?? "GET", headers: req.headers, body: req.body });
  return { status: res.status, body: await res.text() };
};
