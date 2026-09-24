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
import { createObsBrowserDeps } from "./obs-windows.js";

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
      "[--session-id ID] [--transcribe]");
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
    },
  });
  const joiner = createBrowserJoiner(bot.deps);

  const startedAt = Date.now();
  const { sessionHandle } = await joiner.join(url, { tenantId: "vidysea", consentNote: title });
  let gone = false;
  void bot.browserExited(sessionHandle)?.then(() => (gone = true));

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
  await finalizeRecording(video, sessionId, title, platform, rest.includes("--transcribe"));
}

/** Recording file → m4a → silence gate → source.json → (optional) transcript. Shared by `record`
 * and `finalize` (the recovery path when the controlling process died mid-run). */
async function finalizeRecording(
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
): Promise<void> {
  const audio = path.join(RECORD_DIR, `${sessionId}.m4a`);
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1",
    "-c:a", "aac", "-b:a", "96k", audio], { stdio: "inherit" });
  console.log(`[bot] audio → ${audio}`);

  // Silence gate. Measured 2026-09-24: a silent (-91 dB) capture sent to Gemini came back as 18
  // fluent, invented turns. A KB must never ingest that, so silent audio is never transcribed.
  const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", audio, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" });
  const maxDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  const meanDb = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(vd.stderr ?? "")?.[1] ?? "-999");
  const silent = maxDb < SILENCE_MAX_DB;
  console.log(`[bot] audio level: max ${maxDb} dB, mean ${meanDb} dB${silent ? "  ← SILENT" : ""}`);

  const dataDir = path.join(REPO_ROOT, "data", "toc-migrated", sessionId);
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
    path: toPosix(path.relative(REPO_ROOT, video)),
    audioPath: toPosix(path.relative(REPO_ROOT, audio)),
    audioLevel: { maxDb, meanDb, silent },
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
    execFileSync("node", [path.join(REPO_ROOT, "scripts", "transcribe-long-session.mjs"), sessionId],
      { cwd: REPO_ROOT, stdio: "inherit" });
  }
}

/**
 * `finalize --session-id ID --title T [--platform P] [--stop-obs] [--video PATH] [--transcribe]`
 * Recovery when `record`'s own process died mid-run (2026-09-24 16:30: its console was closed,
 * OBS and the bot Chrome kept going). --stop-obs stops the OBS recording, waits for the file to
 * flush, unmutes OBS's global desktop/mic inputs (the dead run never restored them) and closes
 * the bot Chrome; then the normal finalize steps run.
 */
export async function runFinalize(rest: string[]): Promise<void> {
  const sessionId = flag(rest, "--session-id");
  const title = flag(rest, "--title");
  if (!sessionId || !title) throw new Error("usage: lkb finalize --session-id ID --title T [--platform P] [--stop-obs] [--video PATH] [--transcribe]");
  const platform = flag(rest, "--platform") ?? "unknown";
  let video = flag(rest, "--video");

  if (rest.includes("--stop-obs")) {
    const envFile = path.join(REPO_ROOT, ".env");
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const obs = new OBSWebSocket();
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

