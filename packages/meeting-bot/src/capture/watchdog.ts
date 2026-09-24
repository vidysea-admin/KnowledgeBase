/**
 * packages/meeting-bot/src/capture/watchdog.ts — T-047 finalize-on-restart watchdog. Detects
 * "OBS is recording, but no live record controller for it" — the 2026-09-24 16:30:56 failure
 * where the console running `record` was closed, OBS and the bot Chrome kept going, and nothing
 * stopped/finalized/transcribed the recording until a human ran `lkb finalize --stop-obs` — and
 * runs that same recovery path automatically. Reuses `runFinalize` (record-commands.ts); this
 * file never re-implements the stop-OBS/unmute/close-Chrome sequence.
 *
 * Designed to run on a timer (Task Scheduler, every few minutes): every call is one idempotent
 * check, not a long-running loop, and it is a safe no-op whenever nothing is recording.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OBSWebSocket } from "obs-websocket-js";

import { isPidAlive, readControllerState, removeControllerState, type RecordState } from "./controller-state.js";
import { runFinalize } from "./record-commands.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");

export type WatchdogAction =
  | { kind: "noop-idle" }
  | { kind: "noop-active"; state: RecordState }
  | { kind: "finalize"; state: RecordState }
  | { kind: "stale-cleanup"; state: RecordState };

/**
 * Pure decision logic, no I/O. `state` is whatever the record process last wrote (undefined if
 * none was ever written, or it was already cleaned up); `controllerAlive` and `obsRecording` are
 * probed separately so this stays trivially unit-testable with injected fakes.
 *
 * No state file → no session info to finalize with, so this is always a no-op even if something
 * happens to be recording (out of scope: that means OBS was started outside this tool's control).
 */
export function decideWatchdogAction(input: {
  state: RecordState | undefined;
  controllerAlive: boolean;
  obsRecording: boolean;
}): WatchdogAction {
  const { state, controllerAlive, obsRecording } = input;
  if (!state) return { kind: "noop-idle" };
  if (controllerAlive) return { kind: "noop-active", state };
  return obsRecording ? { kind: "finalize", state } : { kind: "stale-cleanup", state };
}

export interface WatchdogProbes {
  readState: () => RecordState | undefined;
  isControllerAlive: (pid: number) => boolean;
  isObsRecording: () => Promise<boolean>;
  finalize: (state: RecordState) => Promise<void>;
  clearState: () => void;
  log: (msg: string) => void;
}

/** Runs one watchdog tick against injected probes. This is the part unit tests exercise directly
 * — no real OBS/Chrome, just fakes recording what was called. */
export async function tickWatchdog(probes: WatchdogProbes): Promise<WatchdogAction> {
  const state = probes.readState();
  const controllerAlive = state ? probes.isControllerAlive(state.pid) : false;
  const obsRecording = await probes.isObsRecording();
  const action = decideWatchdogAction({ state, controllerAlive, obsRecording });

  switch (action.kind) {
    case "noop-idle":
      probes.log("watchdog: nothing recording, no controller state — idle");
      break;
    case "noop-active":
      probes.log(`watchdog: session ${action.state.sessionId} has a live controller (pid ${action.state.pid}) — ok`);
      break;
    case "stale-cleanup":
      probes.log(`watchdog: stale state for ${action.state.sessionId} (controller dead, OBS not recording) — clearing`);
      probes.clearState();
      break;
    case "finalize":
      probes.log(`watchdog: controller for ${action.state.sessionId} (pid ${action.state.pid}) is dead but OBS is ` +
        "still recording — finalizing");
      await probes.finalize(action.state);
      probes.clearState();
      break;
  }
  return action;
}

/** `watchdog` CLI command: wires the real probes (OBS websocket, process.kill(pid, 0), the real
 * runFinalize) and runs one tick. Safe to invoke repeatedly/on a timer. */
export async function runWatchdog(_rest: string[]): Promise<void> {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const obsUrl = process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455";
  const obsPassword = process.env.OBS_WS_PASSWORD;

  await tickWatchdog({
    readState: () => readControllerState(RECORD_DIR),
    isControllerAlive: isPidAlive,
    isObsRecording: async () => {
      const obs = new OBSWebSocket();
      try {
        await obs.connect(obsUrl, obsPassword);
        const status = await obs.call("GetRecordStatus");
        return status.outputActive;
      } catch {
        // OBS unreachable — nothing this tick can stop; not an error, just "not recording".
        return false;
      } finally {
        await obs.disconnect().catch(() => {});
      }
    },
    finalize: (state) =>
      runFinalize(["--session-id", state.sessionId, "--title", state.title, "--platform", state.platform, "--stop-obs"]),
    clearState: () => removeControllerState(RECORD_DIR),
    log: (msg) => console.log(`[bot] ${msg}`),
  });
}
