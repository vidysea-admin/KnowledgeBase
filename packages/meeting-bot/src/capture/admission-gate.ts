/**
 * packages/meeting-bot/src/capture/admission-gate.ts — ISS-CAPTUREFIX-001.
 *
 * The audio-silence watchdog (T-031) must not run while the bot waits in the Meet lobby: a lobby is
 * silent, so after SILENT_TRIGGER_SEC the watchdog asked sb_join.py to reload the page, which ended
 * the tab's audio track and killed the capture (live run 2026-10-13). sb_join.py now emits
 * `admitted` once it sees the in-call controls (non-Meet platforms with no lobby or denied text for the whole wait: `assumed: true`, D-167);
 * this gate starts the watchdog only then, and turns the two failure shapes into clear messages:
 *  - `admission_timeout`  -> "admission_timeout: ..." (the bot was never let in);
 *  - `admission_denied`   -> "admission_denied: ..." (B2 / D-232: Meet refused the bot; pre-admission only);
 *  - a `capture-error` that follows a post-admission page reload -> the error plus the reload cause.
 * Split out of record-commands.ts to keep that file inside the repo LOC budget.
 */
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { writeOwnedTabStatus } from "./tab-browser.js";
export interface GateEvent { event: string; error?: unknown; seconds?: unknown; limit?: unknown; assumed?: unknown; reason?: unknown; in_call?: unknown }
/** How the bot came to be `admitted`: positively seen in the call, or assumed (non-Meet, no lobby signal, D-167). */
export interface AdmissionInfo { assumed: boolean; reason?: string }
export interface GateWatchdog { start(): void }

/**
 * The ONE stdout line the recorder prints when the gate first sees `admitted` (2026-11-28, joined status). The manual/queue
 * worker reads it as admission evidence: "yes" when the bot was seen in the call, "assumed" when D-167 assumed it.
 */
export const ADMITTED_LINE_PREFIX = "[bot] admitted to the meeting";
export function admissionLine(info: AdmissionInfo): string {
  const reason = info.reason && /^[a-z0-9_-]{1,64}$/.test(info.reason) ? info.reason : "no-lobby-signal"; // page text never reaches the log
  return info.assumed ? `${ADMITTED_LINE_PREFIX} (assumed: ${reason})` : `${ADMITTED_LINE_PREFIX} (seen in call)`;
}
export function parseAdmissionLine(raw: string): "yes" | "assumed" | undefined {
  const line = raw.endsWith(String.fromCharCode(13)) ? raw.slice(0, -1) : raw; // a CRLF child stream must not turn a real admission into "no"
  if (!line.startsWith(ADMITTED_LINE_PREFIX)) return undefined;
  const rest = line.slice(ADMITTED_LINE_PREFIX.length);
  if (rest === " (seen in call)") return "yes";
  return /^ \(assumed: [a-z0-9_-]{1,64}\)$/.test(rest) ? "assumed" : undefined;
}

/** 2026-11-28: an "ended" phrase not re-seen for this long no longer counts (sb_join re-emits it every ~2 s tick while shown). */
export const ENDED_STALE_MS = 30_000;
export interface EndTrack { endedAt?: number; seenAt: number }
/**
 * Feed one bot event (review E, 2026-11-28). sb_join matches the end phrases against the whole page text, chat included, so an
 * `ended` sent while the call controls still show (`in_call: true`) is chat or caption text and never counts. An arrival after a
 * stale gap starts a new run instead of joining the old one.
 */
export function noteEnded(t: EndTrack, ev: GateEvent, now: number): EndTrack {
  if (ev.event !== "ended" || ev.in_call === true) return t;
  const fresh = t.endedAt !== undefined && now - t.seenAt <= ENDED_STALE_MS;
  return { endedAt: fresh ? t.endedAt : now, seenAt: now };
}
/** An end phrase stops a capture only when it was shown CONTINUOUSLY for 60 s and end-not-before has passed. */
export function sustainedEnd(endedAt: number | undefined, seenAt: number, now: number, endNotBefore: number): { endedAt: number | undefined; stop: boolean } {
  const still = endedAt !== undefined && now - seenAt <= ENDED_STALE_MS ? endedAt : undefined;
  return { endedAt: still, stop: still !== undefined && now >= endNotBefore && now - still > 60_000 };
}

