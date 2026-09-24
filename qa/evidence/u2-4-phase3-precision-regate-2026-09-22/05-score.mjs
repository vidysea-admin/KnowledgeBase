// 05-score.mjs — measures the answered gate's phase-3 bars against gold-labels.json.
// Bars: (1) accepted identity precision 100%; (2) zero wrong label/name/citation links;
// (3) deterministic-floor preservation; (4) stable accepted facts across the 3 outer runs;
// (5) at least one correct addition. D-015: ISS-255 and ISS-104 reported by issue id.
//
// Correctness semantics (documented in the manifest):
//  - An accepted identity (label L, name N) is CORRECT iff the blocks it claims all belong to L
//    and carry gold person N. When its `blocks` field is EMPTY the identity is a LABEL-WIDE
//    claim (the exact shape the gate measured as unsafe on recurring labels) and is correct only
//    if EVERY block of label L in the session carries gold person N.
//  - Evidence turns are validated separately: each cited turn must exist in the session and carry
//    the name verbatim in a cue-shaped turn (the ISS-255 case-4 re-check). A cited turn that is a
//    NAMED (non-positional) turn is not itself an L-block; it can still be legitimate naming
//    evidence, so its own label never falsifies block scoping — the block/label-wide check above
//    is what decides identity correctness.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = "qa/evidence/u2-4-phase3-precision-regate-2026-09-22";
// fix cycle 1: --tag <t> scores run-results.<t>.jsonl / raw-proposals.<t>.jsonl and writes
// measurement-summary.<t>.json; no tag = the cycle-0 files, unchanged.
const TAG = process.argv.includes("--tag") ? process.argv[process.argv.indexOf("--tag") + 1] : null;
const tagged = (base, ext) => (TAG ? `${base}.${TAG}.${ext}` : `${base}.${ext}`);
const gold = JSON.parse(readFileSync(join(OUT, "gold-labels.json"), "utf8"));

// per-turn gold override (mid-sentence diarizer join measured in the labelling notes:
// in-focus-3 t071 continues Kshitij's answer into t072)
const TURN_OVERRIDES = { "2026-07-30-in-focus-3-t071": "Shithij" };

const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
// person-level match: the accepted name identifies the gold PERSON when the strings are equal or
// one is a contiguous token subsequence of the other ("Jubin" ⊂ "Jubin Thakkar",
// "Ruby" ⊂ "Ruby Thomas"). The wrongness class this gate measures (a third-party-mention credited
// to the speaker: Sonal/Bhavya/Shithij/Anisha against unnamed/Nikhil/Bhakti gold) shares no tokens
// with its gold person, so subsequence tolerance cannot mask it.
const personMatch = (accepted, goldPerson) => {
  const a = norm(accepted).split(" ").filter(Boolean);
  const g = norm(goldPerson).split(" ").filter(Boolean);
  if (a.length === 0 || g.length === 0) return false;
  const sub = (small, big) => {
    if (small.length > big.length) return false;
    outer: for (let i = 0; i <= big.length - small.length; i++) {
      for (let k = 0; k < small.length; k++) if (big[i + k] !== small[k]) continue outer;
      return true;
    }
    return false;
  };
  return sub(a, g) || sub(g, a);
};
const POSITIONAL = /^spk:\d+$/;

