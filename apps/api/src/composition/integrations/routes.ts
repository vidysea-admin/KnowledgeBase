import type { Express, RequestHandler } from 'express';
import { requireScope } from '../../auth.js';
import type { EvaluationIntegrations } from './evaluation.js';
import type { AnswerIntegrations } from './answers.js';
import type { KnowledgeIntegrations } from './knowledge.js';
import type { HostingIntegrations } from './hosting.js';
import type { TranscriptIntegrations } from './transcripts.js';
import { createCalibrationReviewRouter } from '../../calibration-review/router.js';
import { createChampionshipRouter } from '../../routes/championship/championship.js';
import { createEvaluationFlywheelRouter } from '../../evaluation-flywheel/router.js';
import { createKnowledgeRouter } from '../../knowledge/collections-router.js';
import { createConnectorWorkflowRouter } from '../../connector-workflow/router.js';
import { createOutputRouter } from '../../knowledge-outputs/router.js';
import { createAnswerHistoryRouter } from '../../answer-policy/answer-router.js';
import type { AnswerReviewAuthority } from '../../answer-policy/answer-router.js';
import { createSpeakerRelationsRouter, type SpeakerRelationsRouterDeps } from '../../speaker-relations/router.js';
import { createSpeakerRelationSourceRouter, type SpeakerRelationSourceRouterDeps } from '../../speaker-relations/source-router.js';
import { createSpeakerAttributesRouter, type SpeakerAttributesRouterDeps } from '../../speaker-attributes/router.js';
import { createNativeEvidenceRouter } from '../../native-evidence/router.js';
import type { NativeEvidenceResolver } from '../../native-evidence/resolver.js';
import { createExtractionReviewRouter } from '../../extraction-review/router.js';
import { createLabelReviewRouter } from '../../label-review/router.js';
import { createAnswerPolicyAdminRouter } from '../../answer-policy/admin-router.js';
import { createHostingRouter } from '../../hosting/router.js';
import { createCounsellorAccountRouter } from '../../counsellor-accounts/router.js';
import { createOperationsIntegrationsRouter, createUnavailableOperationsIntegrationsRouter } from '../../operations-integrations/router.js';
import { createRetentionStatusRouter } from '../../retention-status/router.js';
import { createTranscriptReviewRouter } from '../../transcript-review/router.js';
import { createAutomationRouter } from '../../automation/router.js';
import { createBotPrivacyRouter } from '../../bot-privacy/router.js';
import type { BotPrivacyDeps } from '../../bot-privacy/types.js';
import type { AutomationIntegrations } from './automation.js';
import { createApplicationFormsRouter } from '../../automation/form-router.js';
import { createCaptureReadinessRouter } from '../../capture-readiness/router.js';
import type { CaptureReadinessDeps } from '../../capture-readiness/types.js';
import { createSessionDecisionsRouter } from '../../session-decisions/router.js';
import type { SessionDecisionsDeps } from '../../session-decisions/reader.js';
import { createRegistrationApprovalRouter, REGISTRATION_APPROVE_SCOPE, type RegistrationApprovalRouterDeps } from '../../registration-approvals/router.js';

export type IntegratedWorkflows = EvaluationIntegrations & AnswerIntegrations & TranscriptIntegrations
  & Pick<KnowledgeIntegrations, 'knowledge' | 'connectorWorkflow' | 'whatsappReview'>
  & Pick<HostingIntegrations, 'hosting' | 'counsellorAccounts' | 'operationsSchedules' | 'retentionStatus'>
  & AutomationIntegrations & { botPrivacy?: BotPrivacyDeps; captureReadiness?: CaptureReadinessDeps; sessionDecisions?: SessionDecisionsDeps;
    answerReviewAuthority?: AnswerReviewAuthority; speakerRelations?: SpeakerRelationsRouterDeps; speakerRelationSource?: SpeakerRelationSourceRouterDeps;
    nativeEvidence?: NativeEvidenceResolver; speakerAttributes?: SpeakerAttributesRouterDeps; registrationApprovals?: RegistrationApprovalRouterDeps; extractionReview?: Parameters<typeof createExtractionReviewRouter>[0]; labelReview?: Parameters<typeof createLabelReviewRouter>[0] };
