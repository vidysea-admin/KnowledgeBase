/**
 * apps/api/src/join-rules/capture-job-queue.ts - the hosted "send bot now" queue (unit `hosted-send-now`).
 *
 * The Cloud Run API and the Cloud Run recorder container share no disk, so the file store of
 * packages/meeting-bot/src/manual-jobs/store.ts cannot carry a job between them. This is the same lifecycle
 * (queued -> launching -> running -> completed | failed | cancelled, with cancel intent) in ONE Mongo collection,
 * `capture_jobs`, written by two parties:
 *   - the API: create (queued), cancel intent, reads;
 *   - the recorder's queue worker (scripts/webinar/send-now/queue-worker.ts): claim, progress, terminal state.
 * One live job per (tenant, meeting): a unique index over `activeKey`, a field that exists only while the job is live,
 * so the guard is atomic and survives restarts. A live job whose owner stopped writing for STALE_OWNER_MS is reaped
 * to `failed` (never restarted: one job never starts a second recorder). No URL or passcode leaves `summary`,
 * and a terminal row keeps none (meetingUrl is blanked on every terminal transition).
 */
import { randomBytes } from "node:crypto";
import type { Collection, Db } from "mongodb";

export const CAPTURE_JOBS = "capture_jobs";
export const CAPTURE_JOB_ID = /^send-now-\d{14}-[0-9a-f]{6}$/;
export const CAPTURE_STATES = ["queued", "launching", "running", "cancel-requested", "cancel-acknowledged", "cancelled", "completed", "failed", "unknown"] as const;
export type CaptureState = typeof CAPTURE_STATES[number];
export const terminalCaptureState = (state: CaptureState) => state === "cancelled" || state === "completed" || state === "failed";
/** A claimed job whose worker has not written for this long is shown as `unknown`. */
export const OWNER_SILENT_MS = 30_000;
/** ...and after this long it is reaped to `failed`, freeing the meeting for a new request. */
export const STALE_OWNER_MS = 120_000;

export interface CaptureJobDoc {
  _id: string; tenantId: string; nonce: string; meetingUrl: string; meetingKey: string; platform: string;
  until: string; requestedAt: string; updatedAt: string; state: CaptureState; cancelRequested: boolean;
  recorderReady?: boolean; ownerId?: string; claimedAt?: string; failure?: string;
  /** `${tenantId}\u0000${meetingKey}` while live; absent once terminal. Unique (sparse). */
  activeKey?: string;
}
export interface CaptureJobSummary { jobId: string; platform: string; state: CaptureState; requestedAt: string; updatedAt: string; joined: "unknown" }
export interface CaptureJobPlan { meetingUrl: string; meetingKey: string; platform: string }

export class CaptureJobDuplicate extends Error { readonly code = "manual_duplicate"; constructor() { super("manual meeting already owned"); } }
const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;
/** Set on every terminal transition: an ended job keeps no meeting URL (it can carry a passcode). */
const ENDED = { meetingUrl: "" } as const;
const activeKey = (tenantId: string, meetingKey: string) => `${tenantId}\u0000${meetingKey}`;

export class CaptureJobQueue {
  constructor(private readonly db: Db, readonly now: () => Date = () => new Date()) {}
  private get jobs(): Collection<CaptureJobDoc> { return this.db.collection<CaptureJobDoc>(CAPTURE_JOBS); }

  /** Idempotent. The unique sparse index is the duplicate guard; nothing else depends on index presence. */
  async ensureIndexes(): Promise<void> {
    await this.jobs.createIndex({ activeKey: 1 }, { unique: true, sparse: true, name: "one_live_job_per_meeting" });
    await this.jobs.createIndex({ state: 1, requestedAt: 1 }, { name: "claim_order" });
    await this.jobs.createIndex({ tenantId: 1, requestedAt: -1 }, { name: "tenant_recent" });
  }

  private iso(): string { return this.now().toISOString(); }
  private staleBefore(ms: number): string { return new Date(this.now().getTime() - ms).toISOString(); }

  /** Live jobs that can no longer finish become `failed`: a silent owner, or a queued job whose window has passed. */
  async reap(): Promise<number> {
    const at = this.iso();
    const result = await this.jobs.updateMany(
      { activeKey: { $exists: true }, $or: [
        { state: { $ne: "queued" }, updatedAt: { $lt: this.staleBefore(STALE_OWNER_MS) } },
        { state: "queued", until: { $lte: at } },
      ] },
      { $set: { state: "failed", updatedAt: at, failure: "owner-lost-or-expired", ...ENDED }, $unset: { activeKey: "" } },
    );
    return result.modifiedCount;
  }

