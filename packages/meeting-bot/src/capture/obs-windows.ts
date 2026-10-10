/**
 * packages/meeting-bot/src/capture/obs-windows.ts — the first REAL deps for joiners/browser-joiner.ts (T-024b / U4.2, 2026-09-24). Windows-only.
 *
 * Join  = spawn py/sb_join.py: a headed SeleniumBase-UC Chrome with its own persistent profile
 *         (data/bot-profile/, logged in once by the user → the bot attends "as him"), which pins
 *         its window title to a unique string.
 * Record = OBS over obs-websocket v5: a dedicated scene with a window capture + an Application
 *         Audio Capture, both matched by that title ("window title must match"). WASAPI process
 *         loopback then hears only the bot Chrome's process tree — not the user's own Chrome,
 *         not a parallel Meet. Global desktop/mic inputs are muted for the run and restored.
 *
 * Why OBS rather than in-browser tab capture: it is already installed and needed zero new
 * capture code for the first live run. Replacing it with tab capture (puppeteer-stream style)
 * is phase 2 in the plan.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { OBSWebSocket } from "obs-websocket-js";

import type { JoinOpts, JoinResult } from "../joiner.js";
import type { BrowserJoinerDeps } from "../joiners/browser-joiner.js";
import { ensureObsReady, type ObsGuardProbes } from "./obs-guard.js";
import { browserProfileArgs } from "./browser/browser-profile.js";

export interface BotEvent {
  event: string;
  t: number;
  [k: string]: unknown;
}

/** Minimal `OBSWebSocket` shape used here. Test seam (T-033, ISS-300) for injecting a fake client. */
export interface ObsClientLike {
  connect: (url: string, password?: string) => Promise<unknown>;
  call: (request: string, args?: unknown) => Promise<any>;
  disconnect: () => Promise<void>;
}

export interface ObsBrowserConfig {
  obsUrl: string;
  obsPassword: string;
  /** e.g. C:\Program Files\obs-studio\bin\64bit\obs64.exe — launched if OBS is not running. */
  obsExe: string;
  python: string;
  joinScript: string;
  profileDir: string;
  recordDir: string;
  browserExecutable?: string;
  profileDirectory?: string;
  /** Let the bot click Join/computer-audio buttons. Only for web clients that need it (Zoho):
   * on arbitrary sites a "Join" button can be anything (YouTube: channel membership). */
  autoClick?: boolean;
  /** Called for every JSON line sb_join.py prints. */
  onEvent?: (handle: string, ev: BotEvent) => void;
  log?: (msg: string) => void;
  /** ISS-324: give up only after the child has been SILENT this long (default 90s). Not a total
   * budget — sb_join.py ticks "bootstrapping" every 10s while SB() brings the browser up. */
  openStallMs?: number;
  /** ISS-324: absolute ceiling on reaching "opened", however chatty the child is (default 480s). */
  openCapMs?: number;
}

const SCENE = "LKB Bot";
export const AUDIO_INPUT = "LKB Bot Audio"; // T-031: also the InputVolumeMeters filter name
const VIDEO_INPUT = "LKB Bot Window";
const WINDOW_PRIORITY_TITLE = 1; // OBS window-helpers: CLASS=0, TITLE=1 ("title must match"), EXE=2

