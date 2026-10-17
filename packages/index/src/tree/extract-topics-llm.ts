/**
 * packages/index/src/tree/extract-topics-llm.ts — U2.3: LLM topic extractor for the existing
 * `ExtractTopicRefs` seam (tree/build.ts `extractFn`).
 *
 * The seam is SYNCHRONOUS (`page -> string[]`), so the model calls are made up front by
 * `prepareTopicExtractFn`, which returns an ordinary sync `ExtractTopicRefs` that reads the
 * precomputed answers. Anything not precomputed, or whose page text changed since, falls through
 * to the heuristic `extractTopicRefs`.
 *
 * Degradation (plan section 10, "keep the regex as the degradation fallback"): a rejected call,
 * a timeout, unparseable output, or output failing the schema all use the heuristic for that page.
 * Output is never trusted blind: every topic must be a short string that appears verbatim
 * (case-insensitive) in the page's own summary/keyInsights text, so the model cannot introduce a
 * topic the page does not support.
 *
 * Tenant scoping: the only input is the page itself; the cache is keyed by tenantId + page _id and
 * a foreign-tenant page is never answered from another tenant's entry. The prompt carries no
 * tenant identifiers.
 *
 * Flag: `LKB_LLM_TOPICS=1` (OFF by default). When off, `prepareTopicExtractFn` returns
 * `extractTopicRefs` itself and never calls the model: byte-identical behaviour.
 * Quality is UNMEASURED: U2.2 golden labels are not human-adjudicated; acceptance waits on them.
 */
import type { SessionPages } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";
import { extractTopicRefs, type ExtractTopicRefs } from "./extract-topics.js";

export type TopicsCompleteFn = (job: Job) => Promise<CompleteResult>;

export const LLM_TOPICS_FLAG = "LKB_LLM_TOPICS";
export const TOPICS_JOB_KIND = "topics";
const MAX_TOPICS = 6;
const MAX_TOPIC_LEN = 80;
const DEFAULT_TIMEOUT_MS = 30_000;

export const TOPICS_SYSTEM_PROMPT = [
  "You extract the main topics of one session from its summary and key insights, for a searchable",
  "knowledge base. A topic is a short noun phrase naming a subject, program, organisation, place or",
  `concept (at most ${MAX_TOPICS}, most important first). Each topic MUST be copied exactly as it`,
  "appears in the text -- never invent or paraphrase one.",
  'Respond with ONLY a JSON array of strings, e.g. ["New Zealand", "Student Visa"].',
  "If the text names no clear topic, respond with an empty array [].",
].join(" ");

export function isLlmTopicsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[LLM_TOPICS_FLAG] === "1";
}

export type TopicFallbackReason = "error" | "timeout" | "invalid-output" | "ungrounded";
export interface TopicExtraction {
  topics: string[];
  /** null when the model's validated answer was used; a reason when the heuristic answered. */
  degraded: { reason: TopicFallbackReason } | null;
}

function pageText(page: SessionPages): string {
  return [page.summary ?? "", ...(page.keyInsights ?? [])].join("\n");
}

/** Schema: a JSON array of non-empty strings, each <= MAX_TOPIC_LEN chars, at most 4x MAX_TOPICS entries. */
function validateTopics(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TOPICS * 4) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t === "" || t.length > MAX_TOPIC_LEN) return null;
    out.push(t);
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("topics-timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** One page via the injected model; never throws. Falls back to the heuristic with a reason. */
export async function extractTopicsLlm(page: SessionPages | null, complete: TopicsCompleteFn,
  opts: { timeoutMs?: number } = {}): Promise<TopicExtraction> {
  if (page === null) return { topics: [], degraded: null };
  const text = pageText(page);
  if (text.trim() === "") return { topics: extractTopicRefs(page), degraded: null };
  const fallback = (reason: TopicFallbackReason): TopicExtraction =>
    ({ topics: extractTopicRefs(page), degraded: { reason } });

  let result: CompleteResult;
  try {
    result = await withTimeout(complete({ kind: TOPICS_JOB_KIND, messages: [
      { role: "system", content: TOPICS_SYSTEM_PROMPT },
      { role: "user", content: text },
    ] }), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (e) {
    return fallback(e instanceof Error && e.message === "topics-timeout" ? "timeout" : "error");
  }

  const parsed = validateTopics(result.json ?? parseJsonLoose(result.text));
  if (parsed === null) return fallback("invalid-output");
  if (parsed.length === 0) return { topics: [], degraded: null };

  const haystack = text.toLowerCase();
  const seen = new Set<string>();
  const grounded: string[] = [];
  for (const t of parsed) {
    const key = t.toLowerCase();
    if (!haystack.includes(key) || seen.has(key)) continue;
    seen.add(key);
    grounded.push(t);
  }
  if (grounded.length === 0) return fallback("ungrounded");
  return { topics: grounded.slice(0, MAX_TOPICS), degraded: null };
}

const keyOf = (p: SessionPages) => `${p.tenantId}\u0000${p._id}`;

export interface PreparedTopicExtractor {
  extractFn: ExtractTopicRefs;
  /** Per-page outcome (empty when the flag is off), for the eval harness and ops visibility. */
  results: Map<string, TopicExtraction>;
}

/**
 * Precomputes LLM topics for `pages` and returns a sync `ExtractTopicRefs` for buildTree /
 * regenerate. Flag off (default): returns `extractTopicRefs` unchanged and never calls `complete`.
 */
export async function prepareTopicExtractFn(pages: SessionPages[], complete: TopicsCompleteFn,
  opts: { enabled?: boolean; timeoutMs?: number } = {}): Promise<PreparedTopicExtractor> {
  const results = new Map<string, TopicExtraction>();
  if (!(opts.enabled ?? isLlmTopicsEnabled())) return { extractFn: extractTopicRefs, results };

  const cached = new Map<string, { text: string; topics: string[] }>();
  for (const page of pages) {
    const r = await extractTopicsLlm(page, complete, opts);
    results.set(keyOf(page), r);
    cached.set(keyOf(page), { text: pageText(page), topics: r.topics });
  }
  const extractFn: ExtractTopicRefs = (page) => {
    if (page === null) return [];
    const hit = cached.get(keyOf(page));
    return hit !== undefined && hit.text === pageText(page) ? [...hit.topics] : extractTopicRefs(page);
  };
  return { extractFn, results };
}

/** Maps extractor output to the U2.2 harness `predictedEntities` shape (id = slug, kind topic). */
export function topicPredictedEntities(topics: string[]): { id: string; kind: "topic" }[] {
  const ids = new Set<string>();
  for (const t of topics) {
    const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (id !== "") ids.add(id);
  }
  return [...ids].map((id) => ({ id, kind: "topic" as const }));
}
