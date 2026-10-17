import { createHash } from "node:crypto";
import { buildEvidenceOutput } from "../../../../packages/core/src/knowledge-outputs/evidence-builder.js";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { PolicyServiceError } from "../answer-policy/service.js";
import { assertOutputCitations } from "./validator.js";
import { OutputError, type OutputCitation, type OutputDeps, type OutputDraft, type OutputInput } from "./types.js";

/** Only server-resolved, verified evidence is offered to either model. No client evidence accepted. */
export async function evidenceFor(deps: OutputDeps, tenantId: string, input: OutputInput): Promise<{ citations: OutputCitation[]; sourceDigest: string; sourceCoverage: OutputDraft["sourceCoverage"]; policy: OutputDraft["policy"] }> {
  assertValidTenantId(tenantId, "knowledgeOutputs.evidence");
  const sources = await deps.readSources(tenantId, input.sessionIds);
  if (sources.sessions.length !== input.sessionIds.length || sources.sessions.some((s) => s.tenantId !== tenantId || !input.sessionIds.includes(s._id))
    || new Set(sources.sessions.map((s) => s._id)).size !== input.sessionIds.length) throw new OutputError("not_found", 404);
  let lookup: Awaited<ReturnType<OutputDeps["policy"]>>;
  try { lookup = await deps.policy(tenantId, { questionClass: input.kind, ...(input.policyId ? { policyId: input.policyId } : {}) }); }
  catch (e) {
    if (e instanceof PolicyServiceError) throw new OutputError(e.code === "not_found" ? "not_found" : e.code === "version_conflict" ? "conflict" : "invalid_request", e.code === "not_found" ? 404 : e.code === "version_conflict" ? 409 : 400);
    throw e;
  }
  if (lookup.status === "conflict") throw new OutputError("conflict", 409);
  const selected = lookup.status === "active" ? lookup.policy : undefined;
  if (selected && (selected.tenantId !== tenantId || selected.citations !== "required" || selected.retired)) throw new OutputError("unavailable", 503);
  const policy: OutputDraft["policy"] = selected ? {
    policyId: selected.policyId, version: selected.version, questionClass: selected.questionClass,
    mode: selected.mode, style: selected.style, onInsufficient: selected.onInsufficient, citations: "required",
  } : undefined;
  if (sources.claims.length > 200 || sources.turns.length > 4000) throw new OutputError("unavailable", 422);
  const sortedClaims = [...sources.claims].sort((a, b) => a._id.localeCompare(b._id));
  let output;
  try { output = buildEvidenceOutput({ tenantId, sessionIds: input.sessionIds, kind: input.kind, title: input.title,
    sections: [{ title: "Authorized evidence", claimIds: sortedClaims.map((c) => c._id) }], claims: sortedClaims, turns: sources.turns }); }
  catch { throw new OutputError("unavailable", 503); }
  const excerpts = output.sections[0]!.excerpts;
  const byTurn = new Map(sources.turns.map((turn) => [turn._id, turn]));
  const citations = excerpts.map((e, i): OutputCitation => {
    const occurredAt = byTurn.get(e.turnId)?.occurredAt;
    return { ...e, id: `e${i + 1}`, ...(occurredAt === undefined ? {} : { occurredAt }) };
  });
  assertOutputCitations(citations);
  if (!citations.length || citations.length > 100 || citations.reduce((n, c) => n + c.quote.length, 0) > 60000
    || JSON.stringify(citations).length > 100000) throw new OutputError("unavailable", 422);
  // Full referenced turns and claim status are pinned, not merely the quote. Deletion/review/edit changes the digest.
  const referenced = new Set(citations.map((c) => c.turnId));
  const readerWithheld = sources.withheldVisibleClaims ?? 0;
  if (!Number.isSafeInteger(readerWithheld) || readerWithheld < 0 || readerWithheld + sources.claims.length > 200) throw new OutputError("unavailable", 503);
  const withheldClaims = output.sections[0]!.withheld.length + readerWithheld;
  const sourceCoverage: OutputDraft["sourceCoverage"] = { status: output.status === "ready" && withheldClaims === 0 ? "ready" : "partial", withheldClaims };
  const canonical = { citations, sourceCoverage, turns: sources.turns.filter((t) => referenced.has(t._id)).sort((a, b) => a._id.localeCompare(b._id))
    .map((t) => [t._id, t.tenantId, t.sessionId, t.speakerRef, t.speakerLabel ?? null, t.tStart, t.tEnd, t.occurredAt ?? null, t.text]), policy: policy ?? null };
  return { citations, sourceCoverage, policy, sourceDigest: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}

export async function currentEvidence(deps: OutputDeps, tenantId: string, draft: OutputDraft): Promise<void> {
  let fresh: Awaited<ReturnType<typeof evidenceFor>>;
  try { fresh = await evidenceFor(deps, tenantId, { kind: draft.kind, title: draft.title, purpose: draft.purpose,
    sessionIds: draft.sessionIds, ...(draft.policy ? { policyId: draft.policy.policyId } : {}) }); }
  catch (e) {
    if (e instanceof OutputError && (e.status === 404 || e.status === 400 || e.status === 409 || e.status === 422)) throw new OutputError("source_changed", 409);
    throw e;
  }
  if (fresh.sourceDigest !== draft.sourceDigest || JSON.stringify(fresh.citations) !== JSON.stringify(draft.citations)
    || JSON.stringify(fresh.sourceCoverage) !== JSON.stringify(draft.sourceCoverage)
    || JSON.stringify(fresh.policy ?? null) !== JSON.stringify(draft.policy ?? null)) throw new OutputError("source_changed", 409);
}
