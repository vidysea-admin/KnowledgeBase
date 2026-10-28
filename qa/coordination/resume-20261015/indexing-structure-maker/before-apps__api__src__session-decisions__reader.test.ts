import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Turns } from "@lkb/core";
import { extractAndPersistDecisions } from "../indexing/decisions-persist.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { buildTestDeps } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { createSessionDecisionsDeps } from "./reader.js";
import { decisionTurns, memoryDecisionFixture } from "./fixture.testsupport.js";

const completion = (payload: unknown) => async () => ({ text: JSON.stringify(payload), usage: { inputTokens: 1, outputTokens: 1 }, provider: "scripted", model: "offline", costUsd: 0 });
const payload = [{ text: "Ship Friday.", turnIds: ["choice", "agreement"], owner: "expert" }];
const produce = async (fixture: ReturnType<typeof memoryDecisionFixture>, turns = decisionTurns, rows: unknown = payload) =>
  extractAndPersistDecisions(turns[0]!.tenantId, turns[0]!.sessionId, turns, completion(rows), fixture.db);
const reader = (f: ReturnType<typeof memoryDecisionFixture>) => createSessionDecisionsDeps(f.brain, f.db);
function assertDecisionResponse(value: unknown): asserts value is { decisions: Array<{ _id: string; text: string; status: string; evidence: unknown[] }> } {
  assert.ok(value !== null && typeof value === "object" && "decisions" in value && Array.isArray(value.decisions));
  for (const row of value.decisions) {
    assert.ok(row !== null && typeof row === "object" && typeof row._id === "string" && typeof row.text === "string"
      && typeof row.status === "string" && Array.isArray(row.evidence));
  }
}

test("actual producer stamps generation binding and reader minimally projects every current citation without writes", async () => {
  const f = memoryDecisionFixture(decisionTurns);
  assert.deepEqual(await produce(f), { count: 1, degraded: null });
  const stored = f.table("decisions")[0]!;
  assert.match(stored.sourceEvidenceDigest as string, /^[a-f0-9]{64}$/);
  assert.match(stored.generationEvidenceDigest as string, /^[a-f0-9]{64}$/);
  stored.apiToken = "never-send-private-extra";
  const start = f.queries.length;
  const out = await reader(f).getSessionDecisions("tenant-a", "decision-session");
  assert.equal(out!.decisions.length, 1); assert.equal(out!.decisions[0]!._id, stored._id);
  assert.equal(out!.decisions[0]!.status, "proposed");
  assert.deepEqual(out!.decisions[0]!.evidence.map((e) => e.turnId), ["agreement", "choice"]);
  assert.equal(out!.decisions[0]!.tStart, 3); assert.equal(out!.decisions[0]!.tEnd, 7);
  assert.equal(out!.decisions[0]!.owner, "expert");
  assert.ok(!JSON.stringify(out).includes("never-send-private-extra"));
  assert.ok(!JSON.stringify(out).includes("tenantId"));
  assert.ok(!JSON.stringify(out).includes("EvidenceDigest"));
  assert.ok(f.queries.slice(start).every((q) => q.op === "find" || q.op === "findOne"));
  assert.ok(f.queries.every((q) => q.filter.tenantId === "tenant-a"));
});

test("legacy unbound, mixed, missing, ambiguous, invalid status/time and invalid owners withhold whole rows", async () => {
  const alterations = [
    (d: Record<string, unknown>) => { delete d.generationEvidenceDigest; },
    (d: Record<string, unknown>) => { delete d.sourceEvidenceDigest; },
    (d: Record<string, unknown>) => { d.evidence = [{ turnId: "choice", sessionId: "decision-session" }, { turnId: "agreement", sessionId: "foreign" }]; },
    (d: Record<string, unknown>) => { d.evidence = [{ turnId: "missing", sessionId: "decision-session" }]; },
    (d: Record<string, unknown>) => { d.status = "confirmed"; },
    (d: Record<string, unknown>) => { d.tEnd = 99; },
    (d: Record<string, unknown>) => { d.owner = "fabricated"; },
  ];
  for (const change of alterations) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f); change(f.table("decisions")[0]!);
    assert.deepEqual((await reader(f).getSessionDecisions("tenant-a", "decision-session"))!.decisions, []);
  }
  const f = memoryDecisionFixture(decisionTurns); await produce(f);
  f.table("turns").push(structuredClone(f.table("turns")[1]!));
  assert.deepEqual((await reader(f).getSessionDecisions("tenant-a", "decision-session"))!.decisions, []);
});

