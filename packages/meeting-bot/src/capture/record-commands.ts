import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OBSWebSocket } from "obs-websocket-js";
import { createBrowserJoiner } from "../joiners/browser-joiner.js";
import { detectPlatform } from "../platform.js";
import { selectJoinStrategy } from "../strategy.js";
import { createAudioWatchdog, createRealLevelSource } from "./audio-watchdog.js";
import { type ControllerRecoveryActions, type ControllerRecoveryContext, cleanupOwnedBrowserProfile, finalizeControllerRecording, getProcessStartTime, removeControllerState, writeControllerState } from "./controller-state.js";
import { AUDIO_INPUT, createObsBrowserDeps, type ObsClientLike } from "./obs-windows.js";
import { collectGapEvent, installCaptureControl, type GapWindow } from "./reconnect-gaps.js";
import { createTelegramNotifier, type TelegramNotifier } from "./telegram-alerts.js";
import { finalizeRecordingWith, normalizeCapture, processRecordingArtifacts } from "./record-finalize.js";
import { createTabBrowserDeps } from "./tab-browser.js";
import { browserProfileArgs, selectedBrowserProfile } from "./browser/browser-profile.js";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const BOT_PROFILE_DIR = path.resolve(process.env.LKB_BOT_PROFILE_DIR ?? path.join(REPO_ROOT, "data", "bot-profile"));
const RECORD_DIR = path.resolve(process.env.LKB_RECORD_DIR ?? path.join(REPO_ROOT, "raw", "webinars"));
const JOIN_SCRIPT = path.join(HERE, "..", "..", "py", "sb_join.py");
const OBS_EXE = "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe";
function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
export function captureTenant(rest: string[], env: NodeJS.ProcessEnv = process.env): string {
  const tenant = flag(rest, "--tenant") ?? env.LKB_TENANT_ID;
  if (!tenant && rest.includes("--index")) throw new Error("Indexed capture requires explicit --tenant or LKB_TENANT_ID");
  if (tenant && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenant)) throw new Error("invalid capture tenant");
  return tenant ?? "vidysea";
}
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
export function shouldAutoClick(platform: string): boolean {
  return platform === "zoho" || platform === "zoom" || platform === "meet";
}
export async function runLogin(rest: string[]): Promise<void> {
  const url = rest[0] && !rest[0].startsWith("--") ? rest[0] : "https://accounts.google.com";
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const profileDirectory = selectedBrowserProfile(rest, BOT_PROFILE_DIR);
  mkdirSync(RECORD_DIR, { recursive: true });
  const stopFile = path.join(RECORD_DIR, ".stop-login");
  console.log(`bot profile: ${BOT_PROFILE_DIR}\nSign in inside the window, then close it.`);
  const args = [JOIN_SCRIPT, url, "--profile", BOT_PROFILE_DIR, "--title", "LKB-BOT login", "--stop-file", stopFile, "--no-click"];
  args.push(...browserProfileArgs(BOT_PROFILE_DIR, profileDirectory));
  if (process.env.LKB_BROWSER_EXECUTABLE) args.push("--browser-executable", process.env.LKB_BROWSER_EXECUTABLE);
  const child = spawn(process.env.LKB_PYTHON ?? "python", args, { stdio: "inherit" });
  await new Promise((r) => child.on("exit", r));
}
export function recordingBackend(rest: string[], env: NodeJS.ProcessEnv = process.env): "obs" | "tab" {
  const value = flag(rest, "--backend") ?? env.LKB_CAPTURE_BACKEND ?? "tab";
  if (value !== "obs" && value !== "tab") throw new Error("--backend must be tab or obs");
  if (value === "obs" && process.platform !== "win32") throw new Error("OBS fallback is Windows-only; use --backend tab");
  return value;
}
export async function runRecord(rest: string[]): Promise<void> {
  const url = rest[0];
  const untilArg = flag(rest, "--until");
  if (!url || !untilArg) {
    throw new Error("usage: lkb record <url> --until HH:MM [--end-not-before HH:MM] [--title T] " +
      "[--session-id ID] [--transcribe]"
    );
  }
  const envFile = path.join(REPO_ROOT, ".env");
  if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");
  if (rest.includes("--process-video") && !rest.includes("--transcribe")) throw new Error("--process-video requires --transcribe");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const profileDirectory = selectedBrowserProfile(rest, BOT_PROFILE_DIR);
  const backend = recordingBackend(rest);
  const tenantId = captureTenant(rest);
  const obsPassword = process.env.OBS_WS_PASSWORD ?? "";
  if (backend === "obs" && !obsPassword) throw new Error("OBS_WS_PASSWORD missing from .env");
  console.log(`[bot] capture backend: ${backend}`);
  const until = todayAt(untilArg);
  const endNotBefore = todayAt(flag(rest, "--end-not-before") ?? untilArg);
  const platform = detectPlatform(url);
  const title = flag(rest, "--title") ?? `${platform} webinar`;
  const sessionId = flag(rest, "--session-id") ?? `${new Date().toISOString().slice(0, 10)}-${slugify(title)}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid session-id; use a safe filename identifier");
  if (until.getTime() <= Date.now()) throw new Error("--until must be in the future");
  if (selectJoinStrategy(platform) === "vexa") {
    console.warn(`[bot] '${platform}' is Vexa-routed but no Vexa is deployed — using the local browser bot`);
  }
  const startedAt = Date.now(), control = installCaptureControl({tenantId, sessionId, until: until.getTime(), startedAt});
  try {
  let endedAt: number | undefined;
  const gaps: GapWindow[] = []; // T-029: filled from "gap" events on sb_join.py's stdout stream
  const telegram = createTelegramNotifier();
  let captureFailure: string | undefined;
  const onEvent = (_h: string, ev: Parameters<typeof collectGapEvent>[1]) => {
    if (ev.event === "ended" && endedAt === undefined) endedAt = Date.now();
    if (ev.event === "capture-error") captureFailure = String(ev.error ?? "capture failed");
    collectGapEvent(gaps, ev);
    telegram.onBotEvent(ev);
  };
  const tab = backend === "tab" ? createTabBrowserDeps({
    python: process.env.LKB_PYTHON ?? "python", joinScript: JOIN_SCRIPT,
    profileDir: BOT_PROFILE_DIR, recordDir: RECORD_DIR, sessionId, tenantId,
    browserExecutable: process.env.LKB_BROWSER_EXECUTABLE,
    profileDirectory,
    autoClick: shouldAutoClick(platform), onEvent,
  }) : undefined;
  const bot = tab ?? createObsBrowserDeps({
    obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455",
    obsPassword,
    obsExe: OBS_EXE,
    python: process.env.LKB_PYTHON ?? "python",
    joinScript: JOIN_SCRIPT,
    profileDir: BOT_PROFILE_DIR,
    recordDir: RECORD_DIR,
    browserExecutable: process.env.LKB_BROWSER_EXECUTABLE,
    profileDirectory,
    autoClick: shouldAutoClick(platform),
    onEvent,
  });
  const joiner = createBrowserJoiner(bot.deps);
  const { sessionHandle } = await joiner.join(url, { tenantId, consentNote: title });
  telegram.notifyJoined(title, platform); // T-030
  let gone = false;
  void bot.browserExited(sessionHandle)?.then(() => (gone = true));
  const audioWatchdog = createAudioWatchdog({
    now: () => Date.now(),
    subscribeLevel: tab ? tab.subscribeLevel : createRealLevelSource({ obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455", obsPassword, inputName: AUDIO_INPUT }),
    scheduleTick: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    notifySilence: (durationSec) => telegram.notifySilence(durationSec), // T-030's own notifier
    reconnect: () => bot.triggerReload(sessionHandle),
    log: (m) => console.log(`[bot] ${m}`),
  });
  audioWatchdog.start();
  writeControllerState(RECORD_DIR, {
    pid: process.pid,
    sessionId,
    title,
    platform,
    until: until.toISOString(),
    obsOutputDir: RECORD_DIR,
    startedAt: new Date(startedAt).toISOString(),
    controllerStartedAt: getProcessStartTime(process.pid),
  });
  try {
    console.log(`[bot] recording until ${until.toLocaleTimeString()} ` +
      `(early stop on 'ended' only after ${endNotBefore.toLocaleTimeString()})`);
    try {
      for (;;) {
        const now = Date.now(), stop = control.request();
        if (stop) { const gap=control.gap()!; gaps.push(gap); tab?.persistControlGap(sessionHandle,gap); console.log(`[bot] capture-control: ${stop.reason}`); break; }
        if (captureFailure) throw new Error(captureFailure);
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
        console.error(`[bot] stop failed: ${e instanceof Error ? e.message : String(e)}`);
        if (backend === "tab") throw e;
      }
      await bot.disconnect().catch(() => {});
    }
    control.dispose();
    let video = bot.outputPath(sessionHandle);
    if (!video || !existsSync(video)) {
      const newest = readdirSync(RECORD_DIR)
        .filter((f) => f.endsWith(backend === "tab" ? ".webm" : ".mkv"))
        .map((f) => path.join(RECORD_DIR, f))
        .filter((f) => statSync(f).mtimeMs >= startedAt)
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      if (newest) console.warn(`[bot] using newest recording in ${RECORD_DIR}: ${newest}`);
      video = newest;
    }
    if (!video || !existsSync(video)) throw new Error(`no recording file produced (${video ?? "none"})`);
    video = normalizeCapture(video);
    await finalizeRecording(video, sessionId, title, platform, rest.includes("--transcribe"), gaps,
      telegram, (Date.now() - startedAt) / 1000, tenantId);
    processRecordingArtifacts(video, sessionId, rest);
  } finally {
    audioWatchdog.stop(); // idempotent — belt-and-suspenders if the inner finally was never reached
    removeControllerState(RECORD_DIR);
  }
  } finally { control.dispose(); }
}
export { normalizeCapture } from "./record-finalize.js";
export { processRecordingArtifacts, validateIndexProof } from "./record-finalize.js";
export { isSilentCapture, finalizeRecordingWith, type FinalizeRecordingOverrides } from "./record-finalize.js";
export async function finalizeRecording(
  video: string, sessionId: string, title: string, platform: string, transcribe: boolean,
  gaps: GapWindow[] = [],
  telegram: TelegramNotifier = createTelegramNotifier(),
  durationSec?: number,
  tenantId?: string,
): Promise<void> {
  return finalizeRecordingWith({ tenantId }, video, sessionId, title, platform, transcribe, gaps, telegram, durationSec);
}
export interface RunFinalizeOverrides extends Partial<Pick<ControllerRecoveryContext, "repoRoot" | "recordDir" | "profileDir">>, Partial<Omit<ControllerRecoveryActions, "finalize" | "processArtifacts">> {
  obs?: ObsClientLike;
  finalize?: typeof finalizeRecording;
}

export async function runFinalize(rest: string[], overrides: RunFinalizeOverrides = {}): Promise<void> {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const tenantId = captureTenant(rest);
  const sessionId = flag(rest, "--session-id");
  const title = flag(rest, "--title");
  if (!sessionId || !title) throw new Error("usage: lkb finalize --session-id ID --title T [--platform P] [--stop-obs] [--video PATH] [--transcribe]");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid session-id");
  const platform = flag(rest, "--platform") ?? "unknown";
  let video = flag(rest, "--video");
  const context: ControllerRecoveryContext = {
    repoRoot: overrides.repoRoot ?? REPO_ROOT, recordDir: overrides.recordDir ?? RECORD_DIR,
    profileDir: overrides.profileDir ?? BOT_PROFILE_DIR, sessionId, tenantId,
    python: process.env.LKB_PYTHON ?? "python", joinScript: JOIN_SCRIPT,
  };
  if (rest.includes("--stop-obs")) {
    const obs = overrides.obs ?? (new OBSWebSocket() as unknown as ObsClientLike);
    await obs.connect(process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455", process.env.OBS_WS_PASSWORD);
    try {
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
    } finally { await obs.disconnect(); }
    const cleaned = cleanupOwnedBrowserProfile(path.resolve(context.profileDir), {...context, stopFile: path.join(RECORD_DIR, ".stop-obs-cleanup")}, overrides.cleanup);
    console.log(cleaned ? "[bot] OBS inputs unmuted, exact owned browser profile cleaned" : "[bot] OBS inputs unmuted; browser profile absent, cleanup skipped");
  }
  if (!video || !existsSync(video)) throw new Error(`no recording file (${video ?? "none"}) — pass --video`);
  await finalizeControllerRecording(video, context, {
    ...overrides, normalize: overrides.normalize ?? normalizeCapture,
    finalize: (media, gaps) => (overrides.finalize ?? finalizeRecording)(media, sessionId, title, platform, rest.includes("--transcribe"), gaps, undefined, undefined, tenantId),
    processArtifacts: (media) => processRecordingArtifacts(media, sessionId, rest),
  });
}
