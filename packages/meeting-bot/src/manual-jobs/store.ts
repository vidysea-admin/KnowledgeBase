/** Durable manual capture ownership. Request, worker state, and cancel intent have separate writers. */
import { createHash, randomBytes } from "node:crypto";
import { linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MANUAL_JOB_ID = /^send-now-\d{14}-[0-9a-f]{6}$/;
const TENANT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
export const MANUAL_STATES = ["queued", "launching", "running", "cancel-requested", "cancel-acknowledged", "cancelled", "completed", "failed", "unknown"] as const;
export type ManualState = typeof MANUAL_STATES[number];
export const terminalManualState = (state: ManualState) => ["cancelled", "completed", "failed"].includes(state);
export interface ManualRequest {
  version: 1; tenantId: string; jobId: string; nonce: string; meetingUrl: string; meetingKey: string;
  platform: string; until: string; requestedAt: string;
}
export interface ManualProgress { version: 1; tenantId: string; jobId: string; nonce: string; state: ManualState; updatedAt: string; recorderReady?: boolean }
export interface ManualSummary { jobId: string; platform: string; state: ManualState; requestedAt: string; updatedAt: string; joined: "unknown" }
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const present = (file: string) => {
  try { lstatSync(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
};

export class ManualJobStore {
  constructor(readonly dir: string, readonly now: () => Date = () => new Date()) {}
  private tenant(tenantId: string, create = false): string {
    if (!TENANT.test(tenantId)) throw new Error("invalid capture tenant");
    if (create) mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (present(this.dir) && (!lstatSync(this.dir).isDirectory() || lstatSync(this.dir).isSymbolicLink())) throw new Error("manual job directory unavailable");
    const dir = path.join(this.dir, tenantId);
    if (create) mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (present(dir) && (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())) throw new Error("manual tenant directory unavailable");
    return dir;
  }
  private file(tenantId: string, jobId: string, suffix = ""): string {
    if (!MANUAL_JOB_ID.test(jobId)) throw new Error("invalid manual job id");
    return path.join(this.tenant(tenantId), `${jobId}${suffix}.json`);
  }
  private read(file: string): unknown {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error("manual job state unavailable");
    return JSON.parse(readFileSync(file, "utf8"));
  }
  readRequest(tenantId: string, jobId: string): ManualRequest | null {
    const file = this.file(tenantId, jobId);
    if (!present(file)) return null;
    const v = this.read(file);
    if (!object(v) || v.version !== 1 || v.tenantId !== tenantId || v.jobId !== jobId || typeof v.nonce !== "string" || !/^[0-9a-f]{64}$/.test(v.nonce) ||
      typeof v.meetingUrl !== "string" || v.meetingUrl.length > 2048 || typeof v.meetingKey !== "string" || v.meetingKey.length > 2048 ||
      typeof v.platform !== "string" || !/^[a-z-]{1,32}$/.test(v.platform) || typeof v.until !== "string" || v.until.length > 64 || !iso(v.requestedAt)) throw new Error("manual job request unavailable");
    return v as unknown as ManualRequest;
  }
  private progress(req: ManualRequest): ManualProgress | null {
    const file = this.file(req.tenantId, req.jobId, ".state");
    if (!present(file)) return null;
    const v = this.read(file);
    if (!object(v) || v.version !== 1 || v.tenantId !== req.tenantId || v.jobId !== req.jobId || v.nonce !== req.nonce ||
      !MANUAL_STATES.includes(v.state as ManualState) || !iso(v.updatedAt) || (v.recorderReady !== undefined && typeof v.recorderReady !== "boolean")) throw new Error("manual job progress unavailable");
    return v as unknown as ManualProgress;
  }
  cancellation(req: ManualRequest): boolean {
    const file = this.file(req.tenantId, req.jobId, ".cancel");
    if (!present(file)) return false;
    const v = this.read(file);
    if (!object(v) || Object.keys(v).sort().join() !== "jobId,nonce,tenantId,version" || v.version !== 1 || v.tenantId !== req.tenantId || v.jobId !== req.jobId || v.nonce !== req.nonce) throw new Error("manual cancel request unavailable");
    return true;
  }
  summary(tenantId: string, jobId: string): ManualSummary | null {
    const req = this.readRequest(tenantId, jobId);
    if (!req) return null;
    const progress = this.progress(req);
    let state: ManualState = progress?.state ?? "queued";
    const updatedAt = progress?.updatedAt ?? req.requestedAt;
    if (!terminalManualState(state) && this.now().getTime() - Date.parse(updatedAt) > 15_000) state = "unknown";
    if (!terminalManualState(state) && state !== "unknown" && this.cancellation(req) && state !== "cancel-acknowledged") state = "cancel-requested";
    // No URL, meeting key, passcode, path, process id, generation, token or raw error leaves the store.
    return { jobId, platform: req.platform, state, requestedAt: req.requestedAt, updatedAt, joined: "unknown" };
  }
  /** Cancel intent does not prove a recorder exists; retain the worker's readiness separately. */
  recorderState(tenantId: string, jobId: string): ManualState | null {
    const req = this.readRequest(tenantId, jobId);
    if (!req) return null;
    const progress = this.progress(req);
    const state = progress?.state ?? "queued";
    if (!terminalManualState(state) && this.now().getTime() - Date.parse(progress?.updatedAt ?? req.requestedAt) > 15_000) return "unknown";
    if (state === "cancel-requested") return progress?.recorderReady === true ? "running" : "launching";
    return state;
  }
  list(tenantId: string): ManualSummary[] {
    const dir = this.tenant(tenantId);
    if (!present(dir)) return [];
    const files = readdirSync(dir);
    const names = files.filter(name => MANUAL_JOB_ID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"));
    for (const name of files) {
      if (name === ".dispatch-lock" || /^send-now-\d{14}-[0-9a-f]{6}(?:\.(?:state|cancel|owner))?\.json\.[0-9a-f]{12}\.tmp$/.test(name) || /^meeting-[0-9a-f]{64}\.json\.[0-9a-f]{12}\.tmp$/.test(name)) continue;
      if (/^meeting-[0-9a-f]{64}\.json$/.test(name)) {
        const claim = this.read(path.join(dir, name));
        if (!object(claim) || typeof claim.jobId !== "string" || !this.readRequest(tenantId, claim.jobId)) throw new Error("manual meeting claim unavailable");
        continue;
      }
      const child = /^(send-now-\d{14}-[0-9a-f]{6})\.(state|cancel|owner)\.json$/.exec(name);
      if (child) {
        const req = this.readRequest(tenantId, child[1]!);
        if (!req) throw new Error("orphaned manual job state");
        if (child[2] === "cancel") this.cancellation(req);
        if (child[2] === "owner") { const v = this.read(path.join(dir, name)); if (!object(v) || Object.keys(v).length !== 1 || v.nonce !== req.nonce) throw new Error("manual owner claim unavailable"); }
        continue;
      }
      if (!names.includes(name)) throw new Error("unexpected manual job state");
    }
    if (names.length > 2000) throw new Error("manual job history requires archival");
    return names.map(name => this.summary(tenantId, name.slice(0, -5))!).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 100);
  }
  create(tenantId: string, plan: { meetingUrl: string; meetingKey: string; platform: string }, until: string): ManualRequest {
    const dir = this.tenant(tenantId, true), lock = path.join(dir, ".dispatch-lock");
    // Fail closed on a concurrent/abandoned dispatch. No time-based lock takeover can duplicate an owner.
    mkdirSync(lock);
    try {
      const claim = path.join(dir, `meeting-${createHash("sha256").update(plan.meetingKey).digest("hex")}.json`);
      if (present(claim)) {
        const previous = this.read(claim);
        if (!object(previous) || typeof previous.jobId !== "string") throw new Error("manual meeting claim unavailable");
        const old = this.summary(tenantId, previous.jobId);
        if (!old || !terminalManualState(old.state)) throw new Error("manual meeting already owned");
      }
      const jobId = `send-now-${this.now().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
      const req: ManualRequest = { version: 1, tenantId, jobId, nonce: randomBytes(32).toString("hex"), meetingUrl: plan.meetingUrl, meetingKey: plan.meetingKey, platform: plan.platform, until, requestedAt: this.now().toISOString() };
      this.publish(this.file(tenantId, jobId), req);
      this.atomic(claim, { jobId });
      return req;
    } finally { rmdirSync(lock); }
  }
  private atomic(file: string, value: unknown): void {
    const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try { writeFileSync(temp, JSON.stringify(value), { flag: "wx", mode: 0o600 }); renameSync(temp, file); }
    finally { rmSync(temp, { force: true }); }
  }
  private publish(file: string, value: unknown): void {
    const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try { writeFileSync(temp, JSON.stringify(value), { flag: "wx", mode: 0o600 }); linkSync(temp, file); }
    finally { rmSync(temp, { force: true }); }
  }
  writeProgress(req: ManualRequest, state: ManualState, recorderReady?: boolean): void {
    const actual = this.readRequest(req.tenantId, req.jobId);
    if (!actual || actual.nonce !== req.nonce || !MANUAL_STATES.includes(state)) throw new Error("manual worker ownership refused");
    this.atomic(this.file(req.tenantId, req.jobId, ".state"), { version: 1, tenantId: req.tenantId, jobId: req.jobId, nonce: req.nonce, state, updatedAt: this.now().toISOString(), ...(recorderReady === undefined ? {} : { recorderReady }) });
  }
  claimWorker(req: ManualRequest): () => void {
    const actual = this.readRequest(req.tenantId, req.jobId);
    if (!actual || actual.nonce !== req.nonce) throw new Error("manual worker ownership refused");
    const file = this.file(req.tenantId, req.jobId, ".owner");
    this.publish(file, { nonce: req.nonce });
    // Retained after exit: the same job may NEVER start a second recorder.
    return () => {};
  }
  cancel(tenantId: string, jobId: string): ManualSummary | null {
    const req = this.readRequest(tenantId, jobId);
    if (!req) return null;
    const summary = this.summary(tenantId, jobId)!;
    if (!terminalManualState(summary.state)) {
      try { this.publish(this.file(tenantId, jobId, ".cancel"), { version: 1, tenantId, jobId, nonce: req.nonce }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; this.cancellation(req); }
    }
    return this.summary(tenantId, jobId);
  }
}

