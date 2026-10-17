/**
 * apps/api/src/source-intake/adapters.ts — T-045 composition of the ordered adapter registry for `POST /ingest/source`.
 * Real wiring points: yt-dlp via `defaultYoutubeExec` (binary from LKB_YT_DLP_PATH), sha256 hashing, `fs` reads, and the
 * generic URL adapter over Jina Reader. STT is composed only from trusted explicit configuration in wiring.ts.
 * Hosted acquisition handles a single embedded OnAir video and Zoom's specific extractor; protected/dynamic pages
 * remain refused without their authorized session. Configured capability is never a live-source receipt.
 */
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcribe } from "@lkb/ai";
import {
  buildSourceRegistry, createDocumentSource, createOnairSource, createRecordingSource, createUrlSource,
  createYoutubeSource, createZoomRecordingSource, isBlockedAddress, resolveAll, resolveFfmpegLocation, isInsideDir,
  resolveYtDlpCommand,
  type HostedRecordingDownloader, type Source, type YoutubeExec,
} from "@lkb/ingest";
import { sha256Hex } from "../hash.js";
import { boundedMediaExec } from "../../../../packages/ingest/src/source-acquisition/exec.js";
import { createHostedAcquisition } from "../../../../packages/ingest/src/source-acquisition/hosted.js";
import { createMediaDurationProbe } from "../../../../packages/ingest/src/source-acquisition/duration.js";
import { createSourceReader } from "./source-reader.js";

export interface SourceIntakeAdapterOptions {
  transcribe: Transcribe;
  downloader?: HostedRecordingDownloader;
  /** Absolute scratch directory the media adapters write into. Default: <os tmp>/lkb-source-intake. */
  workDir?: string;
  env?: Record<string, string | undefined>;
  /** Seams for tests. */
  exec?: YoutubeExec;
  urlFetcher?: (url: string) => Promise<string>;
  /** DNS seam (default: every address the system resolver returns). Used by the SSRF guard on the url adapter. */
  lookup?: (hostname: string) => Promise<string[]>;
  reader?: (path: string) => Promise<Uint8Array>;
  durationProbe?: (path: string) => Promise<number>;
}

/**
 * ISS-W045-001: refuse a target that is not a public http(s) host BEFORE anything is forwarded (to Jina or any swapped
 * fetcher). Same address judge as watched sources (`isBlockedAddress`), applied to EVERY resolved address; fails closed
 * on a lookup error or an empty answer. Redirects: the fetch happens on Jina's side, which we cannot observe; the Jina
 * call itself uses redirect "manual" so a redirect from Jina is an error, never followed here.
 */
export function guardUrlFetcher(
  inner: (url: string) => Promise<string>,
  lookup: (hostname: string) => Promise<string[]> = resolveAll,
): (url: string) => Promise<string> {
  return async (url: string) => {
    let u: URL;
    try { u = new URL(url); } catch { throw new Error("url-blocked: not a valid URL"); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("url-blocked: only http(s) URLs are allowed");
    if (u.username || u.password) throw new Error("url-blocked: URLs with credentials are not allowed");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    if (/^[0-9.]+$/.test(host) || host.includes(":")) addresses = [host]; // literal IP: judge it directly
    else {
      try { addresses = await lookup(host); } catch { throw new Error("url-blocked: host could not be resolved"); }
    }
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a))) {
      throw new Error("url-blocked: host resolves to a private or reserved address");
    }
    return inner(url);
  };
}

const bytesHash = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export function buildSourceIntakeAdapters(opts: SourceIntakeAdapterOptions): Source[] {
  const env = opts.env ?? process.env;
  const workDir = opts.workDir ?? join(tmpdir(), "lkb-source-intake");
  const reader = opts.reader ?? (async (p: string) => {
    const stat = await lstat(p);
    const root = await realpath(workDir);
    const actual = await realpath(p);
    if (!stat.isFile() || stat.isSymbolicLink() || !isInsideDir(root, actual) || stat.size > 128 * 1024 * 1024) {
      throw new Error("source media file refused");
    }
    return new Uint8Array(await readFile(actual));
  });
  const media = { workDir, hasher: bytesHash, reader, transcribe: opts.transcribe,
    durationProbe: opts.durationProbe ?? (opts.exec || opts.reader ? undefined : createMediaDurationProbe(env)),
    downloader: opts.downloader ?? (env.LKB_HOSTED_SOURCE_ACQUISITION === "1" ? createHostedAcquisition({ env, exec: opts.exec }) : undefined) };
  return buildSourceRegistry({
    recording: createRecordingSource({ hasher: bytesHash, reader, transcribe: opts.transcribe }),
    document: createDocumentSource({ hasher: sha256Hex, reader: async (p) => readFile(p, "utf8") }),
    youtube: createYoutubeSource({
      workDir, exec: opts.exec ?? boundedMediaExec, hasher: bytesHash, reader, transcribe: opts.transcribe,
      ytDlpCommand: resolveYtDlpCommand(env), ffmpegLocation: resolveFfmpegLocation(env),
      durationProbe: media.durationProbe,
      allocateWorkDir: opts.exec || opts.reader ? undefined : async () => {
        await mkdir(workDir, { recursive: true });
        const root = await realpath(workDir);
        if ((await lstat(workDir)).isSymbolicLink()) throw new Error("source media directory refused");
        return mkdtemp(join(root, "youtube-"));
      },
    }),
    onair: createOnairSource(media),
    zoomRecording: createZoomRecordingSource(media),
    url: createUrlSource({ hasher: sha256Hex, fetcher: guardUrlFetcher(opts.urlFetcher ?? createSourceReader({ apiKey: env.JINA_API_KEY }), opts.lookup) }),
  });
}
