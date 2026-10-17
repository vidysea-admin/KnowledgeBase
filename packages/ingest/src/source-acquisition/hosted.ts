import { mkdtemp, mkdir, realpath, lstat, rm } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import type { HostedRecordingDownloader, HostedDownloadRequest } from "../sources/hosted-recording.js";
import { parseOnairUrl } from "../sources/onair.js";
import { parseZoomRecordingUrl } from "../sources/zoom-recording.js";
import { isInsideDir, resolveYtDlpCommand, resolveFfmpegLocation, type YoutubeExec } from "../sources/youtube.js";
import { boundedMediaExec } from "./exec.js";
import { onairEmbeddedYoutube, publicOnairPage } from "./onair.js";

export interface HostedAcquisitionOptions {
  env?: Record<string, string | undefined>;
  exec?: YoutubeExec;
  /** Authorized OnAir session implementation; a dynamic/login-only page must refuse, never scrape arbitrary links. */
  onairPage?: (canonicalUrl: string) => Promise<string>;
}

function assertHostedRequest(req: HostedDownloadRequest): void {
  const parsed = req.platform === "cloudonair" ? parseOnairUrl(req.canonicalUrl)
    : req.platform === "zoom-recording" ? parseZoomRecordingUrl(req.canonicalUrl) : undefined;
  const id = parsed?.ok ? ("eventId" in parsed ? parsed.eventId : parsed.recordingId) : undefined;
  if (!parsed?.ok || parsed.canonicalUrl !== req.canonicalUrl || id !== req.id || !isAbsolute(req.workDir)) {
    throw new Error("hosted acquisition request refused");
  }
}

/** Real media acquisition. Session/dynamic OnAir support remains contingent on an actual authorized event run. */
export function createHostedAcquisition(options: HostedAcquisitionOptions = {}): HostedRecordingDownloader {
  const env = options.env ?? process.env;
  const command = resolveYtDlpCommand(env);
  const ffmpeg = resolveFfmpegLocation(env);
  const execute = options.exec ?? boundedMediaExec;
  const page = options.onairPage ?? publicOnairPage(env.LKB_ONAIR_COOKIE_HEADER);
  return async (req) => {
    assertHostedRequest(req);
    await mkdir(req.workDir, { recursive: true });
    const root = await realpath(req.workDir);
    if ((await lstat(req.workDir)).isSymbolicLink()) throw new Error("hosted acquisition directory refused");
    const directory = await mkdtemp(join(root, "hosted-"));
    try {
      const url = req.platform === "cloudonair" ? onairEmbeddedYoutube(await page(req.canonicalUrl)) : req.canonicalUrl;
      // OnAir forwards only the validated embedded YouTube id; Zoom never falls through to the generic extractor.
      const extractor = req.platform === "cloudonair" ? "Youtube" : "Zoom";
      const args = ["--ignore-config", "--no-plugin-dirs", "--use-extractors", extractor,
        "--no-playlist", "--no-progress", "--socket-timeout", "20", "--retries", "1", "--fragment-retries", "1",
        "--max-filesize", "128M", "-x", "--audio-format", "m4a", "--no-simulate", "--print", "after_move:filepath",
        ...(ffmpeg ? ["--ffmpeg-location", ffmpeg] : []), "-o", join(directory, "recording.%(ext)s"), "--", url];
      const result = await execute(command, args, { cwd: directory, timeoutMs: 600_000 });
      if (result.exitCode !== 0 || result.timedOut || result.stdout.length > 65_536) throw new Error("hosted media download failed");
      const reported = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
      if (!reported || !isInsideDir(directory, reported)) throw new Error("hosted media output refused");
      const file = await lstat(reported);
      const actual = await realpath(reported);
      if (!file.isFile() || file.isSymbolicLink() || !isInsideDir(directory, actual) || file.size <= 0 || file.size > 128 * 1024 * 1024) {
        throw new Error("hosted media output refused");
      }
      return { path: actual };
    } catch {
      // Exact freshly-created child directory; never recursively delete a caller-controlled path.
      if (isInsideDir(root, directory)) await rm(directory, { recursive: true, force: true });
      throw new Error("hosted recording acquisition failed");
    }
  };
}
