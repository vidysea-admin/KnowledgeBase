/** Constructor-only composition: no Mongo write, provider call, external submission or target activation. */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { DocumentDocuments } from "@lkb/core";
import { applicationOperations, automationRuns, scopedCollection } from "@lkb/db";
import type { VerifiedKey } from "../../auth.js";
import type { BoundIndexer } from "../../indexing/session.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import type { IntegrationRouting } from "./types.js";
import type { HostingRouterDeps } from "../../hosting/router.js";
import { HostingError, hostingId } from "../../hosting/types.js";
import { AutomationRuntime } from "../../automation/runtime.js";
import { createMongoAutomationStore, type AutomationCollection } from "../../automation/store.js";
import type { AutomationPermission, AutomationRouterDeps } from "../../automation/router.js";
import { ApplicationFormRuntime } from "../../automation/form-runtime.js";
import { createMongoApplicationStore } from "../../automation/form-store.js";
import type { ApplicationFormsRouterDeps } from "../../automation/form-router.js";
import { createConfiguredFormAdapter } from "../../automation/form-adapter.js";
import { applicationDigest, applicationObject, applicationTargetFingerprint, isApplicationDocumentReference } from "../../automation/form-validation.js";
import type { ApplicationTarget } from "../../automation/form-types.js";
import { isAutomationReference } from "../../../../../packages/core/src/domain/automation-monitor.js";
import { assertCanonicalKnowledgeRow } from "../../knowledge/schema-validation.js";

export interface AutomationIntegrations { automation?: AutomationRouterDeps; applicationForms?: ApplicationFormsRouterDeps }
export interface AutomationIntegrationInput {
  db: Db; env: NodeJS.ProcessEnv; root: string; index: BoundIndexer; ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps; routing: IntegrationRouting; hosting?: HostingRouterDeps;
}
interface ApprovedSource { tenantId: string; documentId: string; revision: string; page: number; pageDigest: string }
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
/** All authority and destinations come from server configuration; callers cannot extend this registry. */
export function buildAutomationIntegrations(input: AutomationIntegrationInput): AutomationIntegrations {
  if (!input.hosting) return {};
  const withPermission = async <T>(key: VerifiedKey, permission: AutomationPermission, callback: () => Promise<T>): Promise<T> => {
    if (!key.keyId) throw new HostingError("verified_identity_unavailable", 503);
    return input.hosting!.service.withPermission({ tenantId: hostingId(key.tenantId, "tenant"), keyId: hostingId(key.keyId, "actor"), scopes: [...key.scopes] }, permission, callback);
  };
  const result: AutomationIntegrations = {};
  if (input.env.LKB_AUTOMATION_ENABLED === "1") result.automation = {
    runtime: new AutomationRuntime(createMongoAutomationStore(tenant => automationRuns(tenant, input.db) as unknown as AutomationCollection)), withPermission,
  };
  if (input.env.LKB_APPLICATION_FORMS_ENABLED !== "1") return result;
  try {
    const origins: unknown = JSON.parse(input.env.LKB_APPLICATION_ALLOWED_ORIGINS ?? "[]");
    if (!Array.isArray(origins) || origins.length < 1 || origins.length > 8 || origins.some(o => typeof o !== "string" || new URL(o).origin !== o || !o.startsWith("https://"))) return result;
    const configs: unknown = JSON.parse(input.env.LKB_APPLICATION_TARGETS ?? "[]");
    if (!Array.isArray(configs) || configs.length < 1 || configs.length > 8) return result;
    const targets: ApplicationTarget[] = configs.map(raw => {
      const c = applicationObject(raw, ["id", "version", "endpoint", "tokenEnv", "requiredFields", "allowedFields", "duplicateGuarantee", "approvedSources"]);
      if (!isAutomationReference(c.id) || !isAutomationReference(c.version) || typeof c.endpoint !== "string" || typeof c.tokenEnv !== "string" || !/^LKB_APPLICATION_[A-Z0-9_]{1,48}_TOKEN$/.test(c.tokenEnv) || !Array.isArray(c.requiredFields) || !Array.isArray(c.allowedFields) || !["none", "operation-id"].includes(String(c.duplicateGuarantee)) || !Array.isArray(c.approvedSources) || c.approvedSources.length < 1 || c.approvedSources.length > 200) throw new Error("invalid_target_configuration");
      const approved: ApprovedSource[] = c.approvedSources.map(value => {
        const row = applicationObject(value, ["tenantId", "documentId", "revision", "page", "pageDigest"]);
        if (typeof row.tenantId !== "string" || !isApplicationDocumentReference(row.documentId) || !sha(row.revision) || !sha(row.pageDigest) || !Number.isInteger(row.page) || Number(row.page) < 1 || Number(row.page) > 500) throw new Error("invalid_source_authority");
        return { tenantId: hostingId(row.tenantId, "tenant"), documentId: row.documentId, revision: row.revision, page: Number(row.page), pageDigest: row.pageDigest };
      });
      if (new Set(approved.map(row => JSON.stringify([row.tenantId, row.documentId, row.revision, row.page]))).size !== approved.length) throw new Error("ambiguous_source_authority");
      const target: ApplicationTarget = {
        id: c.id, version: c.version, requiredFields: c.requiredFields as string[], allowedFields: c.allowedFields as string[],
        configurationDigest: applicationDigest([c.endpoint, c.tokenEnv, digest(input.env[c.tokenEnv] ?? ""), approved]),
        adapter: createConfiguredFormAdapter({ endpoint: c.endpoint, allowedOrigins: new Set(origins as string[]), token: input.env[c.tokenEnv] ?? "", duplicateGuarantee: c.duplicateGuarantee as "none" | "operation-id" }),
        async verifyField(tenantId, field, signal) {
          signal.throwIfAborted();
          const authority = approved.find(row => row.tenantId === tenantId && row.documentId === field.source.documentId && row.revision === field.source.revision && row.page === field.source.page);
          if (!authority) return false;
          const document = await scopedCollection<DocumentDocuments>(input.db, "document_documents")(tenantId).find({ _id: authority.documentId, version: authority.revision }).maxTimeMS(5000).limit(1).next();
          signal.throwIfAborted(); if (!document || document.tenantId !== tenantId) return false;
          assertCanonicalKnowledgeRow("document_documents", document);
          const page = document.pages.find(row => row.pageNumber === authority.page);
          return !!page && digest(page.text) === authority.pageDigest && page.text.slice(field.source.start, field.source.end) === field.value;
        },
      };
      applicationTargetFingerprint(target); return target;
    });
    result.applicationForms = { runtime: new ApplicationFormRuntime(createMongoApplicationStore(tenant => applicationOperations(tenant, input.db) as unknown as AutomationCollection), targets), withPermission };
  } catch { /* Configured capability remains unavailable; never substitute a fake/live target. */ }
  return result;
}
