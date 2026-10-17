import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { leanFfmpegArgs, normalizeLeanCapture, type LeanCommand } from "./lean-video-ffmpeg.js";

const media = (changes: Record<string, unknown> = {}) => ({format: {duration: "10"}, streams: [
  {codec_type: "video", codec_name: "h264", nb_read_packets: "50", duration: "10", width: 1280, height: 720, avg_frame_rate: "5/1"},
  {codec_type: "audio", codec_name: "aac", nb_read_packets: "470", duration: "10", channels: 1, sample_rate: "48000"}], ...changes});
const blackFrame = Buffer.alloc(1_382_400, 128); blackFrame.fill(16, 0, 921_600);
const blackDigest = createHash("md5").update(blackFrame).digest("hex");
const privateVideoProof = (missing = false, corrupt = false) => "#tb 0: 1/5\n" + Array.from({length: 13}, (_, offset) => {
  const index = offset + 14;
  return missing && index === 20 ? "" : `0, ${index}, ${index}, 1, 1382400, ${corrupt && index === 20 ? "a".repeat(32) : blackDigest}\n`;
}).join("");
function fixture(t: {after: (fn: () => void) => void}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lkb-t035-")), input = path.join(dir, "capture.mkv");
  writeFileSync(input, "retained original fixture"); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const calls: Array<{cmd: string; args: string[]; timeout: number}> = [], logs: string[] = [];
  const run: LeanCommand = (cmd, args, timeout) => {
    calls.push({cmd, args, timeout});
    if (cmd === "ffprobe") return {status: 0, stdout: JSON.stringify(media()), stderr: ""};
    if (args.at(-1) !== "-") writeFileSync(args.at(-1)!, Buffer.alloc(100_000));
    return {status: 0, stdout: "", stderr: ""};
  };
  return {dir, input, calls, logs, run, opts: {enabled: true, run, log: (s: string) => logs.push(s)}};
}
test("opt-in publishes complete verified derivative, preserves original and clears scratch", (t) => {
  const f = fixture(t), before = readFileSync(f.input);
  const result = normalizeLeanCapture(f.input, f.opts);
  assert.equal(result, path.join(f.dir, "capture.lean.mp4"));
  assert.deepEqual(readFileSync(f.input), before); assert.equal(readFileSync(result).length, 100_000);
  assert.equal(f.calls.length, 4); assert.equal(f.calls.at(-1)?.args.at(-1), "-");
  assert.deepEqual(readdirSync(f.dir).sort(), ["capture.lean.mp4", "capture.mkv"]);
  assert.match(f.logs.join("\n"), /36.0 MB\/h; original 25 bytes retained/);
});
test("disabled option makes no filesystem/subprocess changes", () => {
  assert.equal(normalizeLeanCapture("not-even-a-file", {enabled: false, run: () => {throw Error("called");}}), "not-even-a-file");
});
test("existing output is preserved without invoking encoder", (t) => {
  const f = fixture(t), destination = path.join(f.dir, "capture.lean.mp4"); writeFileSync(destination, "other owner");
  assert.equal(normalizeLeanCapture(f.input, f.opts), f.input); assert.equal(f.calls.length, 0);
  assert.equal(readFileSync(destination, "utf8"), "other owner");
});
for (const failure of ["missing-tool", "timeout", "no-audio", "zero-packets", "truncated", "wrong-fps", "exact-target", "corrupt-input", "corrupt-decode"] as const) {
  test(`failed ${failure} derivative uses untouched original and publishes nothing`, (t) => {
    const f = fixture(t), original = readFileSync(f.input);
    const run: LeanCommand = (cmd, args, timeout) => {
      if (failure === "missing-tool") return {status: null, error: Object.assign(Error("missing"), {code: "ENOENT"})};
      if (failure === "timeout" && cmd === "ffmpeg") return {status: null, error: Error("timed out")};
      const result = f.run(cmd, args, timeout);
      if (failure === "exact-target" && cmd === "ffprobe") {
        const m = media(); m.format.duration = "9"; for (const stream of m.streams) stream.duration = "9";
        return {status: 0, stdout: JSON.stringify(m)};
      }
      if (cmd === "ffprobe" && args.at(-1) !== f.input) {
        const m = media();
        if (failure === "no-audio") m.streams.pop();
        if (failure === "zero-packets") m.streams[1]!.nb_read_packets = "0";
        if (failure === "truncated") m.format.duration = "9";
        if (failure === "wrong-fps") m.streams[0]!.avg_frame_rate = "30/1";
        return {status: 0, stdout: JSON.stringify(m)};
      }
      if (failure === "exact-target" && cmd === "ffmpeg" && args.at(-1) !== "-") writeFileSync(args.at(-1)!, Buffer.alloc(1_000_000));
      if (failure === "corrupt-input" && cmd === "ffmpeg" && args.at(-1) !== "-") return {status: 0, stderr: "input decoder rejected a damaged frame"};
      if (failure === "corrupt-decode" && cmd === "ffmpeg" && args.at(-1) === "-") return {status: 1, stderr: "decode failed"};
      return result;
    };
    assert.equal(normalizeLeanCapture(f.input, {...f.opts, run}), f.input);
    assert.deepEqual(readFileSync(f.input), original); assert.deepEqual(readdirSync(f.dir), ["capture.mkv"]);
    assert.match(f.logs.join("\n"), /using retained original/);
  });
}
test("source change during encode refuses publication", (t) => {
  const f = fixture(t);
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout); if (cmd === "ffmpeg" && args.at(-1) !== "-") writeFileSync(f.input, "changed recording"); return result;
  };
  assert.equal(normalizeLeanCapture(f.input, {...f.opts, run}), f.input);
  assert.equal(existsSync(path.join(f.dir, "capture.lean.mp4")), false);
  assert.match(f.logs.join("\n"), /original recording changed/);
});
test("destination appearing during conversion is never overwritten", (t) => {
  const f = fixture(t), destination = path.join(f.dir, "capture.lean.mp4");
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout); if (cmd === "ffmpeg" && args.at(-1) === "-") writeFileSync(destination, "concurrent owner"); return result;
  };
  assert.equal(normalizeLeanCapture(f.input, {...f.opts, run}), f.input);
  assert.equal(readFileSync(destination, "utf8"), "concurrent owner");
});
test("protocol/relative paths and unsafe aliases are refused before probing", (t) => {
  const f = fixture(t);
  for (const invalid of ["https://example.org/capture.mp4", "capture.mkv", "\\\\server\\share\\capture.mp4", "\\\\?\\C:\\capture.mp4", "\\\\.\\C:\\capture.mp4", path.join(f.dir, "capture.m3u8")]) {
    assert.equal(normalizeLeanCapture(invalid, f.opts), invalid);
  }
  assert.equal(f.calls.length, 0);
});
test("scratch replacement is never recursively deleted or published", (t) => {
  const f = fixture(t); let protectedFile = "";
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout);
    if (cmd === "ffmpeg" && args.at(-1) !== "-") {
      const scratch = path.dirname(args.at(-1)!); renameSync(scratch, path.join(f.dir, "moved-owned-scratch"));
      mkdirSync(scratch); protectedFile = path.join(scratch, "foreign-owner.txt"); writeFileSync(protectedFile, "do not delete");
    }
    return result;
  };
  assert.equal(normalizeLeanCapture(f.input, {...f.opts, run}), f.input);
  assert.equal(readFileSync(protectedFile, "utf8"), "do not delete");
  assert.equal(existsSync(path.join(f.dir, "capture.lean.mp4")), false);
  assert.match(f.logs.join("\n"), /scratch ownership changed/);
});
test("candidate bytes changed during decoder verification are never certified", (t) => {
  const f = fixture(t);
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout);
    if (cmd === "ffmpeg" && args.at(-1) === "-") writeFileSync(args[args.indexOf("-i") + 1]!, Buffer.alloc(100_000, 1));
    return result;
  };
  assert.equal(normalizeLeanCapture(f.input, {...f.opts, run}), f.input);
  assert.equal(existsSync(path.join(f.dir, "capture.lean.mp4")), false);
  assert.match(f.logs.join("\n"), /derivative changed/);
});
test("symlink source cannot redirect into a different recording", (t) => {
  const f = fixture(t), alias = path.join(f.dir, "alias.mkv");
  try {symlinkSync(f.input, alias);} catch (e) {if ((e as NodeJS.ErrnoException).code === "EPERM") {t.skip("host disallows file symlinks"); return;} throw e;}
  assert.equal(normalizeLeanCapture(alias, f.opts), alias); assert.equal(f.calls.length, 0);
});
test("hard-linked source alias is refused before probing", (t) => {
  const f = fixture(t), alias = path.join(f.dir, "foreign.mkv"); linkSync(f.input, alias);
  assert.equal(normalizeLeanCapture(alias, f.opts), alias); assert.equal(f.calls.length, 0);
});
test("command keeps required AV, no overwrite/shell/shortest/cut, bounded encoder and file size", () => {
  const input = "/tmp/source ; $(echo secret).mkv", args = leanFfmpegArgs(input, "/tmp/out.mp4", 10);
  assert.equal(args[0], "-n"); assert.equal(args[args.indexOf("-i") + 1], input);
  assert.deepEqual(args.filter((v, i) => args[i - 1] === "-map"), ["0:v:0", "0:a:0"]);
  assert.equal(args[args.indexOf("-b:a") + 1], "64k"); assert.equal(args[args.indexOf("-fs") + 1], "1111112");
  for (const forbidden of ["-y", "-shortest", "-t", "-an", "-vn"]) assert.equal(args.includes(forbidden), false);
});

