/**
 * scripts/webinar/send-now/queue-store.ts - unit `hosted-send-now`. Adapts ONE claimed `capture_jobs` row to the
 * synchronous store the manual worker (packages/meeting-bot/src/manual-jobs/worker.ts) already drives, so the hosted
 * path reuses the exact recorder lifecycle (readiness, owned cancel ACK, terminal states) of the laptop path.
 *   - reads are served from the claimed row (this process is its only progress writer);
 *   - progress writes are coalesced: a state change is written at once, an unchanged state at most every HEARTBEAT_MS;
 *   - cancel intent is polled from Mongo every POLL_MS; losing ownership (reaped) also reads as a cancel, so the
 *     recorder is stopped rather than left running for a job the API already shows as failed;
 *   - close() stops polling and makes the last state durable (bounded retries), or throws;
 *   - interrupt() (container SIGTERM) writes `failed` at once and freezes the row: the recorder is being killed, so the
 *     job must not sit `running` until the owner-silence reaper finds it.
 */
import type { CaptureJobDoc, CaptureJobQueue, CaptureState } from "../../../apps/api/src/join-rules/capture-job-queue.js";
import type { ManualRequest, ManualState } from "../../../packages/meeting-bot/src/manual-jobs/store.js";
import type { JoinEvidence, ManualWorkerStore } from "../../../packages/meeting-bot/src/manual-jobs/worker.js";

export const HEARTBEAT_MS = 5_000;
export const POLL_MS = 2_000;
type Timers = { every(fn: () => void, ms: number): () => void; sleep(ms: number): Promise<void> };
const realTimers: Timers = {
  every(fn, ms) { const t = setInterval(fn, ms); t.unref?.(); return () => clearInterval(t); },
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

export class QueueJobMirror implements ManualWorkerStore {
  readonly now: () => Date;
  private cancelSeen = false;
  private lost = false;
  private desired: { state: ManualState; ready?: boolean; joined?: JoinEvidence } | undefined;
  private written: { state: ManualState; ready?: boolean; joined?: JoinEvidence; at: number } | undefined;
  private writing: Promise<void> = Promise.resolve();
  private failure: unknown;
  private stopPoll: (() => void) | undefined;
  private confirmed: ManualState | undefined;
  private interrupted: Promise<void> | undefined;

  constructor(private readonly queue: CaptureJobQueue, private readonly job: CaptureJobDoc, private readonly ownerId: string, private readonly timers: Timers = realTimers) {
    this.now = () => queue.now();
  }

  get request(): ManualRequest {
    const j = this.job;
    return { version: 1, tenantId: j.tenantId, jobId: j._id, nonce: j.nonce, meetingUrl: j.meetingUrl, meetingKey: j.meetingKey, platform: j.platform, until: j.until, requestedAt: j.requestedAt };
  }
  get ownershipLost(): boolean { return this.lost; }

  start(): void {
    if (this.stopPoll) return;
    this.stopPoll = this.timers.every(() => { void this.poll(); }, POLL_MS);
    void this.poll();   // a cancel that landed between claim and the first interval is seen before launch
  }
  private async poll(): Promise<void> {
    try { if (await this.queue.cancelRequested(this.job)) this.cancelSeen = true; } catch { /* next poll retries; a dead DB shows as a silent owner */ }
    this.flush(false);
  }

  readRequest(tenantId: string, jobId: string): ManualRequest | null {
    return tenantId === this.job.tenantId && jobId === this.job._id ? this.request : null;
  }
  claimWorker(req: ManualRequest): () => void {
    if (req.nonce !== this.job.nonce) throw new Error("manual worker ownership refused");
    return () => {};
  }
  cancellation(req: ManualRequest): boolean {
    if (req.nonce !== this.job.nonce) throw new Error("manual cancel request unavailable");
    return this.cancelSeen || this.lost;
  }
  writeProgress(req: ManualRequest, state: ManualState, recorderReady?: boolean, joined?: JoinEvidence): void {
    if (req.nonce !== this.job.nonce) throw new Error("manual worker ownership refused");
    if (this.interrupted) return;   // frozen: the interrupt wrote the final state
    this.desired = { state, ...(recorderReady === undefined ? {} : { ready: recorderReady }), ...(joined === undefined ? {} : { joined }) };
    this.flush(false);
  }

  private flush(force: boolean): void {
    const want = this.desired;
    if (!want || this.lost || (this.interrupted && !force)) return;
    const w = this.written, t = this.now().getTime();
    const changed = !w || w.state !== want.state || w.ready !== want.ready || w.joined !== want.joined;
    if (!force && !changed && t - w!.at < HEARTBEAT_MS) return;
    this.written = { ...want, at: t };
    this.writing = this.writing.then(async () => {
      try {
        if (await this.queue.writeProgress(this.job, this.ownerId, want.state as CaptureState, want.ready, want.joined)) this.confirmed = want.state;
        else this.lost = true;
      } catch (error) { this.failure = error; this.written = undefined; }
    });
  }

  /** Container shutdown: stop polling, write `failed` now (bounded), freeze. Idempotent. */
  interrupt(): Promise<void> {
    this.cancelSeen = true;
    return this.interrupted ??= (async () => {
      this.stopPoll?.(); this.stopPoll = undefined;
      await this.writing;
      if (this.lost || this.isEnded()) return;
      this.desired = { state: "failed", ...(this.desired?.joined ? { joined: this.desired.joined } : {}) };   // keep admission evidence a failed write had not landed yet
      for (let attempt = 0; attempt < 2 && !this.lost && !this.isEnded(); attempt++) {
        this.failure = undefined; this.written = undefined;
        this.flush(true); await this.writing;
      }
    })();
  }
  private isEnded(): boolean { return this.confirmed === "completed" || this.confirmed === "failed" || this.confirmed === "cancelled"; }

  /** Stop polling; write the final state durably (3 attempts). Throws when it could not be written or ownership was lost. */
  async close(): Promise<void> {
    this.stopPoll?.(); this.stopPoll = undefined;
    if (this.interrupted) await this.interrupted;
    await this.writing;
    for (let attempt = 0; attempt < 3 && !this.lost; attempt++) {
      if (this.isEnded() && (this.interrupted || this.confirmed === this.desired?.state)) return;   // already durable: never rewrite a terminal row
      if (this.interrupted) break;
      this.failure = undefined; this.written = undefined;
      this.flush(true); await this.writing;
      if (this.lost) break;
      if (!this.failure) return;
      await this.timers.sleep(1000 * (attempt + 1));
    }
    if (this.lost) throw new Error("capture job ownership was lost before the final state was written");
    throw new Error("the final capture job state could not be written");
  }
}
