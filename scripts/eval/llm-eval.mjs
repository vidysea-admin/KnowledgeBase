/**
 * scripts/eval/llm-eval.mjs - U0.10 real-LLM ScoreFn plumbing shared by eval-recall.mjs and eval-calibration.mjs.
 * Opt-in only (`--llm`); without it neither script touches this file. Spend approved by D-164 (Ollama Cloud first, Gemini last).
 *
 * The scorer is apps/api's `createLlmScorer` (the production evaluator judge prompt, jobKind "evaluator"), routed through
 * @lkb/ai `complete` with an explicit one-provider chain. No scoring policy is invented here: the prompt, the 0-1 scale and the
 * reference scores (1.0 own session / 0.0 other session) are the existing ones from score.ts and qa/contracts/evaluator-calibration.md.
 * OLLAMA_BASE_URL is NEVER read or written: the cloud base URL is passed to the provider instance used by this process only.
 * Writes no Mongo and no job rows (the router's `write` is a no-op).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

register();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RESULTS_DIR = join(ROOT, "data", "eval", "results");
export const DEFAULT_CLOUD_URL = "https://ollama.com";

export function parseLlmArgs(argv, env = {}) {
  const has = (n) => argv.includes(n);
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const num = (n) => (val(n) === undefined ? undefined : Number(val(n)));
  if (!has("--llm")) return { llm: false };
  const o = { llm: true, model: val("--model"), provider: val("--provider") ?? "ollama", baseUrl: val("--base-url") ?? DEFAULT_CLOUD_URL,
    maxCostUsd: num("--max-cost-usd"), maxCalls: num("--max-calls"), limitQuestions: num("--limit-questions"), out: val("--out") };
  const bad = (m) => ({ ...o, error: `refused: ${m}` });
  if (!o.model) return bad("--llm requires --model <id>");
  if (!["ollama", "gemini"].includes(o.provider)) return bad("--provider must be ollama or gemini");
  if (o.maxCostUsd === undefined && o.maxCalls === undefined) return bad("--llm requires a cap: --max-calls <n> and/or --max-cost-usd <n>");
  // ISS-U010HARNESS-001: OllamaProvider and GeminiProvider both report costUsd: 0, so a cost-only cap can never trip.
  if (o.maxCostUsd !== undefined && o.maxCalls === undefined) return bad("--max-cost-usd alone is not a cap: the ollama and gemini adapters report costUsd 0, so it can never trip. Use --max-calls <n> (the binding cap); --max-cost-usd is only accepted alongside it");
  for (const [k, v] of [["--max-cost-usd", o.maxCostUsd], ["--max-calls", o.maxCalls], ["--limit-questions", o.limitQuestions]])
    if (v !== undefined && (!Number.isFinite(v) || v <= 0)) return bad(`${k} must be a positive number`);
  if (o.provider === "ollama" && o.baseUrl !== "http://localhost:11434" && !env.OLLAMA_API_KEY) return bad("OLLAMA_API_KEY is not set for a non-local Ollama base URL");
  if (o.provider === "gemini" && !env.GEMINI_API_KEY) return bad("GEMINI_API_KEY is not set");
  return o;
}

/** Strip any configured secret out of text that may reach logs or a results file. */
export function redactor(secrets) {
  const list = secrets.filter((s) => typeof s === "string" && s.length >= 6);
  return (text) => list.reduce((t, s) => String(t).split(s).join("[redacted]"), String(text));
}

export class CapReached extends Error {}

/** Builds `complete(job)` through the router with ONE explicit provider (model fixed per provider instance). */
export async function createEvalComplete(o, env, transport) {
  const ai = await import("../../packages/ai/src/index.ts");
  const tr = transport ?? (await import("../../apps/api/src/ai-transport.ts")).realTransport;
  const provider = o.provider === "gemini"
    ? new ai.GeminiProvider(tr, { apiKey: env.GEMINI_API_KEY ?? "", model: o.model })
    : new ai.OllamaProvider(tr, { baseUrl: o.baseUrl, model: o.model, apiKey: env.OLLAMA_API_KEY });
  const config = { chains: { evaluator: [provider.name] }, providers: { [provider.name]: provider }, write: async () => {}, tenantId: "eval-llm" };
  return (job) => ai.complete("evaluator", job, config);
}

/** True when the next call must not be sent. `>=`: a run exactly at the cap has spent it. */
export function capHit(caps, stats) {
  return (caps.maxCalls !== undefined && stats.calls >= caps.maxCalls) || (caps.maxCostUsd !== undefined && stats.costUsd >= caps.maxCostUsd);
}

/** Top-level results-JSON field: spread into the report; absent when there were no heuristic fallbacks. */
export function fallbackWarning(stats) {
  return stats.fallbacks > 0 ? { warning: `${stats.fallbacks} call(s) fell back to the heuristic scorer: this is NOT a pure LLM number; do not cite it as one` } : {};
}

