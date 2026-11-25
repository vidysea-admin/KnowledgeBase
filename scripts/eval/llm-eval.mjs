/**
 * scripts/eval/llm-eval.mjs - U0.10 real-LLM ScoreFn plumbing shared by eval-recall.mjs and eval-calibration.mjs.
 * Opt-in only (`--llm`); without it neither script touches this file. The pairwise answer judge (bottom of file, D4/D-227) is opt-in too:
 * it runs only when this file is executed with `--pairwise` (and `--llm`, `--max-calls`). Spend approved by D-164 (Ollama Cloud first, Gemini last).
 *
 * The scorer is apps/api's `createLlmScorer` (the production evaluator judge prompt, jobKind "evaluator"), routed through
 * @lkb/ai `complete` with an explicit one-provider chain. No scoring policy is invented here: the prompt, the 0-1 scale and the
 * reference scores (1.0 own session / 0.0 other session) are the existing ones from score.ts and qa/contracts/evaluator-calibration.md.
 * OLLAMA_BASE_URL is NEVER read or written: the cloud base URL is passed to the provider instance used by this process only.
 * Writes no Mongo and no job rows (the router's `write` is a no-op).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// ---------------------------------------------------------------------------------------------------------------------
// D4 pairwise judge (D-227): "two model judges, blind and order-swapped; output = win rate with a confidence interval".
// Answer-against-answer (the scorer above ranks retrieval, not answers). Side A vs side B are opaque labels: which side is
// the AI and which is the human is known only to whoever builds the items file; it never reaches a prompt. Model access is
// the SAME seam as above: createEvalComplete -> complete(job); the judge call itself is injectable so tests use stubs.
// ---------------------------------------------------------------------------------------------------------------------
export const WILSON_METHOD = "Wilson score interval, 95% (z = 1.96), on side-A wins over decided items (A + B)";

const PAIRWISE_SYSTEM_PROMPT = [
  "You are an impartial judge of answers given to a student's question.",
  "Two answers are shown, labelled Answer 1 and Answer 2.",
  "Decide which answer serves the student better: it is correct and specific, directly addresses the question,",
  "does not invent facts, and is clear and complete enough to act on.",
  "Do not prefer an answer because of its length, its style, or its position.",
  "Respond with ONLY a JSON object: {\"winner\": 1} or {\"winner\": 2}, plus a one-sentence \"reason\".",
].join(" ");

/**
 * The blind prompt. Reads ONLY question, answerA, answerB from the item: id, source, session, speaker and any other
 * field are never forwarded. `swapped` puts answerB in position 1.
 */
export function buildPairwisePrompt(item, swapped = false) {
  const [first, second] = swapped ? [item.answerB, item.answerA] : [item.answerA, item.answerB];
  return { system: PAIRWISE_SYSTEM_PROMPT, user: `Question: ${item.question}\n\nAnswer 1:\n${first}\n\nAnswer 2:\n${second}` };
}

/** 1 or 2 from a judge reply, else undefined. Accepts {"winner": 1|2|"1"|"2"} (optionally fenced) or a bare "1"/"2"/"Answer 1". Prose is undefined. */
export function parsePairwiseChoice(text) {
  if (typeof text !== "string") return undefined;
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      const w = JSON.parse(obj[0])?.winner;
      if (w === 1 || w === 2) return w;
      if (w === "1" || w === "2") return Number(w);
    } catch { /* fall through to the bare-token form */ }
    return undefined;
  }
  const bare = text.match(/^\s*(?:answer\s*)?([12])\s*\.?\s*$/i);
  return bare ? Number(bare[1]) : undefined;
}

/** Wilson score interval for k successes in n. n = 0 -> every number null (undefined, never a default 50%). */
export function wilsonInterval(k, n, z = 1.96) {
  if (n === 0) return { rate: null, low: null, high: null, n: 0, k: 0, method: WILSON_METHOD };
  const p = k / n, z2 = z * z, denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom, half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { rate: p, low: k === 0 ? 0 : Math.max(0, centre - half), high: k === n ? 1 : Math.min(1, centre + half), n, k, method: WILSON_METHOD };
}

