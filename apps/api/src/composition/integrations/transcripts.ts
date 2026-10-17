import type { Db } from "mongodb";
import { complete as routeComplete } from "@lkb/ai";
import type { IntegrationRouting } from "./types.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import { indexSession, type BoundIndexer, type IndexSessionDeps } from "../../indexing/session.js";
import { composeGroundedPostProcessing, readGroundedJudgeCostLimit } from "../../grounded-postprocessing/composition.js";
import { createMongoReviewStore } from "../../transcript-review/store.js";
import { createTranscriptRefreshExecutor } from "../../transcript-review/refresh-executor.js";
import type { TranscriptReviewDeps } from "../../transcript-review/router.js";
import { isRefusedWorkDb } from "../../db-name.js";
import { createKnowledgeVisibility } from "../../visibility/knowledge.js";
import { notifyIndexCommitted } from "../../indexing/post-commit.js";
import type { IndexCommittedHook } from "../../indexing/types.js";

export interface TranscriptIntegrations { transcriptReview?: TranscriptReviewDeps }
export interface TranscriptIntegrationInput {
  db: Db; env: NodeJS.ProcessEnv; root: string; index: BoundIndexer; ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps; routing: IntegrationRouting;
  onIndexCommitted?: IndexCommittedHook;
}

function reviewDatabaseAllowed(db: Db, env: NodeJS.ProcessEnv): boolean {
  const name = db.databaseName;
  if (!name || name !== name.trim()) return false;
  if (/^lkb$/i.test(name)) return name === "lkb" && env.MONGODB_DB === "lkb" && env.LKB_I_KNOW_THIS_IS_PRODUCTION === "1";
  return !isRefusedWorkDb(name, env);
}

/** Compose actual durable review and transactional grounded refresh. Construction reads only
 * configuration: no provider requests, sessions, collection reads or writes are started here. */
export function buildTranscriptIntegrations(input: TranscriptIntegrationInput): TranscriptIntegrations {
  if (!reviewDatabaseAllowed(input.db, input.env)) return {};
  const { chains, providers, jobWrite } = input.routing;
  const executeRefresh = createTranscriptRefreshExecutor({ db: input.db, index: (tenantId, sessionId, db) => {
    const complete: IndexSessionDeps["complete"] = (job) => routeComplete(job.kind, job, { chains, providers, write: jobWrite, tenantId });
    return indexSession(tenantId, sessionId, {
      db, complete, retrievalMode: "vectorless",
      ...composeGroundedPostProcessing(complete, { groundedNotes: true, strictWebinar: true, judgeMaxCostUsd: readGroundedJudgeCostLimit(input.env) }),
    });
  } });
  const refresh: typeof executeRefresh = async (request) => {
    await executeRefresh(request);
    await notifyIndexCommitted(input.db, request.tenantId, request.sessionId, input.onIndexCommitted,
      { reviewRevision: request.revision });
  };
  return { transcriptReview: { store: createMongoReviewStore(input.db), refresh,
    authorizeSession: (tenantId, sessionId) => createKnowledgeVisibility(input.db).sessionVisible(tenantId, sessionId) } };
}
