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
import { tenantSourceId, type Source, type SourceDoc, type MediaDoc, type ConsentContext, type Turn } from "../source.js";
import type { RecordingHasher, RecordingReader } from "./recording.js";

import {
  YoutubeSourceError,
  extractYoutubeVideoId,
  canonicalYoutubeUrl,
  type YoutubeErrorCode,
} from "./youtube-url.js";

// public API stays on this module (re-exported for compatibility)
export { YoutubeSourceError, extractYoutubeVideoId, canonicalYoutubeUrl };
export type { YoutubeErrorCode };

function flavourFor(dir: string): typeof posix | typeof win32 {
  return /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith("\\\\") ? win32 : posix;
}

/** Env var naming the yt-dlp binary (repo convention: `LKB_<TOOL>_PATH`, like `LKB_GWS_PATH`). */
export const YT_DLP_ENV = "LKB_YT_DLP_PATH";
/** Env var naming the ffmpeg binary or directory yt-dlp uses for audio extraction. */
const FFMPEG_ENV = "LKB_FFMPEG_PATH";
export { FFMPEG_ENV }; // still public via @lkb/ingest; core/keyframes/ffmpeg-args.ts keeps its own declaration (lint-dupes)

function validBinaryPath(value: string): boolean {
  return value.length > 0 && value.length <= 1024 && value === value.trim() && !value.startsWith("-") && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Pure: the yt-dlp command from an env map (never reads process.env itself). Default `yt-dlp` (PATH lookup). */
export function resolveYtDlpCommand(env: Record<string, string | undefined>): string {
  const v = env[YT_DLP_ENV];
  if (v === undefined || v === "") return "yt-dlp";
  if (!validBinaryPath(v)) throw new YoutubeSourceError("bad-config", `${YT_DLP_ENV} is not a usable path`);
  return v;
}

/** Pure: optional ffmpeg location from an env map; undefined means "let yt-dlp find ffmpeg on PATH". */
export function resolveFfmpegLocation(env: Record<string, string | undefined>): string | undefined {
  const v = env[FFMPEG_ENV];
  if (v === undefined || v === "") return undefined;
  if (!validBinaryPath(v) || !(posix.isAbsolute(v) || win32.isAbsolute(v))) {
    throw new YoutubeSourceError("bad-config", `${FFMPEG_ENV} must be an absolute path`);
  }
  return v;
}

/** yt-dlp argument vector (for spawn, no shell). `workDir` is the caller's absolute directory. */
export function buildYtDlpArgs(videoId: string, workDir: string, opts: { ffmpegLocation?: string } = {}): string[] {
  const url = canonicalYoutubeUrl(videoId);
  const out = flavourFor(workDir).join(workDir, `yt-${videoId}.%(ext)s`);
  const ffmpeg: string[] = [];
  if (opts.ffmpegLocation !== undefined) {
    const loc = opts.ffmpegLocation;
    if (!validBinaryPath(loc) || !(posix.isAbsolute(loc) || win32.isAbsolute(loc))) {
      throw new YoutubeSourceError("bad-config", "ffmpegLocation must be an absolute path");
    }
    ffmpeg.push("--ffmpeg-location", loc);
  }
  return [
    "--ignore-config",
    ...ffmpeg,
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
  /** Absolute ffmpeg binary/dir passed as `--ffmpeg-location`; see `resolveFfmpegLocation`. */
  ffmpegLocation?: string;
  timeoutMs?: number;
  /** Production allocates a fresh physical scratch directory per request, preventing simultaneous tenant collisions. */
  allocateWorkDir?: () => Promise<string>;
  durationProbe?: (path: string) => Promise<number>;
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
      const workDir = deps.allocateWorkDir ? await deps.allocateWorkDir() : deps.workDir;
      if (workDir !== deps.workDir && !isInsideDir(deps.workDir, workDir)) throw new YoutubeSourceError("path-escape", "scratch path is outside workDir");
      const args = buildYtDlpArgs(videoId, workDir, { ffmpegLocation: deps.ffmpegLocation });
      const command = deps.ytDlpCommand ?? "yt-dlp";
      if (!validBinaryPath(command)) throw new YoutubeSourceError("bad-config", "ytDlpCommand is not a usable path");

      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: YoutubeExecResult;
      try {
        result = await Promise.race([
          deps.exec(command, args, { cwd: workDir, timeoutMs }),
          new Promise<never>((_, rej) => {
            timer = setTimeout(
              () => rej(new YoutubeSourceError("timeout", `no result within ${timeoutMs}ms`)),
              timeoutMs + 1000,
            );
          }),
        ]);
      } catch (e) {
        if (e instanceof YoutubeSourceError) throw e;
        if ((e as { code?: unknown } | null)?.code === "ENOENT") {
          throw new YoutubeSourceError("binary-missing", `yt-dlp binary not found (command "${command}"); set ${YT_DLP_ENV} or install yt-dlp`);
        }
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
      if (!isInsideDir(workDir, audioPath)) {
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
      const sourceId = tenantSourceId(tenantId, hash);

      const source = {
        _id: sourceId,
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
          _id: `${sourceId}-media`,
          tenantId,
          sourceRef: sourceId,
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
      const mediaDurationSeconds = deps.durationProbe ? await deps.durationProbe(source.path) : undefined;
      const opts = mediaDurationSeconds === undefined ? {} : { diarize: true, mediaDurationSeconds };
      return deps.transcribe(bytes, opts);
    },
  };
}