test("trusted private windows force black/muted output even with compression disabled", (t) => {
  const f = fixture(t);
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout);
    if (args.includes("framemd5")) return {status: 0, stdout: privateVideoProof()};
    if (args.some((arg) => arg.includes("volumedetect"))) return {status: 0, stderr: "max_volume: -91.0 dB"};
    return result;
  };
  const result = normalizeLeanCapture(f.input, {...f.opts, enabled: false, privateWindows: [{start: 3, end: 5}], run});
  assert.equal(result, path.join(f.dir, "capture.private.lean.mp4"));
  assert.equal(readFileSync(f.input, "utf8"), "retained original fixture");
  const encoder = f.calls.find((call) => call.cmd === "ffmpeg" && call.args.at(-1) !== "-")!.args;
  assert.match(encoder[encoder.indexOf("-vf") + 1]!, /drawbox.*between\(t,2.799999,5.200001\)/);
  assert.equal(encoder[encoder.indexOf("-force_key_frames") + 1], "expr:gt(between(t,2.799999,5.200001),0)");
  assert.match(encoder[encoder.indexOf("-af") + 1]!, /aeval.*between\(t,2.899999,5.100001\).*val\(0\)/);
  assert.match(f.logs.join("\n"), /private masked derivative verified/);
});

for (const failure of ["encoder", "missing-tool", "unmasked-video", "partial-video", "unmasked-audio", "missing-proof", "unmasked-stereo", "extra-track"] as const) {
  test(`required privacy ${failure} fails closed and never returns original as sanitized`, (t) => {
    const f = fixture(t);
    const run: LeanCommand = (cmd, args, timeout) => {
      const result = f.run(cmd, args, timeout);
      if (failure === "encoder" && args.at(-1) !== "-" && cmd === "ffmpeg") return {status: 1};
      if (failure === "missing-tool") return {status: null, error: Object.assign(Error("missing"), {code: "ENOENT"})};
      if (cmd === "ffprobe" && args.at(-1) !== f.input && (failure === "unmasked-stereo" || failure === "extra-track")) {
        const m = media();
        if (failure === "unmasked-stereo") m.streams[1]!.channels = 2;
        else m.streams.push({...m.streams[0]!});
        return {status: 0, stdout: JSON.stringify(m)};
      }
      if (args.includes("framemd5")) return {status: 0,
        stdout: privateVideoProof(failure === "partial-video", failure === "unmasked-video")};
      if (args.some((arg) => arg.includes("volumedetect"))) return {status: 0,
        stderr: failure === "unmasked-audio" ? "max_volume: -20.0 dB" : failure === "missing-proof" ? "" : "max_volume: -91.0 dB"};
      return result;
    };
    assert.throws(() => normalizeLeanCapture(f.input, {...f.opts, enabled: false, privateWindows: [{start: 3, end: 5}], run}), /required privacy masking failed/);
    assert.deepEqual(readdirSync(f.dir), ["capture.mkv"]);
    assert.match(f.logs.join("\n"), /publication refused/);
    assert.equal(f.logs.some((line) => line.includes("using retained original")), false);
  });
}
test("missing/malformed/unbounded privacy windows are refused, never interpolated", (t) => {
  const f = fixture(t);
  for (const privateWindows of [undefined, [], [{start: 0, end: Infinity}], [{start: -1, end: 5}], [{start: 5, end: 3}],
    [{start: 0, end: 11}], [{start: "0);movie=/secret" as unknown as number, end: 5}], Array.from({length: 129}, () => ({start: 0, end: 1}))]) {
    assert.throws(() => normalizeLeanCapture(f.input, {...f.opts, privateWindows, requirePrivacyMask: true}), /required privacy masking failed/);
  }
  assert.equal(f.calls.some((call) => call.cmd === "ffmpeg"), false);
});
test("empty validated privacy list permits disabled public capture without conversion", () => {
  assert.equal(normalizeLeanCapture("not-a-file", {enabled: false, privateWindows: []}), "not-a-file");
});

