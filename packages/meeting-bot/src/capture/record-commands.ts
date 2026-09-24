/**
 * packages/meeting-bot/src/capture/record-commands.ts — the REAL capture commands (2026-09-24,
 * T-024b / U4.2, D-027): `record`, `login`, `finalize`. Split out of cli.ts for the 300-LOC budget;
 * cli.ts only dispatches. They bypass capture() on purpose: capture() transcribes in-process through
 * an injected ingest Source, while the real transcriber (Gemini File API) lives behind @lkb/ai,
 * which this package may not import — so transcription runs as scripts/transcribe-long-session.mjs.
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OBSWebSocket } from "obs-websocket-js";

import { createBrowserJoiner } from "../joiners/browser-joiner.js";
import { detectPlatform } from "../platform.js";
import { selectJoinStrategy } from "../strategy.js";
import { getProcessStartTime, removeControllerState, writeControllerState } from "./controller-state.js";
import { createObsBrowserDeps, type ObsClientLike } from "./obs-windows.js";
import { collectGapEvent, gapsForSourceDoc, type GapWindow } from "./reconnect-gaps.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));


const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const BOT_PROFILE_DIR = path.join(REPO_ROOT, "data", "bot-profile");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");
const JOIN_SCRIPT = path.join(HERE, "..", "..", "py", "sb_join.py");
const OBS_EXE = "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe";
/** Below this peak level the capture heard nothing (digital silence measured at -91 dB). */
const SILENCE_MAX_DB = -50;

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

/** "HH:MM" today (local time) → Date. */
function todayAt(hhmm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`bad time '${hhmm}', expected HH:MM`);
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const toPosix = (p: string) => p.split(path.sep).join("/");

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
  const bot = createObsBrowserDeps({
    obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455",
    obsPassword,
    obsExe: OBS_EXE,
    python: "python",
    joinScript: JOIN_SCRIPT,
    profileDir: BOT_PROFILE_DIR,
    recordDir: RECORD_DIR,
    autoClick: platform === "zoho",
    onEvent: (_h, ev) => {
      if (ev.event === "ended" && endedAt === undefined) endedAt = Date.now();
      collectGapEvent(gaps, ev);
    },
  });
  const joiner = createBrowserJoiner(bot.deps);

  const startedAt = Date.now();
  const { sessionHandle } = await joiner.join(url, { tenantId: "vidysea", consentNote: title });
  let gone = false;
  void bot.browserExited(sessionHandle)?.then(() => (gone = true));

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
    await finalizeRecording(video, sessionId, title, platform, rest.includes("--transcribe"), gaps);
  } finally {
    removeControllerState(RECORD_DIR);
  }
}

/** Strictly-below-threshold predicate the finalize path applies to ffmpeg's measured max_volume.
 * Exported for tests (T-033): AT the boundary (-50) is not silent, below it (-50.1) is. */
export function isSilentCapture(maxDb: number): boolean {
  return maxDb < SILENCE_MAX_DB;
}

function defaultExtractAudio(video: string, audioOut: string): void {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audioOut], { stdio: "inherit" });
}

function defaultMeasureVolume(audioPath: string): { maxDb: number; meanDb: number } {
  // Silence gate. Measured 2026-09-24: a silent (-91 dB) capture sent to Gemini came back as 18
  // fluent, invented turns. A KB must never ingest that, so silent audio is never transcribed.
  const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", audioPath, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" });
  const maxDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  const meanDb = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  return { maxDb, meanDb };
}

function defaultRunTranscription(sessionId: string): void {
  execFileSync("node", [path.join(REPO_ROOT, "scripts", "transcribe-long-session.mjs"), sessionId],
    { cwd: REPO_ROOT, stdio: "inherit" });
}

/** Test seam (T-033, ISS-300): every field defaults to REAL production behaviour unchanged. Tests
 * drive `finalizeRecordingWith` directly (below) rather than adding a param to `finalizeRecording`
 * itself — its own 6-param list is left untouched on purpose: T-030 (sibling lane,
 * wave/t-030-telegram-alerts, commit 883c7b2) independently exports `finalizeRecording` and
 * appends its own trailing `telegram`/`durationSec` params to it. Putting this unit's seam in a
 * differently-named function keeps the two concerns from colliding in one parameter list. */
export interface FinalizeRecordingOverrides {
  extractAudio?: (video: string, audioOut: string) => void;
  measureVolume?: (audioPath: string) => { maxDb: number; meanDb: number };
  runTranscription?: (sessionId: string) => void;
  repoRoot?: string; // a test's temp dir, so nothing is ever written into the real repo tree
}

/** Recording file → m4a → silence gate → source.json → (optional) transcript. Shared by `record`
 * and `finalize` (the recovery path when the controlling process died mid-run). This is the real
 * implementation; `finalizeRecording` below is a thin pass-through with today's defaults, kept
 * param-list-stable for T-030 (see `FinalizeRecordingOverrides` doc above). */
export async function finalizeRecordingWith(
  overrides: FinalizeRecordingOverrides,
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
  gaps: GapWindow[] = [], // T-029: [] on the `finalize` recovery path — no live event stream to draw from there
): Promise<void> {
  const root = overrides.repoRoot ?? REPO_ROOT;
  const recordDir = overrides.repoRoot ? path.join(root, "raw", "webinars") : RECORD_DIR;
  const extractAudio = overrides.extractAudio ?? defaultExtractAudio;
  const measureVolume = overrides.measureVolume ?? defaultMeasureVolume;
  const runTranscription = overrides.runTranscription ?? defaultRunTranscription;

  const audio = path.join(recordDir, `${sessionId}.m4a`);
  extractAudio(video, audio);
  console.log(`[bot] audio → ${audio}`);

  const { maxDb, meanDb } = measureVolume(audio);
  const silent = isSilentCapture(maxDb);
  console.log(`[bot] audio level: max ${maxDb} dB, mean ${meanDb} dB${silent ? "  ← SILENT" : ""}`);

  const dataDir = path.join(root, "data", "toc-migrated", sessionId);
  mkdirSync(dataDir, { recursive: true });
  const sourceDoc = {
    _id: `${sessionId}-src`,
    tenantId: "vidysea",
    kind: "recording",
    // schema/sources.schema.json requires hash (unique index {tenantId, hash}).
    hash: createHash("sha256").update(readFileSync(audio)).digest("hex"),
    captureMode: "silent",
    title,
    platform,
    path: toPosix(path.relative(root, video)),
    audioPath: toPosix(path.relative(root, audio)),
    audioLevel: { maxDb, meanDb, silent },
    gaps: gapsForSourceDoc(gaps), // T-029: forced-disconnect windows recovered mid-run, if any
    consent: {
      given: true,
      recordedBy: "Umesh Sugara (registered attendee) via LKB bot",
      note: "attendee-side capture for internal KB use; organizer recording not available to attendees",
      confirmedNoAlternative: true,
    },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dataDir, "source.json"), JSON.stringify(sourceDoc, null, 2) + "\n");
  console.log(`[bot] registered session ${sessionId}`);

  if (silent) {
    throw new Error(`recording is silent (max ${maxDb} dB) — not transcribing; the capture did not hear the bot window`);
  }
  if (transcribe) {
    runTranscription(sessionId);
  }
}

/** Unchanged param list (T-030 appends its own trailing params to this exact declaration on its
 * own branch) — delegates to the real, test-seamed implementation above with today's defaults. */
export async function finalizeRecording(
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
  gaps: GapWindow[] = [],
): Promise<void> {
  return finalizeRecordingWith({}, video, sessionId, title, platform, transcribe, gaps);
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

