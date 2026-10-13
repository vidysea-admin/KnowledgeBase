/**
 * apps/api/src/source-intake/adapters.ts — T-045 composition of the ordered adapter registry for `POST /ingest/source`.
 * Real wiring points: yt-dlp via `defaultYoutubeExec` (binary from LKB_YT_DLP_PATH), sha256 hashing, `fs` reads, and the
 * generic URL adapter over Jina Reader. Two things are NOT shipped and stay injected:
 *  - `transcribe` (the STT provider/credentials are an owner decision; no provider is composed in apps/api);
 *  - `downloader` for Cloud OnAir / Zoom (OnAir needs a one-time Google login, Zoom links may carry a passcode).
 * Without `downloader` those two adapters fail closed with `downloader-unavailable`.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcribe } from "@lkb/ai";
import {
  buildSourceRegistry, createDocumentSource, createOnairSource, createRecordingSource, createUrlSource,
  createYoutubeSource, createZoomRecordingSource, defaultYoutubeExec, resolveFfmpegLocation, resolveYtDlpCommand,
  type HostedRecordingDownloader, type Source, type YoutubeExec,
} from "@lkb/ingest";
import { sha256Hex } from "../hash.js";

export interface SourceIntakeAdapterOptions {
  transcribe: Transcribe;
  downloader?: HostedRecordingDownloader;
  /** Absolute scratch directory the media adapters write into. Default: <os tmp>/lkb-source-intake. */
  workDir?: string;
  env?: Record<string, string | undefined>;
  /** Seams for tests. */
  exec?: YoutubeExec;
  urlFetcher?: (url: string) => Promise<string>;
  reader?: (path: string) => Promise<Uint8Array>;
}

async function jinaReaderFetch(url: string): Promise<string> {
  const apiKey = process.env.JINA_API_KEY;
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok) throw new Error(`Jina Reader could not fetch this URL (HTTP ${res.status})`);
  return res.text();
}

const bytesHash = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export function buildSourceIntakeAdapters(opts: SourceIntakeAdapterOptions): Source[] {
  const env = opts.env ?? process.env;
  const workDir = opts.workDir ?? join(tmpdir(), "lkb-source-intake");
  const reader = opts.reader ?? (async (p: string) => new Uint8Array(await readFile(p)));
  const media = { workDir, hasher: bytesHash, reader, transcribe: opts.transcribe, downloader: opts.downloader };
  return buildSourceRegistry({
    recording: createRecordingSource({ hasher: bytesHash, reader, transcribe: opts.transcribe }),
    document: createDocumentSource({ hasher: sha256Hex, reader: async (p) => readFile(p, "utf8") }),
    youtube: createYoutubeSource({
      workDir, exec: opts.exec ?? defaultYoutubeExec, hasher: bytesHash, reader, transcribe: opts.transcribe,
      ytDlpCommand: resolveYtDlpCommand(env), ffmpegLocation: resolveFfmpegLocation(env),
    }),
    onair: createOnairSource(media),
    zoomRecording: createZoomRecordingSource(media),
    url: createUrlSource({ hasher: sha256Hex, fetcher: opts.urlFetcher ?? jinaReaderFetch }),
  });
}
