import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../auth.js";
import { createCalibrationReviewRouter } from "./router.js";
import { createFileCalibrationReviewStore } from "./file-store.js";
import { hash } from "./seed.js";
import { publishCalibrationReviewState } from "./persistence.js";
import type { CalibrationPacket } from "./types.js";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const actor = `api-key-sha256:${hash("Bearer good")}`;
// Exercise the actual Express/auth pipeline over local HTTP; no additional dependency or external service.
function request(application: express.Express) {
  const operation = (method: string, path: string) => {
    const headers: Record<string, string> = {}; let payload: unknown;
    const run = async () => {
      const server = application.listen(0, "127.0.0.1"); await once(server, "listening");
      try {
        const port = (server.address() as import("node:net").AddressInfo).port;
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers,
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
        let body: any; try { body = await response.json(); } catch { body = {}; }
        return { status: response.status, body };
      } finally { await new Promise<void>((ok, fail) => server.close(error => error ? fail(error) : ok())); }
    };
    const chain = {
      auth(key: string, _options: { type: string }) { headers.authorization = `Bearer ${key}`; return chain; },
      send(body: unknown) { payload = body; headers["content-type"] = "application/json"; return chain; },
      then<T = { status: number; body: any }, U = never>(ok?: ((value: { status: number; body: any }) => T | PromiseLike<T>) | null, fail?: ((reason: unknown) => U | PromiseLike<U>) | null) { return run().then(ok, fail); },
    }; return chain;
  };
  return { get: (path: string) => operation("GET", path), post: (path: string) => operation("POST", path) };
}
let base: string, corpus: string, packetPath: string, packet: CalibrationPacket;
// Every case below uses authentic private review inputs, even though entered judgments are fictional.
const privateReviewEnabled = process.env.KB_T022_PRIVATE_REVIEW_TESTS === "1";
const privateTest = (name: string, check: () => Promise<void>) => test(name, {
  skip: privateReviewEnabled ? false : "HOLD: authentic private review inputs require explicit KB_T022_PRIVATE_REVIEW_TESTS=1",
}, async () => {
  if (!privateReviewEnabled) return;
  await check();
});
before(async () => {
  if (!privateReviewEnabled) return;
  base = await mkdtemp(join(tmpdir(), "t022-source-test-")); corpus = join(base, "corpus");
  packetPath = join(base, "neutral.json");
  packet = JSON.parse(await readFile(join(project, "data/eval/calibration-human-review.json"), "utf8"));
  await writeFile(packetPath, JSON.stringify(packet));
  for (const source of packet.sources) {
    const target = join(corpus, source.path); await mkdir(dirname(target), { recursive: true });
    await copyFile(join(project, source.path), target);
  }
});
after(async () => { if (base?.startsWith(join(tmpdir(), "t022-source-test-"))) await rm(base, { recursive: true, force: true }); });
function store(name: string) { return createFileCalibrationReviewStore({ root: join(base, name), projectRoot: corpus, packetPath }); }
function app(name: string) {
  const application = express(); application.use(express.json());
  application.use(requireAuth({ async verify(key) {
    return key === "good" ? { tenantId: packet.tenantId, scopes: ["compete"] }
      : key === "foreign" ? { tenantId: "foreign", scopes: ["compete"] }
      : key === "readonly" ? { tenantId: packet.tenantId, scopes: [] } : null;
  } }));
  application.use(createCalibrationReviewRouter({ store: store(name) })); return application;
}
const body = (index = 0, revision = 0) => ({ expectedRevision: revision, inputSha256: packet.items[index]!.inputSha256,
  score: 0.375, rationale: "Explicit synthetic test judgment, never human gold", affirmIndividualReview: true as const });