const ratio = (k, n) => ({ rate: n === 0 ? null : k / n, k, n });

export function validatePairwiseItems(items) {
  if (!Array.isArray(items)) throw new Error("pairwise items must be a JSON array (or {\"items\": [...]})");
  const seen = new Set();
  items.forEach((it, i) => {
    if (it === null || typeof it !== "object") throw new Error(`pairwise item ${i}: not an object`);
    if (typeof it.id !== "string" && typeof it.id !== "number") throw new Error(`pairwise item ${i}: id must be a string or number`);
    for (const f of ["question", "answerA", "answerB"])
      if (typeof it[f] !== "string" || it[f].trim() === "") throw new Error(`pairwise item ${i} (${it.id}): ${f} must be a non-empty string`);
    if (seen.has(it.id)) throw new Error(`pairwise item ${i}: duplicate id ${it.id}`);
    seen.add(it.id);
  });
  return items;
}

export function loadPairwiseItems(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return validatePairwiseItems(Array.isArray(raw) ? raw : raw?.items);
}

/**
 * One (item, judge): ask twice, answers in opposite order. A or B only when both orders agree; disagreement is
 * `inconsistent` (counted as a tie). A throw or an unparseable reply in either order is `error`, never a win; the second
 * call is not made once the first has failed (no spend on an already-errored pair).
 */
export async function judgePair(item, judge) {
  const orders = [];
  for (const swapped of [false, true]) {
    let text;
    try { text = await judge.call(buildPairwisePrompt(item, swapped)); }
    catch (e) { return { verdict: "error", orders, detail: `judge call failed: ${e instanceof Error ? e.message : String(e)}` }; }
    const choice = parsePairwiseChoice(text);
    if (choice === undefined) return { verdict: "error", orders, detail: `unparseable judge reply: ${JSON.stringify(String(text).slice(0, 120))}` };
    orders.push((choice === 1) === !swapped ? "A" : "B");
  }
  return { verdict: orders[0] === orders[1] ? orders[0] : "inconsistent", orders };
}

const emptyCounts = () => ({ A: 0, B: 0, tie: 0, inconsistent: 0, error: 0 });

/** Counts for a list of verdicts. inconsistent and error are their own buckets (D4J-C4), never folded into `tie`. */
function tally(verdicts) {
  const c = emptyCounts();
  for (const v of verdicts) c[v]++;
  return c;
}

/**
 * Combined per item, in this precedence: error if either judge errored; else inconsistent if either judge was position-inconsistent;
 * else A or B when both judges chose that side; else tie (the judges chose opposite sides).
 */
function combine(v1, v2) {
  if (v1 === "error" || v2 === "error") return "error";
  if (v1 === "inconsistent" || v2 === "inconsistent") return "inconsistent";
  return v1 === v2 ? v1 : "tie";
}

export const WIN_RATE_DENOMINATOR = "A + B: items decided by both orders (and, for combined, by both judges on the same side); inconsistent and error items are excluded from numerator and denominator and reported separately; combined ties (judges chose opposite sides) are also excluded";
export const PAIRWISE_NOTES = [
  "answer text is passed verbatim and unscrubbed: names, titles, citations and style cues inside an answer are content under judgement; style cues can unblind a judge, and this run does not strip them",
];

