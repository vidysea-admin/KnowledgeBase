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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(ROOT, "data", "toc-migrated");
const CALIBRATION_SET_PATH = join(ROOT, "data", "eval", "evaluator-calibration-set.json");
const REPORT_PATH = join(ROOT, "data", "eval", "calibration-report.json");

register();

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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