/** Wraps createLlmScorer with a call/cost cap, latency and fallback accounting. Cap is checked BEFORE each call. */
export async function createLlmScoreFn(complete, caps, now = () => performance.now()) {
  const { createLlmScorer } = await import("../../apps/api/src/score.ts");
  const stats = { calls: 0, ok: 0, failed: 0, fallbacks: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, latenciesMs: [], errors: [], capReached: false };
  const counted = async (job) => {
    const t0 = now();
    stats.calls++;
    try {
      const r = await complete(job);
      stats.latenciesMs.push(now() - t0);
      stats.ok++;
      stats.costUsd += r.costUsd ?? 0;
      stats.inputTokens += r.usage?.inputTokens ?? 0;
      stats.outputTokens += r.usage?.outputTokens ?? 0;
      return r;
    } catch (e) {
      stats.latenciesMs.push(now() - t0);
      stats.failed++;
      if (stats.errors.length < 5) stats.errors.push(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  const inner = createLlmScorer(counted);
  const scoreFn = async (query, node) => {
    if (capHit(caps, stats)) {
      stats.capReached = true;
      throw new CapReached("call/cost cap reached; call not sent");
    }
    const res = await inner(query, node);
    // createLlmScorer silently degrades to the heuristic on a failed/unparseable reply. That number is NOT an LLM score.
    const fellBack = /fell back/.test(res[1]);
    if (fellBack) stats.fallbacks++;
    return { score: res[0], reason: res[1], fellBack };
  };
  return { scoreFn, stats };
}

export function latencySummary(xs) {
  if (xs.length === 0) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b), at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x);
  return { n: s.length, meanMs: r(s.reduce((a, b) => a + b, 0) / s.length), p50Ms: r(at(0.5)), p95Ms: r(at(0.95)), maxMs: r(s[s.length - 1]) };
}

export function callSummary(stats, o) {
  return { made: stats.calls, ok: stats.ok, failed: stats.failed, heuristicFallbacks: stats.fallbacks, capReached: stats.capReached,
    maxCalls: o.maxCalls ?? null, maxCostUsd: o.maxCostUsd ?? null, costUsd: stats.costUsd, inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens, latency: latencySummary(stats.latenciesMs), firstErrors: stats.errors };
}

export function resultsPath(kind, o, date, partial) {
  const slug = `${o.provider}-${o.model}`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return o.out ? resolve(o.out) : join(RESULTS_DIR, `${kind}-${slug}-${date}${partial ? "-smoke" : ""}.json`);
}

export function writeResults(path, report, redact) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, redact(JSON.stringify(report, null, 2)) + "\n", "utf8");
  return path;
}

/** Keeps every item whose question is among the first N distinct questions (file order, so deterministic). */
export function limitByQuestion(items, queryOf, n) {
  if (n === undefined) return items;
  const keep = new Set();
  for (const it of items) if (keep.size < n) keep.add(queryOf(it));
  return items.filter((it) => keep.has(queryOf(it)));
}

/** Calibration: one pair at a time through the existing computeMAE; stops (not crashes) at the cap. */
export async function calibrateLlm(pairs, scoreFn, computeMAE) {
  const details = [], fallbackIds = [];
  let notScored = 0;
  for (let i = 0; i < pairs.length; i++) {
    let last;
    try {
      const r = await computeMAE([pairs[i]], async (q, n) => { last = await scoreFn(q, n); return last.score; });
      details.push({ ...r.details[0], reason: last.reason, heuristicFallback: last.fellBack });
      if (last.fellBack) fallbackIds.push(pairs[i].id);
    } catch (e) {
      if (e instanceof CapReached) { notScored = pairs.length - i; break; }
      throw e;
    }
  }
  const n = details.length;
  return { mae: n === 0 ? null : details.reduce((a, d) => a + d.absError, 0) / n, n, notScored, details, fallbackIds };
}

/** Recall: rank EVERY session with the LLM scorer for each question (whole questions only), then score with the unchanged harness. */
export async function rankSessionsLlm(questions, sessionNodes, scoreFn, k) {
  const ranked = new Map();
  let notScored = 0, fallbackQuestions = 0;
  for (let i = 0; i < questions.length; i++) {
    const scored = [];
    let fb = false;
    try {
      for (const [id, node] of sessionNodes) { const r = await scoreFn(questions[i].question, node); fb ||= r.fellBack; scored.push([id, r.score]); }
    } catch (e) {
      if (e instanceof CapReached) { notScored = questions.length - i; break; }
      throw e;
    }
    if (fb) fallbackQuestions++;
    scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    ranked.set(questions[i].question, scored.slice(0, k).map(([id]) => id));
  }
  return { ranked, notScored, fallbackQuestions };
}
