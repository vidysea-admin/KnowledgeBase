/**
 * T-035 wiring tests (lane leanwire). Fake OBS client, fake telegram send, fake size/probe seams.
 * Never launches OBS, ffmpeg, Chrome or the Python joiner (the join child is the tiny node fixture the
 * existing obs-windows tests already use).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { applyLeanVideoToObs, leanRestorePath, restoreLeanVideoInObs } from "./lean-video-obs.js";
import { runFinalize, runRecord } from "./capture/record-commands.js";
import { createObsBrowserDeps, type ObsClientLike, type ObsBrowserConfig } from "./capture/obs/obs-windows.js";
import type { TelegramNotifier } from "./capture/notify/telegram-alerts.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "capture", "fake-join-fixture.mjs");
type Call = { name: string; args?: any };

const LEAN_VIDEO = { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720, fpsNumerator: 5, fpsDenominator: 1 };
const LEAN_PARAMS = [
  { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: "500" },
  { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: "64" },
];

const OPERATOR_VIDEO = { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 30, fpsDenominator: 1 };

/** A fake OBS that actually HOLDS state: Set* calls mutate it, Get* read it, so a restore is observable as end state. */
function fakeObs(opts: { refuse?: string[]; startFails?: boolean; stopPath?: string; mode?: string | null; quality?: string | null; unreadable?: string[];
  profile?: Record<string, string | null>; video?: Record<string, number>; onCall?: (name: string, args: any) => void } = {}) {
  const calls: Call[] = [];
  const state = {
    video: { ...(opts.video ?? OPERATOR_VIDEO) } as Record<string, number>,
    profile: { "Output/Mode": opts.mode === undefined ? "Simple" : opts.mode, "SimpleOutput/RecQuality": opts.quality === undefined ? "Stream" : opts.quality,
      "SimpleOutput/VBitrate": "2500", "SimpleOutput/ABitrate": "160", ...(opts.profile ?? {}) } as Record<string, string | null>,
    recording: false,
  };
  const refuse = new Set(opts.refuse ?? []);
  const obs: ObsClientLike = {
    connect: async () => undefined, disconnect: async () => {},
    call: async (name: string, args?: any) => {
      calls.push({ name, args });
      opts.onCall?.(name, args);
      if (refuse.has(name)) throw new Error(`${name} refused (simulated)`);
      switch (name) {
        case "GetInputList": return { inputs: [] };
        case "GetSceneList": return { scenes: [] };
        case "GetSceneItemId": return { sceneItemId: 1 };
        case "GetVideoSettings": return { ...state.video };
        case "SetVideoSettings": if (state.recording) throw new Error("output active (simulated)"); Object.assign(state.video, args); return {};
        case "GetProfileParameter": {
          const k = `${args.parameterCategory}/${args.parameterName}`;
          if (opts.unreadable?.includes(k)) throw new Error(`${k} unreadable (simulated)`);
          return { parameterValue: k in state.profile ? state.profile[k] : null, defaultParameterValue: null };
        }
        case "SetProfileParameter": state.profile[`${args.parameterCategory}/${args.parameterName}`] = args.parameterValue; return {};
        case "GetRecordStatus": return { outputActive: state.recording };
        case "GetSpecialInputs": return {};
        case "StartRecord": if (opts.startFails) throw new Error("StartRecord rejected (simulated)"); state.recording = true; return {};
        case "StopRecord": state.recording = false; return { outputPath: opts.stopPath };
        default: return {};
      }
    },
  };
  return { obs, calls, state };
}
const names = (calls: Call[]) => calls.map((c) => c.name);
const sets = (calls: Call[]) => calls.filter((c) => c.name === "SetVideoSettings" || c.name === "SetProfileParameter");

const securityState = () => ({ version: 1, video: { ...OPERATOR_VIDEO }, params: [
  { parameterCategory: "SimpleOutput", parameterName: "VBitrate", previous: "02500" },
  { parameterCategory: "SimpleOutput", parameterName: "ABitrate", previous: null },
], appliedAt: "2026-10-15T00:00:00Z" });