interface Run {
  child: ChildProcess;
  stopFile: string;
  exited: Promise<number | null>;
  mutedByUs: string[];
  outputPath?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function botWindowTitle(handle: string): string {
  return `LKB-BOT ${handle}`;
}

/** OBS window spec "title:class:exe" — ':' inside a field is encoded as '#3A'. Chrome's window
 * title is "<document.title> - Google Chrome", and title priority needs an exact match. */
function windowSpec(title: string): string {
  return `${title.replace(/:/g, "#3A")} - Google Chrome:Chrome_WidgetWin_1:chrome.exe`;
}

function isObsProcessRunning(): boolean {
  try {
    const r = spawnSync("tasklist", ["/FI", "IMAGENAME eq obs64.exe", "/NH"], { encoding: "utf8", timeout: 10_000 });
    return (r.stdout ?? "").toLowerCase().includes("obs64.exe");
  } catch {
    return false;
  }
}

/** Sends WM_CLOSE to OBS's main window (Process.CloseMainWindow) — the graceful-shutdown signal;
 * never a taskkill /F. A no-op if OBS isn't running or has no visible main window. */
function requestObsGracefulClose(): void {
  spawnSync("powershell", ["-NoProfile", "-Command",
    "Get-Process obs64 -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }"],
    { encoding: "utf8", timeout: 10_000 });
}

/** OBS 32 removed --disable-shutdown-check (obsproject/obs-studio#12650); the documented
 * replacement is clearing this unclean-shutdown sentinel before relaunch so OBS boots normally
 * instead of offering Safe Mode. `.sentinel` has been reported as either a file or a folder
 * depending on version, so this removes either. */
function clearObsShutdownSentinel(): void {
  if (!process.env.APPDATA) return; // nothing we can safely target
  rmSync(path.join(process.env.APPDATA, "obs-studio", ".sentinel"), { force: true, recursive: true });
}

/** Exported only as a test seam for ISS-337: the `child.on("error")` attachment below cannot be
 * observed through `createObsBrowserDeps` without spawning the whole bot, and a test that fakes the
 * callback would pass even with the listener removed. */
export function launchObsNormally(cfg: ObsBrowserConfig, onError?: (err: Error) => void): void {
  // --disable-shutdown-check kept for older OBS where it still works; clearObsShutdownSentinel
  // above is the part that actually works on OBS 32 (see obs-guard.ts header).
  const child = spawn(cfg.obsExe, ["--minimize-to-tray", "--disable-shutdown-check", "--disable-updater"], {
    cwd: path.dirname(cfg.obsExe),
    detached: true,
    stdio: "ignore",
  });
  // ISS-337: a spawn failure arrives as an async 'error' event. With no listener an EventEmitter
  // throws it, which killed the whole controller on the unattended cold-start path.
  child.on("error", (err: Error) => onError?.(err));
  child.unref();
}

function forceKillObsNeverCall(): never {
  throw new Error("BUG: the OBS guard must never force-kill OBS (T-032 — see obs-guard.ts).");
}

function createRealObsGuardProbes(cfg: ObsBrowserConfig, obs: ObsClientLike, log: (msg: string) => void): ObsGuardProbes {
  return {
    isObsRunning: isObsProcessRunning,
    connectWebsocket: async () => {
      await obs.connect(cfg.obsUrl, cfg.obsPassword);
    },
    requestGracefulClose: async () => requestObsGracefulClose(),
    clearShutdownSentinel: clearObsShutdownSentinel,
    launchObs: (onError) => launchObsNormally(cfg, onError),
    forceKillObs: forceKillObsNeverCall,
    sleep,
    log,
  };
}

/** Test seam (T-033, ISS-300): defaults = today's real behaviour unchanged, so a test can avoid a
 * real OBS process / `Get-Process chrome` poll / tasklist+powershell+obs64.exe recovery flow while
 * still driving the real mute-restore / bot-Chrome-termination logic in `launch`/`stop`. */
export interface ObsBrowserDepsOverrides {
  obs?: ObsClientLike; // defaults to a real `new OBSWebSocket()`
  connectObs?: () => Promise<void>; // defaults to ensureObsReady + system-probe recovery
  confirmBotWindow?: (wantTitle: string) => Promise<boolean>; // defaults to the real chrome-window poll
}

export function createObsBrowserDeps(cfg: ObsBrowserConfig, overrides: ObsBrowserDepsOverrides = {}) {
  const profileArgs = browserProfileArgs(cfg.profileDir, cfg.profileDirectory);
  const log = cfg.log ?? ((m: string) => console.log(`[bot] ${m}`));
  const obs = overrides.obs ?? (new OBSWebSocket() as unknown as ObsClientLike);
  const runs = new Map<string, Run>();
  let connected = false;

  async function connectObs(): Promise<void> {
    if (connected) return;
    if (overrides.connectObs) await overrides.connectObs();
    else await ensureObsReady(createRealObsGuardProbes(cfg, obs, log));
    connected = true;
  }

  async function confirmBotWindowDefault(want: string): Promise<boolean> {
    // One PowerShell process polling internally (spawning one per check cost ~3s each).
    const r = spawnSync("powershell", ["-NoProfile", "-Command",
      `$w='${want}'; for($i=0;$i -lt 60;$i++){ if((Get-Process chrome -EA SilentlyContinue).MainWindowTitle -contains $w){'FOUND';exit}; Start-Sleep -Milliseconds 500 }`],
      { encoding: "utf8", timeout: 45_000 });
    return (r.stdout ?? "").includes("FOUND");
  }
  const confirmBotWindow = overrides.confirmBotWindow ?? confirmBotWindowDefault;

  async function upsertInput(inputName: string, inputKind: string, inputSettings: Record<string, unknown>) {
    const { inputs } = await obs.call("GetInputList");
    if (inputs.some((i: { inputName?: string }) => i.inputName === inputName)) {
      await obs.call("SetInputSettings", { inputName, inputSettings: inputSettings as never, overlay: true });
      try {
        await obs.call("GetSceneItemId", { sceneName: SCENE, sourceName: inputName });
      } catch {
        await obs.call("CreateSceneItem", { sceneName: SCENE, sourceName: inputName });
      }
    } else {
      await obs.call("CreateInput", { sceneName: SCENE, inputName, inputKind, inputSettings: inputSettings as never });
    }
  }

  /** `muted` is filled as inputs are muted, so a caller's catch can restore a partial run. */
  async function prepareScene(title: string, muted: string[]): Promise<void> {
    const { scenes } = await obs.call("GetSceneList");
    if (!scenes.some((s: { sceneName?: string }) => s.sceneName === SCENE)) await obs.call("CreateScene", { sceneName: SCENE });
    const window = windowSpec(title);
    await upsertInput(VIDEO_INPUT, "window_capture", {
      window, priority: WINDOW_PRIORITY_TITLE, method: 2, cursor: false, capture_audio: false,
    });
    await upsertInput(AUDIO_INPUT, "wasapi_process_output_capture", { window, priority: WINDOW_PRIORITY_TITLE });
    await obs.call("SetInputMute", { inputName: AUDIO_INPUT, inputMuted: false });

    // Fit the window capture to the canvas.
    const video = await obs.call("GetVideoSettings");
    const { sceneItemId } = await obs.call("GetSceneItemId", { sceneName: SCENE, sourceName: VIDEO_INPUT });
    await obs.call("SetSceneItemTransform", {
      sceneName: SCENE,
      sceneItemId,
      sceneItemTransform: {
        boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: video.baseWidth, boundsHeight: video.baseHeight,
        positionX: 0, positionY: 0,
      },
    });
    await obs.call("SetCurrentProgramScene", { sceneName: SCENE });

    // Global Desktop/Mic inputs record in every scene — mute them so only the bot is heard.
    const special = await obs.call("GetSpecialInputs");
    for (const name of Object.values(special)) {
      if (typeof name !== "string" || !name) continue;
      const { inputMuted } = await obs.call("GetInputMute", { inputName: name });
      if (!inputMuted) {
        await obs.call("SetInputMute", { inputName: name, inputMuted: true });
        muted.push(name);
      }
    }
    try {
      await obs.call("SetRecordDirectory", { recordDirectory: cfg.recordDir });
    } catch (e) {
      log(`SetRecordDirectory unsupported, using OBS default dir (${String(e)})`);
    }
  }

  async function unmute(names: string[]): Promise<void> {
    for (const name of names) {
      await obs.call("SetInputMute", { inputName: name, inputMuted: false }).catch(() => {});
    }
  }

  async function launch(url: string, _opts: JoinOpts): Promise<JoinResult> {
    const handle = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const title = botWindowTitle(handle);
    mkdirSync(cfg.profileDir, { recursive: true });
    mkdirSync(cfg.recordDir, { recursive: true });
    const stopFile = path.join(cfg.recordDir, `.stop-${handle}`);
    rmSync(stopFile, { force: true });

    // T-031: --reload-file mirrors --stop-file — the audio watchdog's forced-reload channel.
    const pyArgs = [cfg.joinScript, url, "--profile", cfg.profileDir, "--title", title, "--stop-file", stopFile, "--reload-file", path.join(cfg.recordDir, `.reload-${handle}`)];
    pyArgs.push(...profileArgs);
    if (cfg.browserExecutable) pyArgs.push("--browser-executable", cfg.browserExecutable);
    if (!cfg.autoClick) pyArgs.push("--no-click");
    // ISS-324: PYTHONUNBUFFERED so the child's own diagnostics arrive line-by-line instead of
    // sitting in a block-buffered pipe until exit — where child.kill() below destroyed them.
    const child = spawn(cfg.python, pyArgs, {
      stdio: ["ignore", "pipe", "pipe"], windowsHide: false,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    // ISS-324: a spawn failure emits "error" and NEVER "exit". Without this the race below fell
    // through to the timeout branch and blamed the page for a child that never ran at all.
    const spawnFailed = new Promise<Error>((r) => child.on("error", (e) => r(e)));

    // ISS-324: keep what the child actually said, so a failure can report it instead of guessing.
    const tail: string[] = [];
    const remember = (l: string): void => { tail.push(l); if (tail.length > 20) tail.shift(); };

    // ISS-324: any output is liveness; the last event names how far the bring-up actually got.
    let lastStage = "spawned";
    let lastProgressAt = Date.now();
    const progress = (stage: string): void => { lastStage = stage; lastProgressAt = Date.now(); };

    let opened: (() => void) | undefined;
    const openedP = new Promise<void>((r) => (opened = r));
    createInterface({ input: child.stdout! }).on("line", (line) => {
      remember(line);
      let ev: BotEvent;
      try {
        ev = JSON.parse(line) as BotEvent;
      } catch {
        progress("stdout");
        log(`sb_join: ${line}`);
        return;
      }
      progress(ev.event); // starting → bootstrapping… → driver-ready → navigating → opened
      if (ev.event === "opened") opened?.();
      if (ev.event !== "heartbeat") log(`${ev.event} ${JSON.stringify({ ...ev, event: undefined, t: undefined })}`);
      cfg.onEvent?.(handle, ev);
    });
    createInterface({ input: child.stderr! }).on("line", (l) => {
      if (!l.trim()) return;
      remember(`stderr: ${l}`);
      progress("stderr");
      log(`sb_join stderr: ${l}`);
    });

    // ISS-324 root cause: the old fixed 120 s budget covered the ENTIRE opaque SB() browser
    // bring-up (chromedriver fetch/patch + large signed-in profile load), which emits nothing —
    // so a slow cold start was reported as "did not open the page", naming a page never reached.
    // The budget now resets on every progress event and fires only when progress itself stalls.
    const stallMs = cfg.openStallMs ?? 90_000;
    const capMs = cfg.openCapMs ?? 480_000;
    const startedAt = Date.now();
    let settled = false;
    const stalled = (async () => {
      const poll = Math.max(25, Math.min(1000, Math.floor(stallMs / 4)));
      for (;;) {
        await sleep(poll);
        if (settled) return "opened" as const; // race already decided; stop polling
        if (Date.now() - lastProgressAt >= stallMs) return "stalled" as const;
        if (Date.now() - startedAt >= capMs) return "cap" as const;
      }
    })();

    const outcome = await Promise.race([
      openedP.then(() => "opened" as const),
      exited.then(() => "exited" as const),
      spawnFailed.then((e) => e),
      stalled,
    ]);
    settled = true;
    if (outcome !== "opened") {
      child.kill();
      const said = tail.length ? ` last output: ${tail.slice(-5).join(" | ")}` : " child produced NO output";
      if (outcome instanceof Error) {
        throw new Error(`bot browser failed to start: could not spawn '${cfg.python}' (${outcome.message}).${said}`);
      }
      const why = outcome === "exited" ? "child exited"
        : outcome === "cap" ? `no page within the ${Math.round(capMs / 1000)}s cap`
          : `no progress for ${Math.round(stallMs / 1000)}s`;
      throw new Error(`bot browser did not open the page (${why}; last stage: ${lastStage}).${said}`);
    }

    const mutedByUs: string[] = [];
    try {
      // OBS matches the window by exact title; recording before the pin lands records black +
      // silence (what the first smoke run produced). Confirm the window exists first.
      const want = `${title} - Google Chrome`;
      const seen = await confirmBotWindow(want);
      if (!seen) throw new Error(`bot window '${want}' never appeared — OBS would record nothing`);
      log(`bot window confirmed: '${want}'`);
      await connectObs();
      await prepareScene(title, mutedByUs);
      await obs.call("StartRecord");
    } catch (e) {
      // Restore any desktop/mic inputs muted before the failure — nothing else ever would.
      await unmute(mutedByUs);
      // Never leave an orphan bot Chrome holding the profile lock (its pipes also keep node alive).
      writeFileSync(stopFile, "stop");
      await Promise.race([exited, sleep(15_000)]);
      child.kill();
      throw e;
    }
    log(`recording started (scene '${SCENE}', window '${title}')`);
    runs.set(handle, { child, stopFile, exited, mutedByUs });
    return { sessionHandle: handle, mediaStream: undefined };
  }

  async function stop(handle: string): Promise<void> {
    const run = runs.get(handle);
    if (!run) return;
    try {
      const res = await obs.call("StopRecord");
      run.outputPath = res.outputPath;
      // StopRecord returns before the muxer has flushed; reading early gave "File ended
      // prematurely" and a truncated audio track. Wait until the size is stable for 3s.
      let last = -1;
      for (let stable = 0, i = 0; stable < 3 && i < 60; i++) {
        await sleep(1000);
        const size = existsSync(res.outputPath) ? statSync(res.outputPath).size : -1;
        stable = size === last && size > 0 ? stable + 1 : 0;
        last = size;
      }
      log(`recording stopped → ${res.outputPath} (${last} bytes)`);
    } finally {
      await unmute(run.mutedByUs);
      writeFileSync(run.stopFile, "stop");
      const code = await Promise.race([run.exited, sleep(20_000).then(() => "timeout" as const)]);
      if (code === "timeout") run.child.kill();
      rmSync(run.stopFile, { force: true });
    }
  }

  const deps: BrowserJoinerDeps = { launch, stop };
  return {
    deps,
    outputPath: (handle: string) => runs.get(handle)?.outputPath,
    browserExited: (handle: string) => runs.get(handle)?.exited,
    // T-031: writes the reload-file sentinel this handle's pyArgs passed above.
    triggerReload: (handle: string) => runs.has(handle) && writeFileSync(path.join(cfg.recordDir, `.reload-${handle}`), "reload"),
    disconnect: async () => {
      if (connected) await obs.disconnect();
    },
  };
}
