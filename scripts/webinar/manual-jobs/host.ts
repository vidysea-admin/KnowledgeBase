/** Real manual dispatch host: validated URLs, durable tenant ownership and a detached IPC owner worker. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SendNowDeps, SendNowPlanValue } from "../../../apps/api/src/join-rules/send-now.js";
import { ManualJobStore, terminalManualState, type ManualRequest } from "../../../packages/meeting-bot/src/manual-jobs/store.js";
import { createSendNowDeps, type SendNowHostOptions } from "../send-now-host.js";

export interface ManagedSendNowOptions extends SendNowHostOptions {
  jobsDir?: string;
  /** Test seam only; real launcher always uses the fixed owned worker entry and argv, no shell. */
  startWorker?: (req: ManualRequest) => Promise<void>;
}
const duplicate = () => Object.assign(new Error("manual meeting already owned"), { code: "manual_duplicate" });

export function createManagedSendNowDeps(opts: ManagedSendNowOptions = {}): SendNowDeps {
  const root = opts.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const now = opts.now ?? (() => new Date());
  const jobsDir = path.resolve(root, opts.jobsDir ?? process.env.LKB_MANUAL_JOBS_DIR ?? "raw/webinars/manual-jobs");
  const store = new ManualJobStore(jobsDir, now);
  const base = createSendNowDeps(opts);
  const tenant = () => opts.hostTenant?.() ?? process.env.LKB_TENANT_ID ?? "vidysea";
  const owner = (tenantId: string) => { if (tenantId !== tenant()) throw Object.assign(new Error("tenant not served"), { code: "tenant_not_served" }); };
  const startWorker = opts.startWorker ?? (req => new Promise<void>((resolve, reject) => {
    const entry = path.join(root, "packages/meeting-bot/src/manual-jobs/worker.ts");
    const child = spawn(process.execPath, ["--import", "tsx", entry, req.tenantId, req.jobId], {
      cwd: root, detached: true, windowsHide: true, shell: false, stdio: "ignore",
      env: { ...process.env, LKB_MANUAL_JOBS_DIR: store.dir },
    });
    child.once("error", () => reject(new Error("manual worker could not start")));
    child.once("spawn", () => { child.unref(); resolve(); });
  }));
  async function plan(tenantId: string, request: { meetingUrl: string; until: string }): Promise<SendNowPlanValue> {
    const checked = await base.plan(tenantId, request);
    if (!checked.ok) return { ...checked, message: checked.kind === "forbidden" ? "this host does not capture for your tenant"
      : checked.kind === "duplicate" ? "a recorder already owns this meeting"
      : checked.kind === "invalid" ? "the meeting link or recording window was refused"
      : "capture state cannot be verified; nothing was launched" };
    try {
      owner(tenantId);
      for (const job of store.list(tenantId)) {
        if (!terminalManualState(job.state) && store.readRequest(tenantId, job.jobId)?.meetingKey === checked.meetingKey) {
          return { ok: false, kind: "duplicate", reason: "duplicate-live-job", message: "this meeting already has an owned manual job" };
        }
      }
      return checked;
    } catch { return { ok: false, kind: "unreadable", reason: "manual-jobs-unreadable", message: "manual job ownership cannot be read; nothing was launched" }; }
  }
  return {
    durableDispatch: true,
    plan,
    async launch(tenantId, checked, until) {
      owner(tenantId);
      const fresh = await plan(tenantId, { meetingUrl: checked.meetingUrl, until });
      if (!fresh.ok) { if (fresh.kind === "duplicate") throw duplicate(); throw new Error("manual launch refused"); }
      let req: ManualRequest;
      const untilDate = new Date(now().getTime());
      const hm = /^(\d{1,2}):(\d{2})$/.exec(until);
      if (hm) untilDate.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      else untilDate.setTime(Date.parse(until));
      try { req = store.create(tenantId, fresh, untilDate.toISOString()); }
      catch (error) { if ((error as Error).message === "manual meeting already owned") throw duplicate(); throw error; }
      try { await startWorker(req); }
      catch { store.writeProgress(req, "failed"); throw new Error("manual worker could not start"); }
      return { jobId: req.jobId };
    },
    status(tenantId, jobId) {
      if (tenantId !== tenant()) return { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "this host does not capture for your tenant" };
      try {
        const job = store.summary(tenantId, jobId);
        if (!job) return { ok: true, status: "not-running" };
        const phase = store.recorderState(tenantId, jobId);
        if (phase === "unknown" || phase === null) return { ok: false, kind: "unreadable", reason: "manual-owner-unverified", message: "recorder owner status cannot be verified" };
        return { ok: true, status: terminalManualState(phase) ? "not-running" : ["queued", "launching"].includes(phase) ? "launching" : "running", startedAt: job.requestedAt };
      } catch { return { ok: false, kind: "unreadable", reason: "manual-jobs-unreadable", message: "manual jobs are unavailable" }; }
    },
    manualJobs: {
      list(tenantId) { owner(tenantId); return store.list(tenantId); },
      detail(tenantId, jobId) { owner(tenantId); return store.summary(tenantId, jobId); },
      cancel(tenantId, jobId) { owner(tenantId); return store.cancel(tenantId, jobId); },
    },
  };
}