privateTest("current neutral corpus has30items,15pairedquestions,44bindings and pending export", async () => {
  const view = await store("neutral").read(packet.tenantId);
  assert.equal(view!.total, 30); assert.equal(view!.approvedCount, 0); assert.equal(view!.humanGoldVerified, false);
  assert.equal(new Set(view!.items.map(i => i.questionId)).size, 15); assert.equal(view!.packet.sources.length, 44);
  assert.ok(view!.items.every(i => i.humanReview.score === null && i.revision === 0));
  await assert.rejects(store("neutral").export(packet.tenantId), /calibration_individual_reviews_pending/);
});
privateTest("real auth/scope/foreign routes refuse without exposing or writing labels", async () => {
  const application = app("auth");
  for (const key of [undefined, "revoked", "invalid"]) {
    const req = request(application).get("/calibration-review"); if (key) req.auth(key, { type: "bearer" });
    assert.equal((await req).status, 401);
  }
  assert.equal((await request(application).get("/calibration-review").auth("readonly", { type: "bearer" })).status, 403);
  assert.equal((await request(application).get("/calibration-review").auth("foreign", { type: "bearer" })).status, 404);
  assert.equal((await request(application).post("/calibration-review/items/review-001").auth("foreign", { type: "bearer" }).send(body())).status, 404);
  assert.equal((await request(application).post("/calibration-review/items/review-001").auth("good", { type: "bearer" }).send({ ...body(), tenantId: "foreign" })).status, 400);
});
privateTest("fractional submission commits attributable revision/audit and survives a fresh store", async () => {
  const application = app("persist");
  const response = await request(application).post("/calibration-review/items/review-001").auth("good", { type: "bearer" }).send(body());
  assert.equal(response.status, 200); assert.equal(response.body.approvedCount, 1);
  const item = (await store("persist").read(packet.tenantId))!.items[0]!;
  assert.equal(item.humanReview.score, 0.375); assert.equal(item.revision, 1);
  assert.equal(item.audit[0]!.authenticatedActor, actor); assert.equal(item.audit[0]!.tenantId, packet.tenantId);
  assert.match(item.audit[0]!.identityBasis, /asserted, not verified/);
  assert.equal((await request(application).post("/calibration-review/items/review-001").auth("good", { type: "bearer" }).send(body())).status, 409);
  assert.equal((await store("persist").read(packet.tenantId))!.items[0]!.revision, 1);
});
privateTest("invalid numeric/rationale/reviewer/time/body submissions never add approvals", async () => {
  const application = app("invalid");
  const invalid = [ { score: "0.5" }, { score: null }, { score: -1 }, { score: 1.01 }, { rationale: "  " },
    { approvedBy: "Umesh" }, { approvedAt: "2026-01-01T00:00:00.000Z" }, { affirmIndividualReview: false }, { expectedRevision: 0.5 } ];
  for (const changes of invalid) {
    const response = await request(application).post("/calibration-review/items/review-001").auth("good", { type: "bearer" }).send({ ...body(), ...changes });
    assert.ok(response.status === 400 || response.status === 409);
  }
  assert.equal((await request(application).post("/calibration-review/items/unknown").auth("good", { type: "bearer" }).send(body())).status, 404);
  assert.equal((await store("invalid").read(packet.tenantId))!.approvedCount, 0);
});
privateTest("cross-process stores cannot overwrite one item with a competing stale revision", async () => {
  const left = store("compete"), right = store("compete");
  const results = await Promise.allSettled([left.approve(packet.tenantId, "review-001", body(), actor), right.approve(packet.tenantId, "review-001", { ...body(), score: 0.6 }, actor)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const view = await left.read(packet.tenantId); assert.equal(view!.items[0]!.revision, 1); assert.equal(view!.items[0]!.audit.length, 1);
});
privateTest("every single missing approval blocks export; all30 synthetic assertions export their original audit", async () => {
  const s = store("all30");
  for (let i = 0; i < 30; i++) await s.approve(packet.tenantId, packet.items[i]!.id, body(i), actor);
  const exported = await s.export(packet.tenantId); assert.equal(exported.packet.items.length, 30);
  assert.equal(exported.audit.length, 30); assert.equal(exported.humanGoldVerified, false);
  assert.ok(exported.packet.items.every(i => i.humanReview.score === 0.375));
  const stateFile = join(base, "all30", `${hash(packet.tenantId)}.json`), original = await readFile(stateFile, "utf8");
  for (const item of packet.items) {
    const state = JSON.parse(original); delete state.reviews[item.id]; await writeFile(stateFile, JSON.stringify(state));
    await assert.rejects(s.export(packet.tenantId), /calibration_individual_reviews_pending/);
  }
  await writeFile(stateFile, original);
});
privateTest("changed source and seed input invalidate effective approvals, preserve audit bytes", async () => {
  const s = store("drift"); await s.approve(packet.tenantId, "review-001", body(), actor);
  const statePath = join(base, "drift", `${hash(packet.tenantId)}.json`), beforeBytes = await readFile(statePath);
  const source = join(corpus, packet.sources.find(i => i.path.endsWith("session_page.json"))!.path), original = await readFile(source);
  try { await writeFile(source, Buffer.concat([original, Buffer.from(" ")])); await assert.rejects(s.read(packet.tenantId), /calibration_sources_changed/); await assert.rejects(s.export(packet.tenantId), /calibration_sources_changed/); }
  finally { await writeFile(source, original); }
  const seedBytes = await readFile(packetPath); const changed = structuredClone(packet); changed.items[0]!.node.summary += " changed";
  try { await writeFile(packetPath, JSON.stringify(changed)); await assert.rejects(s.approve(packet.tenantId, "review-001", body(0, 1), actor), /calibration_sources_changed/); }
  finally { await writeFile(packetPath, seedBytes); }
  assert.deepEqual(await readFile(statePath), beforeBytes);
});
privateTest("audit corruption and occupied write lock fail closed without state changes", async () => {
  const s = store("failure"); await s.approve(packet.tenantId, "review-001", body(), actor);
  const statePath = join(base, "failure", `${hash(packet.tenantId)}.json`), bytes = await readFile(statePath);
  const state = JSON.parse(bytes.toString()); state.reviews["review-001"].audit[0].after.score = 1;
  await writeFile(statePath, JSON.stringify(state)); await assert.rejects(s.read(packet.tenantId), /calibration_state_invalid/);
  await writeFile(statePath, bytes); const lock = join(base, "failure", `${hash(packet.tenantId)}.lock`); await mkdir(lock);
  try { await assert.rejects(s.approve(packet.tenantId, "review-001", body(0, 1), actor), /calibration_store_busy/); }
  finally { await rm(lock, { recursive: true }); }
  assert.deepEqual(await readFile(statePath), bytes);
});
privateTest("real filesystem write and rename failures preserve existing accepted state/audit bytes", async () => {
  const s = store("io-failure"); await s.approve(packet.tenantId, "review-001", body(), actor);
  const statePath = join(base, "io-failure", `${hash(packet.tenantId)}.json`), prior = await readFile(statePath);
  const state = JSON.parse(prior.toString());
  // The existing snapshot is a file, so opening a temporary child beneath it must fail with real filesystem IO.
  await assert.rejects(publishCalibrationReviewState(join(statePath, "child.json"), state));
  assert.deepEqual(await readFile(statePath), prior);
  // Rename a fsynced temporary file onto an occupied directory: actual publisher failure, not a mocked promise.
  const blocked = join(base, "io-failure", "occupied.json"); await mkdir(blocked);
  await assert.rejects(publishCalibrationReviewState(blocked, state));
  assert.deepEqual(await readFile(statePath), prior);
  assert.equal((await s.read(packet.tenantId))!.items[0]!.revision, 1);
});
