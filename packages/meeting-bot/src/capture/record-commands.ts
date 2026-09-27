/**
 * packages/meeting-bot/src/capture/record-commands.ts — the REAL capture commands (2026-09-24,
 * T-024b / U4.2, D-027): `record`, `login`, `finalize`. Split out of cli.ts for the 300-LOC budget;
 * cli.ts only dispatches. They bypass capture() on purpose: capture() transcribes in-process through
 * an injected ingest Source, while the real transcriber (Gemini File API) lives behind @lkb/ai,
 * which this package may not import — so transcription runs as scripts/transcribe-long-session.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OBSWebSocket } from "obs-websocket-js";

import { createBrowserJoiner } from "../joiners/browser-joiner.js";
import { detectPlatform } from "../platform.js";
import { selectJoinStrategy } from "../strategy.js";
import { createAudioWatchdog, createRealLevelSource } from "./audio-watchdog.js";
import { getProcessStartTime, removeControllerState, writeControllerState } from "./controller-state.js";
import { AUDIO_INPUT, createObsBrowserDeps, type ObsClientLike } from "./obs-windows.js";
import { collectGapEvent, type GapWindow } from "./reconnect-gaps.js";
import { createTelegramNotifier, type TelegramNotifier } from "./telegram-alerts.js";
import { finalizeRecordingWith } from "./record-finalize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const BOT_PROFILE_DIR = path.join(REPO_ROOT, "data", "bot-profile");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");
const JOIN_SCRIPT = path.join(HERE, "..", "..", "py", "sb_join.py");
const OBS_EXE = "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe";

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

/**
 * "HH:MM" (today, local time) OR a full ISO datetime string → Date.
 *
 * ISS-319 fix (fix cycle 2, u5-auto-record-scheduler): a bare `HH:MM` always resolves to
 * *today*, which is correct for a human typing `--until 21:00` at the terminal, but wrong for an
 * auto-scheduled session that crosses midnight (e.g. 23:30-00:45) — the launcher runs on the
 * START day, so `todayAt("00:45")` used to land ~23h in the PAST relative to when the recording
 * begins. A caller that already has the real end instant (schedule-tick.ts's job JSON) now
 * passes a full ISO datetime instead, which this function parses directly — no day-of-week
 * guessing needed. Exported (previously private) so it can be unit-tested without spinning up a
 * real `runRecord`/OBS/browser session.
 */
export function todayAt(hhmmOrIso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}T/.test(hhmmOrIso)) {
    const iso = new Date(hhmmOrIso);
    if (!Number.isNaN(iso.getTime())) return iso;
    throw new Error(`bad ISO datetime '${hhmmOrIso}'`);
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmmOrIso);
  if (!m) throw new Error(`bad time '${hhmmOrIso}', expected HH:MM or an ISO datetime`);
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** U0 (2026-09-25): which `browser`-routed platforms get sb_join.py's auto-click enabled. Pure
 * so the selection is unit-testable without spinning up runRecord's OBS/python side effects.
 * Verified live against a real Zoom webinar join URL (Ashoka Educator Dialogues, 2026-09-25
 * probe): the `/w/<id>` landing page's "Join from browser" button lives in the TOP document
 * (not an iframe) and is already in sb_join.py's JOIN_TEXTS, so autoClick genuinely advances the
 * zoom flow one real step — clicking it navigates to `app.zoom.us/wc/<id>/join` with no human
 * click. Everything past that (name field / Join button / "Join Audio by Computer") renders
 * inside a same-origin iframe that sb_join.py's CLICK_JS does not yet traverse — filed as
 * ISS-U0-1, not fixed here (unverifiable end-to-end: this probe's webinar also requires Zoom
 * account sign-in, which blocks reaching that screen regardless — see ISS-U0-2/HUMAN_GATE in the
 * u0-zoom-browser-join manifest). zoho keeps its original T-024b behavior unchanged. */
export function shouldAutoClick(platform: string): boolean {
  return platform === "zoho" || platform === "zoom";
}

/** `login [url]`: open the bot browser (no clicks, no recording) so the user can sign in once. */
export async function runLogin(rest: string[]): Promise<void> {
  const url = rest[0] ?? "https://accounts.google.com";
  mkdirSync(RECORD_DIR, { recursive: true });
  const stopFile = path.join(RECORD_DIR, ".stop-login");
  console.log(`bot profile: ${BOT_PROFILE_DIR}\nSign in inside the window, then close it.`);
  const child = spawn("python", [JOIN_SCRIPT, url, "--profile", BOT_PROFILE_DIR, "--title", "LKB-BOT login",
    "--stop-file", stopFile, "--no-click"], { stdio: "inherit" });
  await new Promise((r) => child.on("exit", r));
}

