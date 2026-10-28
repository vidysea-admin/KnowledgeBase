import { createGuardedFetcher } from "../sources/guarded-fetch.js";
import { httpRequest, resolveAll } from "../sources/node-transport.js";
import { parseOnairUrl } from "../sources/onair.js";
import { canonicalYoutubeUrl } from "../sources/youtube.js";
import { request } from "node:https";

function iframeSource(tag: string): string | undefined {
  let tail = tag.slice(7, -1);
  let source: string | undefined;
  while (tail.trim() !== "" && tail.trim() !== "/") {
    const attribute = /^\s+([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(tail);
    if (!attribute) return undefined;
    tail = tail.slice(attribute[0].length);
    if (attribute[1]!.toLowerCase() === "src") {
      if (source !== undefined || (attribute[2] === undefined && attribute[3] === undefined)) return undefined;
      source = attribute[2] ?? attribute[3];
    }
  }
  return source;
}

function recordingFrames(html: string): string[] {
  const frames: string[] = [];
  let cursor = 0, templates = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      cursor = end < 0 ? html.length : end + 3; continue;
    }
    const token = /^<(?:"[^"]*"|'[^']*'|[^'">])*>/.exec(html.slice(start));
    if (!token) break; // malformed/incomplete markup does not authorize a source
    const tag = token[0];
    cursor = start + tag.length;
    const name = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)(?=[\s/>])/.exec(tag);
    if (!name) continue;
    const kind = name[2]!.toLowerCase();
    if (name[1]) { if (kind === "template") templates = Math.max(0, templates - 1); continue; }
    if (kind === "template") { templates++; continue; }
    if (kind === "iframe" && templates === 0) frames.push(tag);
    if (kind === "plaintext") break;
    if (["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"].includes(kind)) {
      const closing = new RegExp(`</${kind}\\s*>`, "gi");
      closing.lastIndex = cursor;
      const end = closing.exec(html);
      cursor = end ? end.index + end[0].length : html.length;
    }
  }
  return frames;
}

/** Only explicit embedded video URLs qualify; arbitrary page links never become recordings. */
export function onairEmbeddedYoutube(html: string): string {
  // Consume complete tags and quoted attributes; comments, raw text and inert templates never qualify.
  const ids = [...new Set(recordingFrames(html).flatMap((tag) => {
    const url = iframeSource(tag);
    const match = url && /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/.exec(url);
    return match ? [match[1]!] : [];
  }))];
  if (ids.length !== 1) throw new Error("OnAir requires one unambiguous embedded recording");
  return canonicalYoutubeUrl(ids[0]!);
}

/** Native public-page acquisition. Protected/dynamic events require a supplied authorized session resolver. */
export function publicOnairPage(cookieHeader?: string) {
  if (cookieHeader !== undefined && (!cookieHeader.trim() || /[\r\n\u0000]/.test(cookieHeader) || cookieHeader.length > 16_384)) {
    throw new Error("OnAir session configuration refused");
  }
  const send = cookieHeader === undefined ? httpRequest : onairSessionRequest(cookieHeader);
  const guarded = createGuardedFetcher({ lookup: (host) => resolveAll(host, { timeoutMs: 30_000 }), request: async (url, options) => {
    const result = await send(url, options);
    if (result.status !== 200) throw new Error("OnAir recording unavailable");
    return result;
  }, maxBytes: 2_000_000, timeoutMs: 30_000, maxRedirects: 0 });
  return async (canonicalUrl: string): Promise<string> => {
    const parsed = parseOnairUrl(canonicalUrl);
    if (!parsed.ok || parsed.canonicalUrl !== canonicalUrl) throw new Error("OnAir endpoint refused");
    return guarded(canonicalUrl);
  };
}

/** Session cookies cannot follow a redirect or leave the exact OnAir origin; DNS is pinned. */
function onairSessionRequest(cookie: string) {
  return (value: string, options: { maxBytes: number; timeoutMs: number; address: string }) => new Promise<{
    status: number; location: string | null; body: string;
  }>((resolve, reject) => {
    const target = new URL(value);
    if (target.origin !== "https://cloudonair.withgoogle.com" || target.username || target.password) {
      reject(new Error("OnAir session endpoint refused")); return;
    }
    const req = request(target, {
      headers: { cookie, accept: "text/html" },
      lookup: (_host, opts, callback) => {
        const family = options.address.includes(":") ? 6 : 4;
        const done = callback as unknown as (error: Error | null, address: string | { address: string; family: number }[], family?: number) => void;
        if (opts.all) done(null, [{ address: options.address, family }]);
        else done(null, options.address, family);
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status !== 200) { response.destroy(); reject(new Error("OnAir session recording unavailable")); return; }
      let count = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        count += chunk.length;
        if (count > options.maxBytes) { req.destroy(); response.destroy(); reject(new Error("OnAir response too large")); return; }
        chunks.push(chunk);
      });
      response.once("end", () => resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }));
      response.once("error", () => reject(new Error("OnAir recording request failed")));
    });
    const timer = setTimeout(() => req.destroy(new Error("OnAir request timed out")), options.timeoutMs);
    req.once("error", () => reject(new Error("OnAir recording request failed")));
    req.once("close", () => clearTimeout(timer));
    req.end();
  });
}