test("redacted cited or uncited generation siblings never disclose the earlier stored decision", async () => {
  for (const id of ["choice", "opening"]) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f);
    f.overlay(id, "[redacted]");
    assert.deepEqual((await reader(f).getSessionDecisions("tenant-a", "decision-session"))!.decisions, []);
  }
});

test("genuinely regenerated effective inputs can be consumed despite different immutable originals", async () => {
  const f = memoryDecisionFixture(decisionTurns); f.overlay("choice", "We will ship Monday.");
  const current = await readEffectiveTurns(f.db, "tenant-a", decisionTurns, "decision-session");
  await produce(f, current, [{ text: "Ship Monday.", turnIds: ["choice", "agreement"], owner: "expert" }]);
  const result = await reader(f).getSessionDecisions("tenant-a", "decision-session");
  assert.equal(result!.decisions[0]!.text, "Ship Monday.");
  assert.ok(result!.decisions[0]!.evidence.some((e) => e.text === "We will ship Monday."));
  assert.equal(f.table("turns")[1]!.text, "We will ship Friday.");
});

test("source and overlay withdrawal during the latest awaited decision query fail closed", async () => {
  for (const action of ["withdraw", "redact"]) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f); let lookups = 0;
    f.setHook((name, op) => {
      if (name === "decisions" && op === "find" && ++lookups === 2) {
        if (action === "withdraw") f.table("sources").length = 0;
        else f.overlay("choice", "[redacted]");
      }
    });
    const result = await reader(f).getSessionDecisions("tenant-a", "decision-session");
    if (action === "withdraw") assert.equal(result, null);
    else assert.deepEqual(result!.decisions, []);
  }
});

test("candidate withdrawn during awaited current evidence resolution cannot survive as an old snapshot", async () => {
  const f = memoryDecisionFixture(decisionTurns); await produce(f); let reads = 0;
  const deps = createSessionDecisionsDeps({ async getSessionDetail(t, s) {
    if (++reads === 2) f.table("decisions").length = 0;
    return f.brain.getSessionDetail(t, s);
  } }, f.db);
  assert.deepEqual((await deps.getSessionDecisions("tenant-a", "decision-session"))!.decisions, []);
});

test("third live current-await withdrawal or changed publication is observed by final snapshot", async () => {
  for (const action of ["withdraw", "change"]) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f); let reads = 0, performed = false;
    const deps = createSessionDecisionsDeps({ async getSessionDetail(t, s) {
      if (++reads === 3) {
        performed = true;
        if (action === "withdraw") f.table("decisions").length = 0;
        else f.table("decisions")[0]!.text = "Changed stored publication";
      }
      return f.brain.getSessionDetail(t, s);
    } }, f.db);
    assert.deepEqual((await deps.getSessionDecisions("tenant-a", "decision-session"))!.decisions, []);
    assert.equal(performed, true); assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0]!.ended, true);
  }
});

test("snapshot boundary source/head/approval/publication changes fail closed", async () => {
  for (const action of ["source", "head", "approval", "publication"]) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f); let performed = false;
    f.setHook(() => {
      if (performed || !f.queries.at(-1)!.snapshot) return;
      performed = true;
      if (action === "source") f.table("sources").length = 0;
      if (action === "head") f.overlay("choice", "[redacted]");
      if (action === "approval") f.table("whatsapp_candidates").push({ _id: "private-review", tenantId: "tenant-a", sessionId: "decision-session" });
      if (action === "publication") f.table("decisions")[0]!.evidence = [{ turnId: "choice", sessionId: "foreign" }];
    });
    const out = await reader(f).getSessionDecisions("tenant-a", "decision-session");
    assert.ok(out === null || out.decisions.length === 0); assert.equal(performed, true); assert.equal(f.sessions[0]!.ended, true);
  }
});

