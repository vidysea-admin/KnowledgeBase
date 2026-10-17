import { Ajv2020 } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import schema from "../../../../schema/knowledge_outputs.schema.json" with { type: "json" };
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { OutputError, faqFormat, parseOutputInput, sectionDefinitions, text, type OutputDraft, type OutputCitation } from "./types.js";
import { classKey, normalizeQuestionClass, validPolicyId } from "../answer-policy/rules.js";
import { outputAssessmentDigest } from "./assessment.js";

const ajv = new Ajv2020({ strict: true, allErrors: true });
// ajv-formats publishes a CommonJS function; use its declared plugin type at that module boundary.
const loadedFormats: unknown = createRequire(import.meta.url)("ajv-formats");
if (typeof loadedFormats !== "function") throw new Error("Knowledge-output format validator is unavailable");
const addFormats = loadedFormats as FormatsPlugin;
addFormats(ajv);
const validSchema = ajv.compile<OutputDraft>(schema);
const validCitations = ajv.compile<OutputCitation[]>(schema.properties.citations);
const fail = (): never => { throw new OutputError("unavailable", 503); };
const id = (value: string): boolean => {
  if (!value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
};
const component = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Source citations are checked before provider invocation, using the same actual collection schema. */
export function assertOutputCitations(value: unknown): asserts value is OutputCitation[] { if (!validCitations(value)) fail(); }

/** Actual schema is the shape authority; semantic checks add cross-field relationships it cannot express. */
export function assertOutputDraft(value: unknown): asserts value is OutputDraft {
  if (!validSchema(value)) fail();
  const draft = value as OutputDraft;
  try {
    assertValidTenantId(draft.tenantId, "knowledgeOutputs.validate");
    parseOutputInput({ kind: draft.kind, title: draft.title, purpose: draft.purpose, sessionIds: draft.sessionIds,
      ...(draft.policy ? { policyId: draft.policy.policyId } : {}) });
  } catch { fail(); }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(draft._id)
    || !Number.isSafeInteger(draft.revision) || !text(draft.provider, 120) || !text(draft.model, 180)
    || new Date(draft.updatedAt).getTime() < new Date(draft.createdAt).getTime()
    || new Set(draft.sessionIds).size !== draft.sessionIds.length || !draft.sessionIds.every(id)
    || !Number.isSafeInteger(draft.sourceCoverage.withheldClaims) || draft.sourceCoverage.withheldClaims > 200
    || (draft.sourceCoverage.status === "ready") !== (draft.sourceCoverage.withheldClaims === 0)) fail();
  if (draft.policy && (!validPolicyId(draft.policy.policyId) || !Number.isSafeInteger(draft.policy.version)
    || !normalizeQuestionClass(draft.policy.questionClass)
    || classKey(normalizeQuestionClass(draft.policy.questionClass)!) !== classKey(normalizeQuestionClass(draft.kind)!))) fail();
  if (draft.citations.length < 1 || draft.citations.length > 100
    || draft.citations.reduce((sum, c) => sum + c.quote.length, 0) > 60000 || JSON.stringify(draft.citations).length > 100000) fail();
  const sources = new Set(draft.sessionIds), citationIds = new Set<string>(), turns = new Map<string, string>();
  for (const [index, citation] of draft.citations.entries()) {
    if (citation.id !== `e${index + 1}` || citationIds.has(citation.id) || !sources.has(citation.sessionId)
      || ![citation.claimId, citation.turnId, citation.sessionId, citation.speakerRef].every(id)
      || !citation.quote.trim() || !Number.isFinite(citation.start) || !Number.isFinite(citation.end)
      || citation.start < 0 || citation.end < citation.start
      || citation.href !== `/sessions/${component(citation.sessionId)}#turn-${component(citation.turnId)}`
      || citation.unit !== (citation.speakerRef === "document" || citation.speakerRef === "url" ? "characters" : "seconds")) fail();
    const identity = JSON.stringify([citation.sessionId, citation.speakerRef, citation.speakerLabel ?? null, citation.start, citation.end, citation.occurredAt ?? null, citation.unit]);
    if (turns.has(citation.turnId) && turns.get(citation.turnId) !== identity) fail();
    turns.set(citation.turnId, identity); citationIds.add(citation.id);
  }
  const definitions = sectionDefinitions[draft.kind], itemIds = new Set<string>();
  if (draft.sections.length !== definitions.length) fail();
  for (const [index, section] of draft.sections.entries()) {
    const definition = definitions[index]!;
    if (section.key !== definition.key || section.title !== definition.title || section.items.length > 8) fail();
    for (const item of section.items) {
      const suffix = item.id.slice(`${section.key}-`.length);
      if (!item.id.startsWith(`${section.key}-`) || !/^[1-8]$/u.test(suffix) || itemIds.has(item.id)
        || item.kind !== definition.kind || !text(item.text, 2000)
        || (section.key === "faq" && item.validation === "ai-supported" && !faqFormat(item.text))
        || (item.validation === "ai-supported" ? item.assessmentDigest !== outputAssessmentDigest(draft.sourceDigest, item) : item.assessmentDigest !== "")
        || item.citationIds.length > 10 || new Set(item.citationIds).size !== item.citationIds.length
        || item.citationIds.some((ref) => !citationIds.has(ref))) fail();
      itemIds.add(item.id);
    }
  }
}
