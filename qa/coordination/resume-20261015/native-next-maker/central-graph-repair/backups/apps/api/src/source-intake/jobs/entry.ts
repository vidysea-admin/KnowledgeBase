// Separate explicitly configured process. Never imported/run by the HTTP startup.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { connect, close } from "@lkb/db";
import { buildConfiguredSourceWorker, sourceWorkerConfiguration } from "../../composition/integrations/source-jobs.js";
import { runSourceJob } from "./worker.js";
import { SourceJobError } from "./types.js";

async function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SourceJobError("source_worker_timeout")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export async function sourceWorkerMain(env: NodeJS.ProcessEnv = process.env, args = process.argv.slice(2)): Promise<void> {
  if (args.some(argument => !["--once", "--check-config"].includes(argument))) throw new SourceJobError("source_worker_arguments_invalid");
  const configuration = sourceWorkerConfiguration(env, { requireProvider: false });
  if (!configuration) throw new SourceJobError("source_worker_unconfigured");
  if (args.includes("--check-config")) {
    console.log(JSON.stringify({ configuration: "ready", scope: "pure worker configuration only", tenants: configuration.tenants.length, providerCalls: 0 })); return;
  }
  const jobTimeout = Number(env.LKB_SOURCE_WORKER_JOB_TIMEOUT_MS ?? 1_800_000);
  if (!Number.isSafeInteger(jobTimeout) || jobTimeout < 10_000 || jobTimeout > 3_600_000) throw new SourceJobError("source_worker_timeout_invalid");
  const stopping = new AbortController(), workerId = randomUUID();
  let forceExit: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopping.signal.aborted) return;
    stopping.abort(); process.exitCode = 143;
    // Pending native/provider calls cannot make shutdown unbounded; the claim is durably uncertain.
    forceExit = setTimeout(() => process.exit(143), 15_000); forceExit.unref();
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    await bounded(connect(env.MONGODB_URL!, configuration.database), 10_000);
    const deps = buildConfiguredSourceWorker(env);
    if (!deps) throw new SourceJobError("source_worker_unconfigured");
    do {
      let worked = false;
      for (const tenant of configuration.tenants) {
        if (stopping.signal.aborted) break;
        const deadline = setTimeout(stop, jobTimeout);
        try { worked = await bounded(runSourceJob(deps, tenant, workerId, stopping.signal), jobTimeout + 10_000) || worked; }
        catch { console.error("source_worker_attempt_unconfirmed"); }
        finally { clearTimeout(deadline); }
      }
      if (args.includes("--once") || stopping.signal.aborted) break;
      if (!worked) await pause(2_000, undefined, { signal: stopping.signal }).catch(() => {});
    } while (!stopping.signal.aborted);
  } finally {
    stopping.abort();
    await bounded(close(), 5_000).catch(() => {});
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    // Retain forced exit when an interrupted attempt could still own native/provider handles.
    if (forceExit && process.exitCode !== 143) clearTimeout(forceExit);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sourceWorkerMain().catch(() => { console.error("source_worker_unavailable"); if (!process.exitCode) process.exitCode = 1; });
}
