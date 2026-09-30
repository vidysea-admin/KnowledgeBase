/**
 * packages/meeting-bot/src/capture/reconnect-gaps.ts — T-029 auto-reconnect, the gap → source.json
 * half. py/sb_join.py's ReconnectState (browser-free, its own test_sb_join.py) emits a "gap"
 * JSON-line event {event:"gap", start, end, reason, recovered} (epoch seconds) on the existing
 * stdout event stream that obs-windows.ts already parses line-by-line — the smallest channel
 * available, no new file/pipe needed. Split out of record-commands.ts (not inlined there) so this
 * pure mapping stays unit-testable without spawning ffmpeg/OBS, and to keep record-commands.ts
 * under the 300-LOC budget.
 */
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import type { BotEvent } from "./obs-windows.js";

export interface GapWindow {
  start: number; // epoch seconds, as sb_join.py's time.time() emits
  end: number;
  reason: string;
  recovered: boolean;
}

/** Durable managed stop evidence has one bounded representation across recorder and recovery. */
export function validateCaptureControlGaps(value: unknown, mode: "control" | "combined-control" | "recovery" = "control"): GapWindow[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > (mode === "control" ? 8 : 24) || Buffer.byteLength(JSON.stringify(value)) > 4096) throw new Error("Invalid capture control gaps");
  const gaps: GapWindow[] = [];
  for (const gap of value) {
    if (!gap || typeof gap !== "object" || Array.isArray(gap) || Object.keys(gap).length !== 4 ||
      !Object.keys(gap).every(key => ["start", "end", "reason", "recovered"].includes(key)) ||
      !["capture-control-cancelled", "capture-control-rescheduled", "capture-control-controller-disconnected", ...(mode === "recovery" ? ["controller-interrupted-coverage-unverified"] : [])].includes(gap.reason) ||
      typeof gap.start !== "number" || !Number.isFinite(gap.start) || gap.start < 0 || typeof gap.end !== "number" || !Number.isFinite(gap.end) ||
      gap.end < gap.start || gap.end > 253402300799.999 || gap.recovered !== false) throw new Error("Invalid capture control gaps");
    gaps.push({start:gap.start,end:gap.end,reason:gap.reason,recovered:false});
  }
  const unique = [...new Map(gaps.map(gap => [JSON.stringify(gap), gap])).values()];
  if (unique.length > (mode === "recovery" ? 16 : 8)) throw new Error("Capture gap union exceeds bounds");
  return unique;
}

/** Pure exact sidecar identity; filesystem/operator confinement remains with the callers. */
export function validateCaptureStatusIdentity(identity: Record<string, any>, managed = false): void {
  const fields = ["output", "pid", "handle", "sessionId", "tenantId", "profileDir", "recordDir", "controllerStartedAt"];
  const safe = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  if (!identity || Object.keys(identity).length !== fields.length || Object.keys(identity).some(key => !fields.includes(key)) ||
      !Number.isSafeInteger(identity.pid) || identity.pid <= 0 || identity.pid > 2147483647 ||
      !/^tab-[0-9]+-[a-f0-9]{8}$/.test(identity.handle) ||
      ["output", "profileDir", "recordDir"].some(key => !safe(identity[key], 4096) || !path.isAbsolute(identity[key]) || path.resolve(identity[key]) !== identity[key]) ||
      identity.output !== path.join(identity.recordDir, `${identity.handle}.webm`) ||
      (identity.sessionId !== undefined && (!safe(identity.sessionId, 150) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(identity.sessionId))) ||
      (identity.tenantId !== undefined && (!safe(identity.tenantId, 100) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(identity.tenantId))) ||
      (identity.controllerStartedAt !== undefined && !safe(identity.controllerStartedAt, 128)) ||
      (managed && (!identity.sessionId || !identity.tenantId || !identity.controllerStartedAt))) throw new Error("Invalid capture status identity");
}

/** The shape written into source.json's `gaps` field: human-readable ISO timestamps. */
export interface GapRecord {
  start: string;
  end: string;
  reason: string;
  recovered: boolean;
}

export function gapsForSourceDoc(gaps: GapWindow[]): GapRecord[] {
  return gaps.map((g) => ({
    start: new Date(g.start * 1000).toISOString(),
    end: new Date(g.end * 1000).toISOString(),
    reason: g.reason,
    recovered: g.recovered,
  }));
}

/** Pushes a completed gap onto `gaps` when `ev` is a "gap" BotEvent; a no-op for every other
 * event (heartbeat, clicked, reconnect-reload, ...). Called from the `onEvent` wired in
 * record-commands.ts's runRecord. */
export function collectGapEvent(gaps: GapWindow[], ev: BotEvent): void {
  if (ev.event !== "gap") return;
  gaps.push({
    start: Number(ev.start),
    end: Number(ev.end),
    reason: String(ev.reason ?? "unknown"),
    recovered: Boolean(ev.recovered),
  });
}


