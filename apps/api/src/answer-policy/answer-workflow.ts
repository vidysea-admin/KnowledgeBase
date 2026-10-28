/** Real Ask execution, durable history/review and source-bound conflict handling. */
import { randomUUID } from "node:crypto";
import type { AskV2Deps, AskV2Result } from "@lkb/ask";
import type { TreeIndexNode } from "@lkb/core";
import { isValidTenantId } from "../auth.js";
import { evaluatePolicy } from "./evaluate.js";
import { askForMode, lookupEffectivePolicy, policyAskDeps } from "./application.js";
import { answerEvidence, digest, whyUnverified } from "./answer-evidence.js";
import { PolicyServiceError, type AnswerPolicyService } from "./service.js";
import { normalizeQuestionClass, parseNote, validPolicyId } from "./rules.js";
import type { AnswerFilters, AnswerRecordStore, AnswerRun, SourceConflict, VerifyEvidence } from "./answer-records.js";
import type { Actor, PolicyRevision } from "./types.js";

export class AnswerWorkflowError extends Error {
  constructor(readonly code: "bad_request" | "not_found" | "stale_answer" | "invalid_state" | "evidence_unavailable" | "policy_conflict", message: string) { super(message); }
}
export interface AnswerInput { query: string; questionClass: string; policyId?: string; policyVersion?: number;
  evidenceMode: boolean; filters: AnswerFilters; resolutionId?: string;
  /** "deep" runs the multi-step graph; absent = the default single-call RAG path. A request knob only, never stored in `filters`. */
  mode?: "deep" }
export type AppliedPolicy = Pick<PolicyRevision, "policyId" | "version" | "questionClass" | "mode" | "style" | "onInsufficient" | "citations">;
export interface PublishedAnswer extends AskV2Result {
  runId: string; state: AnswerRun["state"] | "stale"; policy: AppliedPolicy | null;
  candidateDigest: string; evidenceDigest: string; followUps: string[];
  confidence: { basis: "maximum retrieval score"; score: number | null; calibrated: false };
  sourceEvidence: AnswerRun["evidence"];
}
function failure(code: AnswerWorkflowError["code"], message: string): never { throw new AnswerWorkflowError(code, message); }
function boundedGraphReferences(value: unknown): value is NonNullable<AnswerFilters["speakerRefs"]> {
  return Array.isArray(value) && value.length <= 16 && value.every(id => typeof id === "string");
}
function graphReferences(value: unknown, speaker: boolean): NonNullable<AnswerFilters["speakerRefs"]> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16 || value.some((id) => typeof id !== "string"))
    return failure("bad_request", "Select at most 16 canonical graph IDs.");
  const ids = value.map((id: string) => id.trim());
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(id) || (speaker && !/^person:[A-Za-z0-9]/.test(id))))
    return failure("bad_request", "Invalid graph selection ID.");
  const selected = [...new Set(ids)];
  if (!boundedGraphReferences(selected)) return failure("bad_request", "Select at most 16 canonical graph IDs.");
  return selected;
}
/** Evidence-selection hints only. The request factory retains tenant/source authority. */
export function answerGraphSelection(filters: AnswerFilters): { speakerRefs?: string[]; topicRefs?: string[] } | undefined {
  return filters.speakerRefs === undefined && filters.topicRefs === undefined ? undefined : {
    ...(filters.speakerRefs !== undefined ? { speakerRefs: [...filters.speakerRefs] } : {}),
    ...(filters.topicRefs !== undefined ? { topicRefs: [...filters.topicRefs] } : {}),
  };
}
export function parseAnswerInput(raw: unknown): AnswerInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failure("bad_request", "Invalid Ask request.");
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !["query", "questionClass", "policyId", "policyVersion", "evidenceMode", "filters", "resolutionId"].includes(k)))
    return failure("bad_request", "Unknown Ask request field.");
  if (typeof o.query !== "string" || !o.query.trim() || o.query.length > 4000) return failure("bad_request", "Question must contain 1-4000 characters.");
  const questionClass = normalizeQuestionClass(o.questionClass ?? "general");
  if (!questionClass || (o.policyId !== undefined && !validPolicyId(o.policyId))) return failure("bad_request", "Invalid policy selection.");
  if (o.policyId !== undefined && (!Number.isSafeInteger(o.policyVersion) || (o.policyVersion as number) < 1))
    return failure("bad_request", "Select the current saved policy version.");
  if (o.evidenceMode !== undefined && typeof o.evidenceMode !== "boolean") return failure("bad_request", "Invalid evidence mode.");
  const f = (o.filters ?? {}) as Record<string, unknown>;
  if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).some((k) => !["sessionIds", "sources", "speakerRefs", "topicRefs", "mode"].includes(k)))
    return failure("bad_request", "Invalid source filters.");
  if (f.mode !== undefined && f.mode !== "fast" && f.mode !== "deep") return failure("bad_request", "Invalid ask mode.");
  const ids = f.sessionIds ?? [];
  if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 200))
    return failure("bad_request", "Select at most 20 session IDs.");
  if (f.sources !== undefined && f.sources !== "all" && f.sources !== "internal") return failure("bad_request", "Invalid source filter.");
  const speakerRefs = graphReferences(f.speakerRefs, true), topicRefs = graphReferences(f.topicRefs, false);
  if ((speakerRefs?.length ?? 0) + (topicRefs?.length ?? 0) > 16)
    return failure("bad_request", "Select at most 16 canonical graph IDs.");
  if (o.resolutionId !== undefined && (typeof o.resolutionId !== "string" || o.resolutionId.length > 100)) return failure("bad_request", "Invalid conflict resolution.");
  return { query: o.query.trim(), questionClass, ...(o.policyId ? { policyId: o.policyId as string, policyVersion: o.policyVersion as number } : {}),
    evidenceMode: o.evidenceMode === true, filters: { sessionIds: [...new Set(ids as string[])] as AnswerFilters["sessionIds"], sources: f.sources === "internal" ? "internal" : "all",
      ...(speakerRefs !== undefined ? { speakerRefs } : {}), ...(topicRefs !== undefined ? { topicRefs } : {}) },
    ...(o.resolutionId ? { resolutionId: o.resolutionId as string } : {}), ...(f.mode === "deep" ? { mode: "deep" as const } : {}) };
}

