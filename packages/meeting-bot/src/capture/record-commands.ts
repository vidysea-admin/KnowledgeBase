import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OBSWebSocket } from "obs-websocket-js";
import { createBrowserJoiner } from "../joiners/browser-joiner.js";
import { detectPlatform } from "../platform.js";
import { selectJoinStrategy } from "../strategy.js";
import { createAdmissionGate } from "./admission-gate.js";
import { createAudioWatchdog, createRealLevelSource } from "./audio-watchdog.js";
import { type ControllerRecoveryActions, type ControllerRecoveryContext, cleanupOwnedBrowserProfile, finalizeControllerRecording, getProcessStartTime, removeControllerState, writeControllerState } from "./controller-state.js";
import { AUDIO_INPUT, createObsBrowserDeps, type ObsBrowserConfig, type ObsBrowserDepsOverrides, type ObsClientLike } from "./obs/obs-windows.js";
import { leanRestorePath, restoreLeanVideoInObs } from "../lean-video-obs.js";
import { collectGapEvent, type GapWindow } from "./reconnect-gaps.js";
import { createTelegramNotifier, type TelegramNotifier } from "./notify/telegram-alerts.js";
import { normalizeCapture, processRecordingArtifacts, finalizeRecordingWith, type FinalizeRecordingOverrides } from "./record-finalize.js";
import { finalizeRecording, finalizedCaptureVideo } from "./workspace/finalize-workspace-recording.js";
import { createTabBrowserDeps } from "./tab-browser.js";
import { tabReceiverGuardFromEnv } from "./tab-receiver-guard.js";
import { createNativeCaptureRuntime, nativeCaptureSettings } from "./native/native-capture-runtime.js";
import type { NativeCaptureClockQualifierOptions } from "./tiles/native-measurement.js";
import type { NativeCaptureSealer } from "./native/native-archive-join-types.js";
import { applyOnairSession, onairUntilFromEvent } from "../watch/onair-watch.js";
import { selectedBrowserProfile } from "./browser/browser-profile.js";
import { assertCaptureWorkspaceVideo, claimCaptureSession, loginInCaptureWorkspace, prepareWorkspaceCaptureControls, selectTabCaptureWorkspace, slotCaptureSessionId } from "./workspace/tab-session-workspace.js";
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
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  await loginInCaptureWorkspace(rest, {profileDir: BOT_PROFILE_DIR, recordDir: RECORD_DIR, tenantId: captureTenant(rest)}, JOIN_SCRIPT);
}
export function recordingBackend(rest: string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): "obs" | "tab" {
  const value = flag(rest, "--backend") ?? env.LKB_CAPTURE_BACKEND ?? "tab";
  if (value !== "obs" && value !== "tab") throw new Error("--backend must be tab or obs");
  if (value === "obs" && platform !== "win32") throw new Error("OBS fallback is Windows-only; use --backend tab");
  return value;
}
export interface RecordInject {
  nativeArchive?: NativeCaptureSealer;
  nativeSamplerPath?: string;
  nativeFinalizerOverrides?: Pick<FinalizeRecordingOverrides, "repoRoot" | "measureVolume" | "runTranscription" | "validateTranscription">;
  nativeQualificationVerifier?:NativeCaptureClockQualifierOptions["verifyPlatformQualification"];
  tab?: (onEvent: (handle: string, event: any) => void, config: Parameters<typeof createTabBrowserDeps>[0]) => ReturnType<typeof createTabBrowserDeps>;
  finalize?: (...args:Parameters<typeof finalizeRecording>)=>Promise<string|void>; normalize?: typeof normalizeCapture; recordDir?: string; profileDir?: string; wait?: (ms: number) => Promise<void>;
  obs?: ObsBrowserDepsOverrides & { config?: Partial<ObsBrowserConfig>; subscribeLevel?: Parameters<typeof createAudioWatchdog>[0]["subscribeLevel"] };
  telegram?: TelegramNotifier;
  platform?: NodeJS.Platform;
}
export async function runRecord(rest: string[], inject: RecordInject = {}): Promise<void> {
  const url = rest[0];
  const untilArg = flag(rest, "--until");
  if (!url || !untilArg) {
    throw new Error("usage: lkb record <url> --until HH:MM [--end-not-before HH:MM] [--title T] " +
      "[--session-id ID] [--onair-session TITLE] [--capture-slot ID] [--backend tab|obs] [--native-tab-clock] [--lean-video] [--transcribe]"
    );
  }
  const envFile = path.join(REPO_ROOT, ".env");
  if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");
  if (rest.includes("--process-video") && !rest.includes("--transcribe")) throw new Error("--process-video requires --transcribe");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const backend = recordingBackend(rest, process.env, inject.platform), nativeSettings = nativeCaptureSettings(rest, process.env, backend);
  const tenantId = captureTenant(rest);
  const workspace = selectTabCaptureWorkspace(rest, {profileDir: inject.profileDir ?? BOT_PROFILE_DIR, recordDir: inject.recordDir ?? RECORD_DIR, tenantId}, "record", backend);
  const {profileDir, recordDir} = workspace;
  const profileDirectory = selectedBrowserProfile(rest, profileDir);
  const obsPassword = process.env.OBS_WS_PASSWORD ?? "";
  if (backend === "obs" && !obsPassword) throw new Error("OBS_WS_PASSWORD missing from .env");
  console.log(`[bot] capture backend: ${backend}`);
  let until = todayAt(untilArg); applyOnairSession(flag(rest, "--onair-session")); // OnAir may move `until` once, when the player reports its duration
  const endNotBefore = todayAt(flag(rest, "--end-not-before") ?? untilArg);
  const platform = detectPlatform(url);
  const title = flag(rest, "--title") ?? `${platform} webinar`;
  const sessionId = flag(rest, "--session-id") ?? slotCaptureSessionId(`${new Date().toISOString().slice(0, 10)}-${slugify(title)}`,workspace);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid session-id; use a safe filename identifier");
  if (until.getTime() <= Date.now()) throw new Error("--until must be in the future");
  if (selectJoinStrategy(platform) === "vexa") {
    console.warn(`[bot] '${platform}' is Vexa-routed but no Vexa is deployed — using the local browser bot`);
  }
  const startedAt = Date.now(), owner: Parameters<typeof prepareWorkspaceCaptureControls>[1] = {tenantId, sessionId, meetingUrl:url, until:until.getTime(), startedAt, platform, evidenceKind:inject.tab ? "fixture" : "browser"}, consentControl = prepareWorkspaceCaptureControls(rest, owner, workspace, inject.recordDir ?? path.join(REPO_ROOT,"raw","webinars"));
  const control = consentControl.captureControl;
  try {
  let endedAt: number | undefined;
  const gaps: GapWindow[] = [];
  const telegram = inject.telegram ?? createTelegramNotifier();
  let captureFailure: string | undefined;
  let joinedNotified = false;
  const gate = createAdmissionGate(); // ISS-CAPTUREFIX-001: the silence watchdog starts only after `admitted`
  const onEvent = (_h: string, ev: Parameters<typeof collectGapEvent>[1]) => {
    consentControl.privacy.onCaptureEvent(ev);
    consentControl.readiness.onCaptureEvent(ev);
    const gateFailure = gate.onEvent(ev as Parameters<typeof gate.onEvent>[0]);
    if (ev.event === "admitted" && !joinedNotified) { joinedNotified = true; telegram.notifyJoined(title, platform, { assumed: (ev as { assumed?: unknown }).assumed === true }); } // T-030, now only once admitted (ISS-CAPTUREFIX-001)
    owner.until = (until = onairUntilFromEvent(ev as { event?: unknown; seconds?: unknown }, Date.now()) ?? until).getTime(); // the capture-control gap end follows the adjusted end
    if (ev.event === "ended" && endedAt === undefined) endedAt = Date.now();
    if (ev.event === "capture-error") captureFailure = gateFailure ?? String(ev.error ?? "capture failed");
    if (ev.event === "admission_timeout") captureFailure ??= gateFailure;
    if (ev.event === "capture-stopped" && (ev as {failed?: unknown}).failed !== false) captureFailure ??= "capture stopped with failure";
    collectGapEvent(gaps, ev);
    telegram.onBotEvent(ev);
  };
  const tabConfig: Parameters<typeof createTabBrowserDeps>[0] = {
    python: process.env.LKB_PYTHON ?? "python", joinScript: JOIN_SCRIPT,
    profileDir, recordDir, sessionId, tenantId,
    browserExecutable: process.env.LKB_BROWSER_EXECUTABLE, profileDirectory,
    autoClick: shouldAutoClick(platform), onEvent,
    ...(tabReceiverGuardFromEnv() ? {guard: tabReceiverGuardFromEnv()} : {}), // T-034: LKB_TAB_RECEIVER_GUARD=1; absent = unchanged
  };
  const nativeRuntime = nativeSettings ? createNativeCaptureRuntime({settings:nativeSettings,recordDir,tenantId,sessionId,platform,
    extensionDir:path.join(path.dirname(JOIN_SCRIPT),"tab-capture"),verifyPlatformQualification:inject.nativeQualificationVerifier}) : undefined;
  if(nativeRuntime){tabConfig.native=nativeRuntime.config;tabConfig.browserExecutable=nativeRuntime.browserExecutable;}
  const tab = backend === "tab" ? (inject.tab ? inject.tab(onEvent, tabConfig) : createTabBrowserDeps(tabConfig)) : undefined;
  const bot = tab ?? createObsBrowserDeps({
    obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455",
    obsPassword, obsExe: OBS_EXE,
    python: process.env.LKB_PYTHON ?? "python", joinScript: JOIN_SCRIPT,
    profileDir, recordDir, autoClick: shouldAutoClick(platform),
    browserExecutable: process.env.LKB_BROWSER_EXECUTABLE, profileDirectory,
    leanVideo: {},
    onRestoreFailure: (m) => telegram.notifyObsRestoreFailed?.(m), // ISS-LEANWIRE-003
    onEvent,
    ...inject.obs?.config,
  }, inject.obs);
  const joiner = createBrowserJoiner(bot.deps);
  const { sessionHandle } = await joiner.join(url, { tenantId, consentNote: consentControl.receipt.consent.note });
  let gone = false;
  void bot.browserExited(sessionHandle)?.then(() => (gone = true));
  const audioWatchdog = createAudioWatchdog({
    now: () => Date.now(),
    subscribeLevel: tab ? tab.subscribeLevel : inject.obs?.subscribeLevel ?? createRealLevelSource({ obsUrl: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455", obsPassword, inputName: AUDIO_INPUT }),
    scheduleTick: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    notifySilence: (durationSec) => telegram.notifySilence(durationSec), // T-030's own notifier
    reconnect: () => bot.triggerReload(sessionHandle),
    log: (m) => console.log(`[bot] ${m}`),
  });
  gate.attach(audioWatchdog); // starts now only if `admitted` already arrived; never while in the lobby
  writeControllerState(recordDir, {
    pid: process.pid,
    sessionId,
    title,
    platform,
    until: until.toISOString(),
    obsOutputDir: recordDir,
    startedAt: new Date(startedAt).toISOString(),
    controllerStartedAt: getProcessStartTime(process.pid),
  });
  try {
    console.log(`[bot] recording until ${until.toLocaleTimeString()} ` +
      `(early stop on 'ended' only after ${endNotBefore.toLocaleTimeString()})`);
    try {
      for (;;) {
        const now = Date.now(), stop = control.request();
        if (consentControl.failure()) throw new Error(consentControl.failure());
        if (stop) { const gap=control.gap()!; gaps.push(gap); tab?.persistControlGap(sessionHandle,gap); console.log(`[bot] capture-control: ${stop.reason}`); break; }
        if (captureFailure) throw new Error(captureFailure);
        if (now >= until.getTime()) { console.log("[bot] --until reached"); break; }
        if (gone) { console.log("[bot] bot browser exited"); break; }
        if (endedAt !== undefined && now >= endNotBefore.getTime() && now - endedAt > 60_000) {
          console.log("[bot] webinar reported ended"); break;
        }
        await (inject.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(5000);
      }
    } finally {
      audioWatchdog.stop(); // T-031: before joiner.stop — recording is ending, no more reconnects
      try {
        await joiner.stop(sessionHandle);
      } catch (e) {
        console.error(`[bot] stop failed: ${e instanceof Error ? e.message : String(e)}`);
        if (backend === "tab") throw gate.failure ? new Error(gate.failure) : e; // ISS-CAPTUREFIX-001: name the reload that killed it
      }
      await bot.disconnect().catch(() => {});
    }
    control.dispose();
    let video = bot.outputPath(sessionHandle);
    if (!video || !existsSync(video)) {
      const newest = readdirSync(recordDir)
        .filter((f) => f.endsWith(backend === "tab" ? ".webm" : ".mkv"))
        .map((f) => path.join(recordDir, f))
        .filter((f) => statSync(f).mtimeMs >= startedAt)
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      if (newest) console.warn(`[bot] using newest recording in ${recordDir}: ${newest}`);
      video = newest;
    }
    if (!video || !existsSync(video)) throw new Error(`no recording file produced (${video ?? "none"})`);
    consentControl.privacy.dispose();
    const originalVideo=video;
    const native = nativeRuntime ? await nativeRuntime.take(video) : undefined;
    if(!native)video = (inject.normalize ?? normalizeCapture)(video, false);
    const publicVideo=native&&!inject.finalize ? await finalizeRecordingWith({...inject.nativeFinalizerOverrides,tenantId,recordDir:workspace.recordDir,originalVideo,
      nativeMedia:native.media,nativeMaxTotalBytes:native.maxTotalBytes,nativeCanonicalClock:native.canonicalClock,
      nativeArchive:inject.nativeArchive,admission:gate.admission,nativeSidecarPath:inject.nativeSamplerPath??process.env.LKB_TILE_CAPTURE_FILE},video,sessionId,title,platform,rest.includes("--transcribe"),gaps,telegram)
      : await (inject.finalize ?? finalizeRecording)(video, sessionId, title, platform, rest.includes("--transcribe"), gaps,
        telegram, (Date.now() - startedAt) / 1000, tenantId, workspace.recordDir, rest.includes("--lean-video"),originalVideo,gate.admission);
    processRecordingArtifacts(finalizedCaptureVideo(publicVideo,video,!!inject.finalize), sessionId, rest);
  } finally {
    audioWatchdog.stop(); // idempotent — belt-and-suspenders if the inner finally was never reached
    removeControllerState(recordDir);
  }
  } catch(error) {consentControl.readiness.onCaptureEvent({event:"capture-error"});throw error;}
  finally { consentControl.dispose(); }
}
export { normalizeCapture, processRecordingArtifacts, validateIndexProof, isSilentCapture, finalizeRecordingWith, type FinalizeRecordingOverrides } from "./record-finalize.js";
export { finalizeRecording } from "./workspace/finalize-workspace-recording.js";
export interface RunFinalizeOverrides extends Partial<Pick<ControllerRecoveryContext, "repoRoot" | "recordDir" | "profileDir">>, Partial<Omit<ControllerRecoveryActions, "finalize" | "processArtifacts">> {
  obs?: ObsClientLike;
  finalize?: (...args:Parameters<typeof finalizeRecording>)=>Promise<string|void>;
  telegram?: TelegramNotifier; // restore-failure alert sink; defaults to the env-configured notifier
}

export async function runFinalize(rest: string[], overrides: RunFinalizeOverrides = {}): Promise<void> {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const tenantId = captureTenant(rest);
  const workspace = selectTabCaptureWorkspace(rest, {profileDir: overrides.profileDir ?? BOT_PROFILE_DIR, recordDir: overrides.recordDir ?? RECORD_DIR, tenantId}, "finalize", rest.includes("--stop-obs") ? "obs" : "tab");
  const sessionId = flag(rest, "--session-id");
  const title = flag(rest, "--title");
  if (!sessionId || !title) throw new Error("usage: lkb finalize --session-id ID --title T [--capture-slot ID] [--lean-video] [--platform P] [--stop-obs] [--video PATH] [--transcribe]");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid session-id");
  const platform = flag(rest, "--platform") ?? "unknown";
  let video = flag(rest, "--video");
  const context: ControllerRecoveryContext = {
    repoRoot: overrides.repoRoot ?? REPO_ROOT, recordDir: workspace.recordDir,
    profileDir: workspace.profileDir, sessionId, tenantId,
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
    await restoreLeanVideoInObs(obs, leanRestorePath(context.recordDir), (m) => console.log(`[bot] ${m}`),
      (m) => (overrides.telegram ?? createTelegramNotifier()).notifyObsRestoreFailed?.(m));
    } finally { await obs.disconnect(); }
    const cleaned = cleanupOwnedBrowserProfile(path.resolve(context.profileDir), {...context, stopFile: path.join(RECORD_DIR, ".stop-obs-cleanup")}, overrides.cleanup);
    console.log(cleaned ? "[bot] OBS inputs unmuted, exact owned browser profile cleaned" : "[bot] OBS inputs unmuted; browser profile absent, cleanup skipped");
  }
  if (!video || !existsSync(video)) throw new Error(`no recording file (${video ?? "none"}) — pass --video`);
  assertCaptureWorkspaceVideo(workspace, video);
  const originalVideo=video.endsWith(".playable.webm")?video.replace(/\.playable\.webm$/,".webm"):video;
  let releaseSession=()=>{},publicVideo:string|void;
  try { await finalizeControllerRecording(video, context, {
    ...overrides, normalize: overrides.normalize ?? ((video) => normalizeCapture(video, false)),
    finalize: async (media, gaps) => {releaseSession=claimCaptureSession(overrides.recordDir ?? path.join(overrides.repoRoot ?? REPO_ROOT,"raw","webinars"),tenantId,sessionId,true);publicVideo=await (overrides.finalize ?? finalizeRecording)(media, sessionId, title, platform, rest.includes("--transcribe"), gaps, undefined, undefined, tenantId, workspace.recordDir, rest.includes("--lean-video"),originalVideo);},
    processArtifacts: (media) => processRecordingArtifacts(finalizedCaptureVideo(publicVideo,media,!!overrides.finalize), sessionId, rest),
  }); } finally {releaseSession();}
}
