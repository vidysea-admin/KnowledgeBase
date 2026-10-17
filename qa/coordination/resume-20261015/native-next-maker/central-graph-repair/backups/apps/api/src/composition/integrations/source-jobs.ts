import { isAbsolute, resolve, sep } from "node:path";
import { getDb, scopedCollection } from "@lkb/db";
import type { ApiKeys } from "@lkb/core";
import { isRefusedWorkDb, requireDatabaseName } from "../../db-name.js";
import { actorIdentity, approvedSourceInput, sourceJobInputHash } from "../../source-intake/jobs/input.js";
import { createSourceJobStore } from "../../source-intake/jobs/store.js";
import { SourceJobError, type SourceJob, type SourceJobInput, type SourceJobStore, type SourceJobWorkerDeps } from "../../source-intake/jobs/types.js";
import { createSourceMediaTranscriber, sourceMediaConfiguration, sourceUploadTransport } from "../../source-intake/media-runtime.js";
import { buildSourceIntakeDeps } from "../../source-intake/wiring.js";
import { buildConnectorWorkflowDeps } from "../../connector-workflow/wiring.js";
import { executeWatchedSnapshotJob } from "../../connector-workflow/watched-job.js";
import { buildIndexer, buildRouting } from "../production.js";
import { createConfiguredHostingDeps } from "../../hosting/config.js";
import { HostingJournal } from "../../hosting/journal.js";
import { CounsellorAccountStore } from "../../counsellor-accounts/store.js";
import { approvedSourceSession, sourceSessionStillApproved, guardedSourceMediaTransport } from "../../source-intake/jobs/source-privacy.js";