function filteredTree(tree: TreeIndexNode, ids: string[], excludedIds = new Set<string>(), excludedSessions = new Set<string>()): TreeIndexNode {
  const admitted = new Set(ids);
  const visit = (node: TreeIndexNode): TreeIndexNode | null => {
    if (excludedIds.has(`internal:${node.node_id}`)) return null;
    const ref = node.evidence?.sessionRef;
    if (typeof ref === "string" && excludedSessions.has(ref)) return null;
    if (ids.length && typeof ref === "string" && !admitted.has(ref)) return null;
    const children = node.children.map(visit).filter((n): n is TreeIndexNode => n !== null);
    if (ids.length && typeof ref !== "string" && !children.length && node !== tree) return null;
    return { ...node, children };
  };
  return visit(tree) ?? { ...tree, summary: "", children: [], evidence: undefined };
}
function conservativePolicy(tenantId: string, input: AnswerInput): PolicyRevision {
  return { tenantId, policyId: "default-citations", version: 1, questionClass: input.questionClass, mode: "internal-and-web", style: "concise", onInsufficient: "review", citations: "required",
    action: "save", retired: false, changedBy: { actor: "system" }, changedAt: "1970-01-01T00:00:00.000Z", note: "Conservative default; no matching saved policy.", previousVersion: null };
}

