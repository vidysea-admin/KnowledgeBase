/**
 * packages/ingest/src/sources/youtube.ts — T-045 (YouTube half). A `Source` adapter for public
 * YouTube videos via yt-dlp (audio only). Three guarantees:
 *  1. Only a strictly validated video id survives; the URL handed to yt-dlp is REBUILT from it.
 *  2. yt-dlp runs through an injected `YoutubeExec` seam with an argv ARRAY (no shell); the only
 *     user-derived value is the rebuilt URL, placed after a `--` end-of-options marker.
 *  3. Fail closed: any exec/exit/path/output problem is a typed `YoutubeSourceError`; no partial doc.
 * Audio is handed to the injected T-019 STT seam (`Transcribe`), same as `recording.ts`.
 * H8 / D-008: see `assertYoutubeConsent`. `defaultYoutubeExec` is the only place a process is
 * spawned; tests never call it.
 */
import { spawn } from "node:child_process";
import { posix, win32 } from "node:path";
import type { Transcribe } from "@lkb/ai";
import type { Source, SourceDoc, MediaDoc, ConsentContext, Turn } from "../source.js";
import type { RecordingHasher, RecordingReader } from "./recording.js";

export type YoutubeErrorCode =
  | "invalid-url"
  | "consent-refused"
  | "exec-failed"
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

function flavourFor(dir: string): typeof posix | typeof win32 {
  return /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith("\\\\") ? win32 : posix;
}

/** yt-dlp argument vector (for spawn, no shell). `workDir` is the caller's absolute directory. */
export function buildYtDlpArgs(videoId: string, workDir: string): string[] {
  const url = canonicalYoutubeUrl(videoId);
  const out = flavourFor(workDir).join(workDir, `yt-${videoId}.%(ext)s`);
  return [
    "--ignore-config",
    "--no-playlist",
    "--no-progress",
    "-x",
    "--audio-format",
    "m4a",
    "--no-simulate",
    "--print",
    "after_move:filepath",
    "-o",
    out,
    "--",
    url,
  ];
}

export interface YoutubeExecResult {
  exitCode: number | null;
  stdout: string;
  stderr?: string;
  timedOut?: boolean;
}
export interface YoutubeExecOpts {
  cwd: string;
  timeoutMs: number;
}
export type YoutubeExec = (cmd: string, args: string[], opts: YoutubeExecOpts) => Promise<YoutubeExecResult>;

/** The only spawn in this file: no shell, argv array, kill on timeout. Never called by tests. */
export const defaultYoutubeExec: YoutubeExec = (cmd, args, opts) =>
  new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ exitCode: code, stdout, stderr, timedOut });
    });
  });

/**
 * H8 (ARCHITECTURE.md:46): "capture order is organizer-provided recording → public recording →
 * attendee notes/live transcript → silent capture ONLY when no alternative exists." A YouTube
 * video is a public recording, so only `captureMode` 'provided' or 'public' with `given: true`
 * and a non-empty `recordedBy` is accepted; 'notes' and 'silent' are refused.
 */
export function assertYoutubeConsent(consent: ConsentContext): void {
  const ok =
    !!consent &&
    consent.given === true &&
    (consent.captureMode === "provided" || consent.captureMode === "public") &&
    typeof consent.recordedBy === "string" &&
    consent.recordedBy.length > 0;
  if (!ok) {
    throw new YoutubeSourceError(
      "consent-refused",
      "requires consent.given === true, recordedBy, and captureMode 'provided' or 'public' (H8 provided-first)",
    );
  }
}

/** True when `candidate` is strictly inside `dir` (no `..` escape, same drive). */
export function isInsideDir(dir: string, candidate: string): boolean {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0")) return false;
  const f = flavourFor(dir);
  if (!f.isAbsolute(candidate) || !f.isAbsolute(dir)) return false;
  const rel = f.relative(f.resolve(dir), f.resolve(candidate));
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + f.sep) && !f.isAbsolute(rel);
}

export interface YoutubeAdapterDeps {
  /** Caller's working directory (absolute); all output must land inside it. */
  workDir: string;
  exec: YoutubeExec;
  hasher: RecordingHasher;
  reader: RecordingReader;
  transcribe: Transcribe;
  now?: () => string;
  ytDlpCommand?: string;
  timeoutMs?: number;
}

export interface YoutubeInput {
  url: string;
  tenantId: string;
}

