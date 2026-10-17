/** T-035 wiring tests, part 2: runRecord/runFinalize OBS flows (split from lean-video-obs.test.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { applyLeanVideoToObs, leanRestorePath } from "./lean-video-obs.js";
import { runFinalize, runRecord } from "./capture/record-commands.js";
import type { TelegramNotifier } from "./capture/notify/telegram-alerts.js";
import { LEAN_VIDEO, OPERATOR_VIDEO, fakeObs, names, sets } from "./lean-video-obs-fake.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "capture", "fake-join-fixture.mjs");
const tmp = (): string => mkdtempSync(join(tmpdir(), "lkb-lean-state-"));

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

