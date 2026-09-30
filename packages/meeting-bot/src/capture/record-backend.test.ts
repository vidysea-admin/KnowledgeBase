import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTabBrowserDeps } from "./tab-browser.js";
import { recordingBackend, normalizeCapture, runFinalize } from "./record-commands.js";

test("portable tab backend is default, invalid backend never falls through to OBS", () => {
  assert.equal(recordingBackend([], {}), "tab");
  assert.equal(recordingBackend(["--backend", "tab"], {LKB_CAPTURE_BACKEND:"obs"}), "tab");
  assert.throws(() => recordingBackend(["--backend", "unknown"], {}), /tab or obs/);
});
test("finalize refuses unsafe session paths before creating or remuxing anything", async () => {
  await assert.rejects(runFinalize(["--session-id", "../../escape", "--title", "x", "--video", "missing.webm"]), /session-id/);
});
test("live WebM stream is remuxed into measurable playable audio/video without losing original", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tab-stream-"));
  try {
    const original = path.join(dir,"stream.webm");
    const made = spawnSync("ffmpeg",["-y","-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=64x64:rate=10","-f","lavfi","-i","sine=frequency=440","-t","1","-c:v","libvpx","-c:a","libopus","-live","1",original],{encoding:"utf8",timeout:30_000});
    assert.equal(made.status,0,made.stderr);
    const raw = spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","json",original],{encoding:"utf8",timeout:15_000});
    assert.equal(JSON.parse(raw.stdout).format.duration,undefined);
    const normalized = normalizeCapture(original);
    assert.ok(existsSync(original)); assert.ok(existsSync(normalized));
    const probe = spawnSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type","-of","json",normalized],{encoding:"utf8",timeout:15_000});
    const media = JSON.parse(probe.stdout);
    assert.ok(Number(media.format.duration)>0);
    assert.ok(media.streams.some((s:any)=>s.codec_type==="audio"));
    assert.ok(media.streams.some((s:any)=>s.codec_type==="video"));
    assert.equal(normalizeCapture(normalized),normalized);
  } finally {rmSync(dir,{recursive:true,force:true});}
});