/** Runs every item through both judges (sequential, deterministic) and builds the report. */
export async function runPairwise(items, judges, opts = {}) {
  validatePairwiseItems(items);
  const modelOf = (j) => j.model ?? j.name;
  if (!Array.isArray(judges) || judges.length !== 2 || judges[0].name === judges[1].name || modelOf(judges[0]) === modelOf(judges[1]))
    throw new Error("pairwise needs exactly two distinct judges (distinct model ids; one model run twice is refused)");
  const [j1, j2] = judges;
  const am = opts.answerModels;
  const answerModels = am && (am.A || am.B) ? { A: am.A ?? null, B: am.B ?? null } : null;
  const overlap = answerModels ? [modelOf(j1), modelOf(j2)].filter((m) => m === answerModels.A || m === answerModels.B) : [];
  const per = { [j1.name]: [], [j2.name]: [] };
  const rows = [];
  for (const it of items) {
    const r1 = await judgePair(it, j1), r2 = await judgePair(it, j2);
    per[j1.name].push({ id: it.id, ...r1 });
    per[j2.name].push({ id: it.id, ...r2 });
    const c = combine(r1.verdict, r2.verdict);
    rows.push({ id: it.id, combined: c, verdicts: { [j1.name]: r1.verdict, [j2.name]: r2.verdict } });
  }
  const lowDecisive = (c, n) => n > 0 && (c.A + c.B) * 2 < n;   // D4J-C4: fewer than half the items decided
  const winRate = (c) => ({ ...wilsonInterval(c.A, c.A + c.B), denominator: WIN_RATE_DENOMINATOR });
  const judgeReport = (j) => {
    const list = per[j.name], counts = tally(list.map((x) => x.verdict));
    return { counts, winRate: winRate(counts), lowDecisive: lowDecisive(counts, list.length), inconsistencyRate: ratio(counts.inconsistent, list.length - counts.error),
      ...(j.stats ? { calls: callSummary(j.stats, j.caps ?? {}) } : {}), items: list };
  };
  const combinedCounts = tally(rows.map((r) => r.combined));
  const both = rows.filter((r) => ["A", "B"].includes(r.verdicts[j1.name]) && ["A", "B"].includes(r.verdicts[j2.name]));
  const jr = [judgeReport(j1), judgeReport(j2)];
  return {
    method: {
      design: "blind pairwise; two judges; each (item, judge) asked twice with the answers in opposite order; A or B only when both orders agree",
      winRate: WILSON_METHOD,
      combined: "per item, in this precedence: error if either judge errored; else inconsistent if either judge was position-inconsistent; else A or B when both judges chose that side; else tie (opposite sides)",
      denominator: WIN_RATE_DENOMINATOR,
      lowDecisive: "labelled low-decisive when fewer than half of the items are decided (A + B < n / 2)",
      agreement: "share of items where both judges returned a decisive verdict (A or B) and it is the same side",
      inconsistencyRate: "inconsistent / (items - errors), pooled over both judges",
    },
    n: items.length,
    judgeModels: [modelOf(j1), modelOf(j2)],
    answerModels,
    judgeIsAnsweringModel: overlap,
    notes: [...PAIRWISE_NOTES, ...(overlap.length ? ["a judge is identical to an answering model (reported, not a failure)"] : [])],
    judges: { [j1.name]: jr[0], [j2.name]: jr[1] },
    combined: { counts: combinedCounts, winRate: winRate(combinedCounts), lowDecisive: lowDecisive(combinedCounts, items.length) },
    agreement: ratio(both.filter((r) => r.verdicts[j1.name] === r.verdicts[j2.name]).length, both.length),
    disagreementRate: ratio(both.filter((r) => r.verdicts[j1.name] !== r.verdicts[j2.name]).length, both.length),
    inconsistencyRate: ratio(jr[0].counts.inconsistent + jr[1].counts.inconsistent, jr[0].items.length + jr[1].items.length - jr[0].counts.error - jr[1].counts.error),
    items: rows.map(({ id, combined, verdicts }) => ({ id, combined, verdicts })),
  };
}

const pct = (x) => (x === null ? "undefined" : `${(x * 100).toFixed(1)}%`);
const rateLine = (w) => (w.rate === null ? "undefined (no decided items)" : `${pct(w.rate)} [95% CI ${pct(w.low)} to ${pct(w.high)}] over ${w.n} decided`);
const countsLine = (c) => `A ${c.A} / B ${c.B} / tie ${c.tie} / inconsistent ${c.inconsistent} / error ${c.error}`;

