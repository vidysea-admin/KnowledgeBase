import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extractAndPersistDecisions } from "../../../apps/api/src/indexing/decisions-persist.js";
import { createSessionDecisionsDeps } from "../../../apps/api/src/session-decisions/reader.js";
import { decisionTurns, memoryDecisionFixture } from "../../../apps/api/src/session-decisions/fixture.testsupport.js";
import { buildTestDeps } from "../../../apps/api/src/fixtures.js";
import { startTestServer } from "../../../apps/api/src/testUtils.js";

test("PUBLIC synthetic actual persisted producer→authenticated mounted route capture for client/panel", async () => {
  const f = memoryDecisionFixture(decisionTurns);
  const producerResult = await extractAndPersistDecisions("tenant-a", "decision-session", decisionTurns, async () => ({
    text: JSON.stringify([{ text: "Ship Friday.", turnIds: ["choice", "agreement"], owner: "expert" }]),
    usage: { inputTokens: 1, outputTokens: 1 }, provider: "public-scripted", model: "offline", costUsd: 0,
  }), f.db);
  assert.deepEqual(producerResult, { count: 1, degraded: null }); assert.equal(f.table("decisions").length, 1);
  const stored = structuredClone(f.table("decisions")[0]!);
  const app = await startTestServer(buildTestDeps({ brain: f.brain, sessionDecisions: createSessionDecisionsDeps(f.brain, f.db),
    keyStore: { verify: async (key) => key === "transport" ? { tenantId: "tenant-a", scopes: ["sessions"] } : null } }));
  try {
    const headers = { authorization: "Bearer transport" };
    const response = await fetch(`${app.baseUrl}/sessions/decision-session/decisions`, { headers });
    assert.equal(response.status, 200); const body: unknown = await response.json();
    assert.ok(body !== null && typeof body === "object" && "sessionId" in body && body.sessionId === "decision-session"
      && "decisions" in body && Array.isArray(body.decisions));
    assert.equal(body.decisions.length, 1); const decision = body.decisions[0];
    assert.ok(decision !== null && typeof decision === "object" && "evidence" in decision && Array.isArray(decision.evidence));
    assert.equal(decision._id, stored._id); assert.equal(decision.text, stored.text); assert.equal(decision.status, "proposed");
    assert.deepEqual(decision.evidence.map((e) => e.turnId), ["agreement", "choice"]);
    assert.deepEqual(decision.evidence.map((e) => e.text), ["Agreed.", "We will ship Friday."]);
    const session = await fetch(`${app.baseUrl}/sessions/decision-session`, { headers }); assert.equal(session.status, 200);
    const sessionResponse: unknown = await session.json();
    const target = new URL("./public-transport.json", import.meta.url);
    mkdirSync(new URL("./", target), { recursive: true });
    writeFileSync(target, JSON.stringify({ version: 1, dataClass: "synthetic-only", scriptedProvider: true, cases: [{
      semanticMeasured: false, sourceCount: decisionTurns.length,
      sourceHash: createHash("sha256").update(JSON.stringify(decisionTurns)).digest("hex"), producerResult,
      stored: { _id: stored._id, text: stored.text, status: stored.status }, response: body, sessionResponse,
    }] }, null, 2) + "\n");
  } finally { await app.close(); }
});
