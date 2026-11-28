/** Detached job owner keeps recorder IPC alive across API restarts. No process signals are used. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ManualJobStore, type ManualState } from "./store.js";
import { launchControlledRecording, type RecordingControl } from "../capture/reconnect-gaps.js";
import { planSendNow } from "../send-now.js";
import { parseAdmissionLine } from "../capture/admission-gate.js";

export interface ManualWorkerDeps {
  launch(root: string, args: string[], env: NodeJS.ProcessEnv, onLine: (line: string) => void, onControl: (control: RecordingControl) => void): Promise<void>;
  schedule(fn: () => void): () => void;
  publishPrivate?(owner: { tenantId: string; sessionId: string }, control: RecordingControl): Promise<() => Promise<void>>;
  /** Flags appended to `record` (e.g. --transcribe --process-video --index for the hosted queue worker). Fixed values, never user input. */
  recordArgs?: readonly string[];
  /** Every recorder output line, raw. The caller MUST redact before logging (the hosted queue worker does; the laptop path omits it). */
  onRecorderLine?(line: string): void;
}
/** Admission evidence the worker reports with each progress write: "pending" until the recorder's admitted line. */
export type JoinEvidence = "pending" | "yes" | "assumed";
/** What the worker needs from a job store: the file store, or the hosted Mongo mirror (scripts/webinar/send-now/queue-store.ts). */
export type ManualWorkerStore = Pick<ManualJobStore, "now" | "readRequest" | "claimWorker" | "writeProgress" | "cancellation">;
export const defaultManualWorkerDeps: ManualWorkerDeps = {
  launch: launchControlledRecording,
  schedule(fn) { const timer = setInterval(fn, 1000); return () => clearInterval(timer); },
  async publishPrivate(owner, control) {
    const directory = process.env.LKB_CAPTURE_CONTROL_DIR;
    if (!directory) return async () => {};
    if (!path.isAbsolute(directory)) throw new Error("private controller directory must be absolute");
    const bridge = await import("../capture/record-consent/controller-bridge.js");
    const value = control as Parameters<typeof bridge.publishCapturePrivacyController>[0]["control"];
    if (typeof value.privacy !== "function" || typeof value.privacyStatus !== "function") throw new Error("private recorder capability unavailable");
    return bridge.publishCapturePrivacyController({ directory, ...owner, control: value });
  },
};

/** How long after launch an "ended" report may stop a send-now capture (the recorder still waits 60 s of sustained end). */
export const SEND_NOW_END_GRACE_MS = 5 * 60_000;

