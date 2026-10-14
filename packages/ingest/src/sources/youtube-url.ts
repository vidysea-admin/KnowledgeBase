/**
 * packages/ingest/src/sources/youtube-url.ts — typed error + strict video-id validation for the
 * YouTube adapter (split from youtube.ts, pure refactor). Re-exported from youtube.ts.
 */

export type YoutubeErrorCode =
  | "invalid-url"
  | "consent-refused"
  | "exec-failed"
  | "binary-missing"
  | "bad-config"
  | "non-zero-exit"
  | "timeout"
  | "no-output"
  | "path-escape"
  | "empty-output";

export class YoutubeSourceError extends Error {
  readonly code: YoutubeErrorCode;
  constructor(code: YoutubeErrorCode, message: string) {
    super(`youtube adapter [${code}]: ${message}`);
    this.name = "YoutubeSourceError";
    this.code = code;
  }
}

const MAX_INPUT_LENGTH = 200;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const PATH_KINDS = new Set(["live", "shorts"]);

/** Returns the validated 11-char video id, or undefined. Never throws. */
export function extractYoutubeVideoId(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_INPUT_LENGTH) return undefined;
  // no whitespace/control chars/backslashes anywhere, no surrounding space
  if (/[\u0000- \u007f\\]/.test(input)) return undefined;
  // raw authority check: no userinfo ('@') and no explicit port in the user's own text
  const authority = /^https:\/\/([^/?#]*)/i.exec(input)?.[1];
  if (authority === undefined || authority.includes("@") || authority.includes(":")) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return undefined;
  if (!HOSTS.has(url.hostname)) return undefined;

  let id: string | undefined;
  const parts = url.pathname.split("/"); // ["", ...]
  if (url.hostname === "youtu.be") {
    if (parts.length === 2) id = parts[1];
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v") ?? undefined;
  } else if (parts.length === 3 && PATH_KINDS.has(parts[1]!)) {
    id = parts[2];
  }
  return id !== undefined && VIDEO_ID.test(id) ? id : undefined;
}

/** The only URL ever passed onward: rebuilt from a validated id. */
export function canonicalYoutubeUrl(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new YoutubeSourceError("invalid-url", "not a valid video id");
  return `https://www.youtube.com/watch?v=${videoId}`;
}