/** A reload this recent before a capture-error is treated as its cause. */
export const RELOAD_CAUSE_WINDOW_MS = 180_000;

export function createAdmissionGate(now: () => number = Date.now) {
  let admitted = false;
  let watchdog: GateWatchdog | undefined;
  let lastReload: { at: number; kind: string } | undefined;
  let failure: string | undefined;
  let timedOut = false;
  let denied = false;
  let admission: AdmissionInfo | undefined;

  function decide(ev: GateEvent): string | undefined {
    switch (ev.event) {
      case "admitted":
        if (!admitted) admission = ev.assumed === true ? { assumed: true, reason: typeof ev.reason === "string" ? ev.reason : "no-lobby-signal" } : { assumed: false };
        admitted = true;
        watchdog?.start();
        return undefined;
      case "admission_timeout":
        timedOut = !admitted;
        return `admission_timeout: the bot was not admitted to the meeting within ${String(ev.limit ?? "?")}s (waited ${String(ev.seconds ?? "?")}s in the lobby); no recording made`;
      case "admission_denied":
        if (admitted) return undefined; // a refusal phrase after admission is just page text; it never fails a live capture
        denied = true;
        return `admission_denied: Google Meet refused the bot ("You can't join this video call"; shown after ${String(ev.seconds ?? "?")}s); no recording made`;
      case "watchdog-reload":
      case "reconnect-reload":
        if (admitted) lastReload = { at: now(), kind: ev.event };
        return undefined;
      case "capture-error": {
        if (admitted && lastReload && now() - lastReload.at <= RELOAD_CAUSE_WINDOW_MS) {
          return `${String(ev.error ?? "capture failed")} (the audio track ended after a page reload [${lastReload.kind}] following admission; the reload killed the capture)`;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  return {
    get admitted(): boolean { return admitted; },
    /** Undefined until `admitted`; `assumed: true` means no positive in-call signal was ever seen. */
    get admission(): AdmissionInfo | undefined { return admission; },
    /** "lobby" until `admitted`; "failed" once an admission_timeout or admission_denied was reported; a capture is "recording" only in "admitted". */
    get state(): "lobby" | "admitted" | "failed" { return admitted ? "admitted" : timedOut || denied ? "failed" : "lobby"; },
    /** The most recent failure message this gate produced (the tab backend's own stop error is terser). */
    get failure(): string | undefined { return failure; },
    /** Registers the watchdog; starts it at once if `admitted` already arrived (join() can emit it first). */
    attach(w: GateWatchdog): void { watchdog = w; if (admitted) w.start(); },
    /** Feed every bot event. Returns a failure message when the event is fatal for the capture. */
    onEvent(ev: GateEvent): string | undefined {
      const message = decide(ev);
      if (message) failure = message;
      return message;
    },
  };
}

const STATUS_IDENTITY_KEYS = ["output", "pid", "handle", "sessionId", "tenantId", "profileDir", "recordDir", "controllerStartedAt"];

/**
 * B2 / D-232, refusal path only (never called for admission_timeout or any other failure): after the tab backend has stopped,
 * remove THIS session's recording file if it is zero bytes (a refused bot never produced media) and re-mark its status file
 * "failed" (the backend writes "stopped" for a clean recorder stop). A non-empty partial is never touched (B2-I5).
 * Best effort and silent: it must never mask the admission_denied failure the caller is about to throw.
 */
export function settleDeniedCapture(output: string | undefined, failure: string | undefined): void {
  if (!output) return;
  try { if (existsSync(output) && statSync(output).size === 0) rmSync(output); } catch { /* keep the file; the failure is still reported */ }
  try {
    const file = `${output}.status.json`;
    if (!existsSync(file)) return;
    const prior = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const identity = Object.fromEntries(STATUS_IDENTITY_KEYS.filter((k) => prior[k] !== undefined).map((k) => [k, prior[k]]));
    writeOwnedTabStatus(file, identity, { state: "failed", error: failure ?? "admission_denied" });
  } catch { /* a status the backend refuses to rewrite stays as it is */ }
}
