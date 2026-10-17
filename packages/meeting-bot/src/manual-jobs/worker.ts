/** Detached job owner keeps recorder IPC alive across API restarts. No process signals are used. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ManualJobStore, type ManualState } from "./store.js";
import { launchControlledRecording, type RecordingControl } from "../capture/reconnect-gaps.js";
import { planSendNow } from "../send-now.js";

export interface ManualWorkerDeps {
  launch(root: string, args: string[], env: NodeJS.ProcessEnv, onLine: (line: string) => void, onControl: (control: RecordingControl) => void): Promise<void>;
  schedule(fn: () => void): () => void;
  publishPrivate?(owner: { tenantId: string; sessionId: string }, control: RecordingControl): Promise<() => Promise<void>>;
}
const defaults: ManualWorkerDeps = {
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

export async function runManualWorker(root: string, store: ManualJobStore, tenantId: string, jobId: string, deps: ManualWorkerDeps = defaults): Promise<void> {
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
  const persist = () => store.writeProgress(req, state, ready);
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
    await deps.launch(root, ["record", plan.request.meetingUrl, "--until", req.until, "--tenant", tenantId,
      "--session-id", jobId, "--title", `manual ${req.platform}`], { ...process.env, LKB_TENANT_ID: tenantId },
      line => {
        // This fixed recorder line occurs after installCaptureControl and joiner setup. It is NOT admission evidence.
        if (line.startsWith("[bot] recording until ")) {
          ready = true; state = "running";
          try { persist(); } catch (error) { stateError = error; }
          publishPrivate();
          requestTick();
        }
        // Capture logs can carry links/passcodes; do not duplicate them into manual-job logs.
      }, value => { control = value; publishPrivate(); });
    succeeded = true;
  } catch {
    succeeded = false;
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