test("test-only snapshot model keeps all authority reads coherent after its first observation", async () => {
  const f = memoryDecisionFixture(decisionTurns); await produce(f); let advanced = false;
  f.setHook((name, op) => {
    if (!advanced && name === "turns" && op === "find" && f.queries.at(-1)!.snapshot) {
      advanced = true; f.table("turns")[1]!.text = "New live source"; f.table("decisions").length = 0;
    }
  });
  const out = await reader(f).getSessionDecisions("tenant-a", "decision-session");
  assert.equal(advanced, true); assert.equal(out!.decisions.length, 1);
  assert.ok(out!.decisions[0]!.evidence.some((e) => e.text === "We will ship Friday."));
  assert.equal(f.table("decisions").length, 0);
  const boundary = f.queries.findIndex((q) => q.snapshot);
  assert.ok(boundary >= 0); assert.ok(f.queries.slice(boundary).every((q) => q.snapshot));
  assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0]!.ended, true);
});

test("unsupported snapshot capability has no collection-only fallback and mounted route returns generic503", async () => {
  const f = memoryDecisionFixture(decisionTurns); await produce(f); f.setSnapshotAvailable(false);
  await assert.rejects(reader(f).getSessionDecisions("tenant-a", "decision-session"), /snapshot unavailable/);
  const app = await startTestServer(buildTestDeps({ brain: f.brain, sessionDecisions: reader(f),
    keyStore: { verify: async () => ({ tenantId: "tenant-a", scopes: ["sessions"] }) } }));
  try {
    const response = await fetch(`${app.baseUrl}/sessions/decision-session/decisions`, { headers: { authorization: "Bearer reader" } });
    assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("Ship Friday."));
  } finally { await app.close(); }
  assert.equal(f.sessions.length, 0);
});

test("current raw source/time changes and privacy-ineligible sessions withhold all earlier text", async () => {
  for (const change of ["text", "time", "whatsapp", "source-error"]) {
    const f = memoryDecisionFixture(decisionTurns); await produce(f);
    if (change === "text") f.table("turns")[1]!.text = "Current public correction";
    if (change === "time") f.table("turns")[1]!.tEnd = 20;
    if (change === "whatsapp") f.table("sources")[0]!.kind = "whatsapp-batch";
    if (change === "source-error") f.setHook((name) => { if (name === "sources") throw new Error("unavailable"); });
    const out = await reader(f).getSessionDecisions("tenant-a", "decision-session");
    assert.ok(out === null || out.decisions.length === 0);
  }
});

test("stored statuses are preserved and absent owner remains absent; document positions are characters", async () => {
  const source = decisionTurns.map((t) => ({ ...t, speakerRef: "document" }));
  const f = memoryDecisionFixture(source, "document");
  await produce(f, source, [{ text: "Ship Friday.", turnIds: ["choice", "agreement"] }]);
  for (const status of ["proposed", "needs-review", "verified"]) {
    f.table("decisions")[0]!.status = status;
    const d = (await reader(f).getSessionDecisions("tenant-a", "decision-session"))!.decisions[0]!;
    assert.equal(d.status, status); assert.ok(!("owner" in d)); assert.ok(d.evidence.every((e) => e.unit === "characters"));
  }
});

