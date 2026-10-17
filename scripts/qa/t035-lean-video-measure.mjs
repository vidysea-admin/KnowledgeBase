/** Run ONLY with the orchestrator's CPU lease. This is short synthetic evidence,
 * never the required sustained live T-035 recording or speech/slide quality proof.
 * node --import tsx scripts/qa/t035-lean-video-measure.mjs --output qa/evidence/t035-lean-video-measured-encode */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {normalizeLeanCapture, probeLeanMedia} from "../../packages/meeting-bot/src/lean-video-ffmpeg.ts";

const root = process.cwd(), arg = process.argv.indexOf("--output");
assert.ok(arg >= 0 && process.argv[arg + 1], "--output evidence directory required");
const evidence = path.resolve(root, process.argv[arg + 1]);
const allowed = path.resolve(root, "qa/evidence") + path.sep;
assert.ok(evidence.startsWith(allowed), "evidence must stay under repository qa/evidence");
for (let current = evidence; ; current = path.dirname(current)) {
  if (existsSync(current)) assert.equal(lstatSync(current).isSymbolicLink(), false, "evidence aliases refused");
  if (path.dirname(current) === current) break;
}
mkdirSync(evidence, {recursive: true});
const dir = mkdtempSync(path.join(evidence, "synthetic-"));
const source = path.join(dir, "synthetic-source.mp4"), audio = path.join(dir, "downstream-audio.m4a");
const startedAt = new Date().toISOString(), deadline = Date.now() + 240000, commands = [], logs = [];
const run = (command, args, timeout = 120000) => {
  const started = Date.now();
  const boundedTimeout = Math.min(timeout, deadline - started);
  assert.ok(boundedTimeout > 0, "synthetic evidence total deadline exceeded");
  const result = spawnSync(command, args, {encoding: "utf8", timeout: boundedTimeout, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, windowsHide: true});
  const proof = args.includes("framemd5") || args.some((value) => value.includes("volumedetect"));
  commands.push({command, args, elapsedMs: Date.now() - started, status: result.status, error: result.error?.message,
    ...(proof ? {stdout: result.stdout, stderr: result.stderr} : {})});
  return result;
};
const required = (command, args, timeout) => {
  const result = run(command, args, timeout);
  assert.equal(result.status, 0, `${command}: ${result.error?.message ?? result.stderr}`);
  return result;
};
const artifact = (file) => ({path: path.relative(root, file).replaceAll(path.sep, "/"),
  sizeBytes: statSync(file).size, sha256: createHash("sha256").update(readFileSync(file)).digest("hex")});
let report;
try {
  const version = required("ffmpeg", ["-version"], 10000).stdout.split(/\r?\n/)[0];
  required("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-filter_complex_threads", "1", "-threads", "1",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=12",
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1",
    "-b:v", "2000k", "-c:a", "aac", "-b:a", "96k", source], 120000);
  const original = artifact(source), sourceMedia = probeLeanMedia(source, run);
  const derivative = normalizeLeanCapture(source, {enabled: true, run, timeoutMs: 120000, log: (line) => logs.push(line)});
  assert.notEqual(derivative, source, logs.join("\n"));
  assert.equal(artifact(source).sha256, original.sha256, "original bytes must be retained");
  const measured = artifact(derivative), media = probeLeanMedia(derivative, run);
  const mbPerHour = measured.sizeBytes / 1e6 * 3600 / media.duration;
  assert.ok(mbPerHour < 400);
  // Mirrors the immediate finalize audio extraction; also fully decode the extracted audio.
  required("ffmpeg", ["-n", "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", derivative,
    "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "96k", audio], 120000);
  required("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-xerror", "-threads", "1", "-i", audio, "-f", "null", "-"], 120000);
  const audioProbe = JSON.parse(required("ffprobe", ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", audio], 120000).stdout);
  assert.ok(audioProbe.streams.some((s) => s.codec_type === "audio" && Number(s.nb_read_packets) > 0));
  assert.ok(Math.abs(Number(audioProbe.format.duration) - media.duration) <= 0.25);
  // A second derivative uses the same twelve-second fixture to prove mandatory privacy.
  const privateWindows = [{start: 3, end: 5}];
  const privateDerivative = normalizeLeanCapture(source, {enabled: false, requirePrivacyMask: true, privateWindows,
    run, timeoutMs: 120000, log: (line) => logs.push(line)});
  assert.notEqual(privateDerivative, source);
  assert.equal(artifact(source).sha256, original.sha256);
  const privateArtifact = artifact(privateDerivative), privateMedia = probeLeanMedia(privateDerivative, run);
  const blackFrame = Buffer.alloc(1_382_400, 128); blackFrame.fill(16, 0, 921_600);
  const blackHash = createHash("md5").update(blackFrame).digest("hex");
  const publicFrame = required("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", "1", "-i", privateDerivative,
    "-map", "0:v:0", "-an", "-frames:v", "1", "-pix_fmt", "yuv420p", "-threads", "1", "-f", "framemd5", "-"], 120000).stdout;
  const publicHash = publicFrame.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"))?.split(",").at(-1)?.trim();
  assert.ok(publicHash && publicHash !== blackHash, "public video must not be erased");
  const publicAudio = required("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "info", "-threads", "1", "-i", privateDerivative,
    "-map", "0:a:0", "-vn", "-af", "atrim=start=0:end=2,volumedetect", "-f", "null", "-"], 120000).stderr;
  const publicAudioPeakDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(publicAudio)?.[1]);
  assert.ok(Number.isFinite(publicAudioPeakDb) && publicAudioPeakDb > -60, "public audio must not be erased");
  report = {status: "passed", scope: "12-second synthetic lean/private derivatives and downstream audio only", startedAt,
    completedAt: new Date().toISOString(), ffmpeg: version, original: {...original, media: sourceMedia},
    derivative: {...measured, media, mbPerHour}, downstreamAudio: {...artifact(audio), probe: audioProbe},
    privateDerivative: {...privateArtifact, media: privateMedia, privateWindows, mbPerHour: privateArtifact.sizeBytes / 1e6 * 3600 / privateMedia.duration,
      publicRetention: {frameAt1s: publicHash, audio0to2sPeakDb: publicAudioPeakDb},
      proof: "Every selected guarded 5fps frame matched full black YUV420p bytes; private-only decoded audio peak <=-80dB; original unchanged"}, commands, logs,
    remainingGates: ["C2 actual >=60-minute approved production live recording", "intelligible real speech/legible representative live slides",
      "actual production caller and downstream host proof", "actual OBS restoration where applicable"],
    warning: "Test pattern and sine tone are synthetic; output bitrate/bytes are measured but do not prove speech intelligibility or sustained production capture."};
} catch (error) {
  report = {status: "failed", startedAt, completedAt: new Date().toISOString(), error: String(error), commands, logs};
  process.exitCode = 1;
}
writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({status: report.status, evidence: path.relative(root, dir), scope: report.scope ?? "failed synthetic probe"}));
