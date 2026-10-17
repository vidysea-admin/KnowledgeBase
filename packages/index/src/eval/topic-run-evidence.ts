/** U2.3 acquisition evidence over the actual producer. No persistence, gold or acceptance decision. */
import { createHash } from "node:crypto";
import type { CompleteResult } from "@lkb/ai";
import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { buildTopicIndex } from "../tree/topic-indexing.js";
import { topicPredictedEntities, type TopicsCompleteFn } from "../tree/extract-topics-llm.js";

export interface TopicRunSource {
  /** Exact acquired JSON bytes as UTF-8 text; never reconstructed historical responses. */
  sessionJson: string;
  pageJson: string | null;
}
export interface TopicRunEvidenceInput {
  tenantId: string;
  /** Caller declaration only; this adapter cannot authenticate a transport/provider. */
  execution: "injected-fixture" | "configured-provider";
  sources: TopicRunSource[];
  enabled: boolean;
  timeoutMs?: number;
  existingRootJson?: string;
  changedSessionIds?: string[];
}
interface LogicalCall {
  pageId: string;
  promptSha256: string;
  outcome: "unsettled" | "returned" | "rejected";
  elapsedMs: number | null;
  response: { text: string; json?: unknown } | null;
  provider: string | null;
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  costUsd: number | null;
  costStatus: "unknown" | "reported";
}
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pageText = (page: SessionPages) => [page.summary ?? "", ...(page.keyInsights ?? [])].join("\n");
const token = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** Snapshot exact source inputs before asynchronous inference; late timed-out returns cannot rewrite evidence. */
export async function acquireTopicRunEvidence(input: TopicRunEvidenceInput, complete: TopicsCompleteFn) {
  if (!nonempty(input.tenantId) || !["injected-fixture", "configured-provider"].includes(input.execution) ||
      typeof input.enabled !== "boolean" || !Array.isArray(input.sources) ||
      (input.timeoutMs !== undefined && (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0)))
    throw new Error("topic evidence: invalid run input");
  const tenantId = input.tenantId, execution = input.execution, enabled = input.enabled, timeoutMs = input.timeoutMs;
  const changedSessionIds = input.changedSessionIds === undefined ? undefined : [...input.changedSessionIds];
  if (changedSessionIds?.some(id => !nonempty(id))) throw new Error("topic evidence: invalid changed sessions");
  const sessions: Sessions[] = [], pages: SessionPages[] = [];
  const bindings: { sessionId: string; sessionSha256: string; pageId: string | null; pageSha256: string | null }[] = [];
  const sessionIds = new Set<string>(), pageIds = new Set<string>();
  for (const source of input.sources) {
    if (!object(source) || typeof source.sessionJson !== "string" ||
        !(source.pageJson === null || typeof source.pageJson === "string")) throw new Error("topic evidence: invalid source bytes");
    const s: unknown = JSON.parse(source.sessionJson);
    if (!object(s) || !nonempty(s._id) || s.tenantId !== tenantId || !nonempty(s.date) || !nonempty(s.title) || sessionIds.has(s._id))
      throw new Error("topic evidence: invalid or foreign session");
    sessionIds.add(s._id); sessions.push(s as unknown as Sessions);
    let pageId: string | null = null;
    if (source.pageJson !== null) {
      const p: unknown = JSON.parse(source.pageJson);
      if (!object(p) || !nonempty(p._id) || p.tenantId !== tenantId || p.sessionId !== s._id ||
          typeof p.summary !== "string" || (p.keyInsights !== undefined &&
            (!Array.isArray(p.keyInsights) || p.keyInsights.some(v => typeof v !== "string"))) || pageIds.has(p._id))
        throw new Error("topic evidence: invalid or foreign page");
      pageId = p._id; pageIds.add(pageId); pages.push(p as unknown as SessionPages);
    }
    bindings.push({ sessionId: s._id, sessionSha256: sha(source.sessionJson), pageId,
      pageSha256: source.pageJson === null ? null : sha(source.pageJson) });
  }
  if (changedSessionIds?.some(id => !sessionIds.has(id))) throw new Error("topic evidence: unknown changed session");
  const rootBytes = input.existingRootJson;
  const existingRoot = rootBytes === undefined ? undefined : JSON.parse(rootBytes) as TreeIndexNode;
  const eligibleCalls = pages.filter(page => pageText(page).trim() !== "");
  const calls: LogicalCall[] = [];
  let sealed = false;
  const observed: TopicsCompleteFn = async job => {
    const page = eligibleCalls[calls.length];
    if (!page || job.kind !== "topics" || job.messages[1]?.content !== pageText(page))
      throw new Error("topic evidence: producer prompt association changed");
    const call: LogicalCall = { pageId: page._id, promptSha256: sha(JSON.stringify(job)), outcome: "unsettled",
      elapsedMs: null, response: null, provider: null, model: null, usage: null, costUsd: null, costStatus: "unknown" };
    calls.push(call);
    const started = Date.now();
    try {
      const result: CompleteResult = await complete(job);
      if (!sealed) {
        call.outcome = "returned"; call.elapsedMs = Date.now() - started;
        // Capture returned completion artifacts, never claim these are wire/HTTP raw bytes.
        call.response = structuredClone({ text: result.text, ...(result.json !== undefined ? { json: result.json } : {}) });
        call.provider = nonempty(result.provider) ? result.provider : null;
        call.model = nonempty(result.model) ? result.model : null;
        call.usage = token(result.usage?.inputTokens) && token(result.usage?.outputTokens) ? { ...result.usage } : null;
        call.costUsd = typeof result.costUsd === "number" && Number.isFinite(result.costUsd) && result.costUsd >= 0 ? result.costUsd : null;
        call.costStatus = result.costStatus === "reported" && call.costUsd !== null ? "reported" : "unknown";
      }
      return result;
    } catch {
      if (!sealed) { call.outcome = "rejected"; call.elapsedMs = Date.now() - started; }
      // Provider exceptions may contain credentials; the existing extractor needs only rejection.
      throw new Error("topic evidence: completion rejected");
    }
  };
  const produced = await buildTopicIndex(tenantId, sessions, pages, observed,
    { enabled, timeoutMs, existingRoot, changedSessionIds });
  sealed = true;
  const treeTopics: { nodeId: string; title: string; sessionId: string | null; sessionRefs: string[] }[] = [];
  const visit = (node: TreeIndexNode): void => {
    if (node.level === "topic") treeTopics.push({ nodeId: node.node_id, title: node.title,
      sessionId: node.evidence?.sessionRef ?? null, sessionRefs: [...(node.evidence?.sessionRefs ?? [])] });
    node.children.forEach(visit);
  };
  if (produced.root) visit(produced.root);
  const observations = bindings.map(binding => {
    const extraction = binding.pageId === null ? undefined : produced.results.get(`${tenantId}\u0000${binding.pageId}`);
    return { ...binding, extraction: extraction ? structuredClone(extraction) : null,
      predictedEntities: extraction ? topicPredictedEntities(extraction.topics) : null,
      treeTopics: treeTopics.filter(topic => topic.sessionId === binding.sessionId) };
  });
  const allUsageKnown = calls.every(call => call.usage !== null && call.outcome === "returned");
  const allCostsKnown = calls.every(call => call.costStatus === "reported" && call.outcome === "returned");
  return { version: 1 as const, tenantId, execution, executionAttested: false, enabled,
    inputSha256: sha(JSON.stringify({ tenantId, bindings, existingRootSha256: rootBytes === undefined ? null : sha(rootBytes),
      enabled, timeoutMs: timeoutMs ?? null, changedSessionIds: changedSessionIds ?? null })),
    sourceBindings: bindings, observations, logicalCalls: structuredClone(calls), physicalAttempts: null,
    totals: { logicalCalls: calls.length,
      usage: calls.length && allUsageKnown ? { inputTokens: calls.reduce((n, c) => n + c.usage!.inputTokens, 0),
        outputTokens: calls.reduce((n, c) => n + c.usage!.outputTokens, 0) } : null,
      costUsd: calls.length && allCostsKnown ? calls.reduce((n, c) => n + c.costUsd!, 0) : null },
    downstream: { root: produced.root ?? null, rootSha256: produced.root ? sha(JSON.stringify(produced.root)) : null, treeTopics },
    unavailableStages: { transportRaw: null, persisted: null, humanGold: null, semanticQuality: null, acceptance: null } };
}
