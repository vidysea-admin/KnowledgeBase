/**
 * scripts/webinar/send-now-host.ts - T-039 unit `t039-send-now-api-endpoint`. The real adapter behind
 * `POST /calendar/send-now`: plans with the meeting-bot `planSendNow` (link-safety validator + duplicate check over
 * `readLiveJobs`) and launches `cli.ts record` as a DETACHED child (no shell, argv array, output to a log file).
 * apps/* may not import packages/meeting-bot; a script is the lawful place that may import both (as join-rules-host.ts).
 * Wired in scripts/webinar/join-rules-api-host.ts. Pure helpers: no listen, no Mongo.
 *
 * LIMITS (ISS-T039CMD-001/-002 stay OPEN): `readLiveJobs` sees task-scheduler jobs only. A manual `lkb record` or a
 * poller launch is invisible, so a duplicate of those is NOT detected here (the tab-capture lock is the only guard).
 * One host serves ONE capture tenant (LKB_TENANT_ID, default "vidysea"): any other caller tenant is refused (403).
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SendNowDeps, SendNowPlanValue } from "../../apps/api/src/join-rules/send-now.js";
import { planSendNow, type SendNowJob } from "../../packages/meeting-bot/src/send-now.js";
import { hostOnly, readLiveJobs, REFUSAL_MESSAGES } from "../../packages/meeting-bot/src/send-now-command.js";

export interface SendNowHostOptions {
  root?: string;
  now?: () => Date;
  /** Tenant this host captures for. Default: `captureTenant([])` (LKB_TENANT_ID, else "vidysea"). */
  hostTenant?: () => string;
  /** MUST throw when the state cannot be read ("cannot tell" is never "no jobs"). Default: the command's strict reader. */
  readLiveJobs?: () => SendNowJob[] | Promise<SendNowJob[]>;
  /** Throws on a bad `until`. Default: record-commands `todayAt`. */
  validateUntil?: (value: string) => unknown;
  /** Test seam: the entry script node runs (default packages/meeting-bot/src/cli.ts) and the node binary. */
  cliEntry?: string;
  nodeExe?: string;
  /** How long to watch the child for an immediate exit before declaring the launch good. */
  livenessMs?: number;
  logDir?: string;
}

const DUPLICATE: SendNowPlanValue = { ok: false, kind: "duplicate", reason: "duplicate-live-job", message: "" };

export function createSendNowDeps(opts: SendNowHostOptions = {}): SendNowDeps {
  const root = opts.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const now = opts.now ?? (() => new Date());
  let record: Promise<typeof import("../../packages/meeting-bot/src/capture/record-commands.js")> | undefined;
  const rec = () => (record ??= import("../../packages/meeting-bot/src/capture/record-commands.js"));
  const hostTenant = async () => (opts.hostTenant ? opts.hostTenant() : (await rec()).captureTenant([]));

  return {
    async plan(tenantId, { meetingUrl, until }) {
      let tenant: string;
      try { tenant = await hostTenant(); }
      catch { return { ok: false, kind: "unreadable", reason: "tenant-unreadable", message: "the capture tenant of this host cannot be determined; nothing was launched" }; }
      if (tenantId !== tenant) return { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "this host does not capture for your tenant" };
      try { await (opts.validateUntil ?? (await rec()).todayAt)(until); }
      catch (e) { return { ok: false, kind: "invalid", reason: "invalid-until", message: e instanceof Error ? e.message.slice(0, 200) : "bad until" }; }
      let jobs: SendNowJob[];
      try {
        if (opts.readLiveJobs) jobs = await opts.readLiveJobs();
        else {
          const { readWebinarOperationState } = await import("../../packages/meeting-bot/src/calendar/schedule-state.js");
          jobs = readLiveJobs({ operationsFile: path.join(root, "data", "webinar-release", "operations.json"), scheduledDir: path.join(root, "raw", "webinars", "scheduled"), tenantId: tenant }, now(), readWebinarOperationState);
        }
      } catch (e) {
        return { ok: false, kind: "unreadable", reason: "live-jobs-unreadable", message: `cannot tell whether a bot is already in this meeting (${e instanceof Error ? e.message.slice(0, 200) : "unreadable"}); nothing was launched` };
      }
      const plan = planSendNow(meetingUrl, now(), jobs);
      if (!plan.ok) {
        const detail = plan.reason === "credentials-in-url" ? hostOnly(meetingUrl) : plan.detail;
        const message = REFUSAL_MESSAGES[plan.reason](detail);
        return plan.reason === "duplicate-live-job" ? { ...DUPLICATE, message } : { ok: false, kind: "invalid", reason: plan.reason, message };
      }
      return { ok: true, meetingUrl: plan.request.meetingUrl, meetingKey: plan.request.meetingKey, platform: plan.request.platform };
    },

    async launch(tenantId, plan, until) {
      const jobId = `send-now-${now().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
      const logDir = opts.logDir ?? path.join(root, "raw", "webinars");
      mkdirSync(logDir, { recursive: true });
      const cliEntry = opts.cliEntry ?? path.join(root, "packages", "meeting-bot", "src", "cli.ts");
      // argv array, no shell: the (validated) URL can never be re-parsed as shell text. `--import tsx` runs the TS CLI directly.
      const args = [...(opts.cliEntry ? [] : ["--import", "tsx"]), cliEntry, "record", plan.meetingUrl, "--until", until,
        "--tenant", tenantId, "--session-id", jobId, "--title", `send-now ${plan.platform}`];
      const fd = openSync(path.join(logDir, `${jobId}.log`), "a");
      try {
        const child = spawn(opts.nodeExe ?? process.execPath, args, { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", fd, fd] });
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const done = (err?: Error) => { if (settled) return; settled = true; clearTimeout(timer); child.removeAllListeners(); child.on("error", () => {}); err ? reject(err) : resolve(); };
          const timer = setTimeout(() => done(), opts.livenessMs ?? 2000);
          child.once("error", (e) => done(e));
          child.once("exit", (code, sig) => done(new Error(`launcher exited at once (${code ?? sig})`)));
        });
        child.unref();
      } finally { closeSync(fd); }
      return { jobId };
    },
  };
}
