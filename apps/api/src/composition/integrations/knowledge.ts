/** Real knowledge/connector/reviewer dependencies. Mount only after authentication in server.ts.
 * Central trusted-reader eligibility must be checked before operational acceptance.
 * Construction performs no ingestion, database writes, rendering or provider requests.
 */
import type { Db } from "mongodb";
import { Router } from "express";
import type { BoundIndexer } from "../../indexing/session.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { WhatsAppRouteDeps } from "../../routes/whatsapp.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import type { SourceJobStore } from "../../source-intake/jobs/types.js";
import type { IntegrationRouting } from "./types.js";
import type { KnowledgeDeps } from "../../knowledge/collections-router.js";
import type { ConnectorCapability, ConnectorWorkflowDeps } from "../../connector-workflow/types.js";
import { createMongoKnowledgeStore } from "../../knowledge/collections-store.js";
import { createMongoKnowledgeCatalog } from "../../knowledge/catalog-store.js";
import { createDocxRenderer } from "../../knowledge/document-reader.js";
import { buildConnectorWorkflowDeps } from "../../connector-workflow/wiring.js";
import { inspectSourceMediaRuntime } from "../../source-intake/media-runtime.js";
import { createWhatsAppReviewWiring } from "../../whatsapp/review/compose.js";
import { createDbBackedWhatsAppOwners, createWhatsAppRawAccess } from "../../whatsapp/owner-config.js";
import { createMongoWhatsAppReviewSourceReader, createWhatsAppReviewSourceRouter } from "../../whatsapp-review/review-source.js";

export interface KnowledgeIntegrations {
  knowledge?: KnowledgeDeps;
  connectorWorkflow?: ConnectorWorkflowDeps;
  whatsappReview?: Router;
  whatsapp?: WhatsAppRouteDeps;
}

export function buildKnowledgeIntegrations(input: {
  db: Db;
  env: NodeJS.ProcessEnv;
  root: string;
  index: BoundIndexer;
  ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps;
  sourceJobs?: SourceJobStore;
  routing: IntegrationRouting;
}): KnowledgeIntegrations {
  const configured = inspectSourceMediaRuntime(input.env);
  const intakeConfigured = configured.enabled && configured.transcriptionConfigured && Boolean(input.sourceIntake);
  const hostedConfigured = intakeConfigured && configured.hostedAcquisitionEnabled;
  const capability = (id: string, label: string, ready: boolean, detail: string): ConnectorCapability => ({
    id, label, state: ready ? "configured" : "action-required", detail,
  });
  const capabilities = [
    capability("public-url", "Public pages", intakeConfigured,
      "Source intake must be enabled and configured. Public URL acquisition is guarded; live verification remains pending."),
    capability("youtube", "YouTube recordings", intakeConfigured,
      "Uses the configured source-intake transcription and real yt-dlp/FFmpeg adapters. Binary and live recording proof remain separate."),
    capability("zoom-recording", "Provided Zoom recordings", hostedConfigured,
      "Requires enabled hosted acquisition and transcription. Private or dynamic recordings are refused without an authorized transport."),
    capability("onair", "Public OnAir recordings", hostedConfigured,
      "Requires hosted acquisition and transcription; only supported provided recordings are handled. Live acquisition remains unverified."),
    capability("onair-session", "Protected OnAir session", hostedConfigured && configured.onairSessionConfigured,
      "Requires an operator-configured authorized OnAir session. Configuration is not a successful recording receipt."),
  ];
  const renderDocxToPdf = createDocxRenderer(input.env.LKB_LIBREOFFICE_PATH);
  const knowledge: KnowledgeDeps = {
    store: createMongoKnowledgeStore(input.db),
    catalog: createMongoKnowledgeCatalog(input.db),
    ...(renderDocxToPdf ? { renderDocxToPdf } : {}),
  };
  const connectorWorkflow = buildConnectorWorkflowDeps(input.env, input.index, input.sourceIntake, capabilities, input.sourceJobs);
  const whatsAppRawAccess = createWhatsAppRawAccess(input.db);
  const reviewedWhatsApp = createWhatsAppReviewWiring({
    appDb: () => input.db,
    access: whatsAppRawAccess,
    resolveOwners: createDbBackedWhatsAppOwners({ rawMap: input.env.WHATSAPP_TENANT_OWNER_MAP, db: input.db }),
  });
  const whatsappReview = Router();
  whatsappReview.use(createWhatsAppReviewSourceRouter(createMongoWhatsAppReviewSourceReader(input.db), whatsAppRawAccess));
  whatsappReview.use(reviewedWhatsApp.reviewRouter);
  return {
    knowledge,
    ...(connectorWorkflow ? { connectorWorkflow } : {}),
    // Candidate-only ingestion has no direct indexer; approval remains a separate transaction.
    whatsapp: reviewedWhatsApp.whatsapp,
    whatsappReview,
  };
}
