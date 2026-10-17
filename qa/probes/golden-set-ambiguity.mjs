// qa/probes/golden-set-ambiguity.mjs — T-021, the sibling-session ambiguity half of condition 4.
//
// WHAT THE GATE RECORDS. `qa/gates/golden-set-redesign.md`: "An independent read of 12 questions
// found ~4 genuinely answerable by more than one session, driven by seven identically-formatted
// `uniaccess-*` sessions — e.g. *'is the university in the city or a secluded campus?'* is answered
// by all of them." 12 of 92 read by hand, and condition 4 is blocked on it.
//
// WHAT THIS MEASURES. "Genuinely answerable by more than one session" is SEMANTIC and no
// deterministic script decides it. What is measurable is LEXICAL NON-DISCRIMINATION: whether a
// question's distinguishing vocabulary sits in the target's transcript any more than in its
// siblings'. A proxy in BOTH directions — a session can share the vocabulary without answering, and
// answer without sharing it.
//
// CYCLE 2 — four defects the cycle-1 checker found, all of them in this file:
//
//   ISS-234  The known positive was pinned to the WRONG QUESTION. `gq01` is "support for students
//            looking for internships"; the gate's example is `gq02`, "city or a secluded campus?".
//            The shipped JSON carried gq01's id and text under gq02's justification, so the
//            contradiction was already on disk. Worse, gq01 ranked 21 not because siblings answer
//            it but because its own transcript lacks `support` and `looking` — it passed for an
//            unrelated reason, which is the accidental known-positive this test exists to prevent.
//            Now pinned to gq02, and the result is reported WHATEVER it turns out to be.
//
//   ISS-235  `coverage()` had no length normalisation, so short transcripts scored low on every
//            question and their questions floated to the tail: 6 of 13 came from the two shortest
//            sessions. Each session's own mean coverage is now subtracted, so what is ranked is a
//            session's advantage on THIS question against its own baseline.
//
//   ISS-236  `1/df` is not IDF. It floors at 1/23, so four words present in all 23 sessions still
//            carried 36% of the weight mass — the generic vocabulary a stopword list exists to
//            suppress was not being suppressed. Now `log(N/df)`, which reaches exactly zero at
//            df = N. The cycle-1 claim that this replaced a stopword list was therefore wrong.
//
//   ISS-237  The cluster claim was argued from the binary statistic this same file calls unusable,
//            and it REVERSES on the usable one. Restated from rank below.
//
// READ-ONLY, offline, pure over files already on disk.
// Run: node qa/probes/golden-set-ambiguity.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../../scripts/eval/golden-set-diagnostics.mjs";
import { loadCorpora } from "../../scripts/eval/golden-set-build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SET_PATH = join(ROOT, "data", "eval", "golden-set.json");
const OUT_PATH = join(ROOT, "data", "eval", "golden-set-ambiguity.json");

/** The gate's worked example, verbatim: "Is the university located right in the city or is it more
 *  of a secluded campus?" — that is gq02, NOT gq01 (ISS-234). */
const KNOWN_POSITIVE = "2026-05-23-uniaccess-atlas-skilltech-gq02";

const questions = JSON.parse(readFileSync(SET_PATH, "utf8"));
const { turnsText } = loadCorpora();
const sessionIds = [...turnsText.keys()];
const N = sessionIds.length;
const sessionTokens = new Map(sessionIds.map((id) => [id, new Set(tokenize(turnsText.get(id)))]));

/** Sessions containing each token. */
const df = new Map();
for (const toks of sessionTokens.values()) {
  for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
}

/** Real IDF (ISS-236): exactly zero for a word in every session, maximal for a word in one. */
const idf = (t) => Math.log(N / df.get(t));

/** IDF-weighted share of a question's distinguishing vocabulary present in one session. */
function rawCoverage(qTokens, sessionId) {
  const toks = sessionTokens.get(sessionId);
  let hit = 0, total = 0;
  for (const t of qTokens) {
    const d = df.get(t);
    if (d === undefined) continue;   // absent from every transcript: no discriminating signal either way
    const w = idf(t);
    total += w;
    if (toks.has(t)) hit += w;
  }
  return total === 0 ? 0 : hit / total;
}

// Raw coverage for every (question, session) pair, then each session's own mean across all
// questions — its baseline (ISS-235). A short transcript scores low on everything; subtracting its
// baseline asks the question that matters: does this session do better THAN ITSELF here?
const qTokenSets = questions.map((q) => new Set(tokenize(q.question)));
const raw = questions.map((_, qi) => new Map(sessionIds.map((id) => [id, rawCoverage(qTokenSets[qi], id)])));
const sessionBaseline = new Map(
  sessionIds.map((id) => [id, raw.reduce((a, m) => a + m.get(id), 0) / (raw.length || 1)]),
);

const rows = questions.map((q, qi) => {
  const scored = sessionIds
    .map((id) => ({ id, adv: raw[qi].get(id) - sessionBaseline.get(id), cov: raw[qi].get(id) }))
    .sort((a, b) => b.adv - a.adv);
  const mine = scored.find((s) => s.id === q.expectedSessionId);
  const rivals = scored.filter((s) => s.id !== q.expectedSessionId && s.adv >= (mine?.adv ?? 0));
  return {
    id: q.id,
    expectedSessionId: q.expectedSessionId,
    advantage: Number((mine?.adv ?? 0).toFixed(4)),
    rawCoverage: Number((mine?.cov ?? 0).toFixed(4)),
    rank: scored.findIndex((s) => s.id === q.expectedSessionId) + 1,
    rivalCount: rivals.length,
    topRival: rivals[0] ? { id: rivals[0].id, adv: Number(rivals[0].adv.toFixed(4)) } : null,
    contested: rivals.length > 0,
  };
});