test("OBS state security refuses arbitrary profile authority and malformed snapshots", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-obs-security-")), file = leanRestorePath(dir);
  try {
    const malicious = securityState(); malicious.params[0]!.parameterName = "FilePath"; malicious.params[0]!.previous = "C:/foreign";
    const duplicate = securityState(); duplicate.params.push({ ...duplicate.params[0]! });
    const invalidVideo = securityState(); invalidVideo.video.fpsDenominator = 0;
    for (const state of [malicious, duplicate, invalidVideo]) {
      const bytes = JSON.stringify(state); writeFileSync(file, bytes);
      const fake = fakeObs();
      assert.equal((await restoreLeanVideoInObs(fake.obs, file, () => {})).status, "failed");
      assert.equal((await applyLeanVideoToObs(fake.obs, {}, () => {}, { stateFile: file })).restorable, false);
      assert.equal(sets(fake.calls).length, 0);
      assert.equal(readFileSync(file, "utf8"), bytes);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("OBS state security refuses hardlink aliases without overwriting original bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-obs-security-")), file = leanRestorePath(dir), original = join(dir, "original.json");
  const bytes = JSON.stringify(securityState());
  try {
    writeFileSync(original, bytes); linkSync(original, file);
    const fake = fakeObs();
    assert.equal((await applyLeanVideoToObs(fake.obs, {}, () => {}, { stateFile: file })).restorable, false);
    assert.equal((await restoreLeanVideoInObs(fake.obs, file, () => {})).status, "failed");
    assert.equal(sets(fake.calls).length, 0);
    assert.equal(readFileSync(original, "utf8"), bytes); assert.ok(existsSync(file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("OBS state security refuses same-byte replacement before restoration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-obs-security-")), file = leanRestorePath(dir), replacement = join(dir, "replacement.json");
  const bytes = JSON.stringify(securityState());
  try {
    writeFileSync(file, bytes);
    const fake = fakeObs({ onCall: (name) => { if (name === "GetRecordStatus") { writeFileSync(replacement, bytes); renameSync(replacement, file); } } });
    assert.equal((await restoreLeanVideoInObs(fake.obs, file, () => {})).status, "failed");
    assert.equal(sets(fake.calls).length, 0); assert.equal(readFileSync(file, "utf8"), bytes);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("OBS state security preserves a foreign replacement during restore cleanup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-obs-security-")), file = leanRestorePath(dir), replacement = join(dir, "replacement.json");
  try {
    writeFileSync(file, JSON.stringify(securityState()));
    const fake = fakeObs({ onCall: (name, args) => {
      if (name === "SetProfileParameter" && args.parameterName === "ABitrate") { writeFileSync(replacement, "foreign-original"); renameSync(replacement, file); }
    } });
    assert.equal((await restoreLeanVideoInObs(fake.obs, file, () => {})).status, "failed");
    assert.equal(fake.state.profile["SimpleOutput/VBitrate"], "02500");
    assert.equal(fake.state.profile["SimpleOutput/ABitrate"], null);
    assert.equal(readFileSync(file, "utf8"), "foreign-original");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function cfgFor(extra: Partial<ObsBrowserConfig>): ObsBrowserConfig {
  return {
    obsUrl: "ws://127.0.0.1:0", obsPassword: "x", obsExe: "unused.exe", python: process.execPath, joinScript: FIXTURE,
    profileDir: mkdtempSync(join(tmpdir(), "lkb-lean-profile-")), recordDir: mkdtempSync(join(tmpdir(), "lkb-lean-record-")),
    autoClick: false, log: () => {}, ...extra,
  };
}
const cleanup = (c: ObsBrowserConfig) => { rmSync(c.profileDir, { recursive: true, force: true }); rmSync(c.recordDir, { recursive: true, force: true }); };
async function launchOnly(extra: Partial<ObsBrowserConfig>) {
  const cfg = cfgFor(extra);
  const { obs, calls } = fakeObs({ startFails: true });
  try {
    const { deps } = createObsBrowserDeps(cfg, { obs, connectObs: async () => undefined, confirmBotWindow: async () => true });
    await assert.rejects(() => deps.launch("https://example.com/meet", { tenantId: "t" }), /StartRecord rejected/);
  } finally { cleanup(cfg); }
  return calls;
}

test("applyLeanVideoToObs sends the exact lean defaults: SetVideoSettings then VBitrate then ABitrate", async () => {
  const { obs, calls } = fakeObs();
  const logs: string[] = [];
  const r = await applyLeanVideoToObs(obs, {}, (m) => logs.push(m));
  assert.deepEqual(sets(calls), [
    { name: "SetVideoSettings", args: LEAN_VIDEO },
    { name: "SetProfileParameter", args: LEAN_PARAMS[0] },
    { name: "SetProfileParameter", args: LEAN_PARAMS[1] },
  ]);
  assert.deepEqual(r.failed, []);
  assert.equal(r.assessment.withinTarget, true);
  assert.ok(logs.some((l) => /1280x720 @ 5 fps, video 500 kbps, audio 64 kbps; estimate 258\.9 MB\/h \(under 400 MB\/h\)/.test(l)), logs.join("|"));
});

test("applyLeanVideoToObs honours overrides and reports a target-busting override without rewriting it", async () => {
  const { obs, calls } = fakeObs();
  const logs: string[] = [];
  await applyLeanVideoToObs(obs, { videoBitrateKbps: 4000, audioBitrateKbps: 192, fps: 30 }, (m) => logs.push(m));
  const s3 = sets(calls);
  assert.equal(s3[0]!.args.fpsNumerator, 30);
  assert.equal(s3[1]!.args.parameterValue, "4000");
  assert.equal(s3[2]!.args.parameterValue, "192");
  assert.ok(logs.some((l) => /NOT under 400 MB\/h/.test(l)), logs.join("|"));
});

test("applyLeanVideoToObs is fail-soft: refused requests are listed, the rest are still sent, nothing throws", async () => {
  const { obs, calls } = fakeObs({ refuse: ["SetVideoSettings"] });
  const r = await applyLeanVideoToObs(obs, {}, () => {});
  assert.deepEqual(r.failed, ["SetVideoSettings"]);
  assert.deepEqual(names(sets(calls)), ["SetVideoSettings", "SetProfileParameter", "SetProfileParameter"]);
});

test("launch() with leanVideo {} applies lean settings after the scene is built and BEFORE GetVideoSettings and StartRecord", async () => {
  const calls = await launchOnly({ leanVideo: {} });
  const n = names(calls);
  const sv = n.indexOf("SetVideoSettings");
  const fitRead = n.indexOf("GetVideoSettings", sv); // the fit-to-canvas read comes after the lean set (an earlier read is the restore snapshot)
  assert.ok(sv > n.indexOf("GetSceneList") && fitRead > sv && n.indexOf("GetVideoSettings") < sv, n.join(","));
  // lean settings, then (StartRecord is rejected in this fixture) the operator's values restored by launch()'s failure path
  assert.deepEqual(calls.filter((c) => c.name === "SetVideoSettings").map((c) => c.args), [LEAN_VIDEO, OPERATOR_VIDEO]);
  assert.deepEqual(calls.filter((c) => c.name === "SetProfileParameter").map((c) => c.args).slice(0, 2), LEAN_PARAMS);
  assert.ok(n.indexOf("SetProfileParameter") < n.indexOf("StartRecord"));
  const fit = calls.find((c) => c.name === "SetSceneItemTransform")!.args.sceneItemTransform;
  assert.equal(fit.boundsWidth, 1280); assert.equal(fit.boundsHeight, 720);
});

test("launch() with leanVideo overrides sends the overridden values", async () => {
  const calls = await launchOnly({ leanVideo: { targetHeight: 480, fps: 10, videoBitrateKbps: 300 } });
  assert.deepEqual(calls.find((c) => c.name === "SetVideoSettings")!.args,
    { baseWidth: 852, baseHeight: 480, outputWidth: 852, outputHeight: 480, fpsNumerator: 10, fpsDenominator: 1 });
  assert.equal(calls.filter((c) => c.name === "SetProfileParameter")[0]!.args.parameterValue, "300");
});

test("launch() with leanVideo undefined or false leaves OBS video settings untouched (today's behaviour)", async () => {
  for (const leanVideo of [undefined, false] as const) {
    const calls = await launchOnly({ leanVideo });
    assert.equal(names(calls).filter((x) => x === "SetVideoSettings" || x === "SetProfileParameter").length, 0);
  }
});

test("launch() still records when OBS refuses the lean settings (fail-soft), StartRecord is reached", async () => {
  const cfg = cfgFor({ leanVideo: {} });
  const { obs, calls } = fakeObs({ refuse: ["SetVideoSettings", "SetProfileParameter"], startFails: true });
  try {
    const { deps } = createObsBrowserDeps(cfg, { obs, connectObs: async () => undefined, confirmBotWindow: async () => true });
    await assert.rejects(() => deps.launch("https://example.com/meet", { tenantId: "t" }), /StartRecord rejected/);
    assert.ok(names(calls).includes("StartRecord"));
  } finally { cleanup(cfg); }
});

// --- ISS-LEANWIRE-003: snapshot, persist, restore ------------------------------------------------

const tmp = (): string => mkdtempSync(join(tmpdir(), "lkb-lean-state-"));

test("apply persists the previous values BEFORE the first Set call, restore puts every one back exactly and deletes the state", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  let stateAtFirstSet: any;
  const { obs, calls, state } = fakeObs({ onCall: (n) => { if (n === "SetVideoSettings" && !stateAtFirstSet) stateAtFirstSet = JSON.parse(readFileSync(file, "utf8")); } });
  try {
    const r = await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file });
    assert.equal(r.restorable, true);
    assert.deepEqual(stateAtFirstSet.video, OPERATOR_VIDEO);
    assert.deepEqual(stateAtFirstSet.params, [
      { parameterCategory: "SimpleOutput", parameterName: "VBitrate", previous: "2500" },
      { parameterCategory: "SimpleOutput", parameterName: "ABitrate", previous: "160" }]);
    assert.deepEqual(state.video, LEAN_VIDEO); assert.equal(state.profile["SimpleOutput/VBitrate"], "500");
    const before = calls.length;
    const res = await restoreLeanVideoInObs(obs, file, () => {});
    assert.equal(res.status, "restored");
    assert.deepEqual(calls.slice(before).map((c) => [c.name, c.args]), [
      ["GetRecordStatus", undefined],
      ["SetVideoSettings", OPERATOR_VIDEO],
      ["SetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: "2500" }],
      ["SetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: "160" }]]);
    assert.deepEqual(state.video, OPERATOR_VIDEO); assert.equal(state.profile["SimpleOutput/ABitrate"], "160");
    assert.equal(existsSync(file), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a parameter that was unset (null) is restored as null, not as a made-up value", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  const { obs, calls, state } = fakeObs({ profile: { "SimpleOutput/VBitrate": null } });
  try {
    await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file });
    await restoreLeanVideoInObs(obs, file, () => {});
    const restore = calls.filter((c) => c.name === "SetProfileParameter" && c.args.parameterName === "VBitrate").pop()!;
    assert.equal(restore.args.parameterValue, null);
    assert.equal(state.profile["SimpleOutput/VBitrate"], null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("restore does NOTHING while OBS is still recording and keeps the state; it restores once recording stopped", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  const { obs, calls, state } = fakeObs();
  try {
    await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file });
    state.recording = true;
    const logs: string[] = [];
    const before = calls.length;
    const r = await restoreLeanVideoInObs(obs, file, (m) => logs.push(m));
    assert.equal(r.status, "skipped-recording");
    assert.deepEqual(names(calls.slice(before)), ["GetRecordStatus"]);
    assert.ok(existsSync(file)); assert.deepEqual(state.video, LEAN_VIDEO);
    assert.ok(logs.some((l) => /still recording/.test(l)));
    state.recording = false;
    assert.equal((await restoreLeanVideoInObs(obs, file, () => {})).status, "restored");
    assert.deepEqual(state.video, OPERATOR_VIDEO);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("restore failure is loud (log + alert naming the failed keys) and keeps the state so a retry can finish", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  const { obs, state } = fakeObs();
  const flaky = { call: async (n: string, a?: any) => { if (n === "SetProfileParameter" && a.parameterName === "VBitrate" && a.parameterValue === "2500") throw new Error("boom (simulated)"); return obs.call(n, a); } };
  const logs: string[] = [], alerts: string[] = [];
  try {
    await applyLeanVideoToObs(flaky, {}, () => {}, { stateFile: file });
    const r = await restoreLeanVideoInObs(flaky, file, (m) => logs.push(m), (m) => alerts.push(m));
    assert.equal(r.status, "failed"); assert.deepEqual(r.failed, ["SimpleOutput/VBitrate"]);
    assert.equal(alerts.length, 1); assert.match(alerts[0]!, /NOT restored/); assert.match(alerts[0]!, /SimpleOutput\/VBitrate/);
    assert.ok(logs.some((l) => /NOT restored/.test(l)));
    assert.ok(existsSync(file));
    assert.deepEqual(state.video, OPERATOR_VIDEO); // the parts that worked were restored
    assert.equal((await restoreLeanVideoInObs(obs, file, () => {}, (m) => alerts.push(m))).status, "restored");
    assert.equal(state.profile["SimpleOutput/VBitrate"], "2500"); assert.equal(alerts.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an unreadable state file is an alert, never a silent skip; no state file is a quiet no-op", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  const { obs, calls } = fakeObs();
  const alerts: string[] = [];
  try {
    assert.equal((await restoreLeanVideoInObs(obs, file, () => {}, (m) => alerts.push(m))).status, "none");
    assert.equal(calls.length, 0);
    writeFileSync(file, "{not json");
    assert.equal((await restoreLeanVideoInObs(obs, file, () => {}, (m) => alerts.push(m))).status, "failed");
    assert.equal(alerts.length, 1);
    const r = await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file }); // must not overwrite the only record
    assert.equal(r.restorable, false); assert.equal(sets(calls).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a leftover state from a crashed run keeps the ORIGINAL values: a second apply does not record the lean values as 'previous'", async () => {
  const dir = tmp(), file = leanRestorePath(dir);
  const { obs, state } = fakeObs();
  try {
    await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file });
    await applyLeanVideoToObs(obs, {}, () => {}, { stateFile: file }); // OBS now holds lean values
    await restoreLeanVideoInObs(obs, file, () => {});
    assert.deepEqual(state.video, OPERATOR_VIDEO); assert.equal(state.profile["SimpleOutput/VBitrate"], "2500");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("if the current video settings cannot be read or the state cannot be persisted, NOTHING is changed in OBS", async () => {
  const dir = tmp();
  try {
    const a = fakeObs({ refuse: ["GetVideoSettings"] });
    const ra = await applyLeanVideoToObs(a.obs, {}, () => {}, { stateFile: leanRestorePath(dir) });
    assert.equal(ra.restorable, false); assert.equal(sets(a.calls).length, 0); assert.equal(existsSync(leanRestorePath(dir)), false);
    const b = fakeObs();
    const rb = await applyLeanVideoToObs(b.obs, {}, () => {}, { stateFile: join(dir, "no-such-dir", "x.json") });
    assert.equal(rb.restorable, false); assert.equal(sets(b.calls).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- ISS-LEANWIRE-002: the bitrate keys only matter in Simple mode with RecQuality "Stream" -----------

test("Advanced output mode: bitrate keys are SKIPPED with a warning, canvas/fps still apply, the mode is never changed", async () => {
  const dir = tmp();
  const { obs, calls, state } = fakeObs({ mode: "Advanced" });
  const logs: string[] = [];
  try {
    const r = await applyLeanVideoToObs(obs, {}, (m) => logs.push(m), { stateFile: leanRestorePath(dir) });
    assert.deepEqual(r.skipped, ["SimpleOutput/VBitrate", "SimpleOutput/ABitrate"]);
    assert.deepEqual(names(sets(calls)), ["SetVideoSettings"]);
    assert.equal(state.profile["Output/Mode"], "Advanced"); assert.equal(state.profile["SimpleOutput/VBitrate"], "2500");
    assert.ok(logs.some((l) => /WARNING output mode is "Advanced"/.test(l) && /not changed/.test(l)), logs.join("|"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Simple mode with RecQuality HQ: bitrate keys skipped with a warning naming the quality; RecQuality untouched", async () => {
  const { obs, calls, state } = fakeObs({ quality: "HQ" });
  const logs: string[] = [];
  await applyLeanVideoToObs(obs, {}, (m) => logs.push(m));
  assert.deepEqual(names(sets(calls)), ["SetVideoSettings"]);
  assert.equal(state.profile["SimpleOutput/RecQuality"], "HQ");
  assert.ok(logs.some((l) => /recording quality is "HQ"/.test(l)), logs.join("|"));
});

test("Simple mode + Stream quality, or both unset (OBS defaults): bitrates ARE sent; unreadable mode: sent with a warning", async () => {
  for (const o of [{}, { mode: null, quality: null }] as const) {
    const { obs, calls } = fakeObs(o);
    await applyLeanVideoToObs(obs, {}, () => {});
    assert.deepEqual(names(sets(calls)), ["SetVideoSettings", "SetProfileParameter", "SetProfileParameter"]);
  }
  const { obs, calls } = fakeObs({ unreadable: ["Output/Mode"] });
  const logs: string[] = [];
  await applyLeanVideoToObs(obs, {}, (m) => logs.push(m));
  assert.equal(sets(calls).length, 3);
  assert.ok(logs.some((l) => /could not read the OBS output mode/.test(l)));
});

// --- ISS-LEANWIRE-002: runRecord's OBS branch, driven end to end with a fake OBS ------------------------

function silentTelegram(alerts: string[]): TelegramNotifier {
  const noop = () => {};
  return { enabled: false, onBotEvent: noop, notifyJoined: noop, notifySilence: noop, notifyFinished: noop, notifyOverTarget: noop,
    notifyObsRestoreFailed: (m: string) => { alerts.push(m); } } as unknown as TelegramNotifier;
}
async function driveObsRecord(fake: ReturnType<typeof fakeObs>, alerts: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-lean-rr-")), recordDir = join(dir, "record");
  mkdirSync(recordDir, { recursive: true });
  const finalized: unknown[][] = [];
  const prevPw = process.env.OBS_WS_PASSWORD; process.env.OBS_WS_PASSWORD = "unit-test";
  try {
    await runRecord(["https://meet.google.com/abc-defg-hij", "--until", new Date(Date.now() + 2500).toISOString(), "--backend", "obs",
      "--session-id", "lean-rr", "--tenant", "fixture", "--title", "fixture",
      "--capture-approved-by", "fixture-operator", "--capture-approval-ref", "OBS-local-fake-client-test",
      "--organizer-consent", "given", "--recorded-by", "fixture-operator", "--confirmed-no-alternative"], {
      recordDir, wait: () => new Promise((r) => setTimeout(r, 50)), finalize: async (...a) => { finalized.push(a); },
      telegram: silentTelegram(alerts), platform: "win32", // OBS flow is platform-independent once the Windows-only gate is satisfied
      obs: { obs: fake.obs, connectObs: async () => undefined, confirmBotWindow: async () => true, subscribeLevel: () => () => {},
        config: { python: process.execPath, joinScript: FIXTURE, profileDir: join(dir, "profile"), log: () => {} } },
    });
    return { finalized, stateLeft: existsSync(leanRestorePath(recordDir)) };
  } finally {
    if (prevPw === undefined) delete process.env.OBS_WS_PASSWORD; else process.env.OBS_WS_PASSWORD = prevPw;
    rmSync(dir, { recursive: true, force: true });
  }
}
const T = { timeout: 90_000 };
const recordedFile = (): { dir: string; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-lean-out-")), out = join(dir, "o.mkv");
  writeFileSync(out, "recording-bytes");
  return { dir, out };
};

test("runRecord (OBS): apply -> record -> stop -> restore runs in exactly that order and leaves the operator's profile as found", T, async () => {
  const { dir, out } = recordedFile();
  const fake = fakeObs({ stopPath: out });
  const alerts: string[] = [];
  try {
    const r = await driveObsRecord(fake, alerts);
    const interesting = fake.calls.filter((c) => ["SetVideoSettings", "SetProfileParameter", "StartRecord", "StopRecord"].includes(c.name))
      .map((c) => c.name === "SetProfileParameter" ? `${c.name}:${c.args.parameterName}=${c.args.parameterValue}` : c.name);
    assert.deepEqual(interesting, [
      "SetVideoSettings", "SetProfileParameter:VBitrate=500", "SetProfileParameter:ABitrate=64", // apply (lean)
      "StartRecord", "StopRecord",                                                                // record, stop
      "SetVideoSettings", "SetProfileParameter:VBitrate=2500", "SetProfileParameter:ABitrate=160", // restore (operator's values)
    ]);
    assert.deepEqual(fake.calls.filter((c) => c.name === "SetVideoSettings").map((c) => c.args), [LEAN_VIDEO, OPERATOR_VIDEO]);
    assert.deepEqual(fake.state.video, OPERATOR_VIDEO);
    assert.equal(fake.state.profile["SimpleOutput/VBitrate"], "2500");
    assert.equal(r.stateLeft, false); assert.deepEqual(alerts, []); assert.equal(r.finalized.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runRecord (OBS): a restore that fails raises the alert through the notifier (and the recording still finalizes)", T, async () => {
  const { dir, out } = recordedFile();
  // refuse only the RESTORE of the video settings (the lean set has width 1280, the operator's has 1920)
  const fake = fakeObs({ stopPath: out, onCall: (n, a) => { if (n === "SetVideoSettings" && a.baseWidth === 1920) throw new Error("restore refused (simulated)"); } });
  const alerts: string[] = [];
  try {
    const r = await driveObsRecord(fake, alerts);
    assert.equal(alerts.length, 1); assert.match(alerts[0]!, /OBS profile NOT restored/); assert.match(alerts[0]!, /SetVideoSettings/);
    assert.equal(r.stateLeft, true, "state kept for a retry");
    assert.equal(r.finalized.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("crash then `lkb finalize --stop-obs`: the leftover state restores the operator's profile after StopRecord; a stuck restore alerts", T, async () => {
  for (const stuck of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), "lkb-lean-crash-")), recordDir = join(root, "record"), profile = join(root, "profile");
    mkdirSync(recordDir, { recursive: true });
    const media = join(root, "existing.mkv"); writeFileSync(media, "retained");
    const fake = fakeObs({ stopPath: media, onCall: (n, a) => { if (stuck && n === "SetProfileParameter" && a.parameterValue === "160") throw new Error("stuck (simulated)"); } });
    const alerts: string[] = [];
    try {
      // The "crashed controller": it applied lean settings, started recording, and then died without stop().
      await applyLeanVideoToObs(fake.obs, {}, () => {}, { stateFile: leanRestorePath(recordDir) });
      await fake.obs.call("StartRecord");
      assert.equal(fake.state.recording, true); assert.deepEqual(fake.state.video, LEAN_VIDEO);
      const before = fake.calls.length;
      await runFinalize(["--session-id", "crashed", "--tenant", "fixture", "--title", "crashed", "--stop-obs", "--video", media],
        { obs: fake.obs, repoRoot: root, recordDir, profileDir: profile, normalize: (v: string) => v, finalize: async () => {}, telegram: silentTelegram(alerts) });
      const after = names(fake.calls.slice(before));
      assert.ok(after.indexOf("StopRecord") >= 0 && after.indexOf("StopRecord") < after.indexOf("SetVideoSettings"), after.join(","));
      assert.deepEqual(fake.state.video, OPERATOR_VIDEO);
      assert.equal(fake.state.profile["SimpleOutput/VBitrate"], "2500");
      assert.equal(existsSync(leanRestorePath(recordDir)), stuck);
      assert.equal(alerts.length, stuck ? 1 : 0);
      if (stuck) assert.match(alerts[0]!, /SimpleOutput\/ABitrate/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("record-commands.ts still passes leanVideo: {} to createObsBrowserDeps (the behaviour tests above fail without it; pin kept as a tripwire)", async () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture", "record-commands.ts"), "utf8");
  assert.match(/createObsBrowserDeps\(\{[\s\S]*?\n  \}, inject\.obs\);/.exec(src)?.[0] ?? "", /leanVideo: \{\},/);
});