test("interrupted recovery binds owned sidecars, refuses live/unknown/foreign state and preserves retry/gaps", async () => {
  const modes = ["dead", "pid-reused", "live", "unknown", "unknown-start", "malformed", "foreign-session", "foreign-tenant", "foreign-profile", "foreign-output", "bad-lock", "bad-state", "missing-time", "symlink-status", "symlink-runtime", "source-tenant", "cleanup-fail", "finalize-fail", "existing-recovery-lock", "replacement-lock", "concurrent-capture"];
  for (const mode of modes) {
    const root = mkdtempSync(path.join(tmpdir(), "owned-recovery-"));
    const recordDir = path.join(root, "raw", "webinars"), profileDir = path.join(root, "profile");
    mkdirSync(recordDir, {recursive: true}); mkdirSync(profileDir);
    const handle = "tab-123456-aabbccdd", raw = path.join(recordDir, handle + ".webm"), statusPath = raw + ".status.json";
    const extension = path.join(recordDir, ".extension-" + handle), lock = path.join(profileDir, ".lkb-tab-capture.lock");
    mkdirSync(extension); writeFileSync(path.join(extension, "config.json"), "{}"); writeFileSync(raw, "raw retained"); writeFileSync(lock, "99999999");
    const status: Record<string, any> = {state: "recording", output: raw, pid: 99999999, handle, sessionId: "owned-session", tenantId: "owned-tenant", profileDir, recordDir, controllerStartedAt: "2026-09-30T10:00:00Z", captureStartedAt: "2026-09-30T10:00:01Z"};
    const state = {pid: status.pid, sessionId: status.sessionId, obsOutputDir: recordDir, controllerStartedAt: status.controllerStartedAt, until: "2026-09-30T10:01:00Z"};
    if (mode === "foreign-session") status.sessionId = "other";
    if (mode === "foreign-tenant") status.tenantId = "other";
    if (mode === "foreign-profile") status.profileDir += "-other";
    if (mode === "foreign-output") status.output += "-other";
    if (mode === "missing-time") delete status.captureStartedAt;
    if (mode === "bad-state") state.pid++;
    if (mode === "bad-lock") writeFileSync(lock, "42");
    writeFileSync(statusPath, mode === "malformed" ? "{" : JSON.stringify(status));
    writeFileSync(path.join(recordDir, ".record-state.json"), JSON.stringify(state));
    if (mode === "source-tenant") {
      const dir = path.join(root, "data", "toc-migrated", "owned-session"); mkdirSync(dir, {recursive: true}); writeFileSync(path.join(dir, "source.json"), JSON.stringify({tenantId: "other"}));
    }
    if (mode === "symlink-status" || mode === "symlink-runtime") {
      const victim = path.join(root, "victim"); writeFileSync(victim, JSON.stringify(status));
      const target = mode === "symlink-status" ? statusPath : path.join(extension, "config.json"); rmSync(target); symlinkSync(victim, target);
    }
    if (mode === "existing-recovery-lock") writeFileSync(path.join(profileDir, ".lkb-recovery.lock"), "foreign owner");
    let competingCapture: Promise<unknown> | undefined;
    let cleaned = 0, normalized = 0, finalized = 0;
    const options = {
      repoRoot: root, recordDir, profileDir,
      pidProbe: () => mode === "unknown" ? "unknown" as const : ["live", "unknown-start", "pid-reused"].includes(mode) ? "live" as const : "dead" as const,
      startTime: () => mode === "unknown-start" ? undefined : mode === "pid-reused" ? "different-creation" : status.controllerStartedAt,
      cleanup: (profile: string) => {
        assert.equal(profile, profileDir); cleaned++;
        if (mode === "cleanup-fail") throw new Error("cleanup denied");
        if (mode === "replacement-lock") writeFileSync(lock, "42");
        if (mode === "concurrent-capture") {
          competingCapture = assert.rejects(createTabBrowserDeps({python: "MUST-NOT-SPAWN", joinScript: "unused", recordDir, profileDir}).deps.launch("http://127.0.0.1/", {tenantId: "owned-tenant", consentNote: "fixture"}), /recovery/);
        }
      },
      normalize: (video: string) => { assert.equal(video, raw); normalized++; return video; },
      mediaDuration: () => 20,
      finalize: async (...args: any[]) => {
        finalized++; if (mode === "finalize-fail") throw new Error("finalize denied");
        assert.equal(args[5][0].reason, "controller-interrupted-coverage-unverified");
        assert.equal(args[5][0].recovered, false);
        assert.equal(args[5][0].start, Date.parse(status.captureStartedAt) / 1000 + 18);
        assert.equal(args[5][0].end, Date.parse(state.until) / 1000);
      },
    };
    const command = ["--session-id", "owned-session", "--tenant", "owned-tenant", "--title", "owned", "--video", raw];
    try {
      if (["dead", "pid-reused", "concurrent-capture"].includes(mode)) {
        await runFinalize(command, options);
        if (competingCapture) await competingCapture;
        const recovered = JSON.parse(readFileSync(statusPath, "utf8"));
        assert.equal(recovered.state, "recovered"); assert.equal(recovered.coverageIncomplete, true); assert.equal(recovered.cleanupComplete, true);
        assert.equal(cleaned, 1); assert.equal(normalized, 1); assert.equal(finalized, 1);
        assert.equal(existsSync(lock), false); assert.equal(existsSync(extension), false); assert.equal(existsSync(path.join(recordDir, ".record-state.json")), false);
        await runFinalize(command, options); assert.equal(cleaned, 1); assert.equal(finalized, 2);
      } else {
        await assert.rejects(runFinalize(command, options));
        if (["cleanup-fail", "finalize-fail", "replacement-lock"].includes(mode)) {
          assert.equal(JSON.parse(readFileSync(statusPath, "utf8")).state, "recovery-failed");
          assert.ok(existsSync(path.join(recordDir, ".record-state.json")));
          if (mode === "finalize-fail") {
            options.finalize = async () => { finalized++; };
            await runFinalize(command, options); assert.equal(JSON.parse(readFileSync(statusPath, "utf8")).state, "recovered");
          }
        } else { assert.equal(cleaned, 0); assert.equal(normalized, 0); assert.equal(finalized, 0); }
      }
      assert.equal(readFileSync(raw, "utf8"), "raw retained");
      if (mode === "existing-recovery-lock") assert.equal(readFileSync(path.join(profileDir, ".lkb-recovery.lock"), "utf8"), "foreign owner");
      else assert.equal(existsSync(path.join(profileDir, ".lkb-recovery.lock")), false);
      if (mode === "replacement-lock") assert.equal(readFileSync(lock, "utf8"), "42");
    } finally {rmSync(root, {recursive: true, force: true});}
  }
});


test("OBS recovery cleans only exact operator profile and disconnects on all connected failure paths", async () => {
  for (const mode of ["success", "cleanup-fail", "unconfined", "missing-profile", "status-fail"]) {
    const root = mkdtempSync(path.join(tmpdir(), "obs-owned-")), profile = path.join(root, "profile"), media = path.join(root, "existing.mkv");
    if (mode !== "missing-profile") mkdirSync(profile);
    writeFileSync(media, "retained");
    const events: string[] = [];
    const obs: any = {
      connect: async () => {events.push("connect");}, disconnect: async () => {events.push("disconnect");},
      call: async (method: string) => {
        events.push(method);
        if (mode === "status-fail" && method === "GetRecordStatus") throw new Error("status unavailable");
        if (method === "GetRecordStatus") return {outputActive: false};
        if (method === "GetSpecialInputs") return {desktop1: "owned desktop"};
        return {};
      },
    };
    const options = {obs, repoRoot: root, profileDir: mode === "unconfined" ? path.dirname(root) : profile,
      cleanup: (actual: string) => {assert.equal(actual, profile); events.push("exact-cleanup"); if (mode === "cleanup-fail") throw new Error("cleanup denied");},
      normalize: (video: string) => video, finalize: async () => {events.push("finalize");},
    };
    const command = ["--session-id", "obs-owned", "--tenant", "owned", "--title", "owned", "--stop-obs", "--video", media];
    try {
      if (["success", "missing-profile"].includes(mode)) await runFinalize(command, options);
      else await assert.rejects(runFinalize(command, options));
      assert.ok(events.includes("disconnect"));
      if (mode !== "status-fail") assert.ok(events.includes("SetInputMute"));
      assert.equal(events.includes("exact-cleanup"), ["success", "cleanup-fail"].includes(mode));
      assert.equal(readFileSync(media, "utf8"), "retained");
    } finally {rmSync(root, {recursive: true, force: true});}
  }
});
