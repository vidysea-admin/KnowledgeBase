#!/usr/bin/env node
/**
 * scripts/eval/eval-calibration.mjs — T-022 C4. Builds the real tree from `data/toc-migrated/*` (same
 * `tsx/esm/api` pattern as `scripts/eval-recall.mjs`), resolves each calibration-set pair's
 * `sessionId` to its tree node, runs `computeMAE` against the local heuristic scorer, prints MAE
 * + every pair's detail, writes `data/eval/calibration-report.json`. No live network call.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";
import { parseLlmArgs, redactor, createEvalComplete, createLlmScoreFn, calibrateLlm, limitByQuestion, callSummary, fallbackWarning, resultsPath, writeResults } from "./llm-eval.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const CALIBRATION_SET_PATH = join(ROOT, "data", "eval", "evaluator-calibration-set.json");
const REPORT_PATH = join(ROOT, "data", "eval", "calibration-report.json");

register();

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** U0.10 `--llm --model <id> --max-calls|--max-cost-usd <n> [--provider ollama|gemini] [--limit-questions N] [--out file]`. Never touches calibration-report.json. */
async function runLlm(allPairs, computeMAE) {
  await import("dotenv/config"); // keys stay in memory; never printed
  const o = parseLlmArgs(process.argv.slice(2), process.env);
  if (o.error) { console.error(o.error); process.exitCode = 2; return; }
  const redact = redactor([process.env.OLLAMA_API_KEY, process.env.GEMINI_API_KEY]);
  const pairs = limitByQuestion(allPairs, (p) => p.query, o.limitQuestions);
  const { scoreFn, stats } = await createLlmScoreFn(await createEvalComplete(o, process.env), o);
  const r = await calibrateLlm(pairs, scoreFn, computeMAE);
  const date = new Date().toISOString().slice(0, 10);
  const report = {
    kind: "calibration", date, generatedAt: new Date().toISOString(), model: o.model, provider: o.provider,
    baseUrl: o.provider === "ollama" ? o.baseUrl : undefined, jobKind: "evaluator",
    referenceSet: "data/eval/evaluator-calibration-set.json: DERIVED reference (own session 1.0 / other session 0.0), NOT human-hand-scored (qa/contracts/evaluator-calibration.md); an MAE here is a proxy, not the plan's final calibration",
    pairsSelected: pairs.length, pairsScored: r.n, pairsNotScored: r.notScored, limitQuestions: o.limitQuestions ?? null,
    summary: { mae: r.mae, n: r.n, heuristicFallbackPairs: r.fallbackIds },
    ...fallbackWarning(stats), calls: callSummary(stats, o), details: r.details,
  };
  const path = writeResults(resultsPath("calibration", o, date, o.limitQuestions !== undefined), report, redact);
  console.log(`llm calibration ${o.provider}/${o.model}: mae=${r.mae === null ? "n/a" : r.mae.toFixed(3)} over ${r.n}/${pairs.length} pairs, calls=${stats.calls} (ok ${stats.ok}, failed ${stats.failed}, fallbacks ${stats.fallbacks}), p50=${report.calls.latency.p50Ms ?? "n/a"}ms p95=${report.calls.latency.p95Ms ?? "n/a"}ms`);
  console.log(`wrote ${path}`);
}

async function main() {
  const { buildTree } = await import("../../packages/index/src/tree/build.ts");
  const { computeMAE } = await import("../../packages/ask/src/eval/calibration.ts");
  const { heuristicScorer } = await import("../../packages/ask/src/eval/heuristic-scorer.ts");

  const sessionDirs = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);

  const sessions = [];
  const sessionPages = [];
  for (const id of sessionDirs) {
    const sessionPath = join(DATA_DIR, id, "session.json");
    const pagePath = join(DATA_DIR, id, "session_page.json");
    if (existsSync(sessionPath)) sessions.push(loadJson(sessionPath));
    if (existsSync(pagePath)) sessionPages.push(loadJson(pagePath));
  }

  const roots = buildTree(sessions, sessionPages);
  const tenantId = sessions[0]?.tenantId;
  const tree = roots[tenantId];
  if (!tree) throw new Error(`eval-calibration: no tree built for tenantId "${tenantId}"`);

  const nodeBySessionId = new Map();
  (function collect(node) {
    if (node.level === "session" && node.evidence?.sessionRef) {
      nodeBySessionId.set(node.evidence.sessionRef, node);
    }
    for (const child of node.children) collect(child);
  })(tree);

  const calibrationSet = loadJson(CALIBRATION_SET_PATH);
  const pairs = calibrationSet
    .map((p) => {
      const node = nodeBySessionId.get(p.sessionId);
      if (!node) {
        console.warn(`skipping pair ${p.id}: no tree node for sessionId ${p.sessionId}`);
        return undefined;
      }
      return { id: p.id, query: p.query, node, referenceScore: p.referenceScore };
    })
    .filter((p) => p !== undefined);

  if (process.argv.includes("--llm")) return runLlm(pairs, computeMAE);
  const result = await computeMAE(pairs, heuristicScorer);

  console.log(`mae = ${result.mae.toFixed(3)} over ${result.n} pairs`);
  for (const d of result.details) {
    console.log(`  [${d.id}] predicted=${d.predicted.toFixed(3)} reference=${d.reference} absError=${d.absError.toFixed(3)}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scorer: "heuristic",
    mae: result.mae,
    n: result.n,
    details: result.details,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
