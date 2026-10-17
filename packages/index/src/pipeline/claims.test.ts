/**
 * packages/index/src/pipeline/claims.test.ts — the provenance guarantee is the whole point:
 * a claim only survives if its cited turn ids are real, and a fully-fabricated claim is dropped
 * entirely, never shipped with empty evidence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import { extractClaims, type ClaimsCompleteFn } from "./claims.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}

function completion(text: string, json?: unknown): CompleteResult {
  return { text, json, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}

test("extractClaims returns [] for an empty turn list, never calls complete", async () => {
  const complete: ClaimsCompleteFn = async () => { throw new Error("must not be called"); };
  const { claims: result, degraded } = await extractClaims([], complete);
  assert.deepEqual(result, []);
});

test("extractClaims keeps a claim whose cited turnId is real", async () => {
  const turns = [turn("t1", "spk:0", "NZ requires 8 IELTS bands.")];
  const complete: ClaimsCompleteFn = async (job: Job) => {
    assert.equal(job.kind, "claims");
    assert.match(job.messages[1]!.content, /\[id:t1\]/);
    return completion("", [{ text: "NZ requires 8 IELTS bands.", turnIds: ["t1"] }]);
  };
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.text, "NZ requires 8 IELTS bands.");
  assert.deepEqual(result[0]!.evidenceTurnIds, ["t1"]);
});

test("extractClaims drops a claim whose ONLY cited turnId is fabricated (not in the real transcript)", async () => {
  const turns = [turn("t1", "spk:0", "Real content.")];
  const complete: ClaimsCompleteFn = async () => completion("", [{ text: "Invented fact.", turnIds: ["t999-does-not-exist"] }]);
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.deepEqual(result, []);
});

test("extractClaims keeps only the real turnIds out of a mixed real+fabricated set", async () => {
  const turns = [turn("t1", "spk:0", "Real content one."), turn("t2", "spk:1", "Real content two.")];
  const complete: ClaimsCompleteFn = async () => completion("", [{ text: "Mixed claim.", turnIds: ["t1", "t999-fake"] }]);
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]!.evidenceTurnIds, ["t1"]);
});

test("extractClaims drops a claim with no text, and one with a non-array turnIds field", async () => {
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => completion("", [
    { turnIds: ["t1"] }, // no text
    { text: "claim", turnIds: "t1" }, // turnIds not an array
    { text: "good claim", turnIds: ["t1"] },
  ]);
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.text, "good claim");
});

test("extractClaims returns [] when complete() rejects, never throws into the caller — and says it DEGRADED", async () => {
  // ISS-056: an empty array meant both "no claims in this transcript" and "the provider fell
  // over", and the caller deletes a session's claims before re-inserting — so a transient outage
  // silently destroyed real claims. The reason must survive to the caller.
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => { throw new Error("provider down"); };
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.deepEqual(result, []);
  assert.ok(degraded, "a failed provider call must be reported as degraded, not as 'no claims'");
  assert.match(degraded.reason, /provider down/);
});

test("extractClaims returns [] when the response is not a JSON array — also DEGRADED", async () => {
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => completion("not an array");
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.deepEqual(result, []);
  assert.ok(degraded, "an unparseable response is an unknown, not an empty result");
});

test("a transcript with genuinely nothing citable is NOT degraded — empty means empty", async () => {
  // The other half: if degradation were reported for every empty result, the caller could never
  // replace a session's claims with a legitimately empty set, and stale claims would live forever.
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => completion("[]");
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.deepEqual(result, []);
  assert.equal(degraded, null, "an honest empty extraction must not look like a failure");
});

test("claims dropped for fabricated evidence leave a NON-degraded empty result", async () => {
  // Every claim being dropped by the evidence check is a real, successful extraction that found
  // nothing citable — not a provider failure. Conflating them would block legitimate replacement.
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => completion(JSON.stringify([{ text: "Made up.", turnIds: ["nope"] }]));
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.deepEqual(result, []);
  assert.equal(degraded, null);
});

test("extractClaims prefers completion.json over re-parsing completion.text", async () => {
  const turns = [turn("t1", "spk:0", "Content.")];
  const complete: ClaimsCompleteFn = async () => completion("garbage text ignored", [{ text: "from json", turnIds: ["t1"] }]);
  const { claims: result, degraded } = await extractClaims(turns, complete);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.text, "from json");
});

// U2.2 offline measurement: actual extractor filtering must not erase the raw denominator.
import { evaluateExtractionCase, aggregateExtractionReports } from "../eval/extraction.js";
function evalCase(overrides: Record<string, unknown> = {}) {
  return { id: "case1", tenantId: "t1", sessionId: "s1", artifactHash: "a".repeat(64),
    turns: [turn("t1", "spk:0", "Content.")], ...overrides };
}
test("measurement retains raw fabricated evidence after actual extractor filtering", async () => {
  const raw = [{text: "One", turnIds: ["fake"]}, {text: "Two", turnIds: ["t1", "fake"]}];
  const filtered = await extractClaims([turn("t1", "spk:0", "Content.")], async () => completion(JSON.stringify(raw)));
  const r = evaluateExtractionCase(evalCase({rawText: JSON.stringify(raw), filtered}));
  assert.deepEqual(r.stages.raw.invalidCitationRate, {numerator: 2, denominator: 3, value: 2 / 3});
  assert.equal(r.stages.filtered.invalidCitationRate.value, 0);
  assert.equal(r.filterLoss?.droppedClaims, 1); assert.equal(r.filterLoss?.removedCitations, 2);
  assert.equal(r.semantic.measured, false); assert.equal(r.semantic.unsupportedRate.value, null);
});
test("measurement distinguishes missing artifacts, genuine empty and degraded provider", () => {
  const absent = evaluateExtractionCase(evalCase());
  assert.equal(absent.stages.raw.available, false); assert.equal(absent.stages.raw.invalidCitationRate.value, null);
  assert.equal(absent.complete, false);
  const empty = evaluateExtractionCase(evalCase({parsed: [], filtered: {claims: [], degraded: null}}));
  assert.equal(empty.complete, true); assert.equal(empty.stages.filtered.available, true);
  assert.equal(empty.stages.filtered.invalidCitationRate.value, null);
  const degraded = evaluateExtractionCase(evalCase({filtered: {claims: [], degraded: {reason: "private provider text"}}}));
  assert.equal(degraded.stages.filtered.available, false); assert.equal(degraded.complete, false);
  assert.ok(!JSON.stringify(degraded).includes("private provider text"));
});
test("measurement checks ownership, duplicate IDs and malformed evidence rather than membership alone", () => {
  const r = evaluateExtractionCase(evalCase({turns: [turn("t1", "spk:0", "x"), {...turn("t1", "spk:0", "x"), tenantId: "other"}],
    persisted: [{_id: "c", tenantId: "other", text: "x", evidence: [{turnId: "t1", sessionId: "s2"}, {turnId: 4}]}]}));
  assert.ok(r.sourceIssues.includes("duplicate-turn-id")); assert.ok(r.sourceIssues.includes("foreign-turn-owner"));
  assert.equal(r.stages.persisted.invalidCitationRate.numerator, 2);
  assert.ok(r.stages.persisted.issues.some(x => x.code === "foreign-claim-owner"));
  assert.equal(r.complete, false);
});
test("measurement validates optional spans attribution excerpts and media bounds without inventing fields", () => {
  const t = {...turn("t1", "spk:0", "exact source"), tStart: 2, tEnd: 5};
  const r = evaluateExtractionCase(evalCase({turns: [t], mediaDuration: 4, parsed: [{text: "x", turnIds: ["t1"],
    tStart: 1, tEnd: 9, speakerRef: "wrong", sourceExcerpt: "absent"}]}));
  assert.ok(r.sourceIssues.includes("turn-outside-media"));
  for (const code of ["claim-span-mismatch", "speaker-mismatch", "excerpt-mismatch"]) assert.ok(r.stages.parsed.issues.some(x => x.code === code));
  const noFields = evaluateExtractionCase(evalCase({parsed: [{text: "x", turnIds: ["t1"]}]}));
  assert.deepEqual(noFields.stages.parsed.optionalChecks, {span: 0, attribution: 0, excerpt: 0});
  for (const bad of [{tStart: -1, tEnd: 0}, {tStart: 2, tEnd: 1}, {tStart: NaN, tEnd: 3}])
    assert.ok(evaluateExtractionCase(evalCase({turns: [{...t, ...bad}], parsed: []})).sourceIssues.includes("invalid-turn-time"));
});
test("measurement preserves completion JSON precedence and weighted denominators", () => {
  const a = evaluateExtractionCase(evalCase({rawText: "garbage", parsed: [{text: "x", turnIds: ["t1"]}]}));
  assert.equal(a.stages.raw.available, false); assert.equal(a.stages.parsed.invalidCitationRate.value, 0); assert.equal(a.complete, true);
  const b = evaluateExtractionCase(evalCase({id: "case2", parsed: [{text: "x", turnIds: ["bad", "bad", "bad"]}]}));
  const agg = aggregateExtractionReports([a, b]);
  assert.deepEqual(agg.stages.parsed!.invalidCitationRate, {numerator: 3, denominator: 4, value: 0.75});
  assert.equal(agg.cases, 2);
});
test("human labels are hash bound, explicit, unique and never inferred from valid IDs", () => {
  const parsed = [{text: "Unsupported", turnIds: ["t1"]}];
  const label = {caseId: "case1", artifactHash: "a".repeat(64), stage: "parsed", claimId: "row:0", status: "unsupported"};
  const r = evaluateExtractionCase(evalCase({parsed, labels: [label]}));
  assert.equal(r.semantic.measured, true); assert.deepEqual(r.semantic.unsupportedRate, {numerator: 1, denominator: 1, value: 1});
  for (const labels of [[{...label, artifactHash: "b".repeat(64)}], [label, label], [{...label, caseId: "foreign"}], [{...label, claimId: "missing"}]])
    assert.throws(() => evaluateExtractionCase(evalCase({parsed, labels})), /Invalid human label/);
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
test("offline CLI is byte deterministic, binds artifacts and reports incomplete inventory", () => {
  const dir = mkdtempSync(join(tmpdir(), "extraction-test-"));
  const script = resolve(import.meta.dirname, "../../../../scripts/eval-extraction.mjs");
  try {
    writeFileSync(join(dir, "turns.json"), JSON.stringify([turn("t1", "spk:0", "private fixture text")]));
    writeFileSync(join(dir, "claims.json"), JSON.stringify([{_id: "c", tenantId: "t1", text: "private claim", evidence: [{turnId: "missing", sessionId: "s1"}]}]));
    const manifest = {version: 1, cases: [{id: "c1", tenantId: "t1", sessionId: "s1", artifacts: {turns: "turns.json", persisted: "claims.json"}}]};
    const path = join(dir, "corpus.json"); writeFileSync(path, JSON.stringify(manifest));
    const run = () => spawnSync(process.execPath, [script, "--input", path], {encoding: "utf8", timeout: 20000});
    const a = run(), b = run(); assert.equal(a.status, 0); assert.equal(b.status, 0); assert.equal(a.stdout, b.stdout);
    const r = JSON.parse(a.stdout); assert.equal(r.summary.stages.persisted.invalidCitationRate.numerator, 1);
    assert.equal(r.cases[0].stages.raw.available, false); assert.equal(r.cases[0].semantic.measured, false);
    assert.ok(!a.stdout.includes("private fixture text")); assert.ok(!a.stdout.includes("private claim"));
    assert.equal(r.artifacts[0].hashes.turns.length, 64);
    writeFileSync(join(dir, "turns.json"), JSON.stringify([turn("t1", "spk:0", "changed")]));
    const changed = JSON.parse(run().stdout); assert.notEqual(changed.artifacts[0].artifactHash, r.artifacts[0].artifactHash);
    writeFileSync(path, JSON.stringify({...manifest, cases: [...manifest.cases, {...manifest.cases[0], id: "broken", artifacts: {turns: "absent.json"}}]}));
    const failure = run(); assert.equal(failure.status, 2); assert.equal(JSON.parse(failure.stdout).failures[0].reason, "artifact-missing");
    mkdirSync(join(dir, "undeclared"));
    writeFileSync(path, JSON.stringify({...manifest, inventoryDirectory: "."}));
    const incomplete = run(); assert.equal(incomplete.status, 2);
    assert.deepEqual(JSON.parse(incomplete.stdout).inventory.undeclared, ["undeclared"]);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
test("explicit omission and topic/person labels report only reviewed coverage", () => {
  const base = evalCase({parsed: [{text: "x", turnIds: ["t1"]}], expectedFacts: [{id: "fact1"}],
    predictedEntities: [{id: "topic1", kind: "topic"}, {id: "person1", kind: "person"}],
    labels: [{caseId: "case1", artifactHash: "a".repeat(64), claimId: "fact1", status: "omitted"}],
    entityLabels: [{caseId: "case1", artifactHash: "a".repeat(64), id: "topic1", kind: "topic", correct: false}]});
  const r = evaluateExtractionCase(base);
  assert.equal(r.semantic.omissionRate.value, 1); assert.equal(r.semantic.unsupportedRate.value, null);
  assert.equal(r.entities.topic.precision.value, 0); assert.equal(r.entities.person.measured, false);
  assert.throws(() => evaluateExtractionCase({...base, entityLabels: [{caseId: "foreign", artifactHash: "a".repeat(64), id: "topic1", kind: "topic", correct: true}]}), /Invalid entity label/);
});

test("reviewed fact labels measure zero omission and expose partial review coverage", () => {
  const label = {caseId: "case1", artifactHash: "a".repeat(64), factId: "fact1", status: "covered", stage: "parsed", claimId: "row:0"};
  const base = evalCase({parsed: [{text: "x", turnIds: ["t1"]}], expectedFacts: [{id: "fact1"}, {id: "fact2"}]});
  const r = evaluateExtractionCase({...base, factLabels: [label]});
  assert.deepEqual(r.semantic.omissionRate, {numerator: 0, denominator: 1, value: 0});
  assert.deepEqual(r.semantic.factCoverage, {numerator: 1, denominator: 2, value: 0.5});
  assert.equal(r.semantic.factsMeasured, true); assert.equal(r.semantic.unsupportedRate.value, null);
  const unknown = evaluateExtractionCase(base);
  assert.equal(unknown.semantic.omissionRate.value, null); assert.equal(unknown.semantic.factsMeasured, false);
  assert.equal(unknown.semantic.factCoverage.value, 0);
  for (const bad of [{...label, artifactHash: "b".repeat(64)}, {...label, caseId: "foreign"}, {...label, factId: "missing"},
    {...label, stage: "persisted"}, {...label, claimId: "missing"}, {...label, status: "assumed"}, {...label, status: ["covered"]}, {...label, stage: ["parsed"]}])
    assert.throws(() => evaluateExtractionCase({...base, factLabels: [bad]}), /Invalid fact label/);
  assert.throws(() => evaluateExtractionCase({...base, factLabels: [label, label]}), /Invalid fact label duplicate/);
  assert.throws(() => evaluateExtractionCase({...base, parsed: [{_id: "c", text: "x", turnIds: ["t1"]}, {_id: "c", text: "x", turnIds: ["t1"]}],
    factLabels: [{...label, claimId: "c"}]}), /Invalid fact label target/);
});
test("omitted facts are reviewed targets with shared uniqueness across legacy and new labels", () => {
  const common = {caseId: "case1", artifactHash: "a".repeat(64)};
  const legacy = {...common, claimId: "fact1", status: "omitted"};
  const omitted = {...common, factId: "fact1", status: "omitted"};
  const base = evalCase({parsed: [], expectedFacts: [{id: "fact1"}, {id: "fact2"}]});
  const r = evaluateExtractionCase({...base, factLabels: [omitted]});
  assert.deepEqual(r.semantic.omissionRate, {numerator: 1, denominator: 1, value: 1});
  assert.equal(r.semantic.factCoverage.value, 0.5);
  assert.throws(() => evaluateExtractionCase({...base, labels: [legacy, {...legacy, stage: "parsed"}]}), /Invalid human label duplicate/);
  assert.throws(() => evaluateExtractionCase({...base, labels: [legacy], factLabels: [omitted]}), /Invalid fact label duplicate/);
  for (const bad of [{...omitted, stage: "parsed"}, {...omitted, claimId: "row:0"}])
    assert.throws(() => evaluateExtractionCase({...base, factLabels: [bad]}), /Invalid fact label target/);
  const uncertain = evaluateExtractionCase(evalCase({parsed: [{text: "x", turnIds: ["t1"]}],
    labels: [{...common, claimId: "row:0", stage: "parsed", status: "uncertain"}]}));
  assert.equal(uncertain.semantic.unsupportedRate.value, null);
});
test("aggregate fact and entity measurements sum reviewed denominators and retain unknown coverage", () => {
  const common = {caseId: "case1", artifactHash: "a".repeat(64)};
  const a = evaluateExtractionCase(evalCase({parsed: [{text: "x", turnIds: ["t1"]}],
    expectedFacts: [{id: "f1"}, {id: "f2"}, {id: "f3"}], factLabels: ["f1", "f2"].map(factId =>
      ({...common, factId, status: "covered", stage: "parsed", claimId: "row:0"})),
    predictedEntities: ["p1", "p2", "p3"].map(id => ({id, kind: "topic"})),
    entityLabels: ["p1", "p2"].map(id => ({...common, id, kind: "topic", correct: true}))}));
  const b = evaluateExtractionCase(evalCase({id: "case2", parsed: [], expectedFacts: [{id: "f1"}],
    factLabels: [{...common, caseId: "case2", factId: "f1", status: "omitted"}],
    predictedEntities: [{id: "p1", kind: "topic"}],
    entityLabels: [{...common, caseId: "case2", id: "p1", kind: "topic", correct: false}]}));
  const c = evaluateExtractionCase(evalCase({id: "case3", parsed: [], expectedFacts: [{id: "f1"}],
    predictedEntities: [{id: "speaker1", kind: "person"}]}));
  const r = aggregateExtractionReports([a, b, c]);
  assert.deepEqual(r.semantic.omissionRate, {numerator: 1, denominator: 3, value: 1 / 3});
  assert.deepEqual(r.semantic.factCoverage, {numerator: 3, denominator: 5, value: 0.6});
  assert.equal(r.semantic.factMeasuredCases, 2); assert.equal(r.semantic.factUnmeasuredCases, 1);
  assert.deepEqual(r.entities.topic.precision, {numerator: 2, denominator: 3, value: 2 / 3});
  assert.deepEqual(r.entities.topic.coverage, {numerator: 3, denominator: 4, value: 0.75});
  assert.equal(r.entities.person.precision.value, null); assert.equal(r.entities.person.coverage.value, 0);
  assert.equal(a.entities.topic.coverage.value, 2 / 3);
  assert.equal(evaluateExtractionCase(evalCase({parsed: []})).entities.topic.coverage.value, null);
});
test("offline CLI loads reviewed fact labels and rejects drift without exposing labels", () => {
  const dir = mkdtempSync(join(tmpdir(), "extraction-facts-test-"));
  const script = resolve(import.meta.dirname, "../../../../scripts/eval-extraction.mjs");
  try {
    writeFileSync(join(dir, "turns.json"), JSON.stringify([turn("t1", "spk:0", "private source")]));
    writeFileSync(join(dir, "parsed.json"), JSON.stringify([{text: "private claim", turnIds: ["t1"]}]));
    const c = {id: "case1", tenantId: "t1", sessionId: "s1", artifacts: {turns: "turns.json", parsed: "parsed.json"}, expectedFacts: [{id: "f1"}]};
    const path = join(dir, "corpus.json"), run = () => spawnSync(process.execPath, [script, "--input", path], {encoding: "utf8", timeout: 20000});
    writeFileSync(path, JSON.stringify({version: 1, cases: [c]}));
    const hash = JSON.parse(run().stdout).artifacts[0].artifactHash;
    const factLabels = [{caseId: "case1", artifactHash: hash, factId: "f1", status: "covered", stage: "parsed", claimId: "row:0"}];
    writeFileSync(path, JSON.stringify({version: 1, cases: [{...c, factLabels}]}));
    const measured = run(); assert.equal(measured.status, 0);
    const report = JSON.parse(measured.stdout); assert.equal(report.summary.semantic.omissionRate.value, 0);
    assert.equal(report.summary.semantic.factCoverage.value, 1); assert.ok(!measured.stdout.includes("private source"));
    writeFileSync(join(dir, "parsed.json"), JSON.stringify([{text: "changed claim", turnIds: ["t1"]}]));
    const drift = run(); assert.equal(drift.status, 2); assert.equal(JSON.parse(drift.stdout).failures[0].reason, "fact-label-invalid");
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test("strict claims require literal submitted quotes and separate complete support judgments", async () => {
  for (const fault of ["none", "wrong-valid", "missing-coverage", "unsupported", "duplicate-verdict", "unknown-verdict", "malformed-entry", "empty-gap"]) {
    const turns = [turn("c1", "spk:0", "A factual statement."), turn("c2", "spk:1", "Different source.")];
    const complete: ClaimsCompleteFn = async (job) => {
      const p = JSON.parse(job.messages[1]!.content);
      if (p.phase === "extract-claims") {
        const s = p.spans[0]; const claim = { text: s.text, origin: s.origin, verification: "unverified", evidence: [{ turnId: fault === "wrong-valid" ? "c2" : s.turnId, sessionId: s.sessionId, quote: s.text }] };
        return completion("", { processed: fault === "missing-coverage" ? [] : p.inventory, claims: fault === "empty-gap" ? [] : fault === "malformed-entry" ? [null] : [claim] });
      }
      assert.equal(p.mode, "claim-extraction"); assert.match(job.messages[0]!.content, /fact-free source/);
      const verdicts = p.items.map((i: { id: string }) => ({ id: fault === "unknown-verdict" ? "unknown" : i.id, supported: fault !== "unsupported", categoryCorrect: true, answerRelevant: true }));
      if (fault === "duplicate-verdict") verdicts.push(verdicts[0]);
      return completion("", { processed: p.inventory, complete: true, noContent: false, verdicts });
    };
    const result = await extractClaims(turns, complete, { strictWebinar: true });
    if (fault === "none") { assert.equal(result.degraded, null); assert.equal(result.claims[0]!.evidence![0]!.quote, turns[0]!.text); assert.equal(result.claims[0]!.verification, "unverified"); }
    else { assert.ok(result.degraded, fault); assert.deepEqual(result.claims, [], fault); }
  }
});
test("strict no-claim result is distinct only after explicit full semantic no-content review", async () => {
  const complete: ClaimsCompleteFn = async (job) => {
    const p = JSON.parse(job.messages[1]!.content);
    if (p.phase === "judge") { assert.equal(p.mode, "claim-extraction"); assert.match(job.messages[0]!.content, /fact-free source/); }
    return completion("", p.phase === "extract-claims" ? { processed: p.inventory, claims: [] } : { processed: p.inventory, complete: true, noClaims: true, verdicts: [] });
  };
  const result = await extractClaims([turn("empty", "spk:0", "Good morning.")], complete, { strictWebinar: true });
  assert.equal(result.degraded, null); assert.deepEqual(result.claims, []);
});
