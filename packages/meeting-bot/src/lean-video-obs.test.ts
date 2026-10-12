/**
 * T-035 wiring tests (lane leanwire). Fake OBS client, fake telegram send, fake size/probe seams.
 * Never launches OBS, ffmpeg, Chrome or the Python joiner (the join child is the tiny node fixture the
 * existing obs-windows tests already use).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { applyLeanVideoToObs } from "./lean-video-obs.js";
import { createObsBrowserDeps, type ObsClientLike, type ObsBrowserConfig } from "./capture/obs-windows.js";
import { finalizeRecordingWith, measuredMbPerHour } from "./capture/record-finalize.js";
import { createTelegramNotifier, type TelegramNotifier } from "./capture/telegram-alerts.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "capture", "fake-join-fixture.mjs");
type Call = { name: string; args?: any };

const LEAN_VIDEO = { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720, fpsNumerator: 5, fpsDenominator: 1 };
const LEAN_PARAMS = [
  { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: "500" },
  { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: "64" },
];

function fakeObs(opts: { refuse?: string[]; startFails?: boolean; stopPath?: string } = {}) {
  const calls: Call[] = [];
  const obs: ObsClientLike = {
    connect: async () => undefined, disconnect: async () => {},
    call: async (name: string, args?: any) => {
      calls.push({ name, args });
      if (opts.refuse?.includes(name)) throw new Error(`${name} refused (simulated)`);
      switch (name) {
        case "GetInputList": return { inputs: [] };
        case "GetSceneList": return { scenes: [] };
        case "GetSceneItemId": return { sceneItemId: 1 };
        case "GetVideoSettings": return { baseWidth: 1280, baseHeight: 720 };
        case "GetSpecialInputs": return {};
        case "StartRecord": if (opts.startFails) throw new Error("StartRecord rejected (simulated)"); return {};
        case "StopRecord": return { outputPath: opts.stopPath };
        default: return {};
      }
    },
  };
  return { obs, calls };
}
const names = (calls: Call[]) => calls.map((c) => c.name);

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
  assert.deepEqual(calls, [
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
  assert.equal(calls[0]!.args.fpsNumerator, 30);
  assert.equal(calls[1]!.args.parameterValue, "4000");
  assert.equal(calls[2]!.args.parameterValue, "192");
  assert.ok(logs.some((l) => /NOT under 400 MB\/h/.test(l)), logs.join("|"));
});

test("applyLeanVideoToObs is fail-soft: refused requests are listed, the rest are still sent, nothing throws", async () => {
  const { obs, calls } = fakeObs({ refuse: ["SetVideoSettings"] });
  const r = await applyLeanVideoToObs(obs, {}, () => {});
  assert.deepEqual(r.failed, ["SetVideoSettings"]);
  assert.deepEqual(names(calls), ["SetVideoSettings", "SetProfileParameter", "SetProfileParameter"]);
});

test("launch() with leanVideo {} applies lean settings after the scene is built and BEFORE GetVideoSettings and StartRecord", async () => {
  const calls = await launchOnly({ leanVideo: {} });
  const n = names(calls);
  const sv = n.indexOf("SetVideoSettings");
  assert.ok(sv > n.indexOf("GetSceneList") && sv < n.indexOf("GetVideoSettings"), n.join(","));
  assert.deepEqual(calls.filter((c) => c.name === "SetVideoSettings").map((c) => c.args), [LEAN_VIDEO]);
  assert.deepEqual(calls.filter((c) => c.name === "SetProfileParameter").map((c) => c.args), LEAN_PARAMS);
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

// --- over-target report ------------------------------------------------------------------------

function root(): string {
  const r = mkdtempSync(join(tmpdir(), "lkb-lean-fin-"));
  writeFileSync(join(r, "v.mkv"), "x"); mkdirSync(join(r, "raw", "webinars"), { recursive: true });
  return r;
}
const extract = (_v: string, out: string) => writeFileSync(out, "a");
async function finalize(sizeBytes: number | (() => number), durationSec: number, sent: string[], plain = false) {
  const r = root();
  const telegram = createTelegramNotifier({ token: "t", chatId: "c", send: async (_t, _c, text) => { sent.push(text); }, log: () => {} });
  try {
    await finalizeRecordingWith({ repoRoot: r, probeMedia: () => durationSec, extractAudio: extract, measureVolume: () => ({ maxDb: -20, meanDb: -30 }),
      videoSizeBytes: typeof sizeBytes === "function" ? sizeBytes : () => sizeBytes },
      join(r, "v.mkv"), "sess-lean", "Lean Session", "zoho", false, [], plain ? undefined : telegram, durationSec);
    await new Promise((x) => setTimeout(x, 20));
  } finally { rmSync(r, { recursive: true, force: true }); }
}
const overTarget = (sent: string[]) => sent.filter((s) => s.includes("over size target"));

test("measuredMbPerHour: 1 hour of 400,000,000 bytes is exactly 400; unusable inputs give undefined", () => {
  assert.equal(measuredMbPerHour(400_000_000, 3600), 400);
  assert.equal(measuredMbPerHour(100_000_000, 900), 400);
  for (const [s, d] of [[0, 60], [-1, 60], [10, 0], [10, NaN], [NaN, 10], [Infinity, 10]] as const) assert.equal(measuredMbPerHour(s, d), undefined);
});

test("finalize: a 2.7 GB/h recording (the live run) sends one over-target alert with the numbers", async () => {
  const sent: string[] = [];
  await finalize(2_700_000_000, 3600, sent);
  const o = overTarget(sent);
  assert.equal(o.length, 1);
  assert.match(o[0]!, /Lean Session/); assert.match(o[0]!, /2700\.0 MB\/h/); assert.match(o[0]!, /under 400 MB\/h/); assert.match(o[0]!, /2700\.0 MB over 60m/);
});

test("finalize: exactly 400 MB/h is NOT under the target and alerts; 399,999,000 bytes/h does not", async () => {
  const at: string[] = [], below: string[] = [];
  await finalize(400_000_000, 3600, at);
  await finalize(399_999_000, 3600, below);
  assert.equal(overTarget(at).length, 1);
  assert.equal(overTarget(below).length, 0);
});

test("finalize: a lean-sized recording (258.9 MB/h) sends no over-target alert but still sends 'Finished'", async () => {
  const sent: string[] = [];
  await finalize(258_876_000, 3600, sent);
  assert.equal(overTarget(sent).length, 0);
  assert.equal(sent.filter((s) => s.startsWith("🏁 Finished")).length, 1);
});

test("finalize: an unreadable size never fails the finalize and sends no alert", async () => {
  const sent: string[] = [];
  await finalize(() => { throw new Error("stat failed"); }, 3600, sent);
  assert.equal(overTarget(sent).length, 0);
});

test("finalize: a notifier without notifyOverTarget (older fake) does not break an over-target finalize", async () => {
  const r = root();
  let finished = false;
  try {
    await finalizeRecordingWith({ repoRoot: r, probeMedia: () => 60, extractAudio: extract, measureVolume: () => ({ maxDb: -20, meanDb: -30 }), videoSizeBytes: () => 9e9 },
      join(r, "v.mkv"), "sess-old", "Old", "zoho", false, [], { enabled: false, notifyFinished: () => { finished = true; } } as unknown as TelegramNotifier, 60);
    assert.equal(finished, true);
  } finally { rmSync(r, { recursive: true, force: true }); }
});

// runRecord's OBS branch needs a real OBSWebSocket + password, so it cannot be driven here (ISS-LEANWIRE-002).
// Source-text pin: the production OBS config in record-commands.ts opts in to lean video.
test("record-commands.ts passes leanVideo: {} to createObsBrowserDeps (source pin, see ISS-LEANWIRE-002)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture", "record-commands.ts"), "utf8");
  const call = /createObsBrowserDeps\(\{[\s\S]*?\n  \}\);/.exec(src)?.[0] ?? "";
  assert.match(call, /leanVideo: \{\},/);
});
