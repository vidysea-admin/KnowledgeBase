import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ACTORS, scratchMongo } from "./scratch.mjs";

const base = "http://127.0.0.1:3300";
let checks = 0;
const counts = () => JSON.parse(readFileSync("/tmp/lkb-ci-provider-calls.json", "utf8"));
async function call(path, actor, method = "GET", body, headers = {}) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", ...(actor ? { authorization: `Bearer ${actor.token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let value; try { value = await response.json(); } catch { value = null; }
  return { response, value };
}
const { client, db } = await scratchMongo();
try {
  const initial = counts(); assert.equal(initial.httpCalls, 0); assert.equal(initial.processCalls, 0); checks++;
  const health = await call("/health"); assert.equal(health.response.status, 200); assert.deepEqual(health.value, { db: "ok" }); checks++;
  for (const path of ["/sources", "/knowledge/documents", "/hosting/roles", "/sessions/s-ci-a/transcript-review", "/retention/status", "/meeting-bot/privacy"]) {
    assert.equal((await call(path)).response.status, 401); checks++;
  }
  const unauthAsk = await call("/ask", undefined, "POST", { query: "Synthetic CI unauthorized question" });
  assert.equal(unauthAsk.response.status, 401); assert.equal(unauthAsk.value.error, "unauthorized");
  assert.deepEqual(counts(), initial); checks++;
  assert.equal((await call("/ingest/source", undefined, "POST", { url: "https://www.youtube.com/watch?v=abcdefghijk" })).response.status, 401); checks++;
  assert.equal((await call("/ingest/source", ACTORS.limited, "POST", { url: "https://www.youtube.com/watch?v=abcdefghijk" })).response.status, 403); checks++;
  const submission = { url: "https://www.youtube.com/watch?v=abcdefghijk", idempotencyKey: "ci-public-intake-request" };
  const queued = await call("/ingest/source", ACTORS.a, "POST", submission);
  assert.equal(queued.response.status, 202); assert.equal(queued.value.state, "queued"); assert.equal(queued.value.result, undefined); checks++;
  const replay = await call("/ingest/source", ACTORS.a, "POST", submission);
  assert.equal(replay.response.status, 202); assert.equal(replay.value.jobId, queued.value.jobId); checks++;
  assert.equal((await call(`/ingest/source/jobs/${queued.value.jobId}`, ACTORS.a)).value.state, "queued"); checks++;
  assert.equal((await call(`/ingest/source/jobs/${queued.value.jobId}`, ACTORS.b)).response.status, 404); checks++;
  assert.equal((await call("/ingest/source", ACTORS.a, "POST", { ...submission, tenantId: ACTORS.b.tenant })).response.status, 400); checks++;
  assert.equal((await call("/ingest/source", ACTORS.a, "POST", { ...submission, url: submission.url + "&token=secret" })).response.status, 400); checks++;
  assert.deepEqual(counts(), initial); checks++;
  for (const path of ["/sources", "/hosting/roles", "/sessions/s-ci-a/transcript-review"]) {
    assert.equal((await call(path, ACTORS.limited)).response.status, 403); checks++;
  }
  for (const actor of [ACTORS.a, ACTORS.b]) {
    const sources = await call("/sources?tenantId=forged", actor); assert.equal(sources.response.status, 200);
    assert.equal(sources.value.sources.length, 1); assert.equal(sources.value.sources[0].tenantId, actor.tenant); checks++;
    const documents = await call("/knowledge/documents", actor); assert.equal(documents.response.status, 200);
    assert.deepEqual(documents.value.documents, []); checks++;
    const roles = await call("/hosting/roles", actor); assert.equal(roles.response.status, 200);
    assert.ok(roles.value.roles.some((row) => row.keyId === actor.id && row.role === "owner")); checks++;
  }
  assert.equal((await call("/sessions/s-ci-a", ACTORS.b)).response.status, 404); checks++;
  assert.equal((await call("/sessions/s-ci-a/transcript-review", ACTORS.b)).response.status, 404); checks++;
  const granted = await call(`/hosting/roles/${ACTORS.editor.id}`, ACTORS.a, "PUT", { role: "editor" });
  assert.equal(granted.response.status, 200); checks++;
  const editorDenied = await call(`/hosting/roles/${ACTORS.a.id}`, ACTORS.editor, "PUT", { role: "admin" });
  assert.equal(editorDenied.response.status, 403); checks++;
  const forged = await call(`/hosting/roles/${ACTORS.editor.id}`, ACTORS.a, "PUT", { role: "admin", tenantId: ACTORS.b.tenant });
  assert.equal(forged.response.status, 400); checks++;
  const bRoles = await call("/hosting/roles", ACTORS.b); assert.ok(!bRoles.value.roles.some((row) => row.keyId === ACTORS.editor.id)); checks++;
  const loaded = await call("/sessions/s-ci-a/transcript-review", ACTORS.a); assert.equal(loaded.response.status, 200);
  assert.equal(loaded.value.turns[0].text, "Synthetic CI transcript fixture."); checks++;
  const corrected = "Synthetic CI correction.";
  const committed = await call("/sessions/s-ci-a/transcript-review", ACTORS.a, "POST", {
    expectedRevision: loaded.value.revision, reason: "Synthetic fixture check", corrections: [{ turnId: "t-ci-a", text: corrected }],
  }, { "if-match": `"${loaded.value.revision}"` });
  assert.equal(committed.response.status, 200); assert.equal(committed.value.commit, "committed"); assert.equal(committed.value.refresh, "pending"); checks++;
  const overlay = await call("/sessions/s-ci-a/transcript-review", ACTORS.a); assert.equal(overlay.value.turns[0].text, corrected);
  assert.equal(overlay.value.refresh, "pending"); assert.equal(overlay.value.revision, committed.value.revision); checks++;
  const history = await call("/sessions/s-ci-a/transcript-review/history", ACTORS.a); assert.equal(history.response.status, 200);
  assert.equal(history.value.revisions.length, 1); assert.ok(history.value.revisions[0].actorRef.startsWith("apikey:")); checks++;
  assert.equal((await db.collection("turns").findOne({ _id: "t-ci-a", tenantId: ACTORS.a.tenant })).text, "Synthetic CI transcript fixture.");
  assert.equal((await db.collection("turns").findOne({ _id: "t-ci-b", tenantId: ACTORS.b.tenant })).text, "Synthetic CI transcript fixture.");
  const head = await db.collection("transcript_reviews").findOne({ tenantId: ACTORS.a.tenant, sessionId: "s-ci-a" });
  assert.equal(head.refresh.status, "pending"); checks++;
  const retention = await call("/retention/status", ACTORS.a);
  assert.ok([200, 503].includes(retention.response.status));
  if (retention.response.status === 200) assert.ok(["never-run", "available"].includes(retention.value.status));
  else assert.ok(["retention_unavailable", "workflow_unavailable"].includes(retention.value.error)); checks++;
  const privacy = await call("/meeting-bot/privacy", ACTORS.a); assert.equal(privacy.response.status, 503);
  assert.equal(privacy.value.error, "bot_privacy_unavailable"); checks++;
  const final = counts(); assert.equal(final.httpCalls, 0); assert.equal(final.processCalls, 0); checks++;
  const report = { checks, scope: "real mounted production API/auth/roles/tenant Mongo/overlay/pending-request state on synthetic fixtures",
    database: db.databaseName, providerBoundary: final, sourceJobState: "queued-only-no-worker-or-provider-execution", retentionStatus: retention.response.status,
    configuredRetentionWriterProven: false, liveCapture: false, realProvider: false, realSourceAcquisition: false };
  writeFileSync("/tmp/lkb-ci-mounted-report.json", JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally { await client.close(); }