// The binary flag stays UNUSABLE, reported only so it is not recomputed and believed. Cycle 1's
// explanation for it was ALSO wrong: "ties" accounts for the rate, not the direction — the checker
// showed a strict `>` keeps the cluster inversion intact.
const contested = rows.filter((r) => r.contested);

const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
const median = ranks[Math.floor(ranks.length / 2)];
const rankAt = (n) => rows.filter((r) => r.rank <= n).length;
const TAIL_RANK = 10;
const tail = rows.filter((r) => r.rank >= TAIL_RANK).sort((a, b) => b.rank - a.rank);

const known = rows.find((r) => r.id === KNOWN_POSITIVE);
const knownFlagged = Boolean(known && known.rank >= TAIL_RANK);

const uni = rows.filter((r) => r.expectedSessionId.includes("uniaccess"));
const nonUni = rows.filter((r) => !r.expectedSessionId.includes("uniaccess"));
const meanRank = (a) => (a.length ? a.reduce((s, r) => s + r.rank, 0) / a.length : 0);
const tailShare = (a) => (a.length ? a.filter((r) => r.rank >= TAIL_RANK).length / a.length : 0);

// Transcript lengths, so a length artifact in the tail is visible rather than inferred (ISS-235).
const lengths = new Map(sessionIds.map((id) => [id, sessionTokens.get(id).size]));
const sortedByLen = [...lengths.entries()].sort((a, b) => a[1] - b[1]);
const shortestTwo = new Set(sortedByLen.slice(0, 2).map(([id]) => id));

const report = {
  measuredAt: new Date().toISOString(),
  goldenSet: "data/eval/golden-set.json",
  measures: "lexical non-discrimination: IDF-weighted coverage minus each session's own baseline",
  doesNotMeasure: "semantic answerability — a proxy in BOTH directions, not a bound",
  knownPositive: {
    id: KNOWN_POSITIVE,
    question: questions.find((q) => q.id === KNOWN_POSITIVE)?.question ?? null,
    why: "the gate's own worked example, stated to be answerable by all seven uniaccess sessions",
    flagged: knownFlagged,
    rank: known?.rank ?? null,
    rivalCount: known?.rivalCount ?? null,
    interpretation: knownFlagged
      ? "the measure fires on the one case whose answer is independently known"
      : "THE MEASURE DOES NOT DETECT THE GATE'S OWN EXAMPLE. Every other number here is a lexical " +
        "observation, not evidence about ambiguity, and the tail is a candidate list to read rather " +
        "than a finding.",
  },
  headline: { rank1: rankAt(1), rankTop3: rankAt(3), medianRank: median, sessions: N },
  byCluster: {
    // ISS-237: restated from RANK — the usable signal — not from the unusable binary.
    uniaccess: { questions: uni.length, meanRank: Number(meanRank(uni).toFixed(2)), tailShare: Number(tailShare(uni).toFixed(4)) },
    other: { questions: nonUni.length, meanRank: Number(meanRank(nonUni).toFixed(2)), tailShare: Number(tailShare(nonUni).toFixed(4)) },
  },
  unusableBinary: {
    contested: contested.length,
    contestedRate: Number((contested.length / rows.length).toFixed(4)),
    whyUnusable: "fires on ties; cycle 1 also mis-explained it — a strict '>' keeps the cluster inversion",
  },
  tailForAdjudication: {
    thresholdRank: TAIL_RANK,
    count: tail.length,
    fromTwoShortestTranscripts: tail.filter((r) => shortestTwo.has(r.expectedSessionId)).length,
    ids: tail.map((r) => ({ id: r.id, rank: r.rank, rivals: r.rivalCount })),
  },
  transcriptLengths: Object.fromEntries(sortedByLen.map(([id, n]) => [id, n])),
  rows,
};

console.log(`golden set: ${rows.length} questions over ${N} sessions`);
console.log("");
console.log(`KNOWN POSITIVE — ${KNOWN_POSITIVE}`);
console.log(`  "${report.knownPositive.question}"`);
console.log(`  rank ${known?.rank}/${N}, rivals ${known?.rivalCount}  ->  ${knownFlagged ? "FLAGGED" : "NOT FLAGGED"}`);
console.log(`  ${report.knownPositive.interpretation}`);
console.log("");
console.log("RANK OF THE TARGET SESSION:");
console.log(`  rank 1:    ${rankAt(1)}/${rows.length} = ${((rankAt(1) / rows.length) * 100).toFixed(1)}%`);
console.log(`  rank <= 3: ${rankAt(3)}/${rows.length} = ${((rankAt(3) / rows.length) * 100).toFixed(1)}%`);
console.log(`  median rank ${median} of ${N}`);
console.log("");
console.log("CLUSTER, from rank (ISS-237):");
console.log(`  uniaccess  mean rank ${report.byCluster.uniaccess.meanRank}  tail share ${(report.byCluster.uniaccess.tailShare * 100).toFixed(1)}%`);
console.log(`  other      mean rank ${report.byCluster.other.meanRank}  tail share ${(report.byCluster.other.tailShare * 100).toFixed(1)}%`);
console.log("");
console.log(`TAIL (rank >= ${TAIL_RANK}): ${tail.length} questions, ${report.tailForAdjudication.fromTwoShortestTranscripts} from the two shortest transcripts`);
for (const r of tail.slice(0, 13)) console.log(`  rank ${String(r.rank).padStart(2)}  ${r.id}`);

if (process.argv.includes("--write")) {
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\nwrote ${OUT_PATH}`);
} else {
  console.log("\n(dry run — pass --write to persist the report)");
}