export function formatPairwiseSummary(report) {
  const lines = [`pairwise judge: ${report.n} item(s); judge models: ${report.judgeModels.join(", ")}${report.answerModels ? `; answer models: A ${report.answerModels.A ?? "?"}, B ${report.answerModels.B ?? "?"}` : ""}`];
  if (report.judgeIsAnsweringModel.length) lines.push(`  NOTE: judge identical to an answering model: ${report.judgeIsAnsweringModel.join(", ")}`);
  const low = (x) => (x.lowDecisive ? " [low-decisive: fewer than half the items decided]" : "");
  for (const [name, j] of Object.entries(report.judges)) lines.push(`  judge ${name}: ${countsLine(j.counts)}; win rate of A ${rateLine(j.winRate)}; position-inconsistency ${pct(j.inconsistencyRate.rate)}${low(j)}`);
  lines.push(`  combined: ${countsLine(report.combined.counts)}; win rate of A ${rateLine(report.combined.winRate)}${low(report.combined)}`);
  lines.push(`  win-rate denominator: ${report.method.denominator}`);
  lines.push(`  combined rule: ${report.method.combined}`);
  lines.push(`  judge agreement: ${pct(report.agreement.rate)} (${report.agreement.k}/${report.agreement.n} items with two decisive verdicts)`);
  lines.push(`  position-inconsistency (pooled): ${pct(report.inconsistencyRate.rate)} (${report.inconsistencyRate.k}/${report.inconsistencyRate.n})`);
  lines.push(`  judge disagreement: ${pct(report.disagreementRate.rate)} (${report.disagreementRate.k}/${report.disagreementRate.n})`);
  lines.push(`  CI method: ${report.method.winRate}`);
  for (const n of report.notes) lines.push(`  NOTE: ${n}`);
  return lines.join("\n");
}

/**
 * File mode: items JSON in, report JSON out (+ printed summary text). An existing output file is never overwritten (D4J-I2);
 * the refusal comes before any judge call. Answering models come from opts.answerModels or the file's top-level `answerModels`.
 */
export async function runPairwiseFile(inPath, judges, outPath, redact = (t) => t, opts = {}) {
  if (existsSync(outPath)) throw new Error(`refused: output file already exists and is never overwritten: ${outPath} (choose another --out)`);
  const raw = JSON.parse(readFileSync(inPath, "utf8"));
  const report = await runPairwise(loadPairwiseItems(inPath), judges, { answerModels: opts.answerModels ?? raw?.answerModels });
  return { report, summary: formatPairwiseSummary(report), path: writeResults(outPath, report, redact) };
}

/**
 * A real judge over the existing `complete(job)` seam (createEvalComplete). Same job kind and cap rule as createLlmScoreFn:
 * the cap is checked BEFORE each call and the capped call is never sent. Returns the reply text; parsing is runPairwise's job.
 */
