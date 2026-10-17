/** Independent C1-C6 actual createServer/factory/auth boundary probe. Temporary synthetic approvals only. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "../../apps/api/src/server.ts";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.ts";
import { buildEvaluationIntegrations } from "../../apps/api/src/composition/integrations/evaluation.ts";

const root = resolve(import.meta.dirname, "../.."), digest = bytes => createHash("sha256").update(bytes).digest("hex");
const launch = new Date().toISOString(), measured = performance.now();
const tmp = await mkdtemp(join(tmpdir(), "t022-independent-mount-"));
const corpus = join(tmp, "corpus"), store = join(tmp, "private-store"), seed = join(tmp, "neutral.json");
let server, checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const consumerPaths = ["qa/manifests/goal-t022.md", "qa/packets/goal-t022.md", "qa/contracts/goal-t022.md",
  "apps/api/src/server.ts", "apps/api/src/fixtures.ts", "apps/api/src/auth.ts", "apps/api/src/composition/integrations/routes.ts",
  "apps/api/src/composition/integrations/evaluation.ts", "apps/web/src/App.tsx", "apps/web/src/layout/NavSidebar.tsx"];
const originalPacket = JSON.parse(await readFile(join(root, "data/eval/calibration-human-review.json"), "utf8"));
const makerPins = JSON.parse(await readFile(join(root, "qa/evidence/goal-t022-maker-pins.json"), "utf8"));
const pinPaths = [...new Set([...makerPins.map(p => p.path), ...consumerPaths.map(p => join(root, p)),
  join(root, "data/eval/calibration-human-review.json"), ...originalPacket.sources.map(p => join(root, p.path))])];
const pin = async () => Object.fromEntries(await Promise.all(pinPaths.map(async p => [p, digest(await readFile(p))])));
const before = await pin();
try {
  for (const expected of makerPins) assert.equal(before[expected.path], expected.sha256, `candidate drift ${expected.path}`);
  const packet = originalPacket;
  await writeFile(seed, JSON.stringify(packet));
  for (const source of packet.sources) {
    const target = join(corpus, source.path); await mkdir(dirname(target), { recursive: true }); await copyFile(join(root, source.path), target);
  }
  const baseInput = { root, db: { databaseName: "lkb_t022_checker_fixture" }, index: async () => { throw Error("unused index"); },
    ask: {}, routing: { chains: {}, providers: {}, write: async () => {} }, env: {} };
  check(buildEvaluationIntegrations(baseInput).calibrationReview, undefined);
  const configured = { CALIBRATION_REVIEW_STORE_DIR: store, CALIBRATION_REVIEW_CORPUS_ROOT: corpus, CALIBRATION_REVIEW_PACKET_PATH: seed };
  for (const env of [ { ...configured, CALIBRATION_REVIEW_STORE_DIR: "relative-store" },
    { ...configured, CALIBRATION_REVIEW_STORE_DIR: join(root, "apps/web/public/private-store") },
    { ...configured, CALIBRATION_REVIEW_CORPUS_ROOT: join(root, "public/corpus") },
    { ...configured, CALIBRATION_REVIEW_PACKET_PATH: join(root, "dist/public/neutral.json") },
    { ...configured, CALIBRATION_REVIEW_STORE_DIR: tmp } ]) {
    check(buildEvaluationIntegrations({ ...baseInput, env }).calibrationReview, undefined);
  }
  const integrations = buildEvaluationIntegrations({ ...baseInput, env: configured });
  assert.ok(integrations.calibrationReview); checks++;
  const keyStore = fakeKeyStore({ owner: { tenantId: packet.tenantId, scopes: ["compete"] },
    foreign: { tenantId: "foreign-tenant", scopes: ["compete"] }, readonly: { tenantId: packet.tenantId, scopes: [] } });
  const deps = buildTestDeps({ keyStore, ...integrations, rateLimit: { max: 200, windowMs: 60000 } });
  server = createServer(deps).listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, key, body) => {
    const response = await fetch(`${url}${path}`, { method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(3000),
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  for (const key of [undefined, "revoked", "Bearer malformed"]) check((await request("/calibration-review", key)).status, 401);
  check((await request("/calibration-review", "readonly")).status, 403);
  check((await request("/calibration-review", "foreign")).status, 404);
  const initial = await request("/calibration-review", "owner");
  check(initial.status, 200); check(initial.cache, "no-store"); check(initial.body.approvedCount, 0);
  check(initial.body.total, 30); check(initial.body.packet.sources.length, 44); check(initial.body.humanGoldVerified, false);
  check(initial.body.items.every(i => i.humanReview.score === null && i.revision === 0), true);
  const item = initial.body.items[0], submission = { expectedRevision: 0, inputSha256: item.inputSha256,
    score: 0.625, rationale: "INDEPENDENT SYNTHETIC CHECK ONLY; never actual owner evidence", affirmIndividualReview: true };
  check((await request(`/calibration-review/items/${item.id}`, undefined, submission)).status, 401);
  check((await request(`/calibration-review/items/${item.id}`, "readonly", submission)).status, 403);
  check((await request(`/calibration-review/items/${item.id}`, "foreign", submission)).status, 404);
  for (const override of [{ tenantId: "foreign-tenant" }, { approvedBy: "Umesh" }, { authenticatedActor: "claimed-actor" }, { approvedAt: launch }]) {
    check((await request(`/calibration-review/items/${item.id}`, "owner", { ...submission, ...override })).status, 400);
  }
  const accepted = await request(`/calibration-review/items/${item.id}`, "owner", submission);
  check(accepted.status, 200); check(accepted.body.approvedCount, 1);
  const persisted = accepted.body.items[0]; check(persisted.humanReview.score, 0.625); check(persisted.revision, 1);
  check(persisted.audit[0].authenticatedActor, `api-key-sha256:${digest("Bearer owner")}`);
  check(persisted.audit[0].tenantId, packet.tenantId); check(persisted.audit[0].before, null);
  check((await request(`/calibration-review/items/${item.id}`, "owner", submission)).status, 409);
  check((await request("/calibration-review/export", "owner")).status, 409);
  check((await request("/calibration-review/export", "foreign")).status, 404);
  const restarted = buildEvaluationIntegrations({ ...baseInput, env: configured }).calibrationReview;
  const reloaded = await restarted.store.read(packet.tenantId);
  check(reloaded.approvedCount, 1); check(reloaded.items[0].audit.length, 1); check(reloaded.items[0].humanReview.score, 0.625);
  // Unconfigured real mount refuses a correctly authenticated request, rather than returning a mock result.
  const saved = deps.calibrationReview; deps.calibrationReview = undefined;
  const unavailable = createServer(deps).listen(0, "127.0.0.1"); await once(unavailable, "listening");
  try {
    const r = await fetch(`http://127.0.0.1:${unavailable.address().port}/calibration-review`, { headers: { authorization: "Bearer owner" }, signal: AbortSignal.timeout(3000) });
    check(r.status, 503); check((await r.json()).error, "calibration_review_unavailable");
  } finally { unavailable.closeAllConnections(); await new Promise(resolve => unavailable.close(resolve)); deps.calibrationReview = saved; }
  const statePath = join(store, `${digest(packet.tenantId)}.json`), stateBefore = await readFile(statePath);
  const source = join(corpus, packet.sources.find(s => s.path.endsWith("session_page.json")).path);
  await writeFile(source, `${await readFile(source, "utf8")}\n`);
  check((await request("/calibration-review", "owner")).status, 409);
  check((await request(`/calibration-review/items/${item.id}`, "owner", { ...submission, expectedRevision: 1 })).status, 409);
  check((await request("/calibration-review/export", "owner")).status, 409);
  check(await readFile(statePath), stateBefore);
  const after = await pin(); check(after, before);
  console.log(JSON.stringify({ launch, completed: new Date().toISOString(), elapsedMs: performance.now() - measured,
    checks, counts: { currentItems: 30, sourceBindings: 44, temporarySyntheticApprovals: 1, realHumanApprovals: 0, providerCalls: 0 },
    before, after, candidatePinsMatched: true, sourceScope: "actual factory/createServer authenticated mount, config refusal, immutable input, per-item persistence/audit, CAS and drift" }));
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const rel = relative(tmpdir(), tmp);
  assert.ok(rel.startsWith("t022-independent-mount-") && !rel.startsWith("..") && !isAbsolute(rel));
  await rm(tmp, { recursive: true, force: true });
}
