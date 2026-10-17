import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteResult } from "@lkb/ai";
import type { Turns } from "@lkb/core";
import { acquireDecisions, type DecisionAcquisitionInput } from "./decisions-acquisition.js";
import { aggregateExtractionReports } from "./extraction.js";
const turns: Turns[] = [{ _id: "turn-1", tenantId: "tenant-1", sessionId: "session-1",
  speakerRef: "speaker-1", text: "Agreed, we ship Friday.", tStart: 4, tEnd: 8 }];
const proposal = [{ text: "Ship Friday.", turnIds: ["turn-1"], owner: "speaker-1" }];
const stored = [{ _id: "stored-1", tenantId: "tenant-1", text: "Ship Friday.", status: "proposed",
  tStart: 4, tEnd: 8, evidence: [{ turnId: "turn-1", sessionId: "session-1" }] }];
const done = (text: string, json?: unknown): CompleteResult => ({ text, ...(json !== undefined ? { json } : {}),
  usage: { inputTokens: 1, outputTokens: 1 }, provider: "synthetic", model: "fixture" });
const input = (extra: Partial<DecisionAcquisitionInput> = {}): DecisionAcquisitionInput => ({
  id: "case-1", tenantId: "tenant-1", sessionId: "session-1", artifactHash: "a".repeat(64),
  turns: structuredClone(turns), complete: async () => done(JSON.stringify(proposal)), ...extra });

test("actual extractor routes decisions; real readback survives into independent measurement consumer", async () => {
  const result = await acquireDecisions(input({ complete: async job => {
    assert.equal(job.kind, "decisions");
    assert.match(job.messages[1]!.content, /\[id:turn-1\]/);
    return done(JSON.stringify(proposal));
  }, readPersisted: async scope => { assert.deepEqual(scope, { tenantId: "tenant-1", sessionId: "session-1" }); return stored; } }));
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(result.extraction.decisions, [{ text: "Ship Friday.", evidenceTurnIds: ["turn-1"], tStart: 4, tEnd: 8, owner: "speaker-1" }]);
  assert.deepEqual(result.artifacts.persisted, stored);
  assert.equal(result.persistence.kind, "storage-observation");
  for (const stage of Object.values(result.report.stages)) { assert.equal(stage.available, true); assert.deepEqual(stage.issues, []); }
  assert.equal(result.report.stages.filtered.optionalChecks.attribution, 1);
  const downstream = aggregateExtractionReports([result.report]);
  assert.equal(downstream.stages.raw.rows, 1);
  assert.equal(downstream.stages.persisted.rows, 1);
  assert.equal(result.report.semantic.measured, false);
  assert.equal(result.report.semantic.unsupportedRate.value, null);
  assert.equal(result.report.entities.person.measured, false);
});

test("fabricated citations remain in raw and parsed before actual filtering; degraded readback is skipped", async () => {
  const rows = [{ text: "Mixed.", turnIds: ["turn-1", "invented"] }, { text: "Fabricated.", turnIds: ["missing"] }];
  let reads = 0;
  const result = await acquireDecisions(input({ complete: async () => done(JSON.stringify(rows)), readPersisted: async () => { reads++; return []; } }));
  assert.deepEqual(result.artifacts.parsed, rows);
  assert.equal(result.artifacts.rawText, JSON.stringify(rows));
  assert.deepEqual(result.extraction.decisions.map(d => d.evidenceTurnIds), [["turn-1"]]);
  for (const name of ["raw", "parsed"] as const) {
    assert.equal(result.report.stages[name].invalidCitationRate.numerator, 2);
    assert.equal(result.report.stages[name].invalidCitationRate.denominator, 3);
  }
  assert.equal(result.report.stages.filtered.available, false);
  assert.equal(result.report.stages.persisted.available, false);
  assert.equal(result.persistence.reason, "extraction-degraded");
  assert.equal(reads, 0); assert.equal(result.complete, false);
});

