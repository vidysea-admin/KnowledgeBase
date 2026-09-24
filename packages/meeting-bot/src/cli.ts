#!/usr/bin/env node
/**
 * packages/meeting-bot/src/cli.ts — T-024 C5. `lkb capture <meeting-url> [--consent-note <text>]`
 *
 * Location choice (documented per the contract's instruction to pick apps/ vs packages/ and
 * justify it): `apps/api` exists only as a T-016 placeholder with no routes yet, so there is no
 * live "apps/ hosts CLIs/servers, packages/ hosts libraries" precedent to follow either way. The
 * decisive fact is `.dependency-cruiser.cjs`: `apps -> packages/{ask,ingest,index,ai,db,core}`
 * does NOT include `meeting-bot`, so an `apps/cli` could never import `@lkb/meeting-bot`'s
 * `capture()` without breaking `pnpm lint:structure`. The CLI has to live inside
 * `packages/meeting-bot` to be able to call its own `capture()` at all — hence `src/cli.ts` here,
 * not `apps/cli`.
 *
 * Same dependency wall applies to `@lkb/ai`: `meeting-bot -> ingest, core` only (ARCHITECTURE
 * §5) — `@lkb/ai` is not on that list, so this file cannot `import` a whisper/gemini adapter
 * from `@lkb/ai` even though the contract (C5) asks for "real packages/ai" wiring. The honest
 * resolution used here: `defaultTranscribe()` below makes the *same* wire-shape HTTP call
 * `packages/ai/src/stt/whisper.ts` makes (POST `{WHISPER_URL}/transcribe`) — hitting the real
 * self-hosted whisper worker at runtime — without a static import of `@lkb/ai`, so
 * `pnpm lint:structure`'s dependency-cruiser rule stays green. Pass `--whisper-url` (or leave
 * `WHISPER_URL` unset) to point it at a live worker; with no worker reachable it is expected to
 * throw — that failure is real, not swallowed. `--fake-transcribe` swaps in a deterministic
 * built-in transcriber instead, which is what the required fixture demo run below uses so the
 * demo does not depend on a live `workers/transcribe/` process.
 *
 * Real pieces wired here: `@lkb/ingest`'s `createRecordingSource` with a real SHA-256 hasher
 * (`node:crypto`) and a real file reader (`node:fs/promises`). Fake pieces (per C3/C5): the three
 * `Joiner`s — built from the real `joiners/*.ts` factories (not reimplemented inline) but given
 * injected transport/launch/capture functions that resolve to a local fixture file instead of a
 * live Vexa/browser/OS-audio session, exactly as T-024's non-goals require.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createRecordingSource } from "@lkb/ingest";
import type { ConsentContext, Turn } from "@lkb/ingest";

import { capture } from "./capture.js";
import type { JoinStrategy } from "./strategy.js";
import type { Joiner } from "./joiner.js";
import { createVexaJoiner } from "./joiners/vexa-joiner.js";
import { createBrowserJoiner } from "./joiners/browser-joiner.js";
import { createSystemAudioJoiner } from "./joiners/system-audio-joiner.js";
import { detectPlatform } from "./platform.js";
import { selectJoinStrategy } from "./strategy.js";
import { createObsBrowserDeps } from "./capture/obs-windows.js";
import { OBSWebSocket } from "obs-websocket-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = path.join(HERE, "..", "fixtures", "sample-recording.wav");
const DEFAULT_WHISPER_URL = "http://localhost:8899";

interface CliArgs {
  url: string;
  consentNote?: string;
  tenantId: string;
  recordedBy: string;
  captureMode: ConsentContext["captureMode"];
  confirmedNoAlternative: boolean;
  fixturePath: string;
  whisperUrl: string;
  fakeTranscribe: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const [command, url, ...rest] = argv;
  if (command !== "capture" || !url) {
    throw new Error("usage: lkb capture <meeting-url> [--consent-note <text>] [--capture-mode <mode>] " +
      "[--tenant <id>] [--recorded-by <id>] [--confirmed-no-alternative] [--fixture-path <path>] " +
      "[--whisper-url <url>] [--fake-transcribe]");
  }

  const args: CliArgs = {
    url,
    tenantId: "cli-tenant",
    recordedBy: "cli-user",
    captureMode: "provided",
    confirmedNoAlternative: false,
    fixturePath: DEFAULT_FIXTURE_PATH,
    whisperUrl: DEFAULT_WHISPER_URL,
    fakeTranscribe: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    switch (flag) {
      case "--consent-note":
        args.consentNote = rest[++i];
        break;
      case "--tenant":
        args.tenantId = rest[++i] as string;
        break;
      case "--recorded-by":
        args.recordedBy = rest[++i] as string;
        break;
      case "--capture-mode":
        args.captureMode = rest[++i] as ConsentContext["captureMode"];
        break;
      case "--confirmed-no-alternative":
        args.confirmedNoAlternative = true;
        break;
      case "--fixture-path":
        args.fixturePath = rest[++i] as string;
        break;
      case "--whisper-url":
        args.whisperUrl = rest[++i] as string;
        break;
      case "--fake-transcribe":
        args.fakeTranscribe = true;
        break;
      default:
        throw new Error(`lkb capture: unrecognized flag '${flag}'`);
    }
  }
  return args;
}

/** Same wire shape as packages/ai/src/stt/whisper.ts — see file header for why this is a local
 * mirror rather than an import. */
