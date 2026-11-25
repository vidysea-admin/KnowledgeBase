/** D2H CLI tests: node --test scripts/eval/gold/eval-extraction.test.mjs. Synthetic fixtures only; no network, model or database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, "../../..");
const script = join(repo, "scripts/eval-extraction.mjs");
const fixtureGold = join(here, "fixtures/synthetic-gold-export.json"), proposed = join(repo, "data/eval/extraction-thresholds.json");
const tmp = () => mkdtempSync(join(tmpdir(), "d2h-"));
const run = (...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 120000 });
  let json; try { json = JSON.parse(r.stdout); } catch { json = undefined; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
};
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const gold = () => JSON.parse(readFileSync(fixtureGold, "utf8"));
const write = (dir, name, value) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(value)); return p; };
const bar = (status, thresholds) => ({ format: "extraction-thresholds-v1", status, thresholds });

// ---- D2H-C1 gold scoring
test("C1: --gold reports every metric with numerator and denominator, labelled synthetic", () => {
  const r = run("--gold", fixtureGold);
  assert.equal(r.status, 0); assert.ok(r.json, "stdout is one JSON document");
  const m = r.json.metrics;
  for (const k of ["fabricatedCitations", "claimSupport", "machineChecked", "factCoverage", "topicsPrecision", "topicsRecall", "decisionsPrecision", "decisionsRecall", "falseDecisions"]) {
    assert.equal(typeof m[k].numerator, "number", k); assert.equal(typeof m[k].denominator, "number", k); assert.equal(m[k].measured, true, k);
  }
  assert.deepEqual([m.fabricatedCitations.numerator, m.fabricatedCitations.denominator], [0, 4]);
  assert.deepEqual([m.claimSupport.numerator, m.claimSupport.denominator], [4, 4]);
  assert.deepEqual([m.falseDecisions.numerator, m.falseDecisions.denominator], [0, 1]);
  assert.equal(r.json.provenance.synthetic, true); assert.equal(r.json.measurementOfRealCorpus, false);
  assert.equal(r.json.bar, "none"); assert.equal(typeof r.json.definitions.claimSupport, "string");
});
test("C1 falsification: a fabricated citation and an unsupported label move the metrics", () => {
  const g = gold(); g.cases[0].persisted[1].evidence[0].turnId = "no-such-turn"; g.cases[0].labels[2].status = "unsupported";
  const r = run("--gold", write(tmp(), "g.json", g));
  assert.deepEqual([r.json.metrics.fabricatedCitations.numerator, r.json.metrics.fabricatedCitations.denominator], [1, 4]);
  assert.deepEqual([r.json.metrics.claimSupport.numerator, r.json.metrics.claimSupport.denominator], [3, 4]);
  assert.deepEqual([r.json.metrics.machineChecked.numerator, r.json.metrics.machineChecked.denominator], [3, 4]);
});
test("C1: an invalid gold set or flag combination fails closed with exit 2", () => {
  const dir = tmp(); assert.equal(run("--gold", join(dir, "absent.json")).status, 2);
  assert.equal(run("--gold", write(dir, "bad.json", { format: "other", cases: [] })).status, 2);
  assert.equal(run("--thresholds", proposed).status, 2);
  assert.equal(run("--gold", fixtureGold, "--thresholds").status, 2);
});

// ---- D2H-C2 thresholds from a file
test("C2: the shipped proposed bar is labelled proposed and is never acceptance", () => {
  const r = run("--gold", fixtureGold, "--thresholds", proposed);
  assert.equal(r.json.bar, "proposed"); assert.equal(r.json.thresholdsStatus, "proposed");
  assert.equal(r.json.acceptanceForG14, false); assert.equal(r.json.verdict, "meets-proposed-bar"); assert.notEqual(r.json.verdict, "pass");
  assert.equal(r.status, 0);
});
test("C2 falsification: changing one number in the file flips the exit code", () => {
  const g = gold(); g.cases[0].labels[2].status = "unsupported"; const dir = tmp(), gp = write(dir, "g.json", g);
  const loose = write(dir, "loose.json", bar("approved", { claimSupport: { min: 0.7, required: true } }));
  const tight = write(dir, "tight.json", bar("approved", { claimSupport: { min: 0.8, required: true } }));
  assert.equal(run("--gold", gp, "--thresholds", loose).status, 0);
  const miss = run("--gold", gp, "--thresholds", tight);
  assert.equal(miss.status, 1); assert.equal(miss.json.verdict, "fail"); assert.equal(miss.json.results.claimSupport.status, "misses");
});
test("C2: count metrics compare the count against max", () => {
  const g = gold(); g.cases[0].persisted[0].evidence[0].turnId = "ghost"; const dir = tmp(), gp = write(dir, "g.json", g);
  assert.equal(run("--gold", gp, "--thresholds", write(dir, "z.json", bar("approved", { fabricatedCitations: { max: 0 } }))).status, 1);
  assert.equal(run("--gold", gp, "--thresholds", write(dir, "o.json", bar("approved", { fabricatedCitations: { max: 1 } }))).status, 0);
});
test("C2: approved bar met on non-synthetic gold is the only acceptance; synthetic never is", () => {
  const dir = tmp(), t = write(dir, "t.json", bar("approved", { claimSupport: { min: 0.95, required: true } }));
  const synthetic = run("--gold", fixtureGold, "--thresholds", t);
  assert.equal(synthetic.json.verdict, "pass"); assert.equal(synthetic.json.acceptanceForG14, false);
  const g = gold(); delete g.synthetic; const real = run("--gold", write(dir, "g.json", g), "--thresholds", t);
  assert.equal(real.json.acceptanceForG14, true); assert.equal(real.json.measurementOfRealCorpus, true);
});
test("C2: invalid thresholds files fail closed with exit 2", () => {
  const dir = tmp(); const bad = (name, v) => assert.equal(run("--gold", fixtureGold, "--thresholds", write(dir, name, v)).status, 2, name);
  bad("status.json", bar("draft", { claimSupport: { min: 0.9 } })); bad("unknown.json", bar("approved", { nonsense: { min: 0.9 } }));
  bad("kind.json", bar("approved", { claimSupport: { max: 0.9 } })); bad("range.json", bar("approved", { claimSupport: { min: 1.5 } }));
  bad("empty.json", bar("approved", {}));
});
test("C2: without --thresholds the output states bar none and makes no pass/fail claim", () => {
  const r = run("--gold", fixtureGold);
  assert.equal(r.json.bar, "none"); assert.equal(r.json.verdict, "no-bar"); assert.equal(r.json.acceptanceForG14, false); assert.equal(r.json.results, undefined);
});

// ---- D2H-C3 not-measured is not a number
test("C3: absent decision inputs are not-measured (never 0 or 100) and fail only when required", () => {
  const g = gold(); for (const c of g.cases) for (const k of ["predictedDecisions", "decisionLabels", "goldDecisions", "noDecisionSession"]) delete c[k];
  const dir = tmp(), gp = write(dir, "g.json", g), plain = run("--gold", gp);
  for (const k of ["decisionsPrecision", "decisionsRecall", "falseDecisions"]) {
    assert.equal(plain.json.metrics[k].measured, false, k); assert.equal(plain.json.metrics[k].value, null, k); assert.equal(typeof plain.json.metrics[k].reason, "string", k);
  }
  const req = run("--gold", gp, "--thresholds", write(dir, "r.json", bar("approved", { claimSupport: { min: 0.9 }, decisionsPrecision: { min: 0.5, required: true } })));
  assert.equal(req.status, 3); assert.equal(req.json.verdict, "not-measurable"); assert.equal(req.json.results.decisionsPrecision.status, "not-measured");
  const opt = run("--gold", gp, "--thresholds", write(dir, "o.json", bar("approved", { claimSupport: { min: 0.9 }, decisionsPrecision: { min: 0.5 } })));
  assert.equal(opt.status, 0); assert.equal(opt.json.results.decisionsPrecision.status, "not-measured");
});
test("C3: a zero denominator is not-measured; nothing measured is never a pass", () => {
  const g = gold(); for (const c of g.cases) { delete c.labels; delete c.secondLabels; delete c.factLabels; }
  const dir = tmp(), gp = write(dir, "g.json", g);
  assert.equal(run("--gold", gp).json.metrics.claimSupport.measured, false);
  const r = run("--gold", gp, "--thresholds", write(dir, "t.json", bar("approved", { claimSupport: { min: 0.9 } })));
  assert.equal(r.status, 3); assert.equal(r.json.verdict, "not-measurable");
});

// ---- D2H-C4 reviewer agreement
test("C4: double-labelled claims give agreement, count and measure; none gives not-measured", () => {
  const a = run("--gold", fixtureGold).json.reviewerAgreement;
  assert.deepEqual([a.numerator, a.denominator, a.doubleLabelled], [1, 2, 2]); assert.equal(a.value, 0.5); assert.equal(typeof a.measure, "string");
  const g = gold(); for (const c of g.cases) delete c.secondLabels;
  const n = run("--gold", write(tmp(), "g.json", g)).json.reviewerAgreement;
  assert.equal(n.measured, false); assert.equal(n.value, null); assert.equal(n.doubleLabelled, 0);
  const bad = gold(); bad.cases[0].secondLabels[0].claimId = "c9"; assert.equal(run("--gold", write(tmp(), "b.json", bad)).status, 2);
});

// ---- D2H-C6 regression: --input replay output unchanged
test("C6: --input replay output is byte-identical to the recorded pre-change output", () => {
  const dir = tmp(), turn = (id, speakerRef, text, tStart, tEnd) => ({ _id: id, tenantId: "t", sessionId: "s", speakerRef, text, tStart, tEnd });
  mkdirSync(dir, { recursive: true });
  write(dir, "turns.json", [turn("t1", "a", "one two", 0, 4), turn("t2", "b", "three four", 4, 8)]);
  write(dir, "persisted.json", [
    { _id: "c1", tenantId: "t", sessionId: "s", text: "Claim one.", evidence: [{ sessionId: "s", turnId: "t1" }] },
    { _id: "c2", tenantId: "t", sessionId: "s", text: "Claim two.", evidence: [{ sessionId: "s", turnId: "gone" }] }]);
  const manifest = write(dir, "manifest.json", { version: 1, cases: [{ id: "replay-1", tenantId: "t", sessionId: "s", artifacts: { turns: "turns.json", persisted: "persisted.json" } }] });
  const expected = JSON.parse(readFileSync(join(here, "fixtures/replay-expected.json"), "utf8")), r = run("--input", manifest);
  assert.equal(r.status, expected.exit); assert.equal(r.stdout, expected.stdout);
  assert.equal(run("--bogus").json.failure, "usage: --input local-manifest.json");
  assert.equal(run("--thresholds", proposed).json.failure, "usage: --input local-manifest.json");
});

// ---- invariants
test("I2: the gold set and thresholds file are byte-identical after a run", () => {
  const before = [sha(fixtureGold), sha(proposed)]; run("--gold", fixtureGold, "--thresholds", proposed);
  assert.deepEqual([sha(fixtureGold), sha(proposed)], before);
});
test("I1: the script's imports are local-only (no network, database, dotenv or provider)", () => {
  const src = readFileSync(script, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), specs = [...src.matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const s of specs) assert.ok(s.startsWith("node:") || s.startsWith("../packages/index/src/eval/") || s === "tsx/esm/api", s);
  assert.ok(!/node:(?:https?|net|tls|dns|http2)|\bfetch\(|dotenv|process\.env/.test(src));
});