export async function runManualWorker(root: string, store: ManualWorkerStore, tenantId: string, jobId: string, deps: ManualWorkerDeps = defaultManualWorkerDeps): Promise<void> {
  const request = store.readRequest(tenantId, jobId);
  if (!request) throw new Error("manual job not found");
  const req = request;
  store.claimWorker(req);
  // Revalidate URL independently in the process which owns actual capture; persisted input is not authority.
  const plan = planSendNow(req.meetingUrl, store.now(), []);
  const until = Date.parse(req.until), ahead = until - store.now().getTime();
  if (!plan.ok || plan.request.meetingKey !== req.meetingKey || plan.request.platform !== req.platform ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(req.until) || !Number.isFinite(ahead) || ahead <= 0 || ahead > 86_400_000) {
    store.writeProgress(req, "failed"); return;
  }
  if (store.cancellation(req)) { store.writeProgress(req, "cancelled"); return; }
  let state: ManualState = "launching", control: RecordingControl | undefined, ready = false, ack = false, checking = false, stateError: unknown;
  let activeTick: Promise<void> = Promise.resolve();
  let publication: Promise<void> = Promise.resolve(), publishing = false, disposePrivate: (() => Promise<void>) | undefined;
  let publicationError: unknown;
  // Join evidence (2026-11-28): "pending" until the recorder prints its admitted line; a job that ends still pending never joined.
  let joined: JoinEvidence = "pending";
  const persist = () => store.writeProgress(req, state, ready, joined);
  persist();
  async function tick(): Promise<void> {
    if (checking) return;
    checking = true;
    try {
      if (stateError && ready && control && !ack) ack = await control.stop("cancelled") === "accepted";
      if (store.cancellation(req) && !ack) {
        state = "cancel-requested"; persist();
        if (ready && control && await control.stop("cancelled") === "accepted") { ack = true; state = "cancel-acknowledged"; }
      }
      persist();
    } catch (error) { stateError = error; }
    finally { checking = false; }
  }
  const requestTick = () => { if (!checking) activeTick = tick(); };
  const publishPrivate = () => {
    if (!ready || !control || !deps.publishPrivate || publishing) return;
    publishing = true;
    const heldControl = control;
    // The stdout line triggers an attempt only. The helper must verify sealed child privacy readiness before publishing.
    publication = Promise.resolve().then(() => deps.publishPrivate!({ tenantId, sessionId: jobId }, heldControl)).then(dispose => { disposePrivate = dispose; })
      .catch(error => {
        publicationError = error;
        try { if (!store.cancellation(req)) stateError = error; } catch { stateError = error; }
        requestTick();
      });
  };
  const stopTicks = deps.schedule(requestTick);
  let succeeded = false;
  try {
    // Masterclass 2026-11-28: --until is only the user's upper bound for a meeting that is already running. Without
    // --end-not-before the recorder treats --until as the end-not-before too, so "webinar has been ended by host" could not
    // stop it and 61 min of silence were recorded. A real end may stop the capture from SEND_NOW_END_GRACE_MS after launch.
    const endNotBefore = new Date(Math.min(until, store.now().getTime() + SEND_NOW_END_GRACE_MS)).toISOString();
    await deps.launch(root, ["record", plan.request.meetingUrl, "--until", req.until, "--end-not-before", endNotBefore, "--tenant", tenantId,
      "--session-id", jobId, "--title", `manual ${req.platform}`, ...(deps.recordArgs ?? [])], { ...process.env, LKB_TENANT_ID: tenantId },
      line => {
        try { deps.onRecorderLine?.(line); } catch { /* a log sink never affects the capture */ }
        // This fixed recorder line occurs after installCaptureControl and joiner setup. It is NOT admission evidence.
        if (line.startsWith("[bot] recording until ")) {
          ready = true; state = "running";
          try { persist(); } catch (error) { stateError = error; }
          publishPrivate();
          requestTick();
        }
        const admitted = joined === "pending" ? parseAdmissionLine(line) : undefined;
        if (admitted) { joined = admitted; try { persist(); } catch (error) { stateError = error; } }
        // Lines go to onRecorderLine only; its owner redacts them (links/passcodes never reach the job record).
      }, value => { control = value; publishPrivate(); });
    succeeded = true;
  } catch (error) {
    succeeded = false;
    // 2026-11-28: say why in the log sink (the consumer redacts); the job record keeps only the state.
    // D-264: the launcher's fixed message, then its stderr tail, go to the log sink ONLY (its owner redacts); never the job record.
    const tail = (error as { stderrTail?: unknown } | null)?.stderrTail;
    const said = [`[failed] ${error instanceof Error ? error.message.slice(0, 200) : "recording failed"}`,
      ...(Array.isArray(tail) ? tail.filter((line): line is string => typeof line === "string").slice(-8).map(line => `[stderr] ${line}`) : [])];
    for (const line of said) { try { deps.onRecorderLine?.(line); } catch { /* a log sink never affects the job */ } }
  } finally {
    stopTicks(); await publication; await activeTick;
    try { await disposePrivate?.(); } catch (error) { stateError = error; }
    if (publicationError) {
      // Exiting after an acknowledged operator cancellation naturally invalidates an in-flight readiness challenge.
      try { if (!(ack && store.cancellation(req))) stateError ??= publicationError; } catch { stateError ??= publicationError; }
    }
    state = succeeded && !stateError ? ack ? "cancelled" : "completed" : "failed";
    persist();
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tenantId, jobId] = process.argv.slice(2);
  if (!tenantId || !jobId || process.argv.length !== 4) process.exitCode = 1;
  else {
    const store = new ManualJobStore(process.env.LKB_MANUAL_JOBS_DIR ?? path.join(root, "raw/webinars/manual-jobs"));
    runManualWorker(root, store, tenantId, jobId).catch(() => { process.exitCode = 1; });
  }
}