export function createPairwiseJudge(name, complete, caps, now = () => performance.now(), model = undefined) {
  const stats = { calls: 0, ok: 0, failed: 0, fallbacks: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, latenciesMs: [], errors: [], capReached: false };
  const call = async ({ system, user }) => {
    if (capHit(caps, stats)) { stats.capReached = true; throw new CapReached("call/cost cap reached; call not sent"); }
    const t0 = now();
    stats.calls++;
    try {
      const r = await complete({ kind: "evaluator", messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      stats.latenciesMs.push(now() - t0);
      stats.ok++;
      stats.costUsd += r.costUsd ?? 0;
      stats.inputTokens += r.usage?.inputTokens ?? 0;
      stats.outputTokens += r.usage?.outputTokens ?? 0;
      return r.text;
    } catch (e) {
      stats.latenciesMs.push(now() - t0);
      stats.failed++;
      if (stats.errors.length < 5) stats.errors.push(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  return { name, model, call, stats, caps };
}

/**
 * `--pairwise <items.json> --llm --judge-1 <provider:model> --judge-2 <provider:model> --max-calls <n> [--base-url u] [--out file]
 *  [--answer-model-a <id>] [--answer-model-b <id>]`. Same opt-in gate as the other modes (D-164): --llm and --max-calls are required,
 * each judge is validated by the unchanged parseLlmArgs (keys, provider, positive cap). `--max-calls` is the TOTAL for the run.
 */
export function parsePairwiseArgs(argv, env = {}) {
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv.includes("--pairwise")) return { pairwise: false };
  const o = { pairwise: true, file: val("--pairwise"), out: val("--out"), answerModels: { A: val("--answer-model-a"), B: val("--answer-model-b") }, maxCalls: val("--max-calls") === undefined ? undefined : Number(val("--max-calls")) };
  const bad = (m) => ({ ...o, error: `refused: ${m}` });
  if (!o.file || o.file.startsWith("--")) return bad("--pairwise requires an items JSON file");
  if (!argv.includes("--llm")) return bad("--pairwise sends content to a model and needs the opt-in --llm flag (D-164)");
  const judges = [];
  for (const flag of ["--judge-1", "--judge-2"]) {
    const spec = val(flag);
    if (!spec) return bad(`${flag} <provider:model> is required`);
    const m = spec.match(/^([^:]+):(.+)$/);
    if (!m) return bad(`${flag} must be provider:model, e.g. ollama:glm-5.3-flash`);
    judges.push({ provider: m[1], model: m[2], spec });
  }
  if (judges[0].model === judges[1].model) return bad("--judge-1 and --judge-2 must have distinct model ids (one model run twice is refused)");
  if (o.maxCalls === undefined) return bad("--max-calls <n> is required (total for the run)");
  const parsed = judges.map((j) => parseLlmArgs(["--llm", "--model", j.model, "--provider", j.provider, "--max-calls", String(o.maxCalls), ...(val("--base-url") ? ["--base-url", val("--base-url")] : [])], env));
  const err = parsed.find((p) => p.error);
  if (err) return bad(err.error.replace(/^refused: /, ""));
  return { ...o, judges: parsed.map((p, i) => ({ ...p, spec: judges[i].spec })) };
}

/** CLI entry: only runs when this file is executed directly (importing it never starts a run). */
export async function pairwiseMain(argv, env = process.env) {
  const a = parsePairwiseArgs(argv, env);
  if (!a.pairwise) { console.error("usage: node scripts/eval/llm-eval.mjs --pairwise <items.json> --llm --judge-1 <provider:model> --judge-2 <provider:model> --max-calls <n> [--base-url <url>] [--out <file>]"); return 2; }
  if (a.error) { console.error(a.error); return 2; }
  const items = loadPairwiseItems(a.file);
  const planned = items.length * a.judges.length * 2;
  if (planned > a.maxCalls) { console.error(`refused: ${planned} calls planned (${items.length} items x ${a.judges.length} judges x 2 orders) exceed --max-calls ${a.maxCalls}`); return 2; }
  const out = a.out ? resolve(a.out) : join(RESULTS_DIR, `pairwise-${new Date().toISOString().slice(0, 10)}.json`);
  if (existsSync(out)) { console.error(`refused: output file already exists and is never overwritten: ${out} (choose another --out)`); return 2; }
  const judges = [];
  // D-164 provider order: Ollama Cloud first, Gemini last. Each judge is capped at its own planned calls, so the total never exceeds --max-calls.
  for (const o of [...a.judges].sort((x, y) => (x.provider === "gemini") - (y.provider === "gemini")))
    judges.push(createPairwiseJudge(o.spec, await createEvalComplete(o, env), { maxCalls: items.length * 2 }, undefined, o.model));
  const { summary, path } = await runPairwiseFile(a.file, judges, out, redactor([env.OLLAMA_API_KEY, env.GEMINI_API_KEY].filter(Boolean)), { answerModels: a.answerModels });
  console.log(`${summary}\nreport: ${path}`);
  return 0;
}

if (process.argv.includes("--pairwise") && process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = await pairwiseMain(process.argv.slice(2));
