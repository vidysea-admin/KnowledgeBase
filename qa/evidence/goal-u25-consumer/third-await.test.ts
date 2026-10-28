import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAndPersistDecisions } from "../../../apps/api/src/indexing/decisions-persist.js";
import { createSessionDecisionsDeps } from "../../../apps/api/src/session-decisions/reader.js";
import { decisionTurns, memoryDecisionFixture } from "../../../apps/api/src/session-decisions/fixture.testsupport.js";

async function producedFixture() {
  const fixture = memoryDecisionFixture(decisionTurns);
  const result = await extractAndPersistDecisions("tenant-a", "decision-session", decisionTurns, async () => ({
    text: JSON.stringify([{ text: "Ship Friday.", turnIds: ["choice", "agreement"], owner: "expert" }]),
    usage: { inputTokens: 1, outputTokens: 1 }, provider: "checker-scripted", model: "offline", costUsd: 0,
  }), fixture.db);
  assert.deepEqual(result, { count: 1, degraded: null });
  assert.equal(fixture.table("decisions").length, 1);
  return fixture;
}

test("independent control: unchanged produced row survives current reader with stored proposed status", async () => {
  const fixture = await producedFixture();
  const stored = structuredClone(fixture.table("decisions")[0]!);
  const result = await createSessionDecisionsDeps(fixture.brain, fixture.db).getSessionDecisions("tenant-a", "decision-session");
  assert.equal(result?.decisions.length, 1);
  assert.equal(result!.decisions[0]!._id, stored._id);
  assert.equal(result!.decisions[0]!.status, "proposed");
  assert.equal(result!.decisions[0]!.text, "Ship Friday.");
});

test("independent third-current-await withdrawal: deleted proposal cannot survive the final evidence await", async () => {
  const fixture = await producedFixture();
  let sourceResolutions = 0, withdrawalPerformed = false;
  const reader = createSessionDecisionsDeps({ async getSessionDetail(tenant, session) {
    if (++sourceResolutions === 3) {
      fixture.table("decisions").length = 0;
      withdrawalPerformed = true;
    }
    return fixture.brain.getSessionDetail(tenant, session);
  } }, fixture.db);
  const result = await reader.getSessionDecisions("tenant-a", "decision-session");
  assert.equal(withdrawalPerformed, true, "exact original third-await withdrawal must actually execute");
  assert.equal(fixture.table("decisions").length, 0);
  assert.equal(result?.decisions.length ?? 0, 0, "withdrawn stored decision must not be returned from an earlier snapshot");
});
