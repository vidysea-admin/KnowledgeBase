// Real binary/local playable-media readiness, explicitly synthetic. Never a real YouTube/source receipt.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";

const execute = (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 15_000, maxBuffer: 65_536, windowsHide: true, shell: false });
const version = execute(process.env.LKB_YT_DLP_PATH ?? "/usr/local/bin/yt-dlp", ["--no-update", "--version"]).trim();
assert.equal(version, "2026.08.19");
const ffmpeg = process.env.LKB_FFMPEG_PATH ?? "/usr/bin/ffmpeg";
const ffprobe = process.env.LKB_FFPROBE_PATH ?? "/usr/bin/ffprobe";
const directory = mkdtempSync(join(tmpdir(), "lkb-ci-media-"));
try {
  const file = join(directory, "synthetic.m4a");
  execute(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", file]);
  assert.ok(statSync(file).size > 0);
  const metadata = JSON.parse(execute(ffprobe, ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration", "-of", "json", "-i", file]));
  const duration = Number(metadata.format?.duration);
  assert.ok(duration >= 0.9 && duration <= 1.2);
  console.log(JSON.stringify({ scope: "native binary and synthetic local media readiness only", ytDlpVersion: version,
    ffmpegVersion: execute(ffmpeg, ["-version"]).split("\n")[0], ffprobeVersion: execute(ffprobe, ["-version"]).split("\n")[0], durationSeconds: duration,
    realSourceAcquisition: false, providerCalls: false }));
} finally {
  const confined = relative(tmpdir(), directory);
  if (!confined || confined.startsWith("..") || isAbsolute(confined) || !directory.split(/[\\/]/).at(-1)?.startsWith("lkb-ci-media-")) throw new Error("native fixture cleanup refused");
  rmSync(directory, { recursive: true, force: true });
}