export interface SourceWorkerConfiguration { root: string; database: string; tenants: readonly string[] }
/** Pure explicit trusted configuration; no defaults, connections, files, provider objects or writes. */
export function sourceWorkerConfiguration(env: NodeJS.ProcessEnv, options: { requireProvider?: boolean } = {}): SourceWorkerConfiguration | undefined {
  if (env.LKB_SOURCE_INTAKE !== "1" || !env.LKB_SOURCE_JOB_DIR || !env.LKB_SOURCE_WORKER_TENANTS || !env.MONGODB_URL ||
      (options.requireProvider !== false && !sourceMediaConfiguration(env))) return undefined;
  const root = env.LKB_SOURCE_JOB_DIR, database = requireDatabaseName(env);
  if (database === "lkb" ? env.MONGODB_DB !== "lkb" || env.LKB_I_KNOW_THIS_IS_PRODUCTION !== "1" : isRefusedWorkDb(database, env)) throw new SourceJobError("source_worker_database_refused");
  if (!isAbsolute(root) || /(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(root) ||
      [env.LKB_HOSTING_STATE_DIR, env.LKB_COUNSELLOR_STATE_DIR].some(value => {
        if (!value) return false;
        const a = resolve(value).toLowerCase(), b = resolve(root).toLowerCase();
        return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
      })) throw new SourceJobError("unsafe_source_spool");
  let tenants: unknown;
  try { tenants = JSON.parse(env.LKB_SOURCE_WORKER_TENANTS); } catch { throw new SourceJobError("source_worker_tenants_invalid"); }
  if (!Array.isArray(tenants) || !tenants.length || tenants.length > 100) throw new SourceJobError("source_worker_tenants_invalid");
  const allowed = tenants.map(actorIdentity);
  if (new Set(allowed).size !== allowed.length) throw new SourceJobError("source_worker_tenants_invalid");
  return { root: resolve(root), database, tenants: Object.freeze(allowed) };
}

async function storedActorAllowed(configuration: SourceWorkerConfiguration, input: Pick<SourceJobInput, "tenantId" | "actorKeyId">, env: NodeJS.ProcessEnv, requiredScopes: readonly string[] = ["ingest"]): Promise<boolean> {
  if (!configuration.tenants.includes(actorIdentity(input.tenantId))) return false;
  const db = getDb();
  if (db.databaseName !== configuration.database) throw new SourceJobError("source_worker_database_mismatch");
  const key = await scopedCollection<ApiKeys>(db, "api_keys")(input.tenantId)
    .find({ _id: actorIdentity(input.actorKeyId), revokedAt: null }).project<Pick<ApiKeys, "tenantId" | "scopes">>({ tenantId: 1, scopes: 1 }).maxTimeMS(5000).limit(1).next();
  const scopes = key?.scopes;
  if (!key || key.tenantId !== input.tenantId || !Array.isArray(scopes) || !scopes.every(scope => typeof scope === "string") || !requiredScopes.every(scope => scopes.includes(scope))) return false;
  // Mirror the production verified-identity lifecycle when configured; a still-present key cannot bypass an account/key recovery state.
  if (["LKB_HOSTING_STATE_DIR", "LKB_HOSTING_ENCRYPTION_KEY", "LKB_HOSTING_BOOTSTRAP_ADMINS", "LKB_HOSTING_WEBHOOK_ORIGINS", "LKB_COUNSELLOR_STATE_DIR"].some(name => env[name] !== undefined)) {
    const hosting = createConfiguredHostingDeps(env, { keyExists: async (tenant, id) => Boolean(await scopedCollection<ApiKeys>(db, "api_keys")(tenant)
      .find({ _id: id, revokedAt: null }).project<Pick<ApiKeys, "_id">>({ _id: 1 }).maxTimeMS(5000).limit(1).next()) });
    if (!hosting) return false;
    if (env.LKB_COUNSELLOR_STATE_DIR !== undefined) {
      const root = env.LKB_COUNSELLOR_STATE_DIR;
      if (!isAbsolute(root) || /(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(root) ||
          resolve(root).toLowerCase() === hosting.service.options.journal.root.toLowerCase()) return false;
      const accounts = new CounsellorAccountStore(new HostingJournal(root));
      hosting.service.setAccountStatusProvider(async (tenant, id) => await accounts.identityStatus(tenant, id) ?? "unbound");
    }
    return hosting.service.isIdentityActive(input.tenantId, input.actorKeyId);
  }
  return true;
}

/** API construction is pure/lazy. First actual operation validates the private spool and stored actor. */
export function buildConfiguredSourceJobStore(env: NodeJS.ProcessEnv): SourceJobStore | undefined {
  const configuration = sourceWorkerConfiguration(env, { requireProvider: false });
  if (!configuration) return undefined;
  let store: SourceJobStore | undefined;
  const ready = () => store ??= createSourceJobStore(configuration.root);
  return {
    async enqueue(input, authorize) {
      if (!await storedActorAllowed(configuration, input, env, input.watchedSnapshot ? ["sources", "ingest"] : ["ingest"])) throw new SourceJobError("source_job_forbidden", 403);
      return ready().enqueue(input, async snapshot => ({ ...await authorize(snapshot), sourceAuthority: snapshot.watchedSnapshot ? undefined : approvedSourceSession(env, snapshot, { requireCookie: false }) }));
    },
    poll: (tenant, id) => ready().poll(tenant, id), completed: (tenant, id) => ready().completed(tenant, id),
    claim: (tenant, worker) => ready().claim(tenant, worker), renew: (tenant, id, attempt) => ready().renew(tenant, id, attempt),
    finish: (tenant, id, attempt, result) => ready().finish(tenant, id, attempt, result),
    uncertain: (tenant, id, attempt, reason) => ready().uncertain(tenant, id, attempt, reason),
  };
}

/** Separate worker factory. Calling it constructs configured deps only; runSourceJob does the work. */
export function buildConfiguredSourceWorker(env: NodeJS.ProcessEnv): SourceJobWorkerDeps | undefined {
  const configuration = sourceWorkerConfiguration(env, { requireProvider: false }), store = buildConfiguredSourceJobStore(env);
  if (!configuration || !store) return undefined;
  const index = buildIndexer(buildRouting(), { strictWebinar: true, groundedNotes: true });
  const publicEnv = { ...env }; delete publicEnv.LKB_ONAIR_COOKIE_HEADER;
  const intake = buildSourceIntakeDeps(publicEnv, index, { execution: "worker" }) ?? {
    async intake(): Promise<never> { throw new SourceJobError("source_worker_unconfigured"); },
  };
  return { store, intake,
    async authorizeExecution(job: Readonly<SourceJob>) {
      return job.approval.approvedBy === job.actorKeyId && Boolean(job.approval.approvalRef) &&
        (job.watchedSnapshot ? !job.approval.sourceAuthority : sourceSessionStillApproved(env, job)) &&
        await storedActorAllowed(configuration, job, env, job.watchedSnapshot ? ["sources", "ingest"] : ["ingest"]);
    },
    async executeJob(job) {
      const request = approvedSourceInput({ ...job, idempotencyKey: "worker-execution" });
      const allowed = async () => (job.watchedSnapshot ? !job.approval.sourceAuthority : sourceSessionStillApproved(env, job)) &&
        await storedActorAllowed(configuration, job, env, job.watchedSnapshot ? ["sources", "ingest"] : ["ingest"]);
      if (job.url !== request.url || job.inputHash !== sourceJobInputHash(request) ||
          job.approval.approvedBy !== job.actorKeyId || !job.approval.approvalRef ||
          !await allowed()) throw new SourceJobError("source_job_forbidden", 403);
      if (job.watchedSnapshot) {
        const watchedDeps = buildConnectorWorkflowDeps(env, async (tenant, session) => {
          if (tenant !== job.tenantId || !await allowed()) throw new SourceJobError("source_job_forbidden", 403);
          return index(tenant, session);
        }, undefined, [], store);
        if (!watchedDeps || !await allowed()) throw new SourceJobError("source_worker_unconfigured");
        return executeWatchedSnapshotJob(job, watchedDeps);
      }
      const jobEnv = { ...env };
      if (!approvedSourceSession(env, job)) delete jobEnv.LKB_ONAIR_COOKIE_HEADER;
      const media = sourceMediaConfiguration(jobEnv);
      if (!media) throw new SourceJobError("source_worker_unconfigured");
      const transcribe = createSourceMediaTranscriber({ ...media, transport: guardedSourceMediaTransport(allowed, sourceUploadTransport()) });
      const scopedIntake = buildSourceIntakeDeps(jobEnv, async (tenant, session) => {
        if (tenant !== job.tenantId || !await allowed()) throw new SourceJobError("source_job_forbidden", 403);
        return index(tenant, session);
      }, { execution: "worker", transcribe });
      if (!scopedIntake) throw new SourceJobError("source_worker_unconfigured");
      return scopedIntake.intake({ tenantId: job.tenantId, url: job.url });
    },
  };
}
