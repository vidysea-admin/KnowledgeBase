#!/usr/bin/env node
/**
 * scripts/eval/gen-calibration-set.mjs — T-022 C3. Derives `data/eval/evaluator-calibration-set.json`
 * from T-021's real `data/eval/golden-set.json`: for each of the first 15 golden questions, two
 * pairs — its own session (referenceScore 1.0, "clearly relevant") and a deliberately different
 * session (referenceScore 0.0, "clearly irrelevant") — at least 30 pairs total. Idempotent
 * (deterministic session-list order + fixed offset pairing).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN_SET_PATH = join(ROOT, "data", "eval", "golden-set.json");
const OUT_PATH = join(ROOT, "data", "eval", "evaluator-calibration-set.json");
const N_QUESTIONS = 15;

function main() {
  const golden = JSON.parse(readFileSync(GOLDEN_SET_PATH, "utf8"));
  const distinctSessions = [...new Set(golden.map((q) => q.expectedSessionId))].sort();
  const selected = golden.slice(0, N_QUESTIONS);

  const pairs = [];
  selected.forEach((q, i) => {
    pairs.push({
      id: `${q.id}-relevant`,
      query: q.question,
      sessionId: q.expectedSessionId,
      referenceScore: 1.0,
    });

    // A deliberately different session, chosen by a fixed offset so a re-run is deterministic.
    const otherIndex = (distinctSessions.indexOf(q.expectedSessionId) + 7) % distinctSessions.length;
    const otherSessionId = distinctSessions[otherIndex];
    pairs.push({
      id: `${q.id}-irrelevant`,
      query: q.question,
      sessionId: otherSessionId,
      referenceScore: 0.0,
    });
  });

  const outDir = dirname(OUT_PATH);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(pairs, null, 2) + "\n", "utf8");
  console.log(`wrote ${pairs.length} calibration pairs -> ${OUT_PATH}`);
}

main();
