import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireAuth } from "../auth.js";
import { createBrainRouter } from "../routes/brain.js";
import { createEvaluationFlywheelRouter } from "./router.js";
import { rig } from "./test-fixture.js";
import type { EvaluationFlywheel } from "./workflow.js";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";

async function mounted(workflow: EvaluationFlywheel | undefined, gaps: () => unknown[] = () => []) {
  const app = express(); app.use(express.json());
  const all = ["compete", "gaps", "ingest", "ask"];
  app.use(requireAuth({ verify: async (key) => key === "foreign" ? { tenantId: "foreign", scopes: all }
    : key === "good" ? { tenantId: "t", scopes: all }
      : key === "gaps-only" ? { tenantId: "t", scopes: ["gaps"] }
      : key.startsWith("missing-") ? { tenantId: "t", scopes: all.filter((s) => s !== key.slice(8)) } : null }));
  app.use(createEvaluationFlywheelRouter(workflow));
  app.use(createBrainRouter({ listGaps: async (t) => t === "t" ? gaps() as never : [], listSessions: async () => [],
    getSessionDetail: async () => null, listSources: async () => [] }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  return { async req(path: string, body?: unknown, key = "good") {
    const result = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() as any };
  }, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("actual authenticated routes enforce all write scopes, tenant scope, body validation and gaps compatibility", { timeout: 15000 }, async () => {
  const r = rig(), server = await mounted(r.workflow(), () => r.tables.gaps ?? []);
  try {
    assert.equal((await server.req("/evaluations/loss/gap", {}, "unknown")).status, 401);
    for (const scope of ["compete", "gaps", "ingest", "ask"]) {
      assert.equal((await server.req("/evaluations/loss/gap", {}, `missing-${scope}`)).status, 403);
      assert.equal((await server.req("/evaluations/loss/retest", { sourceUrl: "https://example.org/session", requestId: "http" }, `missing-${scope}`)).status, 403);
    }
    assert.equal(r.tables.gaps?.length ?? 0, 0);
    assert.equal((await server.req("/evaluations/loss/gap", { tenantId: "foreign" })).status, 400);
    assert.equal((await server.req("/evaluations/loss/gap", {}, "foreign")).status, 404);
    assert.equal((await server.req("/evaluations/loss/gap", {})).status, 200);
    const listed = await server.req("/gaps"); assert.equal(listed.status, 200);
    const list = Array.isArray(listed.body) ? listed.body : listed.body.gaps;
    assert.equal(list[0].kind, "source-pending"); assert.equal(list[0].status, "open");
    const publicGaps = await server.req("/gaps", undefined, "gaps-only"); assert.equal(publicGaps.status, 200);
    const publicRows = Array.isArray(publicGaps.body) ? publicGaps.body : publicGaps.body.gaps;
    assert.equal(publicRows[0].flywheel?.loss, undefined, "gaps scope cannot disclose compete answers/scores");
    assert.ok(!JSON.stringify(publicRows).includes("When does registration open?"));
    assert.equal(publicRows[0].flywheel?.lock?.token, undefined);
    assert.equal((await server.req("/evaluations/loss/flywheel", undefined, "gaps-only")).status, 403);
    assert.equal((await server.req("/evaluations/loss/retest", { sourceUrl: "https://example.org/session", requestId: "http", tenantId: "foreign" })).status, 400);
    const child = await server.req("/evaluations/loss/retest", { sourceUrl: "https://example.org/session", requestId: "http" });
    assert.equal(child.status, 200); assert.equal(child.body.score, undefined);
    const inspect = await server.req("/evaluations/loss/flywheel"); assert.equal(inspect.body.flywheel.stage, "retested");
    assert.equal(inspect.body.flywheel.sourceUrl, undefined);
    assert.equal((await server.req("/evaluations/loss/flywheel", undefined, "foreign")).status, 404);
    assert.equal((await server.req("/gaps", undefined, "foreign")).body.gaps?.length ?? (await server.req("/gaps", undefined, "foreign")).body.length, 0);
  } finally { await server.close(); }
});
test("unconfigured flywheel answers safe503 after scope validation, with no writes", async () => {
  const server = await mounted(undefined);
  try {
    assert.deepEqual(await server.req("/evaluations/loss/gap", {}), { status: 503, body: { error: "flywheel_unavailable" } });
    assert.equal((await server.req("/evaluations/loss/gap", {}, "missing-compete")).status, 403);
  } finally { await server.close(); }
});
test("actual shared createServer mount invokes the flywheel using the verified tenant", async () => {
  const r = rig();
  const server = await startTestServer(buildTestDeps({ evaluationFlywheel: r.workflow(),
    keyStore: fakeKeyStore({ good: { tenantId: "t", scopes: ["compete", "gaps", "ingest", "ask"] } }) }));
  try {
    const result = await fetch(`${server.baseUrl}/evaluations/loss/gap`, { method: "POST", headers: { authorization: "Bearer good", "content-type": "application/json" }, body: "{}" });
    assert.equal(result.status, 200); const head = await result.json() as any;
    assert.equal(head.tenantId, "t"); assert.equal(head.flywheel.originalEvalRunId, "loss"); assert.equal(r.tables.gaps!.length, 1);
    assert.deepEqual(r.calls, { intake: 0, index: 0, ask: 0 });
  } finally { await server.close(); }
});
