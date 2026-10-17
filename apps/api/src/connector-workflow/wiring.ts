import { randomUUID } from "node:crypto";
import { createGuardedFetcher, resolveAll, httpRequest } from "@lkb/ingest";
import type { BoundIndexer } from "../indexing/session.js";
import { createMongoIntakeSink, type SourceIntakeDeps } from "../source-intake/store.js";
import { createConnectorMongoStore } from "./mongo-store.js";
import type { ConnectorWorkflowDeps, ConnectorCapability } from "./types.js";
import type { SourceJobStore } from "../source-intake/jobs/types.js";

/** Root owns mounting. Configuration reports transport readiness only; live verification stays separate. */
export function buildConnectorWorkflowDeps(
  env: NodeJS.ProcessEnv, indexSession: BoundIndexer, sourceIntake?: SourceIntakeDeps,
  capabilities: ConnectorCapability[] = [],
  sourceJobs?: SourceJobStore,
): ConnectorWorkflowDeps | undefined {
  if (env.LKB_CONNECTOR_WORKFLOW !== "1") return undefined;
  return {
    store: createConnectorMongoStore(env), sourceIntake, sourceJobs, indexSession, capabilities,
    watched: {
      fetcher: createGuardedFetcher({ lookup: resolveAll, request: httpRequest, timeoutMs: 10000, maxBytes: 1000000 }),
      sink: createMongoIntakeSink(), indexSession,
    },
    now: () => new Date().toISOString(), newId: randomUUID,
  };
}
