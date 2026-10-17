import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireAuth } from "../../auth.js";
import type { ChampionshipEvent } from "../../championship/model.js";
import { createChampionshipRouter, type ChampionshipStore } from "./championship.js";

const plan = { title: "Internal preparation", questions: [{ id: "q", text: "Exact real question?", source: { kind: "toc", reference: "session/timestamp" } }],
  counsellors: [{ id: "c", name: "Counsellor", evidenceReference: "unverified-roster" }], judges: [], rubric: { version: "draft", reference: "panel-pending" }, reviewReference: "review-pending" };
test("authenticated create/freeze/trial/report workflow persists original snapshot, scopes tenant and CAS", async () => {
  const events = new Map<string, ChampionshipEvent>(); let reads = 0, writes = 0;
  const store: ChampionshipStore = {
    create: async (tenant, e) => { assert.equal(tenant, e.tenantId); events.set(e._id, structuredClone(e)); writes++; },
    get: async (tenant, id) => { reads++; const e = events.get(id); return e?.tenantId === tenant ? structuredClone(e) : null; },
    replace: async (tenant, id, revision, e) => { const old = events.get(id); if (old?.tenantId !== tenant || old.revision !== revision) return false; events.set(id, structuredClone(e)); writes++; return true; },
    getEvalRun: async tenant => tenant === "a" ? { _id: "eval", tenantId: "a", question: plan.questions[0]!.text, counsellor: { name: "Counsellor" }, aiAnswer: { text: "Actual upstream response", sources: { internal: [{ timestamp: 30 }], web: [] } },
      counsellorAnswer: { text: "Original human response" }, score: { ai: 4, counsellor: 3 }, credibility: "internal", createdAt: "2026-10-14T00:02:00Z" } : null,
  };
  let now = "2026-10-14T00:00:00Z";
  const app = express(); app.use(express.json()); app.use(requireAuth({ verify: async key => key === "a" || key === "b" ? { tenantId: key, scopes: ["compete"] } : key === "no-scope" ? { tenantId: "a", scopes: ["ask"] } : null }));
  app.use(createChampionshipRouter(store, () => now));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}`;
  async function request(path: string, key = "a", body?: unknown) { return fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  try {
    assert.equal((await request("/championship", "no-scope", plan)).status, 403); assert.equal((await request("/championship", "revoked", plan)).status, 401); assert.equal(writes, 0); assert.equal(reads, 0);
    const response = await request("/championship", "a", { ...plan, tenantId: "b", credibility: "independent-human" }); assert.equal(response.status, 201);
    const event = await response.json() as ChampionshipEvent; assert.equal(event.tenantId, "a"); assert.equal(event.evidenceStatus, "operator-supplied-unverified");
    assert.equal((await request(`/championship/${event._id}`, "b")).status, 404);
    now = "2026-10-14T00:01:00Z";
    assert.equal((await request(`/championship/${event._id}/freeze`, "a", { expectedRevision: 1, bankDigest: event.bankDigest })).status, 409);
    const frozen = await request(`/championship/${event._id}/freeze`, "a", { expectedRevision: 0, bankDigest: event.bankDigest }); assert.equal(frozen.status, 200);
    now = "2026-10-14T00:03:00Z";
    const trial = { expectedRevision: 1, questionId: "q", counsellorId: "c", evalRunId: "eval", credibility: "independent-human", score: { ai: 5, counsellor: 1 } };
    assert.equal((await request(`/championship/${event._id}/trials`, "b", trial)).status, 404);
    assert.equal((await request(`/championship/${event._id}/trials`, "a", { ...trial, evalRunId: "wrong" })).status, 404);
    assert.equal((await request(`/championship/${event._id}/trials`, "a", trial)).status, 200);
    assert.equal((await request(`/championship/${event._id}/trials`, "a", trial)).status, 409);
    const reloaded: unknown = await (await request(`/championship/${event._id}`)).json();
    assert.ok(reloaded && typeof reloaded === "object" && "event" in reloaded && "report" in reloaded);
    const loadedEvent = reloaded.event, report = reloaded.report;
    assert.ok(loadedEvent && typeof loadedEvent === "object" && "revision" in loadedEvent);
    assert.ok(report && typeof report === "object" && "recordedPairs" in report && "credibility" in report && "counsellors" in report);
    assert.equal(loadedEvent.revision, 2); assert.equal(report.recordedPairs, 1); assert.equal(report.credibility, "internal");
    assert.ok(Array.isArray(report.counsellors)); const first: unknown = report.counsellors[0];
    assert.ok(first && typeof first === "object" && "observedScoreTotals" in first);
    assert.deepEqual(first.observedScoreTotals, { ai: 4, counsellor: 3 }); assert.equal(writes, 3);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