const unavailable: RequestHandler = (_req, res) => { res.status(503).json({ error: 'workflow_unavailable', message: 'Workflow is unavailable; configure its required runtime.' }); };

/** Called strictly after the shared authentication/rate-limit perimeter. */
export function mountIntegratedWorkflows(app: Express, deps: IntegratedWorkflows): void {
  app.use(createCalibrationReviewRouter(deps.calibrationReview));
  app.use(createExtractionReviewRouter(deps.extractionReview));
  app.use(createLabelReviewRouter(deps.labelReview));
  app.use(createEvaluationFlywheelRouter(deps.evaluationFlywheel));
  app.use(createOutputRouter(deps.knowledgeOutputs));
  app.use(createHostingRouter(deps.hosting));
  app.use(createAutomationRouter(deps.automation));
  app.use(createApplicationFormsRouter(deps.applicationForms));
  app.use(createBotPrivacyRouter(deps.botPrivacy));
  app.use(createCaptureReadinessRouter(deps.captureReadiness));
  if (deps.sessionDecisions) app.use(createSessionDecisionsRouter(deps.sessionDecisions));
  else app.get('/sessions/:id/decisions', requireScope('sessions'), unavailable);
  if (deps.championship) app.use(createChampionshipRouter(deps.championship));
  else app.use('/championship', requireScope('compete'), unavailable);
  if (deps.knowledge) app.use(createKnowledgeRouter(deps.knowledge));
  else app.use('/knowledge', requireScope('sessions'), unavailable);
  if (deps.connectorWorkflow) app.use(createConnectorWorkflowRouter(deps.connectorWorkflow));
  if (deps.whatsappReview) app.use(deps.whatsappReview);
  if (deps.speakerRelationSource) app.use(createSpeakerRelationSourceRouter(deps.speakerRelationSource));
  if (deps.nativeEvidence) app.use(createNativeEvidenceRouter(deps.nativeEvidence));
  if (deps.speakerAttributes) app.use(createSpeakerAttributesRouter(deps.speakerAttributes));
  if (deps.speakerRelations) app.use(createSpeakerRelationsRouter(deps.speakerRelations));
  else app.use('/speaker-relations', requireScope('sessions'), unavailable);
  if (deps.answerWorkflow) app.use(createAnswerHistoryRouter(deps.answerWorkflow, deps.answerReviewAuthority));
  else app.use(['/answer-history', '/answer-reviews', '/answer-evidence-conflicts'], requireScope('ask'), unavailable);
  if (deps.answerPolicyService) app.use(createAnswerPolicyAdminRouter(deps.answerPolicyService));
  else app.use('/answer-policies', requireScope('answer-policy:read'), unavailable);
  if (deps.counsellorAccounts) app.use('/counsellor-accounts', createCounsellorAccountRouter(deps.counsellorAccounts));
  else app.use('/counsellor-accounts', requireScope('hosting'), unavailable);
  if (deps.operationsSchedules) app.use(createOperationsIntegrationsRouter(deps.operationsSchedules.service, deps.operationsSchedules.hosting));
  else app.use(createUnavailableOperationsIntegrationsRouter());
  if (deps.retentionStatus) app.use(createRetentionStatusRouter(deps.retentionStatus));
  else app.use('/retention/status', requireScope('sessions'), unavailable);
  if (deps.registrationApprovals) app.use(createRegistrationApprovalRouter(deps.registrationApprovals));
  else app.use('/registration-approvals', requireScope(REGISTRATION_APPROVE_SCOPE), unavailable);
  if (deps.transcriptReview) app.use(createTranscriptReviewRouter(deps.transcriptReview));
  else app.use('/sessions/:sessionId/transcript-review', requireScope('sessions'), unavailable);
}