test("actual JSON and literal text remain distinct; no raw text is manufactured from JSON", async () => {
  const divergent = await acquireDecisions(input({ complete: async () => done("[]", proposal) }));
  assert.equal(divergent.report.stages.raw.rows, 0);
  assert.equal(divergent.report.stages.parsed.rows, 1);
  assert.equal(divergent.extraction.decisions.length, 1);
  const absent = await acquireDecisions(input({ complete: async () => ({ ...done("", proposal), text: undefined } as unknown as CompleteResult) }));
  assert.equal("rawText" in absent.artifacts, false);
  assert.equal(absent.report.stages.raw.available, false);
  assert.equal(absent.report.stages.parsed.available, true);
  assert.equal(absent.complete, false);
});

test("missing, inaccessible and malformed readback stay unknown; rows are never generated from proposals", async () => {
  const missing = await acquireDecisions(input());
  assert.equal(missing.persistence.reason, "readback-not-supplied");
  for (const readPersisted of [async () => { throw new Error("offline"); }, async () => null]) {
    const result = await acquireDecisions(input({ readPersisted }));
    assert.ok(["readback-failed", "readback-invalid"].includes(result.persistence.reason!));
    assert.equal("persisted" in result.artifacts, false);
    assert.equal(result.report.stages.persisted.rows, null);
    assert.equal(result.complete, false);
  }
});

test("provider failures and malformed output never become clean empty measurements", async () => {
  for (const complete of [async () => { throw new Error("provider down"); }, async () => done("invalid text"), async () => done('{"decisions":[]}')]) {
    const result = await acquireDecisions(input({ complete, readPersisted: async () => { assert.fail("degraded result must not read back"); } }));
    assert.ok(result.extraction.degraded);
    assert.equal(result.report.stages.filtered.available, false);
    assert.equal(result.report.stages.persisted.available, false);
    assert.equal(result.complete, false);
  }
});

test("genuine provider empty remains distinct from empty source without a provider observation", async () => {
  const genuine = await acquireDecisions(input({ complete: async () => done("[]"), readPersisted: async () => [] }));
  for (const stage of Object.values(genuine.report.stages)) { assert.equal(stage.available, true); assert.equal(stage.rows, 0); }
  assert.equal(genuine.extraction.degraded, null);
  const empty = await acquireDecisions(input({ turns: [], complete: async () => { assert.fail("empty source must not call provider"); }, readPersisted: async () => { assert.fail("no observed provider response"); } }));
  assert.equal(empty.providerCalls, 0); assert.equal(empty.persistence.reason, "provider-not-called");
  assert.equal(empty.report.stages.raw.available, false); assert.equal(empty.complete, false);
});

test("scope refusal precedes provider/readback; actual invalid-source extraction remains degraded", async () => {
  let calls = 0;
  for (const extra of [{ tenantId: "other" }, { sessionId: "other" }, { id: " " }, { artifactHash: "invalid" }]) {
    await assert.rejects(acquireDecisions(input({ ...extra, complete: async () => { calls++; return done("[]"); } })), /scope/);
  }
  assert.equal(calls, 0);
  const result = await acquireDecisions(input({ turns: [{ ...turns[0]!, tStart: -1 }], complete: async () => { calls++; return done("[]"); } }));
  assert.equal(calls, 0); assert.ok(result.extraction.degraded); assert.equal(result.complete, false);
});

test("captured stage snapshots resist later mutation and expose foreign storage citations", async () => {
  const source = input(); const rows = structuredClone(proposal); const readback = structuredClone(stored);
  const result = await acquireDecisions({ ...source, complete: async () => done(JSON.stringify(rows), rows), readPersisted: async () => readback });
  source.turns[0]!.text = "changed"; rows[0]!.turnIds[0] = "changed"; readback[0]!.text = "changed";
  assert.equal((result.artifacts.turns[0] as Turns).text, turns[0]!.text);
  assert.deepEqual(result.artifacts.parsed, proposal); assert.deepEqual(result.artifacts.persisted, stored);
  const foreign = await acquireDecisions(input({ readPersisted: async () => [{ ...stored[0], tenantId: "foreign" }] }));
  assert.ok(foreign.report.stages.persisted.issues.some(i => i.code === "foreign-claim-owner"));
  assert.equal(foreign.report.semantic.measured, false);
});