const results = readFileSync(join(OUT, tagged("run-results", "jsonl")), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// ---- per-session turn -> block index (same block definition the pipeline uses)
const sessionData = new Map();
for (const g of gold.sessions) {
  const turns = JSON.parse(readFileSync(join("data/toc-migrated", g.session, "turns.json"), "utf8"));
  const blocks = [];
  let cur = null;
  turns.forEach((t, i) => {
    const ref = t.speakerRef ?? "";
    if (POSITIONAL.test(ref)) {
      if (cur && cur.label === ref) cur.end = i;
      else { if (cur) blocks.push(cur); cur = { label: ref, start: i, end: i }; }
    } else if (cur) { blocks.push(cur); cur = null; }
  });
  if (cur) blocks.push(cur);
  if (blocks.length !== g.blocks.length) throw new Error(`block-count drift ${g.session}: ${blocks.length} vs gold ${g.blocks.length}`);
  const byGoldBlockNo = new Map(g.blocks.map((b) => [b.block, b]));
  const turnInfo = new Map();
  blocks.forEach((b, i) => {
    const goldBlock = byGoldBlockNo.get(i + 1);
    const person = goldBlock?.person ?? null;
    for (let k = b.start; k <= b.end; k++) turnInfo.set(turns[k]._id, { block: i + 1, label: b.label, person });
  });
  const labelBlocks = new Map(); // label -> [{blockNo, person}]
  blocks.forEach((b, i) => {
    const person = byGoldBlockNo.get(i + 1)?.person ?? null;
    const list = labelBlocks.get(b.label) ?? [];
    list.push({ blockNo: i + 1, person, start: b.start, end: b.end });
    labelBlocks.set(b.label, list);
  });
  sessionData.set(g.session, { turns, turnInfo, blocks, labelBlocks });
}

const identityKey = (speakerRef, displayName) => `${speakerRef}|${norm(displayName)}`;

// ---- score every (session, outerRun)
const perRun = [];
for (const line of results) {
  const { turns, turnInfo, labelBlocks } = sessionData.get(line.session);
  const byId = new Map(turns.map((t) => [t._id, t]));
  const checks = [];
  for (const s of line.resolved ?? []) {
    const reasons = [];
    const evChecks = [];
    for (const e of s.evidence ?? []) {
      const t = byId.get(e.turnId);
      const verdicts = [];
      if (!t) { verdicts.push("cited turn not in session"); reasons.push(`cited turn ${e.turnId} not in session`); }
      else {
        const expected = TURN_OVERRIDES[e.turnId] ?? turnInfo.get(e.turnId)?.person ?? null;
        if (expected && personMatch(s.displayName, expected)) verdicts.push("evidence block matches gold");
        else if (!expected) verdicts.push("evidence block gold is unnamed");
        else verdicts.push(`evidence block gold is ${expected}`);
      }
      evChecks.push({ turnId: e.turnId, ok: verdicts.every((v) => v === "evidence block matches gold"), verdicts });
    }
    if (!s.evidence || s.evidence.length === 0) reasons.push("zero evidence turns");
    const claimed = s.blocks ?? [];
    if (claimed.length > 0) {
      for (const b of claimed) {
        const turn = turns[b.startTurnIndex];
        const info = turn ? turnInfo.get(turn._id) : null;
        if (!info || info.label !== s.speakerRef) {
          reasons.push(`claimed block start=${b.startTurnIndex} is not a ${s.speakerRef} block`);
          continue;
        }
        const person = TURN_OVERRIDES[turn._id] ?? info.person;
        if (!personMatch(s.displayName, person)) {
          reasons.push(`claimed block ${info.block} gold is ${person ?? "unnamed"}`);
        }
      }
    } else {
      reasons.push("empty blocks = label-wide identity over a recurring label");
      const mine = labelBlocks.get(s.speakerRef) ?? [];
      if (mine.length === 0) reasons.push(`label ${s.speakerRef} has no positional blocks in this session`);
      for (const b of mine) {
        if (!personMatch(s.displayName, b.person)) {
          reasons.push(`label-wide claim contradicted at block ${b.blockNo} (gold ${b.person ?? "unnamed"})`);
        }
      }
    }
    checks.push({ speakerRef: s.speakerRef, displayName: s.displayName, evidenceTurns: (s.evidence ?? []).map((e) => e.turnId), identityCorrect: reasons.length === 0, reasons, evChecks });
  }
  const acceptedSet = [...new Set((line.resolved ?? []).map((s) => identityKey(s.speakerRef, s.displayName)))].sort();
  perRun.push({
    session: line.session, outerRun: line.outerRun, windows: line.windows, providerCalls: line.providerCalls, ms: line.ms,
    degraded: line.degraded, checks, acceptedSet, unresolved: line.unresolved, floor: line.floor, floorTurnsCovered: line.floorTurnsCovered,
  });
}

// ---- bar 1 + bar 2
const totalAccepted = perRun.reduce((n, r) => n + r.checks.length, 0);
const totalCorrect = perRun.reduce((n, r) => n + r.checks.filter((c) => c.identityCorrect).length, 0);
const wrongLinkList = [];
let wrongPairs = 0;
for (const r of perRun) {
  for (const c of r.checks) {
    if (!c.identityCorrect) {
      wrongLinkList.push({ session: r.session, outerRun: r.outerRun, speakerRef: c.speakerRef, displayName: c.displayName, evidenceTurns: c.evidenceTurns, reasons: c.reasons });
    }
    wrongPairs += c.evChecks.filter((e) => !e.ok).length;
  }
}

// ---- bar 3 — floor preservation
let floorTurns = 0;
let floorCoveredTurns = 0;
const floorBySession = new Map();
for (const r of perRun) {
  if (!floorBySession.has(r.session)) {
    floorBySession.set(r.session, r.floor ?? []);
    floorTurns += r.floorTurnsCovered ?? 0;
    // block/turn-based coverage re-derivation: distinct POSITIONAL turns inside the blocks of
    // resolved floor identities (the phase-1 floor's coverage measure)
    const { turns, blocks, turnInfo } = sessionData.get(r.session);
    const covered = new Set();
    for (const f of r.floor ?? []) {
      for (const b of f.blocks ?? []) {
        for (let k = b.startTurnIndex; k <= Math.min(b.endTurnIndex, turns.length - 1); k++) {
          const t = turns[k];
          if (t && POSITIONAL.test(t.speakerRef ?? "") && turnInfo.get(t._id)) covered.add(t._id);
        }
      }
    }
    floorCoveredTurns += covered.size;
    void blocks;
  }
}
const floorList = [...floorBySession.entries()].flatMap(([s, fs]) => fs.map((f) => ({ session: s, ...f })));
const floorLabelCount = new Set(floorList.map((f) => `${f.session}|${f.speakerRef}`)).size;
const contradictions = [];
for (const r of perRun) {
  for (const c of r.checks) {
    const f = (r.floor ?? []).find((x) => x.speakerRef === c.speakerRef);
    if (f && !personMatch(c.displayName, f.displayName)) contradictions.push({ session: r.session, outerRun: r.outerRun, speakerRef: c.speakerRef, floorName: f.displayName, acceptedName: c.displayName });
  }
}
const floorPresence = floorList.map((f) => {
  const present = perRun.some((r) => r.session === f.session && r.checks.some((c) => c.speakerRef === f.speakerRef && personMatch(c.displayName, f.displayName) && c.identityCorrect));
  return { session: f.session, speakerRef: f.speakerRef, displayName: f.displayName, presentInAccepted: present };
});

// ---- bar 4 — stability across outer runs (shipped-layer accepted sets)
const sessions = [...new Set(perRun.map((r) => r.session))];
const stability = sessions.map((s) => {
  const runs = perRun.filter((r) => r.session === s).sort((a, b) => a.outerRun - b.outerRun);
  const sets = runs.map((r) => JSON.stringify([...r.acceptedSet]));
  return { session: s, outerRuns: runs.length, stable: runs.length >= 2 && new Set(sets).size === 1, acceptedSets: sets };
});

// ---- bar 5 — correct additions beyond the floor
const additions = new Map();
for (const r of perRun) {
  for (const c of r.checks) {
    if (!c.identityCorrect) continue;
    const f = (r.floor ?? []).find((x) => x.speakerRef === c.speakerRef);
    if (!f || !personMatch(c.displayName, f.displayName)) {
      const key = `${r.session}|${identityKey(c.speakerRef, c.displayName)}`;
      if (!additions.has(key)) additions.set(key, { session: r.session, speakerRef: c.speakerRef, displayName: c.displayName, evidenceTurns: c.evidenceTurns });
    }
  }
}
const distinctAdditions = [...additions.values()];

// ---- ISS-255 by id (its recorded live evidence is the visa session, inside this corpus)
const visa = "2026-04-21-visa-blueprint-part2-italy-france-nz";
const iss255 = { corpusContainsVisaSession: sessions.includes(visa), cases: [] };
const visaWrong = wrongLinkList.filter((w) => w.session === visa);
iss255.cases.push({
  id: 1,
  name: "handover inversion (spk:0 -> 'Ruby' via t205) refused",
  pass: !visaWrong.some((w) => norm(w.displayName) === "ruby"),
  wrongVisaLinks: visaWrong,
});
const visaRuns = perRun.filter((r) => r.session === visa).sort((a, b) => a.outerRun - b.outerRun);
const visaSets = visaRuns.map((r) => JSON.stringify([...r.acceptedSet]));
iss255.cases.push({ id: 2, name: "accepted set stable across outer runs 1-3 (recorded run 1 vs 2-3 instability)", pass: visaRuns.length === 3 && new Set(visaSets).size === 1, acceptedSets: visaSets });

const rawLines = readFileSync(join(OUT, tagged("raw-proposals", "jsonl")), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const multiNameLabels = [];
for (const session of sessions) {
  for (const outer of [1, 2, 3]) {
    for (const ir of [1, 2, 3]) {
      const lines = rawLines.filter((x) => x.session === session && x.outerRun === outer && x.internalRun === ir);
      const byLabel = new Map();
      for (const x of lines) for (const e of x.entries) {
        if (e.unparseable || !e.speakerRef || !POSITIONAL.test(e.speakerRef)) continue;
        const nm = (e.displayName ?? "").trim();
        if (!nm) continue;
        const set = byLabel.get(e.speakerRef) ?? new Set();
        set.add(nm);
        byLabel.set(e.speakerRef, set);
      }
      for (const [label, set] of byLabel) if (set.size > 1) multiNameLabels.push({ session, outerRun: outer, internalRun: ir, label, names: [...set] });
    }
  }
}
const everyLabelAtMostOneAcceptedName = perRun.every((r) => new Set(r.checks.map((c) => c.speakerRef)).size === r.checks.length);
const visaMulti = multiNameLabels.filter((m) => m.session === visa);
iss255.cases.push({
  id: 3,
  name: "same label -> multiple names within one raw run (recorded: spk:0 -> Kshitij Garg AND Shagun AND spk:0)",
  rawMultiNameObservationsVisa: visaMulti.length,
  rawMultiNameObservationsCorpus: multiNameLabels.length,
  shippedContainmentEveryLabelAtMostOneAcceptedName: everyLabelAtMostOneAcceptedName,
  pass: everyLabelAtMostOneAcceptedName,
});

const rules = await import(pathToFileURL("packages/index/src/pipeline/speaker-name-rules.ts").href);
const invalidPairs = [];
let evidencePairs = 0;
for (const r of perRun) {
  const byId = new Map(sessionData.get(r.session).turns.map((t) => [t._id, t]));
  for (const c of r.checks) {
    for (const e of c.evidenceTurns) {
      evidencePairs++;
      const t = byId.get(e);
      if (!t) { invalidPairs.push({ session: r.session, outerRun: r.outerRun, speakerRef: c.speakerRef, displayName: c.displayName, turnId: e, reason: "turn not in session" }); continue; }
      const okVerbatim = rules.containsNameVerbatim(t.text ?? "", c.displayName);
      const okCue = rules.citesNameAsAnIntroduction(t.text ?? "", c.displayName);
      if (!okVerbatim || !okCue) invalidPairs.push({ session: r.session, outerRun: r.outerRun, speakerRef: c.speakerRef, displayName: c.displayName, turnId: e, okVerbatim, okCue });
    }
  }
}
iss255.cases.push({ id: 4, name: "every accepted evidence pair carries the name verbatim in a cue-shaped turn", pass: invalidPairs.length === 0, evidencePairs, invalidCount: invalidPairs.length, invalid: invalidPairs.slice(0, 20) });
iss255.verdict = `${iss255.cases.filter((c) => c.pass).length}/4`;

const summary = {
  measuredAt: new Date().toISOString(),
  corpus: { sessions: sessions.length, blocks: gold.sessions.reduce((n, g) => n + g.blocks.length, 0) },
  bar1_acceptedIdentityPrecision: { accepted: totalAccepted, correct: totalCorrect, precision: totalAccepted === 0 ? null : +(totalCorrect / totalAccepted).toFixed(4), bar: 1.0, holds: totalAccepted > 0 && totalCorrect === totalAccepted },
  bar2_wrongLinks: { wrongIdentityCount: wrongLinkList.length, wrongEvidencePairs: wrongPairs, bar: 0, wrongLinkList },
  bar3_floorPreservation: { floorTurnsCovered: floorTurns, floorBlockCoveredTurns: floorCoveredTurns, floorSpeakerLabels: floorLabelCount, floorList, contradictedByAccepted: contradictions, presence: floorPresence },
  bar4_stability: { perSession: stability, allStable: stability.every((s) => s.stable) },
  bar5_correctAdditions: { additions: distinctAdditions, count: distinctAdditions.length },
  iss255,
  perRun: perRun.map((r) => ({ session: r.session, outerRun: r.outerRun, windows: r.windows, providerCalls: r.providerCalls, ms: r.ms, degraded: r.degraded, accepted: r.checks.map((c) => ({ speakerRef: c.speakerRef, displayName: c.displayName, evidenceTurns: c.evidenceTurns, identityCorrect: c.identityCorrect, reasons: c.reasons })), unresolved: r.unresolved })),
};
writeFileSync(join(OUT, tagged("measurement-summary", "json")), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  accepted: totalAccepted, correct: totalCorrect, precision: summary.bar1_acceptedIdentityPrecision.precision,
  wrongIdentities: wrongLinkList.length, wrongPairs,
  floorTurns, floorCoveredTurns, floorLabels: floorLabelCount, contradicted: contradictions.length,
  stableAll: summary.bar4_stability.allStable, additions: distinctAdditions.length,
  ISS255: iss255.verdict,
}, null, 2));