test("private EOF proof refuses audible decoded tail beyond stale source duration", (t) => {
  const f = fixture(t), original = readFileSync(f.input);
  const run: LeanCommand = (cmd, args, timeout) => {
    const result = f.run(cmd, args, timeout);
    if (cmd === "ffprobe" && args.at(-1) !== f.input) {
      const m = media(); m.format.duration = "10.2"; m.streams[1]!.duration = "10.2";
      return {status: 0, stdout: JSON.stringify(m)};
    }
    if (args.includes("framemd5")) return {status: 0, stdout: "#tb 0: 1/5\n" + Array.from({length: 6}, (_, n) =>
      `0, ${n + 44}, ${n + 44}, 1, 1382400, ${blackDigest}\n`).join("")};
    // Sound exists only after 10s: a bounded 9..10 proof misses it, an EOF proof observes it.
    if (args.some((arg) => arg.includes("volumedetect"))) return {status: 0,
      stderr: args[args.indexOf("-af") + 1]!.includes("gte(t,8.999999)") ? "max_volume: -20.0 dB" : "max_volume: -91.0 dB"};
    return result;
  };
  assert.throws(() => normalizeLeanCapture(f.input, {...f.opts, requirePrivacyMask: true, privateWindows: [{start: 9, end: 10}], run}), /private audio is not silent/);
  assert.deepEqual(readFileSync(f.input), original); assert.deepEqual(readdirSync(f.dir), ["capture.mkv"]);
});
test("EOF mask covers decoded tail without cutting media or extending a closed private window", () => {
  const suffix = leanFfmpegArgs("/tmp/source.mkv", "/tmp/out.mp4", 12, [{start: 9, end: 12}]);
  assert.match(suffix[suffix.indexOf("-af") + 1]!, /gte\(t,8.899999\)/);
  assert.match(suffix[suffix.indexOf("-vf") + 1]!, /gte\(t,8.799999\)/);
  for (const forbidden of ["-t", "-shortest"]) assert.equal(suffix.includes(forbidden), false);
  const closed = leanFfmpegArgs("/tmp/source.mkv", "/tmp/out.mp4", 12, [{start: 9, end: 10}]);
  assert.match(closed[closed.indexOf("-af") + 1]!, /between\(t,8.899999,10.100001\)/);
  assert.equal(closed[closed.indexOf("-af") + 1]!.includes("gte(t,"), false);
});