function defaultTranscribe(whisperUrl: string) {
  return async (audio: Uint8Array): Promise<Turn[]> => {
    const res = await fetch(`${whisperUrl}/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: JSON.stringify({ audio: Array.from(audio), diarize: true }),
    });
    if (!res.ok) throw new Error(`whisper worker error ${res.status}`);
    const body = (await res.json()) as { turns?: Turn[] };
    return body.turns ?? [];
  };
}

/** Deterministic built-in transcriber — no network call. Used by `--fake-transcribe` and the
 * required fixture demo run so it does not depend on a live workers/transcribe/ process. */
function fakeTranscribe(): (audio: Uint8Array) => Promise<Turn[]> {
  return async (audio: Uint8Array): Promise<Turn[]> => [
    { speakerRef: "spk:0", tStart: 0, tEnd: 1, text: `[fake-transcribe] ${audio.byteLength} bytes captured` },
  ];
}

/** Builds all three joiners from the real joiners/*.ts factories, wired to resolve to a local
 * fixture file instead of a live session (T-024 non-goal: no real Vexa/Playwright/OS-audio yet). */
function buildFakeJoiners(fixturePath: string): Record<JoinStrategy, Joiner> {
  const resolved = { sessionHandle: fixturePath, mediaStream: undefined };
  return {
    vexa: createVexaJoiner({
      baseUrl: "https://unused.invalid",
      transport: async () => ({ status: 200, body: resolved }),
    }),
    browser: createBrowserJoiner({ launch: async () => resolved }),
    "system-audio": createSystemAudioJoiner({
      startCapture: async () => resolved,
      stopCapture: async () => {},
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// REAL capture (2026-09-24, T-024b / U4.2): `record` and `login`. These bypass `capture()` on
// purpose: capture() transcribes in-process through an injected ingest Source, and the real
// transcriber (Gemini File API, chunked) lives behind @lkb/ai, which this package may not import.
// So `record` = join + record + extract audio + register source.json; transcription is the
// existing scripts/transcribe-long-session.mjs, run as a separate process (--transcribe).
// ---------------------------------------------------------------------------------------------

const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const BOT_PROFILE_DIR = path.join(REPO_ROOT, "data", "bot-profile");
const RECORD_DIR = path.join(REPO_ROOT, "raw", "webinars");
const JOIN_SCRIPT = path.join(HERE, "..", "py", "sb_join.py");
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
async function runLogin(rest: string[]): Promise<void> {
  const url = rest[0] ?? "https://accounts.google.com";
  mkdirSync(RECORD_DIR, { recursive: true });
  const stopFile = path.join(RECORD_DIR, ".stop-login");
  console.log(`bot profile: ${BOT_PROFILE_DIR}\nSign in inside the window, then close it.`);
  const child = spawn("python", [JOIN_SCRIPT, url, "--profile", BOT_PROFILE_DIR, "--title", "LKB-BOT login",
    "--stop-file", stopFile, "--no-click"], { stdio: "inherit" });
  await new Promise((r) => child.on("exit", r));
}

/** `record <url> --until HH:MM [--end-not-before HH:MM] [--title T] [--session-id ID] [--transcribe]` */
async function runRecord(rest: string[]): Promise<void> {
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
async function runFinalize(rest: string[]): Promise<void> {
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "record") return runRecord(argv.slice(1));
  if (argv[0] === "finalize") return runFinalize(argv.slice(1));
  if (argv[0] === "login") return runLogin(argv.slice(1));
  const args = parseArgs(argv);

  const consent: ConsentContext = {
    captureMode: args.captureMode,
    given: true,
    recordedBy: args.recordedBy,
    note: args.consentNote,
    confirmedNoAlternative: args.confirmedNoAlternative,
  };

  const ingestSource = createRecordingSource({
    hasher: (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
    reader: (filePath: string) => readFile(filePath),
    transcribe: args.fakeTranscribe ? fakeTranscribe() : defaultTranscribe(args.whisperUrl),
  });

  const result = await capture(
    args.url,
    { tenantId: args.tenantId, consent },
    { joiners: buildFakeJoiners(args.fixturePath), ingestSource },
  );

  console.log(`sessionId: ${result.session._id}`);
  console.log(`capture mode: ${result.source.captureMode}`);
  console.log(`turn count: ${result.turns.length}`);
  console.log(`warnings: ${result.warnings.length > 0 ? result.warnings.join(" | ") : "(none)"}`);
}

main().catch((err) => {
  console.error(`lkb capture failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
