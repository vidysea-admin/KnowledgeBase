// qa/probes/golden-set-condition3.mjs — T-021 condition 3.
//
// WHY THIS EXISTS. `qa/gates/golden-set-redesign.md` (Option C) makes condition 3 a PRECONDITION on
// reporting a recall number: the two leakage diagnostics "must be re-run on any regenerated set
// BEFORE its recall number is reported" (`scripts/eval/golden-set-diagnostics.mjs` header, verbatim).
//
// They were run — on a 75-question set that scored recall@5 0.307. THE OPERATIVE SET IS A DIFFERENT
// ONE: `data/eval/golden-set.json` holds 92 questions generated 2026-09-08T09:01 (kept 92,
// rejected 0), and all three current reports score against it — heuristic 0.391, vector 0.935,
// hybrid 0.870. `scripts/gen-golden-set.mjs` writes the set and the reject list and nothing else,
// and no file under `data/eval/` contains a pin rate. So three recall numbers, including one this
// maker shipped and cited in a PASSed unit, rest on a set whose leakage was never measured.
//
// READ-ONLY and offline: pure functions over files already on disk. No model, no network, no
// writes outside the report path — so the checker can reproduce it exactly.
//
// Run: node qa/probes/golden-set-condition3.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagnose, tokenize } from "../../scripts/eval/golden-set-diagnostics.mjs";
import { loadCorpora, buildPinTokens } from "../../scripts/eval/golden-set-build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SET_PATH = join(ROOT, "data", "eval", "golden-set.json");
const OUT_PATH = join(ROOT, "data", "eval", "golden-set-diagnostics.json");

// THE GATE'S OWN NUMBERS, and which corpus each was measured on — the distinction cycle 1 missed.
// `qa/verdicts/golden-set-regeneration.md:232` states both prior overlaps on one line: "mean 0.071
// against the scored corpus, 0.164 against turns". The 63% and 9.3% pin rates are TURNS-corpus.
const BASELINE = {
  leaky46: { turnsPinRate: 0.63, pagePinRateAnalogue: 1.0, note: "the set ISS-071 called unfalsifiable" },
  prior75: { turnsPinRate: 0.093, pageOverlapMean: 0.071, turnsOverlapMean: 0.164 },
};

const questions = JSON.parse(readFileSync(SET_PATH, "utf8"));
const { turnsText, pageText } = loadCorpora();

// TWO SEPARATE MEASUREMENTS, one per corpus. Cycle 1 reported a max(page,turns) overlap beside a
// page-only prior and a page-corpus pin rate beside turns-corpus baselines, which manufactured a
// "2.3x overlap regression" that does not exist (ISS-224). Measured like-for-like there is none.
const dPage = diagnose(questions, pageText);    // scored corpus: session_page summary + keyInsights
const dTurns = diagnose(questions, turnsText);  // raw transcripts: what 63% and 9.3% were measured on

// THE FORCED ZERO (ISS-225). `buildPinTokens` is not an independent oracle here: the operative set
// is the OUTPUT of `refilter()` (commit 6055634), whose keep-predicate `judgeCandidate` IS this
// same function. Re-applying a filter to its own output rejects nothing by construction, so 0/92
// carries no information about leakage — it restates the filter. Cycle 1 verified the denominator
// was non-empty (159 real tokens) and mistook that for verifying the measurement. Kept and
// LABELLED rather than deleted, because "0/92, forced" is the honest form of the number.
const correctedPins = buildPinTokens(turnsText, pageText);
const forcedRows = questions.map((q) => {
  // tokenize() — the same splitter the pin map was built with. Cycle 1 used its own regex here
  // (ISS-226); measured, both give 0/92 with zero per-question disagreement, but two tokenizers
  // for one lookup is a latent defect and there is no reason to keep it.
  const hit = [...new Set(tokenize(q.question))].find((t) => correctedPins.get(t) === q.expectedSessionId);
  return { id: q.id, pinned: hit !== undefined, token: hit ?? null };
});
const forcedPinned = forcedRows.filter((r) => r.pinned);

