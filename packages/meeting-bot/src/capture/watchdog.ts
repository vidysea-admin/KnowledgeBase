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

import { isControllerAlive, readControllerState, removeControllerState, type RecordState } from "./controller-state.js";
import { runFinalize } from "./record-commands.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");

/**
 * ISS-T-047-CONTROLLER-001: "recording"/"idle" are confirmed states (a successful GetRecordStatus
 * call); "unknown" means the probe itself couldn't tell (OBS websocket unreachable, timed out,
 * mid-restart, etc) — NOT the same as a confirmed "not recording", and must never be treated as
 * grounds to clear the one artifact recovery depends on.
 */
export type ObsStatus = "recording" | "idle" | "unknown";

export type WatchdogAction =
  | { kind: "noop-idle" }
  | { kind: "noop-active"; state: RecordState }
  | { kind: "finalize"; state: RecordState }
  | { kind: "stale-cleanup"; state: RecordState }
  | { kind: "noop-unknown"; state: RecordState };

/**
 * Pure decision logic, no I/O. `state` is whatever the record process last wrote (undefined if
 * none was ever written, or it was already cleaned up); `controllerAlive` and `obsStatus` are
 * probed separately so this stays trivially unit-testable with injected fakes.
 *
 * No state file → no session info to finalize with, so this is always a no-op even if something
 * happens to be recording (out of scope: that means OBS was started outside this tool's control).
 *
 * `obsStatus: "unknown"` (controller dead, can't confirm OBS either way) is ALWAYS a wait/retry —
 * `noop-unknown` — never `stale-cleanup` and never `finalize`: it is exactly as wrong to finalize
 * on unconfirmed "recording" as it is to clear state on unconfirmed "not recording".
 */
export function decideWatchdogAction(input: {
  state: RecordState | undefined;
  controllerAlive: boolean;
  obsStatus: ObsStatus;
}): WatchdogAction {
  const { state, controllerAlive, obsStatus } = input;
  if (!state) return { kind: "noop-idle" };
  if (controllerAlive) return { kind: "noop-active", state };
  if (obsStatus === "unknown") return { kind: "noop-unknown", state };
  return obsStatus === "recording" ? { kind: "finalize", state } : { kind: "stale-cleanup", state };
}

/** Minimal shape of the OBS client `createGetObsStatus` needs — just enough of `OBSWebSocket` to
 * be fakeable in tests without a real websocket/network dependency. */
export interface ObsStatusClient {
  connect(url: string, password?: string): Promise<unknown>;
  call(requestType: "GetRecordStatus"): Promise<{ outputActive: boolean }>;
  disconnect(): Promise<unknown>;
}

/**
 * Builds the real `getObsStatus` probe. `makeClient` defaults to a real `OBSWebSocket` but is
 * injectable so a test can exercise this exact function's error path (ISS-T-047-CONTROLLER-001)
 * with a fake client whose `connect` throws, instead of a hand-rewritten stand-in.
 */
export function createGetObsStatus(
  obsUrl: string,
  obsPassword: string | undefined,
  makeClient: () => ObsStatusClient = () => new OBSWebSocket() as unknown as ObsStatusClient,
): () => Promise<ObsStatus> {
  return async () => {
    const obs = makeClient();
    try {
      await obs.connect(obsUrl, obsPassword);
      const status = await obs.call("GetRecordStatus");
      return status.outputActive ? "recording" : "idle";
    } catch {
      // ISS-T-047-CONTROLLER-001: connect/call failed — OBS's actual recording state cannot be
      // confirmed either way this tick (never log the error object itself: it can carry the
      // connect URL, and OBS_WS_PASSWORD is a connect argument this catch has no reason to touch,
      // but the safest rule is "no probe error content in logs, ever").
      return "unknown";
    } finally {
      await obs.disconnect().catch(() => {});
    }
  };
}

export interface WatchdogProbes {
  readState: () => RecordState | undefined;
  /** Takes the full state (not just the pid) so the real wiring can also check controller
   * identity beyond bare pid reuse (ISS-T-047-CONTROLLER-002; see controller-state.ts's
   * `isControllerAlive`). */
  isControllerAlive: (state: RecordState) => boolean;
  getObsStatus: () => Promise<ObsStatus>;
  finalize: (state: RecordState) => Promise<void>;
  clearState: () => void;
  log: (msg: string) => void;
}

/** Runs one watchdog tick against injected probes. This is the part unit tests exercise directly
 * — no real OBS/Chrome, just fakes recording what was called. */
export async function tickWatchdog(probes: WatchdogProbes): Promise<WatchdogAction> {
  const state = probes.readState();
  const controllerAlive = state ? probes.isControllerAlive(state) : false;
  const obsStatus = await probes.getObsStatus();
  const action = decideWatchdogAction({ state, controllerAlive, obsStatus });

  switch (action.kind) {
    case "noop-idle":
      probes.log("watchdog: nothing recording, no controller state — idle");
      break;
    case "noop-active":
      probes.log(`watchdog: session ${action.state.sessionId} has a live controller (pid ${action.state.pid}) — ok`);
      break;
    case "noop-unknown":
      probes.log(`watchdog: controller for ${action.state.sessionId} is dead but OBS status could not be ` +
        "confirmed this tick (websocket unreachable/erroring) — leaving state in place, will retry next tick");
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
  const log = (msg: string) => console.log(`[bot] ${msg}`);

  await tickWatchdog({
    readState: () => readControllerState(RECORD_DIR),
    isControllerAlive,
    getObsStatus: createGetObsStatus(obsUrl, obsPassword),
    finalize: (state) =>
      runFinalize(["--session-id", state.sessionId, "--title", state.title, "--platform", state.platform, "--stop-obs"]),
    clearState: () => removeControllerState(RECORD_DIR),
    log,
  });
}