type StopReason = "cancelled" | "rescheduled";
type ControlRequest = {reason: StopReason | "controller-disconnected"; at: number};
export interface RecordingControl {generation: string; stop: (reason: StopReason) => Promise<"accepted" | "unavailable">;}
const generationValid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function controlMatches(value: unknown, type: "stop" | "ack", tenantId: string, sessionId: string, generation: string, token: string): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  try { if (Buffer.byteLength(JSON.stringify(value)) > 4096) return false; } catch { return false; }
  return Object.keys(row).length === 7 && Object.keys(row).every(key => ["version", "type", "tenantId", "sessionId", "generation", "token", "reason"].includes(key)) &&
    row.version === 1 && row.type === type && row.tenantId === tenantId && row.sessionId === sessionId && row.generation === generation &&
    typeof row.token === "string" && /^[0-9a-f]{64}$/.test(row.token) && timingSafeEqual(Buffer.from(row.token), Buffer.from(token)) &&
    ["cancelled", "rescheduled"].includes(row.reason as string);
}
/** The child consumes only its inherited private parent IPC capability. Manual captures have no listener. */
export function installCaptureControl(context: {tenantId: string; sessionId: string; until: number; startedAt: number}, processLike = process) {
  const token = processLike.env.LKB_CAPTURE_CONTROL_TOKEN, generation = processLike.env.LKB_CAPTURE_CONTROL_GENERATION;
  let request: ControlRequest | undefined, disposed = false;
  const managed = token !== undefined || generation !== undefined;
  if (managed && (!token || !/^[0-9a-f]{64}$/.test(token) || !generationValid(generation) || !processLike.connected || !processLike.send)) throw new Error("Invalid managed capture control");
  const message = (value: unknown) => {
    if (disposed || !managed || !controlMatches(value, "stop", context.tenantId, context.sessionId, generation!, token!)) return;
    if (request && request.reason !== value.reason) return;
    request ??= {reason: value.reason, at: Date.now()};
    try { processLike.send!({...value, type: "ack"}, () => {}); } catch { /* Disconnection is handled separately. */ }
  };
  const disconnected = () => { if (!disposed) request ??= {reason: "controller-disconnected", at: Date.now()}; };
  if (managed) { processLike.on("message", message); processLike.on("disconnect", disconnected); }
  return {
    request: () => request,
    gap: () => request ? {start: Math.max(context.startedAt, Math.min(request.at, context.until)) / 1000,
      end: context.until / 1000, reason: `capture-control-${request.reason}`, recovered: false} : undefined,
    dispose: () => {
      if (disposed) return; disposed = true;
      if (managed) { processLike.off("message", message); processLike.off("disconnect", disconnected); if (processLike.connected) processLike.disconnect(); }
    },
  };
}
/** Single fixed CLI launcher; parent handles never escape the closure and no signal fallback exists. */
export function launchControlledRecording(root: string, args: string[], env: NodeJS.ProcessEnv, onLine: (line: string) => void, onControl?: (control: RecordingControl) => void, spawnLike = spawn): Promise<void> {
  const managed = args[0] === "record", sessionId = args[args.indexOf("--session-id") + 1], tenantId = env.LKB_TENANT_ID;
  if (managed && (args.indexOf("--session-id") < 0 || (args.includes("--tenant") && args[args.indexOf("--tenant") + 1] !== tenantId) || !tenantId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId) || !sessionId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId))) return Promise.reject(new Error("Invalid recording control owner"));
  const generation = randomUUID(), token = randomBytes(32).toString("hex");
  const childEnv = {...env}; delete childEnv.LKB_CAPTURE_CONTROL_TOKEN; delete childEnv.LKB_CAPTURE_CONTROL_GENERATION;
  if (managed) Object.assign(childEnv, {LKB_CAPTURE_CONTROL_TOKEN: token, LKB_CAPTURE_CONTROL_GENERATION: generation});
  return new Promise((done, fail) => {
    const child = spawnLike(process.execPath, ["--import", "tsx", path.join(root, "packages/meeting-bot/src/cli.ts"), ...args],
      {cwd: root, env: childEnv, shell: false, windowsHide: true, stdio: managed ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"]});
    let response: Promise<"accepted" | "unavailable"> | undefined;
    let closed = false, pending = "", requested: StopReason | undefined, acknowledged = false;
    let waiting: {resolve: (value: "accepted" | "unavailable") => void; timer: ReturnType<typeof setTimeout>} | undefined;
    const settle = (value: "accepted" | "unavailable") => { if (waiting) {clearTimeout(waiting.timer); waiting.resolve(value); waiting = undefined;} };
    const message = (value: unknown) => {
      if (!closed && controlMatches(value, "ack", tenantId!, sessionId!, generation, token) && value.reason === requested) { acknowledged = true; settle("accepted"); }
    };
    child.on("message", message);
    child.stdout!.on("data", bytes => {
      pending += bytes.toString(); if (pending.length > 65536) pending = pending.slice(-65536);
      const lines = pending.split("\n"); pending = lines.pop() ?? ""; for (const line of lines) onLine(line);
    });
    child.stderr!.on("data", () => {});
    const cleanup = () => { closed = true; settle("unavailable"); child.off("message", message); };
    child.once("disconnect", () => settle("unavailable"));
    child.once("error", () => {cleanup(); fail(new Error("Recording child could not start"));});
    child.once("close", code => {cleanup(); code === 0 ? done() : fail(new Error(`Recording pipeline exited ${code}`));});
    if (managed && onControl) onControl({generation, stop: reason => {
      if (!["cancelled", "rescheduled"].includes(reason) || closed || !child.connected || (requested && requested !== reason)) return Promise.resolve("unavailable");
      if (acknowledged) return Promise.resolve("accepted");
      if (response) return response;
      requested = reason;
      response = new Promise(resolve => {
        waiting = {resolve, timer: setTimeout(() => settle("unavailable"), 5000)};
        child.send({version: 1, type: "stop", tenantId, sessionId, generation, token, reason}, error => {if (error) settle("unavailable");});
      });
      return response;
    }});
  });
}
