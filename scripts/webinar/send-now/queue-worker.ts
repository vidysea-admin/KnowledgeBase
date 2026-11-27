/**
 * scripts/webinar/send-now/queue-worker.ts - unit `hosted-send-now`. The recorder container's consumer of the hosted
 * "send bot now" queue (`capture_jobs`, apps/api/src/join-rules/capture-job-queue.ts).
 *
 *   node --import tsx scripts/webinar/send-now/queue-worker.ts --once [--max-wait-s N]
 *
 * Waits up to N seconds (default 0: one look) for a queued job of a served tenant, claims it atomically, and runs it
 * to the end with the manual worker (join, record, then the finalize chain), then exits. One job per call: the
 * entrypoint loop calls it between calendar ticks, so a meeting is never recorded by two pipelines at once (D-231).
 * Record flags: --transcribe (unless LKB_SEND_NOW_TRANSCRIBE=0); --process-video --index only with LKB_SEND_NOW_INDEX=1,
 * because --index writes the knowledge base and that is the operator's decision per deployment.
 * Env: MONGODB_URL, MONGODB_DB (same guard as the API), LKB_SEND_NOW_TENANTS / LKB_TENANT_ID.
 * Exit: 0 no job or job completed/cancelled; 2 the job failed; 1 configuration or database error. Never prints the
 * meeting URL (it can carry a passcode); only the job id and states.
 */
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { CaptureJobQueue, type CaptureJobDoc } from "../../../apps/api/src/join-rules/capture-job-queue.js";
import { requireDatabaseName } from "../../../apps/api/src/db-name.js";
import { servedTenants } from "../../../apps/api/src/join-rules/send-now-queue.js";
import { defaultManualWorkerDeps, runManualWorker, type ManualWorkerDeps } from "../../../packages/meeting-bot/src/manual-jobs/worker.js";
import { assertCaptureHostIdSetting } from "../../../packages/meeting-bot/src/capture/workspace/capture-slot-readiness.js";
import { QueueJobMirror } from "./queue-store.js";

/** The slice of the driver used here, typed from the queue's own Db so no second `mongodb` copy is resolved for types. */
type QueueDb = ConstructorParameters<typeof CaptureJobQueue>[0];
type MongoClientCtor = new (url: string) => { connect(): Promise<{ db(name: string): QueueDb; close(): Promise<void> }> };

export function recordArgsFor(env: Record<string, string | undefined>): string[] {
  if (env.LKB_SEND_NOW_TRANSCRIBE === "0") return [];
  return env.LKB_SEND_NOW_INDEX === "1" ? ["--transcribe", "--process-video", "--index"] : ["--transcribe"];
}

export function parseArgs(argv: readonly string[]): { maxWaitS: number } {
  if (argv[0] !== "--once") throw new Error("usage: queue-worker.ts --once [--max-wait-s N]");
  if (argv.length === 1) return { maxWaitS: 0 };
  if (argv.length !== 3 || argv[1] !== "--max-wait-s" || !/^\d{1,5}$/.test(argv[2]!)) throw new Error("usage: queue-worker.ts --once [--max-wait-s N]");
  return { maxWaitS: Number(argv[2]) };
}

export interface QueueWorkerOptions {
  queue: CaptureJobQueue; tenants: readonly string[]; root: string; maxWaitS: number;
  recordArgs: readonly string[]; ownerId?: string; pollMs?: number;
  deps?: ManualWorkerDeps; log?: (line: string) => void; sleep?: (ms: number) => Promise<void>;
  mirror?: (job: CaptureJobDoc, ownerId: string) => QueueJobMirror;
  /** Aborted on container SIGTERM: stop waiting for a claim, or end a claimed job `failed` at once. */
  stop?: AbortSignal;
  /** The environment checked before any claim (default process.env). */
  env?: NodeJS.ProcessEnv;
}
export type QueueWorkerResult = { job: null } | { job: string; state: string };

export async function runQueueOnce(o: QueueWorkerOptions): Promise<QueueWorkerResult> {
  const log = o.log ?? (line => console.log(line));
  const sleep = o.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const ownerId = o.ownerId ?? `${os.hostname().slice(0, 40)}-${process.pid}-${randomBytes(4).toString("hex")}`;
  // ISS-B3HOSTID-001: a bad host id refuses before any claim, so a job is never taken and then burnt.
  assertCaptureHostIdSetting(o.env ?? process.env);
  const deadline = o.queue.now().getTime() + o.maxWaitS * 1000;
  let job: CaptureJobDoc | null = null;
  for (;;) {
    if (o.stop?.aborted) break;   // shutting down: never claim a job that would be killed at once
    job = await o.queue.claimNext(ownerId, o.tenants);
    if (job || o.queue.now().getTime() >= deadline) break;
    await sleep(o.pollMs ?? 5_000);
  }
  if (!job) return { job: null };
  log(`[send-now-queue] claimed ${job._id} (${job.platform})`);
  const mirror = o.mirror?.(job, ownerId) ?? new QueueJobMirror(o.queue, job, ownerId);
  mirror.start();
  const onStop = () => { log(`[send-now-queue] ${job!._id} interrupted by shutdown`); void mirror.interrupt(); };
  if (o.stop?.aborted) onStop(); else o.stop?.addEventListener("abort", onStop, { once: true });
  let final = "failed";
  try {
    await runManualWorker(o.root, mirror, job.tenantId, job._id, { ...(o.deps ?? defaultManualWorkerDeps), recordArgs: o.recordArgs });
  } catch {
    // runManualWorker only throws before launch (unreadable request): record that as a failure.
    mirror.writeProgress(mirror.request, "failed");
  } finally {
    o.stop?.removeEventListener("abort", onStop);
    await mirror.close();
    final = (await o.queue.detail(job.tenantId, job._id))?.state ?? "unknown";
    log(`[send-now-queue] ${job._id} finished: ${final}`);
  }
  return { job: job._id, state: final };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const { maxWaitS } = parseArgs(process.argv.slice(2));
    const url = process.env.MONGODB_URL;
    if (!url) throw new Error("MONGODB_URL is required");
    // pnpm does not hoist `mongodb` to the root: resolve it as apps/api does (the scripts/lib/shared-db.mjs pattern).
    const resolved = createRequire(path.join(root, "apps", "api", "package.json")).resolve("mongodb");
    const { MongoClient } = await import(pathToFileURL(resolved).href) as { MongoClient: MongoClientCtor };
    const client = await new MongoClient(url).connect();
    try {
      const queue = new CaptureJobQueue(client.db(requireDatabaseName(process.env)));
      // The entrypoint TERMs the whole process group on shutdown and SIGKILLs it after LKB_STOP_WAIT_S: end the job now.
      const stop = new AbortController();
      for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => stop.abort());
      const result = await runQueueOnce({ queue, tenants: servedTenants(process.env), root, maxWaitS, recordArgs: recordArgsFor(process.env), stop: stop.signal });
      process.exitCode = result.job === null || ["completed", "cancelled"].includes(result.state) ? 0 : 2;
    } finally { await client.close(); }
  })().catch(error => { console.error(`[send-now-queue] ${error instanceof Error ? error.message.slice(0, 200) : "failed"}`); process.exitCode = 1; });
}