test("actual mounted authenticated route uses actor tenant, refuses missing/revoked/foreign/scope and ignores query tenant", async () => {
  const f = memoryDecisionFixture(decisionTurns); await produce(f);
  const app = await startTestServer(buildTestDeps({ brain: f.brain, sessionDecisions: reader(f),
    keyStore: { verify: async (key) => key === "reader" ? { tenantId: "tenant-a", scopes: ["sessions"] }
      : key === "limited" ? { tenantId: "tenant-a", scopes: ["ask"] } : key === "foreign" ? { tenantId: "tenant-b", scopes: ["sessions"] } : null } }));
  try {
    for (const [key, status] of [[null, 401], ["revoked", 401], ["limited", 403], ["foreign", 404]] as const) {
      const response = await fetch(`${app.baseUrl}/sessions/decision-session/decisions`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
      assert.equal(response.status, status); assert.ok(!(await response.text()).includes("Ship Friday."));
    }
    const response = await fetch(`${app.baseUrl}/sessions/decision-session/decisions?tenantId=tenant-b`, { headers: { authorization: "Bearer reader" } });
    assert.equal(response.status, 200); const body: unknown = await response.json(); assertDecisionResponse(body);
    assert.equal(body.decisions[0]!._id, f.table("decisions")[0]!._id);
  } finally { await app.close(); }
});

test("actual producer→root mounted route transport captured for shared client/panel; real source quote is not semantic gold", {
  skip: process.env.KB_U25_PRIVATE_TOC_TESTS !== "1" ? "HOLD: authentic TOC transport generation requires explicit private-test opt-in" : false,
}, async () => {
  const cases: Array<{ source: Turns[]; rows: unknown; semanticMeasured: false; sourceHash: string }> = [
    { source: decisionTurns, rows: payload, semanticMeasured: false, sourceHash: createHash("sha256").update(JSON.stringify(decisionTurns)).digest("hex") },
  ];
  const bytes = readFileSync(new URL("../../../../data/toc-migrated/2026-08-27-in-focus-4/turns.json", import.meta.url));
  const source: Turns[] = JSON.parse(bytes.toString("utf8")), cited = source.find((t) => t.text.length > 100)!;
  assert.equal(source.length, 51);
  cases.push({ source, rows: [{ text: cited.text, turnIds: [cited._id], owner: cited.speakerRef }], semanticMeasured: false, sourceHash: createHash("sha256").update(bytes).digest("hex") });
  const captures = [];
  for (const item of cases) {
    const first = item.source[0]!, f = memoryDecisionFixture(item.source);
    const result = await produce(f, item.source, item.rows), stored = structuredClone(f.table("decisions")[0]!);
    const app = await startTestServer(buildTestDeps({ brain: f.brain, sessionDecisions: reader(f),
      keyStore: { verify: async (key) => key === "transport" ? { tenantId: first.tenantId, scopes: ["sessions"] } : null } }));
    try {
      const response = await fetch(`${app.baseUrl}/sessions/${encodeURIComponent(first.sessionId)}/decisions`, { headers: { authorization: "Bearer transport" } });
      assert.equal(response.status, 200); const body: unknown = await response.json(); assertDecisionResponse(body);
      assert.equal(body.decisions.length, 1); assert.equal(body.decisions[0]!._id, stored._id); assert.equal(body.decisions[0]!.text, stored.text);
      assert.equal(body.decisions[0]!.status, "proposed"); assert.equal(body.decisions[0]!.evidence.length, (stored.evidence as unknown[]).length);
      const sessionResponse = await fetch(`${app.baseUrl}/sessions/${encodeURIComponent(first.sessionId)}`, { headers: { authorization: "Bearer transport" } });
      assert.equal(sessionResponse.status, 200);
      captures.push({ semanticMeasured: false, sourceCount: item.source.length, sourceHash: item.sourceHash, producerResult: result,
        stored: { _id: stored._id, text: stored.text, status: stored.status }, response: body, sessionResponse: await sessionResponse.json() });
    } finally { await app.close(); }
  }
  const target = new URL("../../../../qa/evidence/goal-u25-consumer/", import.meta.url);
  mkdirSync(target, { recursive: true }); writeFileSync(new URL("transport.json", target), JSON.stringify({ version: 1, scriptedProvider: true, cases: captures }, null, 2) + "\n");
});