/** `record <url> --until HH:MM [--end-not-before HH:MM] [--title T] [--session-id ID] [--transcribe]` */
export async function runRecord(rest: string[]): Promise<void> {
  const url = rest[0];
  const untilArg = flag(rest, "--until");
  if (!url || !untilArg) {
    throw new Error("usage: lkb record <url> --until HH:MM [--end-not-before HH:MM] [--title T] " +
      "[--session-id ID] [--transcribe]\n" +
      "  Run detached so a closed console can't kill it (T-047): powershell -NoProfile " +
      "-ExecutionPolicy Bypass -File scripts/webinar/start-record-detached.ps1 -Url <url> " +
      "-Until HH:MM [-Title T]\n" +
      "  Recover an orphaned recording (OBS still running, no live controller): `lkb watchdog` " +
      "— idempotent, safe on a timer, no-op when nothing is recording");
  }
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const obsPassword = process.env.OBS_WS_PASSWORD;
  if (!obsPassword) throw new Error("OBS_WS_PASSWORD missing from .env");

  const until = todayAt(untilArg);
  const endNotBefore = todayAt(flag(rest, "--end-not-before") ?? untilArg);
  const platform = detectPlatform(url);
  const title = flag(rest, "--title") ?? `${platform} webinar`;
  const sessionId = flag(rest, "--session-id") ?? `${new Date().toISOString().slice(0, 10)}-${slugify(title)}`;
  if (selectJoinStrategy(platform) === "vexa") {
    console.warn(`[bot] '${platform}' is Vexa-routed but no Vexa is deployed — using the local browser bot`);
  }

  let endedAt: number | undefined;
  const gaps: GapWindow[] = []; // T-029: filled from "gap" events on sb_join.py's stdout stream
  // T-030: reads TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from the .env already loaded above; disabled
  // (one log line, never throws) when either is missing.
  const telegram = createTelegramNotifier();
  const bot = createObsBrowserDeps({
    obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455",
    obsPassword,
    obsExe: OBS_EXE,
    python: "python",
    joinScript: JOIN_SCRIPT,
    profileDir: BOT_PROFILE_DIR,
    recordDir: RECORD_DIR,
    autoClick: shouldAutoClick(platform),
    onEvent: (_h, ev) => {
      if (ev.event === "ended" && endedAt === undefined) endedAt = Date.now();
      collectGapEvent(gaps, ev);
      telegram.onBotEvent(ev); // T-030: disconnected (reconnect-reload) / recovered (closed gap)
    },
  });
  const joiner = createBrowserJoiner(bot.deps);

  const startedAt = Date.now();
  const { sessionHandle } = await joiner.join(url, { tenantId: "vidysea", consentNote: title });
  telegram.notifyJoined(title, platform); // T-030
  let gone = false;
  void bot.browserExited(sessionHandle)?.then(() => (gone = true));

  // T-031: live audio watchdog — alerts + forces one reload per silent stretch (>2min of the
  // bot's own capture reading below the silence threshold, e.g. a muted-but-still-connected tab).
  // Stopped unconditionally in the outer `finally` below so no exit path leaves its 1s tick timer
  // or InputVolumeMeters listener dangling.
  const audioWatchdog = createAudioWatchdog({
    now: () => Date.now(),
    subscribeLevel: createRealLevelSource({ obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455", obsPassword, inputName: AUDIO_INPUT }),
    scheduleTick: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    notifySilence: (durationSec) => telegram.notifySilence(durationSec), // T-030's own notifier
    reconnect: () => bot.triggerReload(sessionHandle),
    log: (m) => console.log(`[bot] ${m}`),
  });
  audioWatchdog.start();

  // T-047: written now, removed only once cleanup below actually runs to completion. If this
  // process is killed out from under OBS (console closed — the 2026-09-24 16:30:56 failure),
  // this file is left behind with a pid that's no longer alive; `lkb watchdog` uses exactly that
  // to detect it and finish the job (stop OBS, unmute, close bot Chrome, finalize).
  writeControllerState(RECORD_DIR, {
    pid: process.pid,
    sessionId,
    title,
    platform,
    until: until.toISOString(),
    obsOutputDir: RECORD_DIR,
    startedAt: new Date(startedAt).toISOString(),
    // ISS-T-047-CONTROLLER-002: identity marker beyond the bare pid, so a later watchdog tick can
    // tell this exact process apart from whatever the OS recycles onto this pid after it dies.
    // undefined (probe failure) is fine — isControllerAlive falls back to pid-only trust.
    controllerStartedAt: getProcessStartTime(process.pid),
  });

  try {
    console.log(`[bot] recording until ${until.toLocaleTimeString()} ` +
      `(early stop on 'ended' only after ${endNotBefore.toLocaleTimeString()})`);
    try {
      for (;;) {
        const now = Date.now();
        if (now >= until.getTime()) { console.log("[bot] --until reached"); break; }
        if (gone) { console.log("[bot] bot browser exited"); break; }
        if (endedAt !== undefined && now >= endNotBefore.getTime() && now - endedAt > 60_000) {
          console.log("[bot] webinar reported ended"); break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    } finally {
      audioWatchdog.stop(); // T-031: before joiner.stop — recording is ending, no more reconnects
      try {
        await joiner.stop(sessionHandle);
      } catch (e) {
        // e.g. OBS restarted mid-run. The file is usually still on disk — fall back to it below.
        console.error(`[bot] stop failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await bot.disconnect().catch(() => {});
    }

    let video = bot.outputPath(sessionHandle);
    if (!video || !existsSync(video)) {
      const newest = readdirSync(RECORD_DIR)
        .filter((f) => f.endsWith(".mkv"))
        .map((f) => path.join(RECORD_DIR, f))
        .filter((f) => statSync(f).mtimeMs >= startedAt)
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      if (newest) console.warn(`[bot] using newest recording in ${RECORD_DIR}: ${newest}`);
      video = newest;
    }
    if (!video || !existsSync(video)) throw new Error(`no recording file produced (${video ?? "none"})`);
    await finalizeRecording(video, sessionId, title, platform, rest.includes("--transcribe"), gaps,
      telegram, (Date.now() - startedAt) / 1000);
  } finally {
    audioWatchdog.stop(); // idempotent — belt-and-suspenders if the inner finally was never reached
    removeControllerState(RECORD_DIR);
  }
}

// finalizeRecordingWith / isSilentCapture / FinalizeRecordingOverrides live in record-finalize.ts
// (T-033, ISS-300) — split out to stay under this file's own 300-LOC budget (import above);
// re-exported here so existing import sites (this package's tests) don't need to know the split.
export { isSilentCapture, type FinalizeRecordingOverrides } from "./record-finalize.js";
export { finalizeRecordingWith };

/** Unchanged param list (T-030's own shape, 883c7b2/1649da9) — delegates to the real,
 * test-seamed implementation in record-finalize.ts with today's defaults. */
export async function finalizeRecording(
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
  gaps: GapWindow[] = [],
  telegram: TelegramNotifier = createTelegramNotifier(),
  durationSec?: number,
): Promise<void> {
  return finalizeRecordingWith({}, video, sessionId, title, platform, transcribe, gaps, telegram, durationSec);
}

/**
 * `finalize --session-id ID --title T [--platform P] [--stop-obs] [--video PATH] [--transcribe]`
 * Recovery when `record`'s own process died mid-run (2026-09-24 16:30: its console was closed,
 * OBS and the bot Chrome kept going). --stop-obs stops the OBS recording, waits for the file to
 * flush, unmutes OBS's global desktop/mic inputs (the dead run never restored them) and closes
 * the bot Chrome; then the normal finalize steps run.
 */
/** Test seam (T-033, ISS-300 / contract C5): defaults to a real `new OBSWebSocket()`, so every
 * in-repo caller (`cli.ts`, no 2nd arg) is exactly today's code path. A test injects a client
 * whose `connect` rejects to drive the "OBS unreachable" recovery-failure path without a real
 * network attempt (avoids a hang risk on an unreachable host/port). */
export interface RunFinalizeOverrides {
  obs?: ObsClientLike;
}

export async function runFinalize(rest: string[], overrides: RunFinalizeOverrides = {}): Promise<void> {
  const sessionId = flag(rest, "--session-id");
  const title = flag(rest, "--title");
  if (!sessionId || !title) throw new Error("usage: lkb finalize --session-id ID --title T [--platform P] [--stop-obs] [--video PATH] [--transcribe]");
  const platform = flag(rest, "--platform") ?? "unknown";
  let video = flag(rest, "--video");

  if (rest.includes("--stop-obs")) {
    const envFile = path.join(REPO_ROOT, ".env");
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const obs = overrides.obs ?? (new OBSWebSocket() as unknown as ObsClientLike);
    await obs.connect(process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455", process.env.OBS_WS_PASSWORD);
    const status = await obs.call("GetRecordStatus");
    if (status.outputActive) {
      const res = await obs.call("StopRecord");
      video = video ?? res.outputPath;
      let last = -1;
      for (let stable = 0, i = 0; stable < 3 && i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const size = existsSync(res.outputPath) ? statSync(res.outputPath).size : -1;
        stable = size === last && size > 0 ? stable + 1 : 0;
        last = size;
      }
      console.log(`[bot] recording stopped → ${res.outputPath} (${last} bytes)`);
    } else {
      console.log("[bot] OBS was not recording");
    }
    const special = await obs.call("GetSpecialInputs");
    for (const name of Object.values(special)) {
      if (typeof name === "string" && name) {
        await obs.call("SetInputMute", { inputName: name, inputMuted: false }).catch(() => {});
      }
    }
    await obs.disconnect();
    spawnSync("powershell", ["-NoProfile", "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*${BOT_PROFILE_DIR}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
    console.log("[bot] OBS inputs unmuted, bot browser closed");
  }
  if (!video || !existsSync(video)) throw new Error(`no recording file (${video ?? "none"}) — pass --video`);
  await finalizeRecording(video, sessionId, title, platform, rest.includes("--transcribe"));
}