  async create(tenantId: string, plan: CaptureJobPlan, untilIso: string): Promise<CaptureJobDoc> {
    await this.reap();
    const at = this.iso();
    const doc: CaptureJobDoc = {
      _id: `send-now-${at.replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`, tenantId,
      nonce: randomBytes(32).toString("hex"), meetingUrl: plan.meetingUrl, meetingKey: plan.meetingKey, platform: plan.platform,
      until: untilIso, requestedAt: at, updatedAt: at, state: "queued", cancelRequested: false, activeKey: activeKey(tenantId, plan.meetingKey),
    };
    try { await this.jobs.insertOne(doc); }
    catch (error) { if (isDuplicateKey(error)) throw new CaptureJobDuplicate(); throw error; }
    return doc;
  }

  async hasLiveJob(tenantId: string, meetingKey: string): Promise<boolean> {
    await this.reap();
    return (await this.jobs.findOne({ activeKey: activeKey(tenantId, meetingKey) }, { projection: { _id: 1 } })) !== null;
  }

  summary(doc: CaptureJobDoc): CaptureJobSummary {
    let state = doc.state;
    if (!terminalCaptureState(state) && state !== "queued" && doc.updatedAt < this.staleBefore(OWNER_SILENT_MS)) state = "unknown";
    else if (!terminalCaptureState(state) && state !== "cancel-acknowledged" && doc.cancelRequested) state = "cancel-requested";
    return { jobId: doc._id, platform: doc.platform, state, requestedAt: doc.requestedAt, updatedAt: doc.updatedAt, joined: "unknown" };
  }
  async detail(tenantId: string, jobId: string): Promise<CaptureJobSummary | null> {
    if (!CAPTURE_JOB_ID.test(jobId)) return null;
    await this.reap();   // readers reap too: an expired queued job must not read "queued" while no worker runs
    const doc = await this.jobs.findOne({ _id: jobId, tenantId });
    return doc ? this.summary(doc) : null;
  }
  async list(tenantId: string): Promise<CaptureJobSummary[]> {
    await this.reap();
    const docs = await this.jobs.find({ tenantId }).sort({ requestedAt: -1 }).limit(100).toArray();
    return docs.map(doc => this.summary(doc));
  }

  /** Cancel intent. A queued job nobody claimed ends here; a claimed one is stopped by its owner. */
  async cancel(tenantId: string, jobId: string): Promise<CaptureJobSummary | null> {
    if (!CAPTURE_JOB_ID.test(jobId)) return null;
    const at = this.iso();
    await this.jobs.updateOne({ _id: jobId, tenantId, state: "queued", activeKey: { $exists: true } },
      { $set: { state: "cancelled", cancelRequested: true, updatedAt: at, ...ENDED }, $unset: { activeKey: "" } });
    await this.jobs.updateOne({ _id: jobId, tenantId, activeKey: { $exists: true } }, { $set: { cancelRequested: true } });
    return this.detail(tenantId, jobId);
  }

  /** Worker side: atomically take the oldest queued job of a served tenant. */
  async claimNext(ownerId: string, tenants: readonly string[]): Promise<CaptureJobDoc | null> {
    await this.reap();
    const at = this.iso();
    return this.jobs.findOneAndUpdate(
      { state: "queued", activeKey: { $exists: true }, cancelRequested: false, tenantId: { $in: [...tenants] } },
      { $set: { state: "launching", ownerId, claimedAt: at, updatedAt: at } },
      { sort: { requestedAt: 1 }, returnDocument: "after" },
    );
  }

  /** Worker side: write progress for a job this owner holds. False when ownership was lost (reaped). */
  async writeProgress(job: Pick<CaptureJobDoc, "_id" | "nonce">, ownerId: string, state: CaptureState, recorderReady?: boolean): Promise<boolean> {
    const set: Partial<CaptureJobDoc> = { state, updatedAt: this.iso(), ...(recorderReady === undefined ? {} : { recorderReady }) };
    const update = terminalCaptureState(state) ? { $set: { ...set, ...ENDED }, $unset: { activeKey: "" as const } } : { $set: set };
    const result = await this.jobs.updateOne({ _id: job._id, nonce: job.nonce, ownerId, activeKey: { $exists: true } }, update);
    return result.matchedCount === 1;
  }

  async cancelRequested(job: Pick<CaptureJobDoc, "_id" | "nonce">): Promise<boolean> {
    const doc = await this.jobs.findOne({ _id: job._id, nonce: job.nonce }, { projection: { cancelRequested: 1 } });
    return doc?.cancelRequested === true;
  }
}
