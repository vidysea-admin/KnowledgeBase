import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ACTORS } from "./scratch.mjs";

async function get(path, actor) {
  const response = await fetch(`http://127.0.0.1:3300${path}`, {
    signal: AbortSignal.timeout(10_000), headers: { authorization: `Bearer ${actor.token}` },
  });
  return { status: response.status, value: await response.json() };
}
const overlay = await get("/sessions/s-ci-a/transcript-review", ACTORS.a);
assert.equal(overlay.status, 200); assert.equal(overlay.value.turns[0].text, "Synthetic CI correction.");
assert.equal(overlay.value.refresh, "pending");
const roles = await get("/hosting/roles", ACTORS.a);
assert.equal(roles.status, 200);
assert.ok(roles.value.roles.some(row => row.keyId === ACTORS.editor.id && row.role === "editor"));
assert.equal((await get("/sessions/s-ci-a/transcript-review", ACTORS.b)).status, 404);
const jobId = createHash("sha256").update(JSON.stringify([ACTORS.a.tenant, ACTORS.a.id, "ci-public-intake-request"])).digest("hex");
const sourceJob = await get(`/ingest/source/jobs/${jobId}`, ACTORS.a);
assert.equal(sourceJob.status, 200); assert.equal(sourceJob.value.state, "queued");
assert.equal((await get(`/ingest/source/jobs/${jobId}`, ACTORS.b)).status, 404);
const calls = JSON.parse(readFileSync("/tmp/lkb-ci-provider-calls.json", "utf8"));
assert.equal(calls.httpCalls, 0); assert.equal(calls.processCalls, 0);
console.log(JSON.stringify({ checks: 9, scope: "actual API process restart preserves synthetic fixture overlay, pending refresh, queued source request and private role journal", providerBoundary: calls }));
