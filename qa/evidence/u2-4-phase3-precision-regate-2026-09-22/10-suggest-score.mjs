// 10-suggest-score.mjs -- scores run-results.<tag>.jsonl (09-suggest-regate.mts) against gold-labels.json.
//   node 10-suggest-score.mjs --tag <t>   -> measurement-summary.<t>.json (opened 'wx') + a console table
// Tiers: "final" = the auto-final `resolved` list (includes deterministic-floor entries); "suggested" = the
// human-confirm tier (the production path). Correctness per suggest-score-lib.mjs (block-scoped gold match).
import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";
import { indexGold, scoreSession, personMatch } from "./suggest-score-lib.mjs";
const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
const TAG = process.argv[process.argv.indexOf("--tag") + 1];
const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8")).sessions;
(await import("./corpus-lock.mjs")).verifyCorpus();
const lines = readFileSync(join(OUT, `run-results.${TAG}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const norm = (s) => (s ?? "").trim().toLowerCase();
const summary = { tag: TAG, measuredAt: new Date().toISOString(), runs: [...new Set(lines.map((l) => l.outerRun))], tiers: {} };
for (const tier of ["final", "suggested"]) {
  const key = tier === "final" ? "resolved" : "suggested";
  let outputs = 0, correct = 0; const wrong = [], perSpeaker = new Map(), setsBySession = new Map();
  for (const g of gold) {
    const fileTurns = JSON.parse(readFileSync(join("data/toc-migrated", g.session, "turns.json"), "utf8"));
    const ordered = [...fileTurns].sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id));
    const ix = indexGold(g, ordered, fileTurns);
    for (const L of lines.filter((l) => l.session === g.session)) {
      const sc = scoreSession(ix, L[key]);
      outputs += sc.judged.length; correct += sc.judged.filter((j) => j.correct).length;
      for (const j of sc.judged) {
        if (!j.correct) wrong.push({ session: g.session, outerRun: L.outerRun, speakerRef: j.speakerRef, displayName: j.displayName, reasons: j.reasons, quote: j.provenance?.map((p) => p.evidenceQuote) });
        const k = `${g.session}|${j.speakerRef}|${norm(j.displayName)}`;
        const cur = perSpeaker.get(k) ?? { session: g.session, speakerRef: j.speakerRef, displayName: j.displayName, runsProduced: 0, runsCorrect: 0 };
        cur.runsProduced++; if (j.correct) cur.runsCorrect++; perSpeaker.set(k, cur);
      }
      const set = JSON.stringify(sc.judged.map((j) => `${j.speakerRef}|${norm(j.displayName)}`).sort());
      setsBySession.set(g.session, [...(setsBySession.get(g.session) ?? []), set]);
      L._gold = sc.gold;
    }
  }
  // recall: gold-named (session,label,person) pairs recovered CORRECTLY in at least one / in every run
  const goldRows = [];
  for (const g of gold) {
    const ix0 = lines.filter((l) => l.session === g.session);
    if (!ix0.length) continue;
    const pairs = ix0[0]._gold.map((p, i) => ({ session: g.session, label: p.label, person: p.person, blocks: p.blocks, recoveredRuns: ix0.filter((l) => l._gold[i]?.recovered).length, runs: ix0.length }));
    goldRows.push(...pairs);
  }
  const named = goldRows.length;
  summary.tiers[tier] = {
    outputs, correct, precision: outputs ? +(correct / outputs).toFixed(4) : null, wrongLinks: wrong.length, wrong,
    goldNamedLabelPersonPairs: named, recoveredInAnyRun: goldRows.filter((r) => r.recoveredRuns > 0).length, recoveredInEveryRun: goldRows.filter((r) => r.recoveredRuns === r.runs).length,
    recallAnyRun: named ? +(goldRows.filter((r) => r.recoveredRuns > 0).length / named).toFixed(4) : null,
    stableSessions: [...setsBySession].filter(([, v]) => v.length > 1 && new Set(v).size === 1).length, sessionsWithMultipleRuns: [...setsBySession].filter(([, v]) => v.length > 1).length,
    perSpeakerOutputs: [...perSpeaker.values()], goldPairs: goldRows,
  };
}
summary.degradedSessionRuns = lines.filter((l) => l.degraded).map((l) => ({ session: l.session, outerRun: l.outerRun, reason: l.degraded }));
summary.providerCalls = lines.reduce((n, l) => n + l.providerCalls, 0);
const fd = openSync(join(OUT, `measurement-summary.${TAG}.json`), "wx"); writeSync(fd, JSON.stringify(summary, null, 2) + "\n"); closeSync(fd);
for (const t of ["final", "suggested"]) { const s = summary.tiers[t]; console.log(JSON.stringify({ tier: t, outputs: s.outputs, correct: s.correct, precision: s.precision, wrongLinks: s.wrongLinks, goldPairs: s.goldNamedLabelPersonPairs, recoveredAny: s.recoveredInAnyRun, recoveredEvery: s.recoveredInEveryRun, recallAny: s.recallAnyRun, stable: `${s.stableSessions}/${s.sessionsWithMultipleRuns}` })); }
console.log(JSON.stringify({ providerCalls: summary.providerCalls, degraded: summary.degradedSessionRuns.length }));
void personMatch;