function parseInput(input: unknown): { videoId: string; tenantId: string } | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { url, tenantId } = input as Record<string, unknown>;
  const videoId = extractYoutubeVideoId(url);
  if (!videoId || typeof tenantId !== "string" || tenantId.length === 0) return undefined;
  return { videoId, tenantId };
}

/** Creates the `youtube` `Source` adapter. Not registered anywhere (T-045 unit scope). */
export function createYoutubeSource(deps: YoutubeAdapterDeps): Source {
  const now = deps.now ?? (() => new Date().toISOString());
  const timeoutMs = deps.timeoutMs ?? 600_000;
  if (!flavourFor(deps.workDir).isAbsolute(deps.workDir)) {
    throw new YoutubeSourceError("path-escape", "workDir must be an absolute path");
  }

  return {
    name: "youtube",

    detect(input: unknown): boolean {
      if (typeof input === "string") return extractYoutubeVideoId(input) !== undefined;
      return (
        typeof input === "object" &&
        input !== null &&
        extractYoutubeVideoId((input as { url?: unknown }).url) !== undefined
      );
    },

    async fetch(input: unknown, consent: ConsentContext): Promise<{ source: SourceDoc; media: MediaDoc[] }> {
      assertYoutubeConsent(consent);
      const parsed = parseInput(input);
      if (!parsed) {
        throw new YoutubeSourceError("invalid-url", "input must be { url, tenantId } with a valid YouTube URL");
      }
      const { videoId, tenantId } = parsed;
      const canonicalUrl = canonicalYoutubeUrl(videoId);
      const args = buildYtDlpArgs(videoId, deps.workDir);

      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: YoutubeExecResult;
      try {
        result = await Promise.race([
          deps.exec(deps.ytDlpCommand ?? "yt-dlp", args, { cwd: deps.workDir, timeoutMs }),
          new Promise<never>((_, rej) => {
            timer = setTimeout(
              () => rej(new YoutubeSourceError("timeout", `no result within ${timeoutMs}ms`)),
              timeoutMs + 1000,
            );
          }),
        ]);
      } catch (e) {
        if (e instanceof YoutubeSourceError) throw e;
        throw new YoutubeSourceError("exec-failed", e instanceof Error ? e.message : String(e));
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (result.timedOut) throw new YoutubeSourceError("timeout", `yt-dlp exceeded ${timeoutMs}ms`);
      if (result.exitCode !== 0) {
        throw new YoutubeSourceError("non-zero-exit", `exit code ${String(result.exitCode)}`);
      }
      const lines = String(result.stdout ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const audioPath = lines[lines.length - 1];
      if (!audioPath) throw new YoutubeSourceError("no-output", "yt-dlp reported no audio file path");
      if (!isInsideDir(deps.workDir, audioPath)) {
        throw new YoutubeSourceError("path-escape", "reported audio path is outside workDir");
      }

      let bytes: Uint8Array;
      try {
        bytes = await deps.reader(audioPath);
      } catch (e) {
        throw new YoutubeSourceError("no-output", e instanceof Error ? e.message : String(e));
      }
      if (!bytes || bytes.byteLength === 0) throw new YoutubeSourceError("empty-output", "audio file is empty");
      const hash = await deps.hasher(bytes);
      const retrievedAt = now();

      const source = {
        _id: hash,
        tenantId,
        kind: "url",
        captureMode: consent.captureMode,
        path: audioPath,
        url: canonicalUrl,
        hash,
        consent: { given: consent.given, recordedBy: consent.recordedBy, note: consent.note },
        createdAt: retrievedAt,
        // citation metadata (the sources schema allows additional properties)
        sourceMeta: { platform: "youtube", videoId, canonicalUrl, retrievedAt },
      } as SourceDoc;
      const media = [
        {
          _id: `${hash}-media`,
          tenantId,
          sourceRef: hash,
          kind: "audio",
          path: audioPath,
          retention: { purgeAfterVerified: false },
        },
      ] as MediaDoc[];
      return { source, media };
    },

    async toTurns(source: SourceDoc): Promise<Turn[]> {
      if (!source.path || !isInsideDir(deps.workDir, source.path)) {
        throw new YoutubeSourceError("path-escape", "toTurns requires source.path inside workDir");
      }
      const bytes = await deps.reader(source.path);
      if (bytes.byteLength === 0) throw new YoutubeSourceError("empty-output", "audio file is empty");
      return deps.transcribe(bytes, {});
    },
  };
}