const report = {
  measuredAt: new Date().toISOString(),
  goldenSet: "data/eval/golden-set.json",
  questions: dPage.total,
  sessions: pageText.size,
  scoredCorpus: "session_page.json (summary + keyInsights) — what retrieval scores against",
  sourceCorpus: "data/toc-migrated/<id>/turns.json — what the questions were generated from",

  // THE GATE-COMPARABLE MEASUREMENT. 63% and 9.3% are turns-corpus, so this is the row that may be
  // set beside them.
  gateComparable: {
    corpus: "raw transcripts (~218k words)",
    pinnedCount: dTurns.pinnedCount,
    pinRate: dTurns.pinRate,
    uniqueTokenCount: dTurns.uniqueTokenCount,
    vsLeakyBaseline: BASELINE.leaky46.turnsPinRate,
    vsPrior75: BASELINE.prior75.turnsPinRate,
    overlapMean: dTurns.meanVerbatimOverlap,
    overlapMax: dTurns.maxVerbatimOverlap,
    priorOverlapMean: BASELINE.prior75.turnsOverlapMean,
  },

  pageCorpus: {
    corpus: "session_page text (~3.1k words)",
    pinnedCount: dPage.pinnedCount,
    pinRate: dPage.pinRate,
    caveat:
      "NOT comparable to the 63% baseline, which is turns-corpus. The page-corpus analogue of the " +
      "leaky 46-question set is 100%, not 63%. Chance uniqueness dominates at this corpus size: " +
      "the pinning tokens are you, should, will, people, paths, skills, living.",
    overlapMean: dPage.meanVerbatimOverlap,
    overlapMax: dPage.maxVerbatimOverlap,
    priorOverlapMean: BASELINE.prior75.pageOverlapMean,
  },

  forcedZero: {
    pinnedCount: forcedPinned.length,
    uniqueTokenCount: correctedPins.size,
    forced: true,
    why:
      "the operative set is the output of refilter() (6055634) whose keep-predicate IS " +
      "buildPinTokens, so re-applying it rejects 0 by construction. Carries no information about " +
      "leakage; it restates the filter.",
  },

  nearVerbatimAtOrAbove0_8: { page: dPage.nearVerbatim, turns: dTurns.nearVerbatim },
  baselines: BASELINE,
  pagePinnedQuestions: dPage.rows.filter((r) => r.pinned).map((r) => ({ id: r.id, token: r.pinToken })),
  turnsPinnedQuestions: dTurns.rows.filter((r) => r.pinned).map((r) => ({ id: r.id, token: r.pinToken })),
  highestOverlap: [...dTurns.rows].sort((a, b) => b.overlap - a.overlap).slice(0, 5)
    .map((r) => ({ id: r.id, overlap: Number(r.overlap.toFixed(4)) })),
};

console.log(`golden set: ${report.questions} questions over ${report.sessions} sessions`);
console.log("");
console.log("GATE-COMPARABLE (turns corpus — the one 63% and 9.3% were measured on):");
console.log(`  unique-token pin  ${dTurns.pinnedCount}/${dTurns.total} = ${(dTurns.pinRate * 100).toFixed(1)}%   (leaky 46-set 63.0%, prior 75-set 9.3%)`);
console.log(`  verbatim overlap  mean ${dTurns.meanVerbatimOverlap.toFixed(4)}  max ${dTurns.maxVerbatimOverlap.toFixed(4)}  (prior 75-set mean 0.164)`);
console.log("");
console.log("PAGE CORPUS (NOT comparable to 63% — its analogue on the leaky set is 100%):");
console.log(`  unique-token pin  ${dPage.pinnedCount}/${dPage.total} = ${(dPage.pinRate * 100).toFixed(1)}%   — chance uniqueness at ~3.1k words`);
console.log(`  verbatim overlap  mean ${dPage.meanVerbatimOverlap.toFixed(4)}  max ${dPage.maxVerbatimOverlap.toFixed(4)}  (prior 75-set mean 0.071)`);
console.log("");
console.log(`near-verbatim (>=0.8): page ${dPage.nearVerbatim}, turns ${dTurns.nearVerbatim}`);
console.log(`FORCED zero: ${forcedPinned.length}/${dPage.total} from a ${correctedPins.size}-token map — the set IS refilter()'s output, so this restates the filter`);
console.log(`turns-corpus pinning tokens: ${report.turnsPinnedQuestions.map((p) => p.token).join(", ") || "(none)"}`);

if (process.argv.includes("--write")) {
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT_PATH}`);
} else {
  console.log("(dry run — pass --write to persist the report)");
}
