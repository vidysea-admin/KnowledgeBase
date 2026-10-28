/** Answer services share real stores and request-tenant provider routing.
 * Construction performs no provider calls, ingestion or database writes.
 */
import type { Db } from "mongodb";
import { complete as routeComplete } from "@lkb/ai";
import { assertValidTenantId } from "@lkb/db";
import type { BoundIndexer } from "../../indexing/session.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import type { IntegrationRouting } from "./types.js";
import { isRefusedWorkDb } from "../../db-name.js";
import { createAnswerPolicyService, type AnswerPolicyService } from "../../answer-policy/service.js";
import { createMongoAnswerPolicyStore } from "../../answer-policy/mongo-store.js";
import { createMongoAnswerRecordStore } from "../../answer-policy/answer-mongo-store.js";
import { createComposedEvidenceVerifier } from "./evidence-verifier.js";
import { createAnswerWorkflow, type AnswerWorkflow } from "../../answer-policy/answer-workflow.js";
import { createConfiguredOutputService } from "../../knowledge-outputs/wiring.js";
import type { OutputService } from "../../knowledge-outputs/service.js";
import type { OutputDeps } from "../../knowledge-outputs/types.js";
import type { NativeEvidenceResolver } from "../../native-evidence/resolver.js";

/** Output review may fail unavailable; it must never reuse its generating model. */
export function createOutputVerifier(routing: IntegrationRouting): OutputDeps["complete"] {
  return (tenantId, job) => {
    assertValidTenantId(tenantId, "knowledgeOutputs.verify");
    return routeComplete("output-verifier", job, {
      ...routing, write: routing.jobWrite, tenantId,
      chains: { ...routing.chains, "output-verifier": ["ollama-cloud-verifier"] },
    });
  };
}

export interface AnswerIntegrations {
  answerWorkflow?: AnswerWorkflow;
  knowledgeOutputs?: OutputService;
  answerPolicyService?: AnswerPolicyService;
}

export function buildAnswerIntegrations(input: {
  db: Db;
  env: NodeJS.ProcessEnv;
  root: string;
  index: BoundIndexer;
  ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps;
  routing: IntegrationRouting;
  nativeEvidence?: NativeEvidenceResolver;
}): AnswerIntegrations {
  // D-168 is the explicit production policy opt-in, not a general work-DB bypass.
  const production = input.db.databaseName === "lkb" && input.env.MONGODB_DB === "lkb"
    && input.env.LKB_I_KNOW_THIS_IS_PRODUCTION === "1";
  const workDatabase = !isRefusedWorkDb(input.db.databaseName, input.env)
    && !isRefusedWorkDb(input.db.databaseName);
  if (!production && !workDatabase) return {};

  const answerPolicyService = createAnswerPolicyService(createMongoAnswerPolicyStore(input.db, { production }));
  // Current approval and effective transcript eligibility come from the real trusted
  // reader. Web evidence still refuses without a trusted web freshness capability.
  const answerWorkflow = createAnswerWorkflow(answerPolicyService,
    createMongoAnswerRecordStore(input.db, { production }), createComposedEvidenceVerifier(input.db, input.nativeEvidence));
  const integrations: AnswerIntegrations = { answerPolicyService, answerWorkflow };

  // T-058 deliberately has no inherited authorization to write a protected DB.
  if (workDatabase) {
    const { chains, providers, jobWrite } = input.routing;
    integrations.knowledgeOutputs = createConfiguredOutputService(input.db, (tenantId, job) => {
      assertValidTenantId(tenantId, "knowledgeOutputs.complete");
      // Generated outputs require a different assessor. Falling back to DeepSeek here
      // would make that same model both author and verifier; fail unavailable instead.
      return routeComplete("output-generation", job, { providers, write: jobWrite, tenantId,
        chains: { ...chains, "output-generation": ["ollama-cloud"] } });
    }, answerPolicyService, createOutputVerifier(input.routing));
  }
  return integrations;
}
