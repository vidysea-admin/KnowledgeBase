/**
 * packages/meeting-bot/src/capture/obs-windows.test.ts — T-033 / ISS-300 / contract C9+C3.
 * Drives `createObsBrowserDeps` with a fully injected fake OBS client (`ObsBrowserDepsOverrides`,
 * added this unit), an overridden `connectObs` (so no real tasklist/powershell/obs64.exe recovery
 * flow ever runs), an overridden `confirmBotWindow` (so no real `Get-Process chrome` poll ever
 * runs), and a real but tiny child process (`fake-join-fixture.mjs`, run via `process.execPath`
 * through the already-injectable `cfg.python`/`cfg.joinScript`) standing in for py/sb_join.py.
 *
 * Proves the three OBS-failure paths contract C9 names (StartRecord / connect / StopRecord
 * rejecting): mutes restored are EXACTLY the inputs this run muted (never ones already muted
 * before the run, per C3), and the bot Chrome process is confirmed terminated — observed
 * black-box via the fixture's own reported pid, not by spying on a private `child.kill()` call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createObsBrowserDeps, type ObsClientLike, type ObsBrowserConfig } from "./obs-windows.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SCRIPT = join(HERE, "fake-join-fixture.mjs");

// --- fake OBS client ---------------------------------------------------------------------------

interface FakeObsOpts {
  specialInputs?: Record<string, string>;
  initiallyMuted?: string[]; // input names that report inputMuted:true before the run
  startRecordFails?: boolean;
  stopRecordFails?: boolean;
}

function makeFakeObs(opts: FakeObsOpts = {}) {
  const calls: { name: string; args?: any }[] = [];
  const muteState = new Map<string, boolean>();
  for (const name of Object.values(opts.specialInputs ?? {})) {
    muteState.set(name, (opts.initiallyMuted ?? []).includes(name));
  }
  const obs: ObsClientLike = {
    connect: async () => undefined,
    disconnect: async () => {},
    call: async (request: string, args?: any) => {
      calls.push({ name: request, args });
      switch (request) {
        case "GetInputList": return { inputs: [] };
        case "SetInputSettings": return {};
        case "GetSceneItemId": return { sceneItemId: 1 };
        case "CreateSceneItem": return {};
        case "CreateInput": return {};
        case "GetSceneList": return { scenes: [] };
        case "CreateScene": return {};
        case "SetInputMute":
          muteState.set(args.inputName, args.inputMuted);
          return {};
        case "GetVideoSettings": return { baseWidth: 1920, baseHeight: 1080 };
        case "SetSceneItemTransform": return {};
        case "SetCurrentProgramScene": return {};
        case "GetSpecialInputs": return opts.specialInputs ?? {};
        case "GetInputMute": return { inputMuted: muteState.get(args.inputName) ?? false };
        case "SetRecordDirectory": return {};
        case "StartRecord":
          if (opts.startRecordFails) throw new Error("StartRecord rejected (simulated)");
          return {};
        case "StopRecord":
          if (opts.stopRecordFails) throw new Error("StopRecord rejected (simulated)");
          return { outputPath: join(tmpdir(), "does-not-need-to-exist.mkv") };
        default:
          throw new Error(`fake obs: unhandled request ${request}`);
      }
    },
  };
  return { obs, calls };
}

function muteCallsFor(calls: { name: string; args?: any }[], inputName: string): boolean[] {
  return calls.filter((c) => c.name === "SetInputMute" && c.args?.inputName === inputName)
    .map((c) => c.args.inputMuted as boolean);
}

// --- process-liveness helpers (black-box termination proof) ------------------------------------

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilDead(pid: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
}

// --- test scaffolding ----------------------------------------------------------------------

function makeCfg(overrides: Partial<ObsBrowserConfig> & { onOpened: (pid: number) => void }): ObsBrowserConfig {
  const profileDir = mkdtempSync(join(tmpdir(), "lkb-obs-profile-"));
  const recordDir = mkdtempSync(join(tmpdir(), "lkb-obs-record-"));
  return {
    obsUrl: "ws://127.0.0.1:0",
    obsPassword: "unused",
    obsExe: "unused.exe",
    python: process.execPath,
    joinScript: FIXTURE_SCRIPT,
    profileDir,
    recordDir,
    autoClick: false,
    onEvent: (_h, ev) => {
      if (ev.event === "opened" && typeof ev.pid === "number") overrides.onOpened(ev.pid);
    },
    log: () => {},
    ...overrides,
  };
}

function cleanupCfg(cfg: ObsBrowserConfig): void {
  rmSync(cfg.profileDir, { recursive: true, force: true });
  rmSync(cfg.recordDir, { recursive: true, force: true });
}

// --- StartRecord rejecting -----------------------------------------------------------------

test("obs-windows launch(): StartRecord rejecting restores exactly this run's mutes and terminates the bot Chrome", async () => {
  let pid = -1;
  const cfg = makeCfg({ onOpened: (p) => (pid = p) });
  const { obs, calls } = makeFakeObs({
    specialInputs: { d: "Desktop Audio", m: "Mic/Aux" },
    initiallyMuted: ["Desktop Audio"], // already muted BEFORE this run — must never be touched
    startRecordFails: true,
  });
  try {
    const { deps } = createObsBrowserDeps(cfg, {
      obs, connectObs: async () => undefined, confirmBotWindow: async () => true,
    });
    await assert.rejects(() => deps.launch("https://example.com/meet", { tenantId: "t1" }),
      /StartRecord rejected/);

    assert.ok(pid > 0, "fixture should have reported its pid via the 'opened' event");
    assert.ok(await waitUntilDead(pid), "bot Chrome (fixture) process must be terminated after a StartRecord failure");

    assert.deepEqual(muteCallsFor(calls, "Mic/Aux"), [true, false],
      "Mic/Aux was not muted before the run — must be muted then restored (unmuted)");
    assert.deepEqual(muteCallsFor(calls, "Desktop Audio"), [],
      "Desktop Audio was ALREADY muted before the run — must never be touched by mute or restore");
  } finally {
    cleanupCfg(cfg);
  }
});

// --- connect rejecting -----------------------------------------------------------------------

test("obs-windows launch(): connect (OBS unreachable) rejecting touches no mutes and terminates the bot Chrome", async () => {
  let pid = -1;
  const cfg = makeCfg({ onOpened: (p) => (pid = p) });
  const { obs, calls } = makeFakeObs({
    specialInputs: { d: "Desktop Audio" },
    initiallyMuted: ["Desktop Audio"],
  });
  try {
    const { deps } = createObsBrowserDeps(cfg, {
      obs,
      connectObs: async () => { throw new Error("OBS unreachable (simulated)"); },
      confirmBotWindow: async () => true,
    });
    await assert.rejects(() => deps.launch("https://example.com/meet", { tenantId: "t1" }),
      /OBS unreachable/);

    assert.ok(pid > 0, "fixture should have reported its pid via the 'opened' event");
    assert.ok(await waitUntilDead(pid), "bot Chrome (fixture) process must be terminated even when connect fails before any scene setup");

    assert.equal(calls.filter((c) => c.name === "SetInputMute").length, 0,
      "connect fails before prepareScene ever runs — the restored set must be exactly empty, nothing wrongly touched");
  } finally {
    cleanupCfg(cfg);
  }
});

// --- StopRecord rejecting ------------------------------------------------------------------

test("obs-windows stop(): StopRecord rejecting still restores this run's mutes and terminates the bot Chrome", async () => {
  let pid = -1;
  const cfg = makeCfg({ onOpened: (p) => (pid = p) });
  const { obs, calls } = makeFakeObs({
    specialInputs: { m: "Mic/Aux" },
    initiallyMuted: [],
    startRecordFails: false,
    stopRecordFails: true,
  });
  try {
    const { deps } = createObsBrowserDeps(cfg, {
      obs, connectObs: async () => undefined, confirmBotWindow: async () => true,
    });
    const { sessionHandle } = await deps.launch("https://example.com/meet", { tenantId: "t1" });
    assert.ok(pid > 0, "fixture should have reported its pid via the 'opened' event");
    assert.deepEqual(muteCallsFor(calls, "Mic/Aux"), [true], "prepareScene must mute Mic/Aux during a successful launch");

    // `BrowserJoinerDeps.stop` is typed optional (Playwright-shaped interface, browser-joiner.ts);
    // `createObsBrowserDeps` always provides it — assert non-null rather than widen the type.
    assert.ok(deps.stop, "createObsBrowserDeps must always provide stop");
    await assert.rejects(() => deps.stop!(sessionHandle), /StopRecord rejected/);

    assert.deepEqual(muteCallsFor(calls, "Mic/Aux"), [true, false],
      "stop()'s finally must restore the mute even though StopRecord itself threw");
    assert.ok(await waitUntilDead(pid), "bot Chrome (fixture) process must be terminated after stop() despite StopRecord failing");
  } finally {
    cleanupCfg(cfg);
  }
});