export function createAnswerWorkflow(policies: AnswerPolicyService, store: AnswerRecordStore, verify: VerifyEvidence,
  clock: () => Date = () => new Date()) {
  const tenant = (t: string): void => { if (!isValidTenantId(t)) failure("bad_request", "Invalid verified tenant."); };
  const runOf = async (t: string, id: string): Promise<AnswerRun> => { tenant(t); const run = await store.get(t, id); return run ?? failure("not_found", "No such answer."); };
  const sourceKey = (e: AnswerRun["evidence"][number]): string => {
    if (e.origin === "web" && typeof e.source.url === "string") return `web:${e.source.url}`;
    const ref = (e.source.evidence as { sessionRef?: unknown } | undefined)?.sessionRef;
    if (e.origin === "internal" && typeof ref === "string" && ref.trim()) return `session:${ref}`;
    return failure("evidence_unavailable", "Conflict source has no canonical identity.");
  };
  const resolutionPlan = async (t: string, original: AnswerRun, resolutionId: string) => {
    const conflicts = await store.conflicts(t, original.id);
    if (!conflicts.some((c) => c.id === resolutionId) || conflicts.some((c) => c.status !== "resolved" || !c.resolution))
      failure("invalid_state", "Resolve every reported evidence conflict before generating a new answer.");
    const rejected = new Set<string>(), kept = new Set<string>(), ids = new Set<string>(), sessions = new Set<string>(), urls = new Set<string>();
    for (const conflict of conflicts) {
      if (conflict.candidateDigest !== original.candidateDigest || conflict.evidenceDigest !== original.evidenceDigest)
        failure("stale_answer", "Conflict set belongs to a different evidence revision.");
      const losing = original.evidence.find((e) => e.id === conflict.resolution!.excludeSourceId);
      const keeping = original.evidence.find((e) => e.id === conflict.resolution!.keepSourceId);
      if (!losing || !keeping || losing.id === keeping.id || ![conflict.a.id, conflict.b.id].includes(losing.id)
        || ![conflict.a.id, conflict.b.id].includes(keeping.id)) failure("stale_answer", "Conflict resolution has invalid cited sources.");
      const key = sourceKey(losing!); rejected.add(key); kept.add(sourceKey(keeping!)); ids.add(losing!.id);
      if (key.startsWith("session:")) sessions.add(key.slice(8)); else urls.add(key.slice(4));
    }
    if ([...kept].some((key) => rejected.has(key))) failure("invalid_state", "Reviewed source preferences contradict one another; ask again with a new evidence selection.");
    return { snapshot: digest([...conflicts].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), rejected, ids, sessions, urls };
  };
  const snapshotFreshness = async (t: string, run: AnswerRun): Promise<void> => {
    if (run.candidateDigest !== digest(run.candidate) || run.evidenceDigest !== digest(run.evidence)
      || !(await verify(t, run.evidence))) failure("stale_answer", "Source evidence changed or cannot be verified; ask again.");
    const lookup = await lookupEffectivePolicy(policies, t, { questionClass: run.questionClass,
      ...(run.policy ? { policyId: run.policy.policyId, expectedVersion: run.policy.version } : {}) });
    if (lookup.status !== (run.policy ? "active" : "none")) failure("policy_conflict", "The effective policy changed; ask again before review.");
  };
  const freshness = async (t: string, run: AnswerRun, depth = 0): Promise<void> => {
    if (depth > 100) failure("stale_answer", "Answer resolution lineage is too deep; ask again.");
    await snapshotFreshness(t, run);
    if (run.parentRunId && run.resolutionId) {
      const original = await runOf(t, run.parentRunId); await freshness(t, original, depth + 1);
      const plan = await resolutionPlan(t, original, run.resolutionId);
      if (run.evidence.some((e) => plan.rejected.has(sourceKey(e))))
        failure("invalid_state", "A reviewed source preference changed; generate a new answer after resolving conflicts.");
    }
  };
  const published = async (t: string, run: AnswerRun, fresh = false): Promise<PublishedAnswer> => {
    const conflicts = await store.conflicts(t, run.id);
    // A saved answer is a release of the same candidate under the same policy,
    // not a permanent authorization to bypass later policy/evidence revisions.
    let current = true, inheritedConflict = false, whyNot: string | undefined;
    try { await snapshotFreshness(t, run); } catch { current = false; if (fresh) whyNot = await whyUnverified(t, run.evidence, verify); }
    if (run.parentRunId && run.resolutionId) {
      try {
        const original = await runOf(t, run.parentRunId); await freshness(t, original);
        const plan = await resolutionPlan(t, original, run.resolutionId);
        inheritedConflict = run.evidence.some((e) => plan.rejected.has(sourceKey(e)));
      } catch (error) {
        if (error instanceof AnswerWorkflowError && error.code === "invalid_state") inheritedConflict = true;
        else current = false;
      }
    }
    const state = !current ? "stale" : conflicts.length || inheritedConflict ? "conflicted" : run.state;
    const scores = run.candidate.scored.map((s) => s.score).filter((s): s is number => typeof s === "number" && Number.isFinite(s));
    return { ...run.candidate, ...(!current ? { sources: { internal: [], web: [] }, scored: [], auditLog: [], reason: whyNot ?? "Stored candidate, policy or source evidence changed, was withdrawn, or cannot be verified." } : {}),
      answer: state === "allowed" || state === "approved" ? run.candidate.answer : "", runId: run.id, state,
      policy: run.policy ? { policyId: run.policy.policyId, version: run.policy.version, questionClass: run.policy.questionClass,
        mode: run.policy.mode, style: run.policy.style, onInsufficient: run.policy.onInsufficient, citations: run.policy.citations } : null,
      candidateDigest: run.candidateDigest, evidenceDigest: run.evidenceDigest,
      sourceEvidence: current ? run.evidence : [],
      confidence: { basis: "maximum retrieval score", score: scores.length ? Math.max(...scores) : null, calibrated: false },
      followUps: [`What evidence supports this answer to: ${run.query}`, `What limitations should I consider about: ${run.query}`] };
  };
  return {
    async execute(t: string, raw: unknown, actor: Actor, tree: TreeIndexNode, rawDeps: AskV2Deps): Promise<PublishedAnswer> {
      tenant(t); const input = parseAnswerInput(raw);
      if (rawDeps.tenantId !== t || !rawDeps.sourceContext) failure("evidence_unavailable", "Bounded, tenant-bound source retrieval is unavailable.");
      const lookup = await lookupEffectivePolicy(policies, t, { policyId: input.policyId, questionClass: input.questionClass, expectedVersion: input.policyVersion });
      if (lookup.status === "conflict") failure("policy_conflict", "Contradictory saved policies require revision or retirement.");
      const selected = lookup.status === "active" ? lookup.policy : null;
      let parentRunId: string | undefined;
      let plan: Awaited<ReturnType<typeof resolutionPlan>> | undefined;
      let resolutionOriginal: AnswerRun | undefined;
      if (input.resolutionId) {
        const conflict = await store.getConflict(t, input.resolutionId);
        if (!conflict?.resolution || conflict.status !== "resolved") failure("not_found", "No resolved evidence conflict for this tenant.");
        const original = await runOf(t, conflict.runId); await freshness(t, original);
        if (original.query !== input.query || original.questionClass !== input.questionClass
          || original.policy?.policyId !== selected?.policyId || original.policy?.version !== selected?.version
          || digest(original.filters) !== digest(input.filters)) failure("stale_answer", "Resolution belongs to a different answer selection.");
        parentRunId = original.id; plan = await resolutionPlan(t, original, input.resolutionId);
        resolutionOriginal = original;
      }
      let deps = policyAskDeps(rawDeps, selected ?? conservativePolicy(t, input));
      if (input.filters.sources === "internal") deps = { ...deps, webFallbackFn: undefined, tavilySearchFn: undefined };
      if (plan?.urls.size) {
        const sync = deps.webFallbackFn, async = deps.tavilySearchFn;
        deps = { ...deps, ...(sync ? { webFallbackFn: (q) => sync(q).filter((s) => typeof s.url === "string" && !plan!.urls.has(s.url)) } : {}),
          ...(async ? { tavilySearchFn: async (q) => (await async(q)).filter((s) => typeof s.url === "string" && !plan!.urls.has(s.url)) } : {}) };
      }
      // Persist the exact JSON wire value. Optional undefined audit/provider metadata must not
      // become BSON null after restart and falsely change the reviewed candidate digest.
      const candidate = JSON.parse(JSON.stringify(await askForMode(input.mode, input.query, filteredTree(tree, input.filters.sessionIds, plan?.ids, plan?.sessions), deps))) as AskV2Result;
      if (resolutionOriginal) {
        await freshness(t, resolutionOriginal);
        if ((await resolutionPlan(t, resolutionOriginal, input.resolutionId!)).snapshot !== plan!.snapshot)
          failure("stale_answer", "Reported evidence conflicts changed during generation; ask again after review.");
      }
      const evaluation = evaluatePolicy(t, selected ?? conservativePolicy(t, input), candidate);
      const evidence = answerEvidence(candidate);
      const run: AnswerRun = { id: randomUUID(), tenantId: t, createdAt: clock().toISOString(), actor, query: input.query, questionClass: input.questionClass,
        filters: input.filters, evidenceMode: input.evidenceMode, state: evaluation.decision === "allow" ? "allowed" : evaluation.decision === "review" ? "review" : "refused",
        reason: evaluation.reason, candidate, candidateDigest: digest(candidate), evidenceDigest: digest(evidence), evidence, policy: selected, feedback: [],
        ...(parentRunId ? { parentRunId, resolutionId: input.resolutionId } : {}) };
      // History is part of a successful request: storage failure must not advertise a saved answer.
      await store.create(t, run); return published(t, run, input.mode !== "deep");
    },
    async history(t: string) { tenant(t); const runs = await store.list(t, 100); return Promise.all(runs.map(async (run) => ({ id: run.id, query: run.query, createdAt: run.createdAt, questionClass: run.questionClass, filters: run.filters, evidenceMode: run.evidenceMode, reason: run.reason, result: await published(t, run) }))); },
    async get(t: string, id: string) {
      const run = await runOf(t, id);
      // Legacy rows remain readable; absent original inputs must never acquire replay defaults.
      const replayAvailable = typeof run.questionClass === "string" && !!run.questionClass.trim() && run.questionClass.length <= 80
        && typeof run.query === "string" && !!run.query.trim() && run.query.length <= 4000
        && typeof run.evidenceMode === "boolean" && !!run.filters && Array.isArray(run.filters.sessionIds)
        && Object.keys(run.filters).every(key => ["sessionIds", "sources", "speakerRefs", "topicRefs"].includes(key))
        && run.filters.sessionIds.length <= 20 && run.filters.sessionIds.every(id => typeof id === "string" && !!id.trim() && id.length <= 200)
        && ["all", "internal"].includes(run.filters.sources)
        && (run.filters.speakerRefs === undefined || boundedGraphReferences(run.filters.speakerRefs))
        && (run.filters.topicRefs === undefined || boundedGraphReferences(run.filters.topicRefs))
        && (run.filters.speakerRefs?.length ?? 0) + (run.filters.topicRefs?.length ?? 0) <= 16;
      return { id: run.id, createdAt: run.createdAt, query: run.query, reason: run.reason, result: await published(t, run), replayAvailable,
        ...(replayAvailable ? { questionClass: run.questionClass, evidenceMode: run.evidenceMode, filters: run.filters } : {}) };
    },
    async suggestions(t: string) { tenant(t); return [...new Set((await store.list(t, 20)).map((r) => r.query))].slice(0, 5); },
    async feedback(t: string, id: string, raw: unknown, by: Actor) {
      await runOf(t, id); const o = raw as { rating?: unknown; note?: unknown } | null;
      if (!o || !["helpful", "unhelpful"].includes(o.rating as string)) failure("bad_request", "Choose helpful or unhelpful.");
      const note = parseNote(o!.note);
      if (!(await store.feedback(t, id, { rating: o!.rating as "helpful" | "unhelpful", note, by, at: clock().toISOString() }))) failure("invalid_state", "Feedback limit reached.");
      return { saved: true };
    },
    async queue(t: string) {
      tenant(t); return Promise.all((await store.reviewItems(t, 100)).map(async (run) => {
        try { await freshness(t, run); return run; }
        catch { return { ...run, reason: "Candidate, policy or source evidence changed; rerun required.", candidate: { ...run.candidate, answer: "", reason: "Current evidence or policy unavailable.", sources: { internal: [], web: [] }, scored: [], auditLog: [] }, evidence: [] }; }
      }));
    },
    async review(t: string, id: string, raw: unknown, by: Actor) {
      const run = await runOf(t, id), o = raw as { decision?: unknown; note?: unknown; candidateDigest?: unknown; evidenceDigest?: unknown } | null;
      if (!o || (o.decision !== "approved" && o.decision !== "rejected")) failure("bad_request", "Choose approved or rejected.");
      if (run.state !== "review" || o!.candidateDigest !== run.candidateDigest || o!.evidenceDigest !== run.evidenceDigest) failure("stale_answer", "Answer is stale or already reviewed.");
      const note = parseNote(o!.note);
      if (o!.decision === "approved") {
        await freshness(t, run);
        if ((await store.conflicts(t, run.id)).length) failure("invalid_state", "Conflicting evidence requires a newly generated answer after resolution.");
        if (!run.candidate.answer.trim()) failure("evidence_unavailable", "An empty candidate cannot be approved.");
      }
      const review = { decision: o!.decision as "approved" | "rejected", note, by, at: clock().toISOString(), candidateDigest: run.candidateDigest, evidenceDigest: run.evidenceDigest };
      if (!(await store.review(t, id, run.candidateDigest, review))) failure("stale_answer", "Answer was reviewed concurrently.");
      return this.get(t, id);
    },
    async reportConflict(t: string, id: string, raw: unknown, by: Actor) {
      const run = await runOf(t, id), o = raw as { a?: unknown; b?: unknown; explanation?: unknown } | null;
      const a = run.evidence.find((e) => e.id === o?.a), b = run.evidence.find((e) => e.id === o?.b);
      if (!a || !b || a.id === b.id || !a.excerpt.trim() || !b.excerpt.trim()) failure("bad_request", "Select two different cited sources with original excerpts.");
      const explanation = parseNote(o?.explanation); await freshness(t, run);
      const conflict: SourceConflict = { id: randomUUID(), tenantId: t, runId: run.id, createdAt: clock().toISOString(), by, explanation,
        a: a!, b: b!, candidateDigest: run.candidateDigest, evidenceDigest: run.evidenceDigest, status: "open" };
      return store.addConflict(t, conflict);
    },
    async conflicts(t: string) {
      tenant(t); return Promise.all((await store.conflicts(t)).map(async (c) => {
        if (await verify(t, [c.a, c.b])) return c;
        const hide = (side: SourceConflict["a"]) => ({ ...side, source: {}, excerpt: "Evidence changed or was withdrawn; a new answer is required." });
        return { ...c, explanation: "Stored conflict evidence changed or was withdrawn; a new answer is required.", a: hide(c.a), b: hide(c.b) };
      }));
    },
    async resolveConflict(t: string, id: string, raw: unknown, by: Actor) {
      tenant(t); const conflict = await store.getConflict(t, id);
      if (!conflict) failure("not_found", "No such evidence conflict.");
      if (conflict!.status !== "open") failure("invalid_state", "Evidence conflict is already resolved.");
      const o = raw as { keepSourceId?: unknown; note?: unknown; evidenceDigest?: unknown } | null;
      if (!o || ![conflict!.a.id, conflict!.b.id].includes(o.keepSourceId as string) || o.evidenceDigest !== conflict!.evidenceDigest) failure("stale_answer", "Resolution does not match this evidence revision.");
      const run = await runOf(t, conflict!.runId); await freshness(t, run);
      const resolution = { keepSourceId: o!.keepSourceId as string, excludeSourceId: o!.keepSourceId === conflict!.a.id ? conflict!.b.id : conflict!.a.id, note: parseNote(o!.note), by, at: clock().toISOString() };
      if (!(await store.resolveConflict(t, id, resolution))) failure("invalid_state", "Conflict was resolved concurrently.");
      return { ...conflict!, status: "resolved" as const, resolution };
    },
  };
}
export type AnswerWorkflow = ReturnType<typeof createAnswerWorkflow>;
