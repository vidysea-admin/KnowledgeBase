import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import { startTestServer } from "../../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../fixtures.js";
import { buildProductionDeps } from "../production.js";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { buildCalendarWorkerIntegrations, buildCapturePolicyIntegrations } from "./capture-policy.js";

test("capture-policy bridge requires exact explicit enablement and an absolute private repository path", () => {
  const root = path.resolve("capture-policy-fixture");
  for (const flag of [undefined, "", "0", "true", "1 "]) assert.deepEqual(buildCapturePolicyIntegrations({root, env: {LKB_JOIN_RULES_ENABLED: flag}}), {});
  for (const invalid of ["", "relative/root", `${root}\n`, ` ${root}`])
    assert.deepEqual(buildCapturePolicyIntegrations({root: invalid, env: {LKB_JOIN_RULES_ENABLED: "1"}}), {});
});
test("construction performs no writes; actual real policy methods persist at the same scheduler directory and isolate tenants", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-bridge-"));
  try {
    const {joinRules} = buildCapturePolicyIntegrations({root, env: {LKB_JOIN_RULES_ENABLED: "1"}});
    assert.ok(joinRules?.registrationPolicy);
    assert.deepEqual(readdirSync(root), []);
    const rules = {version: 1 as const, ownDomains: [], rules: []};
    await joinRules.saveIf("tenant-a", "absent", rules);
    await joinRules.recordOptOut("tenant-a", "event-a");
    assert.equal(existsSync(path.join(root, "raw", "webinars", "join-rules", "tenant-a.json")), true);
    assert.deepEqual((await joinRules.load("tenant-a")).state.optedOutEventIds, ["event-a"]);
    assert.deepEqual((await joinRules.load("tenant-b")).state.optedOutEventIds, []);
    const policy = {version: 1, operator: {firstName: "Operator", lastName: "Test", email: "operator@example.org"},
      form: {mode: "native-html", formSelector: "#registration", submitSelector: "#submit", fields: {firstName: "#first", lastName: "#last", email: "#email"}},
      scope: {organizers: ["host@example.org"], domains: [], platforms: ["unknown"], allowedHosts: ["events.example.org"]},
      relevance: {includeTerms: ["career"], excludeTerms: ["sales"]}};
    const saved = await joinRules.registrationPolicy.mutate("tenant-a", "absent", "replace", policy) as {revision: string; approved: boolean};
    assert.equal(saved.approved, false);
    const approved = await joinRules.registrationPolicy.mutate("tenant-a", saved.revision, "approve") as {approved: boolean};
    assert.equal(approved.approved, true);
    assert.equal(existsSync(path.join(root, "raw", "webinars", "registration-policies", "tenant-a.json")), true);
    assert.equal((await joinRules.registrationPolicy.load("tenant-b") as {policy: unknown}).policy, null);
  } finally { rmSync(root, {recursive: true, force: true}); }
});


const binding = {tenantId: "toc", keyId: "worker-key-id", account: "operator@example.org", hostId: "windows-host"};
const principal = {tenantId: "toc", keyId: binding.keyId, scopes: ["calendar", "operations:write"]};
const workerEnv = {LKB_CALENDAR_WORKER_ENABLED: "1", LKB_CALENDAR_WORKER_BINDINGS: JSON.stringify([binding])};
function workerFixture() {
  let clock = Date.parse("2026-10-27T08:00:00.000Z");
  const data: Record<string, any[]> = {api_keys: [{_id: binding.keyId, tenantId: "toc", revokedAt: null, scopes: principal.scopes}], watch_state: []};
  let beforeUpdate: (() => void) | undefined, afterUpdate: (() => void) | undefined;
  const calls: {name: string; op: string; filter?: any}[] = [];
  const match = (row: any, filter: any): boolean => Object.entries(filter).every(([key, expected]: [string, any]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && "$exists" in expected) return (actual !== undefined) === expected.$exists;
    if (expected && typeof expected === "object" && "$all" in expected) return Array.isArray(actual) && expected.$all.every((v: string) => actual.includes(v));
    return isDeepStrictEqual(actual, expected);
  });
  const db = {databaseName: "calendar_bridge_test", collection(name: string) {
    if (!data[name]) throw new Error("unexpected collection");
    return {
      async findOne(filter: any) { calls.push({name, op: "read", filter: structuredClone(filter)}); return structuredClone(data[name]!.find(row => match(row, filter)) ?? null); },
      async insertOne(doc: any) { calls.push({name, op: "insert"}); if (data[name]!.some(row => row._id === doc._id)) throw Object.assign(new Error("duplicate"), {code: 11000}); data[name]!.push(structuredClone(doc)); return {acknowledged: true}; },
      async updateOne(filter: any, update: any) { calls.push({name, op: "update", filter: structuredClone(filter)}); beforeUpdate?.();
        const row = data[name]!.find(row => match(row, filter)); if (!row) return {matchedCount: 0};
        Object.assign(row, structuredClone(update.$set)); afterUpdate?.(); return {matchedCount: 1}; },
    };
  }} as unknown as Db;
  const make = () => buildCalendarWorkerIntegrations({db, env: workerEnv, now: () => new Date(clock)})!;
  return {db, data, calls, make, integration: make(), tick: (ms = 1000) => {clock += ms;}, date: () => new Date(clock).toISOString(),
    before: (fn?: () => void) => {beforeUpdate = fn;}, after: (fn?: () => void) => {afterUpdate = fn;}};
}
const beginWorker = (f: ReturnType<typeof workerFixture>, expectedGeneration: string | null = null) => f.integration.calendar.worker!.begin(principal, {account: binding.account, hostId: binding.hostId, expectedGeneration});
const snapshot = (f: ReturnType<typeof workerFixture>, generation: string, sequence = 1) => ({version: 1, account: binding.account, hostId: binding.hostId,
  generation, sequence, complete: true, checkedAt: f.date(), sourceEvents: [], meetings: [{id: "no-link", title: "Private operator meeting", startTime: "", endTime: ""},
    {id: "cancelled", title: "Cancelled", startTime: "", endTime: "", cancelled: true}], candidates: [], operations: {operations: [], omitted: 0}});
const refuses = (status: number) => (error: any) => error.statusCode === status;
test("worker mode is explicit, construction lazy, and invalid configured ownership never falls back", async () => {
  const db = {collection() { throw new Error("must be lazy"); }} as unknown as Db;
  assert.equal(buildCalendarWorkerIntegrations({db, env: {}}), undefined);
  for (const env of [{LKB_CALENDAR_WORKER_ENABLED: "true"}, {...workerEnv, LKB_CALENDAR_WORKER_BINDINGS: "[]"},
    {...workerEnv, LKB_CALENDAR_WORKER_BINDINGS: JSON.stringify([binding, binding])}, {...workerEnv, LKB_CALENDAR_WORKER_BINDINGS: JSON.stringify([{...binding, tenantId: 4}])}]) {
    const result = buildCalendarWorkerIntegrations({db, env}); assert.ok(result); await assert.rejects(result.calendar.listUpcoming("toc"), refuses(403));
  }
});
test("durable worker retries/restarts preserve original receipt and exact stale boundary bars acquisition", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), state = snapshot(f, generation);
  const first = await f.integration.calendar.worker!.publish(principal, state); f.tick(5000);
  assert.deepEqual(await f.make().calendar.worker!.publish(principal, state), first);
  assert.equal(f.data.watch_state!.length, 1);
  assert.equal((await f.make().calendar.inventory!("toc")).worker.status, "fresh");
  f.tick(595000);
  assert.equal((await f.integration.calendar.inventory!("toc")).worker.status, "stale");
  await assert.rejects(f.integration.calendar.acquire!("toc"), refuses(503));
  assert.deepEqual(await f.integration.calendar.worker!.publish(principal, state), first, "retry cannot refresh receipt");
  assert.equal((await f.integration.calendar.inventory!("toc")).meetings.length, 2);
  assert.ok(f.calls.filter(call => call.filter).every(call => call.filter.tenantId === "toc"));
});
test("server-fenced generation replacement cannot steal a fresh lease and permanently rejects the old generation", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f);
  await f.integration.calendar.worker!.publish(principal, snapshot(f, generation));
  await assert.rejects(beginWorker(f, generation), refuses(409)); f.tick(600000);
  const next = await beginWorker(f, generation); assert.notEqual(next.generation, generation);
  await assert.rejects(f.integration.calendar.worker!.publish(principal, snapshot(f, generation, 2)), refuses(409));
  await f.integration.calendar.worker!.publish(principal, snapshot(f, next.generation));
  assert.equal((await f.integration.calendar.worker!.read(principal)).generation, next.generation);
});
test("incomplete/failed scans preserve accepted inventory while removing scheduling authority", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f);
  await f.integration.calendar.worker!.publish(principal, snapshot(f, generation)); f.tick();
  const incomplete = {...snapshot(f, generation, 2), complete: false, meetings: []};
  const failure = await f.integration.calendar.worker!.publish(principal, incomplete); assert.equal(failure.complete, false);
  assert.equal((await f.integration.calendar.inventory!("toc")).meetings.length, 2);
  assert.equal((await f.integration.calendar.inventory!("toc")).worker.status, "stale");
  await assert.rejects(f.integration.calendar.acquire!("toc"), refuses(503));
  assert.equal(f.data.watch_state!.filter(row => row.workerSnapshot?.state.complete).length, 1);
  assert.equal(f.data.watch_state!.filter(row => row.workerSnapshot).length, 2);
  assert.equal(f.data.watch_state!.filter(row => row.workerReceipt).length, 1);
  assert.equal((await f.integration.listWorkerHeartbeats("toc"))[0]!.providerScanStatus, "failed");
  f.tick(); await f.integration.calendar.worker!.publish(principal, snapshot(f, generation, 3));
  assert.equal((await f.integration.calendar.acquire!("toc")).meetings.length, 2);
});
test("conflicting concurrent replays publish exactly one revision and invisible staging cannot authorize reads", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), a = snapshot(f, generation), b = {...a, meetings: []};
  const results = await Promise.allSettled([f.integration.calendar.worker!.publish(principal, a), f.integration.calendar.worker!.publish(principal, b)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected" && r.reason.statusCode === 409).length, 1);
  const current = (await f.integration.calendar.inventory!("toc")).meetings;
  assert.equal(current.length, results[0]!.status === "fulfilled" ? 2 : 0);
  const empty = workerFixture(); empty.data.watch_state = structuredClone(f.data.watch_state!);
  await assert.rejects(empty.integration.calendar.inventory!("toc"), refuses(503));
});
test("revocation at publication commit wins the same key-document CAS; unacknowledged success retries once", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f); f.before(() => {f.data.api_keys![0].revokedAt = f.date();});
  await assert.rejects(f.integration.calendar.worker!.publish(principal, snapshot(f, generation)), refuses(403));
  assert.equal(f.data.watch_state!.length, 1); assert.equal(f.data.api_keys![0].workerFence.sequence, 0);
  await assert.rejects(f.integration.calendar.listUpcoming("toc"), refuses(403));
  const other = workerFixture(), next = await beginWorker(other), state = snapshot(other, next.generation);
  other.after(() => {throw new Error("lost acknowledgement");});
  await assert.rejects(other.integration.calendar.worker!.publish(principal, state), /lost acknowledgement/);
  const receivedAt = other.data.api_keys![0].workerFence.ackAt; other.after(); other.tick(2000);
  assert.equal((await other.make().calendar.worker!.publish(principal, state)).receivedAt, receivedAt);
});
test("worker snapshots reject mixed-field authority, oversize/unknown fields and old provider scans", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), state = snapshot(f, generation);
  for (const body of [{...state, tenantId: "foreign"}, {...state, keyId: "other"}, {...state, receivedAt: f.date()},
    {...state, generation: "attacker-generation"}, {...state, sequence: 0}, {...state, meetings: [{...state.meetings[0], arbitrarySecret: "raw-body"}]},
    {...state, meetings: [{...state.meetings[0], description: "x".repeat(32769)}]}, {...state, meetings: Array(2001).fill(state.meetings[0])},
    {...state, candidates: [{messageId: "m", subject: "x", senderEmail: "s@x.org", senderDomain: "x.org", body: "private"}]}]) {
    await assert.rejects(f.integration.calendar.worker!.publish(principal, body));
  }
  for (const identity of [{account: "other@example.org"}, {hostId: "other-host"}]) await assert.rejects(f.integration.calendar.worker!.publish(principal, {...state, ...identity}), refuses(403));
  for (const forged of [{...principal, keyId: "other"}, {...principal, tenantId: "foreign"}, {...principal, scopes: ["calendar"]}]) await assert.rejects(f.integration.calendar.worker!.publish(forged, state), refuses(403));
  await f.integration.calendar.worker!.publish(principal, state); f.tick();
  await assert.rejects(f.integration.calendar.worker!.publish(principal, {...state, sequence: 2}), refuses(422));
  await assert.rejects(f.integration.calendar.worker!.publish(principal, {...snapshot(f, generation, 2), checkedAt: "2026-10-26T08:00:00.000Z"}), refuses(422));
  assert.equal(f.data.watch_state!.length, 1);
});
test("snapshot digest, pointer identity and key revocation are rechecked on every operator read", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f); await f.integration.calendar.worker!.publish(principal, snapshot(f, generation));
  f.data.watch_state![0].workerSnapshot.state.account = "other@example.org";
  await assert.rejects(f.integration.calendar.listUpcoming("toc"), refuses(503));
  f.data.watch_state![0].workerSnapshot.state.account = binding.account;
  f.data.watch_state![0].workerSnapshot.state.meetings = [];
  await assert.rejects(f.integration.calendar.listUpcoming("toc"), refuses(503));
});
test("mounted worker routes enforce scopes/owner, show complete inventory and redact operation summaries", async () => {
  const f = workerFixture(), calendar = f.integration.calendar;
  const server = await startTestServer(buildTestDeps({calendar, brain: {...buildTestDeps().brain, listWebinarOperations: f.integration.listWebinarOperations}, keyStore: fakeKeyStore({
    worker: principal, other: {...principal, keyId: "other"}, calendar: {...principal, scopes: ["calendar"]}, operator: {tenantId: "toc", scopes: ["calendar", "sessions"]}})}));
  const headers = (key = "worker") => ({authorization: "Bearer "+key, "content-type": "application/json"});
  try {
    assert.equal((await fetch(server.baseUrl+"/calendar/worker-state")).status, 401);
    for (const key of ["other", "calendar"]) assert.equal((await fetch(server.baseUrl+"/calendar/worker-state", {headers: headers(key)})).status, 403);
    const started = await fetch(server.baseUrl+"/calendar/worker-state/generation", {method: "POST", headers: headers(), body: JSON.stringify({account: binding.account, hostId: binding.hostId, expectedGeneration: null})});
    assert.equal(started.status, 200); const {generation} = await started.json() as {generation: string};
    const state = snapshot(f, generation); state.operations.operations = [{id: "event-1", title: "Private https://zoom.us/j/123?pwd=secret C:/private/recording.mp4", status: "queued", attempts: 0}] as any;
    const published = await fetch(server.baseUrl+"/calendar/worker-state", {method: "PUT", headers: headers(), body: JSON.stringify(state)});
    assert.equal(published.status, 200); assert.equal((await published.json() as any).sequence, 1);
    const inventory = await fetch(server.baseUrl+"/calendar/upcoming", {headers: headers("operator")}); assert.equal(inventory.status, 200);
    const body = await inventory.json() as any; assert.equal(body.meetings.length, 2); assert.equal(body.worker.status, "fresh");
    const operations = await fetch(server.baseUrl+"/webinar-operations", {headers: headers("operator")}); assert.equal(operations.status, 200);
    const text = await operations.text(); assert.ok(!text.includes("pwd=") && !text.includes("recording.mp4"));
    assert.equal(operations.headers.get("x-lkb-tenant"), "toc");
    f.tick(600000); assert.equal((await fetch(server.baseUrl+"/calendar/upcoming?discovery=1", {headers: headers("operator")})).status, 503);
    assert.equal((await fetch(server.baseUrl+"/calendar/upcoming?discovery=1&sync=1", {headers: headers("operator")})).status, 503);
    assert.equal((await fetch(server.baseUrl+"/calendar/upcoming", {headers: headers("operator")})).status, 200);
  } finally { await server.close(); }
});
test("production composition selects the durable bridge without local Google or operations-file fallback", async () => {
  const previous = {...process.env};
  try {
    Object.assign(process.env, workerEnv); const deps = buildProductionDeps();
    assert.equal(typeof deps.calendar.worker?.publish, "function"); assert.equal(typeof deps.calendar.inventory, "function");
    assert.equal(typeof deps.watchedSources.workerHealth, "function");
    await assert.rejects(deps.calendar.listUpcoming("foreign"), refuses(403));
    await assert.rejects(deps.brain.listWebinarOperations!("foreign"), refuses(403));
  } finally { for (const key of Object.keys(workerEnv)) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});

test("hosted Gmail candidates use only the accepted fresh owner snapshot and retain existing rejections", async () => {
  const {createMeetingCandidatesDeps} = await import("../../store.js");
  const f = workerFixture(), {generation} = await beginWorker(f), state = snapshot(f, generation);
  state.candidates = [{messageId: "mail", subject: "Career webinar invitation", meetingUrl: "https://meet.google.com/abc-defg-hij", senderEmail: "host@external.org", senderDomain: "external.org", senderAuthenticated: true}] as any;
  await f.integration.calendar.worker!.publish(principal, state);
  let localReads = 0, inserts = 0;
  const deps = createMeetingCandidatesDeps("toc", async () => {localReads++; throw new Error("local Google forbidden");}, () => "calendar_bridge_test", {
    getTrustedSender: async () => null,
    createMeetingCandidateIfNew: async () => {inserts++; return false;}, // existing rejected row is never replaced
  } as any, f.integration.listGmailCandidates);
  assert.deepEqual(await deps.scanGmail("toc"), {created: 0, autoApproved: 0}); assert.equal(inserts, 1); assert.equal(localReads, 0);
  await assert.rejects(deps.scanGmail("foreign"), refuses(403));
  f.tick(600000); await assert.rejects(deps.scanGmail("toc"), refuses(503)); assert.equal(inserts, 1);
});

test("mounted production Calendar/operations composition consumes durable storage without a local file", async () => {
  const previous = {...process.env}, f = workerFixture(); let server: Awaited<ReturnType<typeof startTestServer>> | undefined;
  try {
    Object.assign(process.env, workerEnv); const production = buildProductionDeps({calendarWorkerDatabase: f.db});
    server = await startTestServer(buildTestDeps({calendar: production.calendar, brain: production.brain, keyStore: fakeKeyStore({worker: principal,
      operator: {tenantId: "toc", scopes: ["calendar", "sessions"]}})}));
    const headers = {authorization: "Bearer worker", "content-type": "application/json"};
    const started = await fetch(server.baseUrl+"/calendar/worker-state/generation", {method: "POST", headers, body: JSON.stringify({account: binding.account, hostId: binding.hostId, expectedGeneration: null})});
    assert.equal(started.status, 200); const {generation} = await started.json() as {generation: string};
    const state = {...snapshot(f, generation), checkedAt: new Date().toISOString()};
    const response = await fetch(server.baseUrl+"/calendar/worker-state", {method: "PUT", headers, body: JSON.stringify(state)}); assert.equal(response.status, 200);
    const inventory = await fetch(server.baseUrl+"/calendar/upcoming", {headers: {authorization: "Bearer operator"}});
    assert.equal(inventory.status, 200); assert.equal((await inventory.json() as any).meetings.length, 2);
    const operations = await fetch(server.baseUrl+"/webinar-operations", {headers: {authorization: "Bearer operator"}});
    assert.equal(operations.status, 200); assert.equal((await operations.json() as any).worker.status, "fresh");
    assert.equal(f.data.watch_state!.length, 1);
  } finally {
    await server?.close(); for (const key of Object.keys(workerEnv)) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
test("concurrent identical publications and pre-commit interruption reuse immutable original receipt", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), state = snapshot(f, generation);
  f.before(() => f.tick());
  const acks = await Promise.all([f.integration.calendar.worker!.publish(principal, state), f.integration.calendar.worker!.publish(principal, state)]);
  assert.deepEqual(acks[0], acks[1]); assert.equal(f.data.watch_state!.length, 1);
  const interrupted = workerFixture(), next = await beginWorker(interrupted), pending = snapshot(interrupted, next.generation);
  interrupted.before(() => {throw new Error("pre-commit interruption");});
  await assert.rejects(interrupted.integration.calendar.worker!.publish(principal, pending), /pre-commit interruption/);
  await assert.rejects(interrupted.integration.calendar.listUpcoming("toc"), refuses(503));
  const originalReceipt = interrupted.data.watch_state![0].workerSnapshot.receivedAt;
  interrupted.before(); interrupted.tick(5000);
  assert.equal((await interrupted.integration.calendar.worker!.publish(principal, pending)).receivedAt, originalReceipt);
});

test("operation summaries remove custom-scheme join tokens and absolute local paths", async () => {
  const {projectWebinarOperations} = await import("../../routes/brain.js");
  const result = projectWebinarOperations({operations: [{id: "event", title: "Webinar zoommtg://zoom.us/join?zak=TOKEN \\\\host\\private\\recording.mp4 /srv/private/capture.mp4", status: "queued", attempts: 0, description: "private source text"}], omitted: 0});
  const text = JSON.stringify(result); assert.ok(!text.includes("TOKEN") && !text.includes("recording.mp4") && !text.includes("capture.mp4") && !text.includes("private source text"));
});

test("worker watcher composition preserves unrelated tenants' own metadata without revealing the owner", async () => {
  const f = workerFixture(), rows = [{_id: "other:gmail", tenantId: "other", sourceType: "gmail" as const, lastHeartbeatAt: f.date()}];
  assert.deepEqual(await f.integration.mergeHeartbeats("other", rows), rows);
  assert.deepEqual(await f.integration.workerHealth("other"), {status: "unavailable"});
  assert.deepEqual(await f.integration.listWorkerHeartbeats("other"), []);
});

test("historical identical retries return original acknowledgement without replacing a newer accepted revision", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), first = snapshot(f, generation);
  const original = await f.integration.calendar.worker!.publish(principal, first); f.tick();
  const failed = {...snapshot(f, generation, 2), complete: false, meetings: []}, failedAck = await f.integration.calendar.worker!.publish(principal, failed); f.tick();
  const newest = {...snapshot(f, generation, 3), meetings: []}; await f.integration.calendar.worker!.publish(principal, newest); f.tick(600000);
  assert.deepEqual(await f.make().calendar.worker!.publish(principal, first), original);
  assert.deepEqual(await f.make().calendar.worker!.publish(principal, failed), failedAck);
  assert.equal((await f.integration.calendar.worker!.read(principal)).sequence, 3);
  assert.equal((await f.integration.calendar.inventory!("toc")).meetings.length, 0);
  assert.equal((await f.integration.calendar.inventory!("toc")).worker.status, "stale");
  await assert.rejects(f.integration.calendar.worker!.publish(principal, {...first, meetings: []}), refuses(409));
});

test("failed scans persist fresh operation updates without replacing coverage or authorizing scheduling", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f);
  await f.integration.calendar.worker!.publish(principal, snapshot(f, generation)); f.tick();
  const failed = {...snapshot(f, generation, 2), complete: false, meetings: [], operations: {operations: [{id: "capture", title: "Capture", status: "recording", attempts: 1}], omitted: 0}};
  await f.integration.calendar.worker!.publish(principal, failed);
  const operations = await f.make().listWebinarOperations("toc"); assert.equal(operations.operations[0]?.status, "recording");
  assert.equal(operations.discovery?.calendar.status, "failed"); assert.equal((await f.integration.calendar.inventory!("toc")).meetings.length, 2);
  await assert.rejects(f.integration.calendar.acquire!("toc"), refuses(503));
  const initial = workerFixture(), next = await beginWorker(initial); await initial.integration.calendar.worker!.publish(principal, {...failed, generation: next.generation, sequence: 1});
  assert.equal((await initial.integration.listWebinarOperations("toc")).operations[0]?.status, "recording");
  await assert.rejects(initial.integration.calendar.listUpcoming("toc"), refuses(503));
});


test("configured hosted rule state survives repository replacement and rejects invalid paths", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "rules-host-"));
  const stateDir = path.join(root, "persistent");
  try {
    const env = {LKB_JOIN_RULES_ENABLED: "1", LKB_JOIN_RULES_STATE_DIR: stateDir};
    const rules = {version: 1 as const, ownDomains: [], rules: [], attendanceMode: "all" as const};
    const first = buildCapturePolicyIntegrations({root: path.join(root, "checkout-a"), env}).joinRules!;
    await first.saveIf("tenant-a", "absent", rules);
    const next = buildCapturePolicyIntegrations({root: path.join(root, "checkout-b"), env}).joinRules!;
    assert.equal((await next.load("tenant-a")).ruleSet?.attendanceMode, "all");
    assert.deepEqual((await next.load("tenant-b")).ruleSet.rules, []);
    for (const invalid of ["relative/path", "", ` ${stateDir}`, `${stateDir}\n`]) {
      assert.deepEqual(buildCapturePolicyIntegrations({root, env: {...env, LKB_JOIN_RULES_STATE_DIR: invalid}}), {});
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
});


test("cycle1 delayed cached snapshot crosses authenticated HTTP loader without forging provider time", async () => {
  const {createHttpCalendarLoader} = await import(new URL("../../../../../packages/meeting-bot/src/calendar/schedule-loaders.ts", import.meta.url).href);
  const {validateWebinarCalendarAcquisition, prepareWebinarSourceState} = await import(new URL("../../../../../packages/meeting-bot/src/calendar/state/schedule-state.ts", import.meta.url).href);
  const f = workerFixture(), {generation} = await beginWorker(f), state = snapshot(f, generation);
  await f.integration.calendar.worker!.publish(principal, state); const providerCheckedAt = state.checkedAt; f.tick(1000);
  const server = await startTestServer(buildTestDeps({calendar: f.integration.calendar, keyStore: fakeKeyStore({worker: principal, other: {...principal, keyId: "other"}, calendar: {...principal, scopes: ["calendar"]}})}));
  try {
    const loader = createHttpCalendarLoader(server.baseUrl, "worker", undefined, {tenantId: "toc"});
    const acquired = await loader(undefined, f.date());
    assert.equal(acquired.checkedAt, providerCheckedAt);
    assert.equal((acquired as any).snapshot.receivedAt, providerCheckedAt);
    assert.equal((acquired as any).snapshot.servedAt, f.date());
    assert.equal(prepareWebinarSourceState({version: 1, tenantId: "toc", operations: {}}, acquired, [], f.date()).state.source!.coverage.baselineComplete, true);
    assert.throws(() => validateWebinarCalendarAcquisition(JSON.parse(JSON.stringify(acquired)), "toc", undefined, f.date()), /Invalid/);
    for (const key of ["other", "calendar"]) await assert.rejects(createHttpCalendarLoader(server.baseUrl, key, undefined, {tenantId: "toc"})(undefined, f.date()), /HTTP 503/);
    const noProtocol = await fetch(server.baseUrl+"/calendar/upcoming?discovery=1&sync=1", {headers: {authorization: "Bearer worker"}});
    assert.equal(noProtocol.status, 503);
    const native = {...acquired} as any; delete native.snapshot;
    assert.throws(() => validateWebinarCalendarAcquisition(native, "toc", undefined, f.date()), /Invalid/);
    acquired.meetings.push({id: "forged", title: "forged", startTime: "", endTime: ""});
    assert.throws(() => validateWebinarCalendarAcquisition(acquired, "toc", undefined, f.date()), /Invalid/);
    f.tick(599000); await assert.rejects(loader(undefined, f.date()), /HTTP 503/);
  } finally { await server.close(); }
});

test("cycle1 full mirror retains cancellation, unplaced and literal all-day inventory without promoting recurring masters", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), state: any = snapshot(f, generation);
  const known = {id: "occurrence", title: "Known invitation", startTime: "2026-10-28T08:00:00.000Z", endTime: "2026-10-28T09:00:00.000Z"};
  const allDay = {id: "all-day", title: "All day", startTime: "2026-10-28", endTime: "2026-10-29"};
  state.meetings = [known, allDay];
  state.sourceEvents = [{id: known.id, title: "", startTime: "", endTime: "", cancelled: true},
    {id: "outside-window", title: "Cancelled outside expansion", startTime: "", endTime: "", cancelled: true},
    {id: "unplaced", title: "Unplaced source", startTime: "", endTime: ""},
    {...allDay, id: "series", recurrence: ["RRULE:FREQ=DAILY"]}];
  state.gmailSummary = {listed: 5, fetched: 5, candidates: 1, excludedNonMeeting: 2, excludedInternal: 1, refusedSender: 1, incompleteMessages: 0, complete: true};
  state.candidates = [{messageId: "mail", subject: "Unresolved invitation", senderEmail: "host@example.net", senderDomain: "example.net", evidenceIssue: "unresolved-body"}];
  await f.integration.calendar.worker!.publish(principal, state);
  const acquired = await f.integration.calendar.acquire!("toc");
  assert.deepEqual(acquired.sourceEvents, state.sourceEvents); assert.deepEqual(acquired.meetings, state.meetings);
  const inventory = (await f.integration.calendar.inventory!("toc")).meetings;
  assert.equal(inventory.length, 4); assert.ok(!inventory.some(row => row.id === "series"));
  assert.deepEqual(inventory.find(row => row.id === known.id), {...known, cancelled: true});
  assert.deepEqual(inventory.find(row => row.id === "all-day"), allDay);
  assert.equal(inventory.find(row => row.id === "unplaced")?.startTime, "");
  assert.equal(inventory.find(row => row.id === "outside-window")?.startTime, "");
  assert.deepEqual(f.integration.ownedDomains("toc"), ["example.org"]); assert.deepEqual(f.integration.ownedDomains("foreign"), []);
  assert.deepEqual(await f.integration.gmailSummary("toc"), state.gmailSummary);
  assert.equal((await f.integration.listGmailCandidates("toc"))[0]?.evidenceIssue, "unresolved-body");
  f.tick(600000); assert.equal(await f.integration.gmailSummary("toc"), undefined); await assert.rejects(f.integration.listGmailCandidates("toc"), refuses(503));
});
test("cycle1 private wire rejects missing mirror, recurrence occurrences and unbounded or private summary fields", async () => {
  const f = workerFixture(), {generation} = await beginWorker(f), state: any = snapshot(f, generation);
  const {sourceEvents: _missing, ...missing} = state;
  const summary = {listed: 1, fetched: 1, candidates: 1, excludedNonMeeting: 0, excludedInternal: 0, refusedSender: 0, incompleteMessages: 0, complete: true};
  for (const bad of [missing, {...state, meetings: [{...state.meetings[0], recurrence: ["RRULE:FREQ=DAILY"]}]},
    {...state, gmailSummary: {listed: 0}}, {...state, gmailSummary: {...summary, listed: 10001}}, {...state, gmailSummary: {...summary, fetched: -1}},
    {...state, gmailSummary: {...summary, rawBody: "private"}}, {...state, candidates: [{messageId: "m", subject: "s", senderEmail: "a@b.org", senderDomain: "b.org", evidenceIssue: "ok"}]}])
    await assert.rejects(f.integration.calendar.worker!.publish(principal, bad), refuses(400));
});

test("cycle1 snapshot HTTP rejects forged freshness metadata, foreign scope, stale receipt and revoked owner", async () => {
  const {createHttpCalendarLoader} = await import(new URL("../../../../../packages/meeting-bot/src/calendar/schedule-loaders.ts", import.meta.url).href);
  const f = workerFixture(), {generation} = await beginWorker(f);
  await f.integration.calendar.worker!.publish(principal, snapshot(f, generation)); f.tick(1000);
  let alter = (value: any): any => value;
  const calendar = {...f.integration.calendar, acquire: async (tenant: string, token?: string) => alter(await f.integration.calendar.acquire!(tenant, token))};
  const server = await startTestServer(buildTestDeps({calendar, keyStore: fakeKeyStore({worker: principal})}));
  try {
    const loader = createHttpCalendarLoader(server.baseUrl, "worker", undefined, {tenantId: "toc"});
    const baseline = await loader(undefined, f.date());
    const reset = await loader(baseline.syncToken, f.date());
    assert.equal(reset.mode, "reset"); assert.equal(reset.requestedSyncToken, baseline.syncToken);
    const changes: ((value: any) => any)[] = [
      value => ({...value, tenantId: "foreign"}), value => ({...value, complete: false}),
      value => ({...value, snapshot: {...value.snapshot, digest: "a".repeat(64)}}),
      value => ({...value, snapshot: {...value.snapshot, servedAt: "2026-10-27T08:00:00.000Z"}}),
      value => ({...value, snapshot: {...value.snapshot, receivedAt: "2026-10-27T08:00:02.000Z"}}),
      value => ({...value, checkedAt: "2026-10-27T08:00:01.000Z"}),
      value => ({...value, snapshot: {...value.snapshot, unexpected: true}}),
      value => ({...value, snapshot: {...value.snapshot, version: 2}}),
      value => ({...value, checkedAt: "2026-10-27T07:50:01.000Z", snapshot: {...value.snapshot, receivedAt: "2026-10-27T07:50:01.000Z"}}),
    ];
    for (const change of changes) { alter = change; await assert.rejects(loader(undefined, f.date()), /Invalid/); }
    alter = value => value; f.data.api_keys![0].revokedAt = f.date();
    await assert.rejects(loader(undefined, f.date()), /HTTP 503/);
  } finally { await server.close(); }
});
 test("office inventory derives operator skip only from server-bound domains and keeps raw acquisition strict", async () => {   const f = workerFixture(), {generation} = await beginWorker(f), state: any = snapshot(f, generation);   const organizers = ['HOST@EXAMPLE.ORG', 'host@dept.example.org', 'host@notexample.org', 'host@example.org.evil.test', undefined];
  state.meetings = organizers.map((organizer, i) => ({id: String(i), title: 'Visible source', startTime: '', endTime: '', ...(organizer ? {organizer} : {})}));   state.sourceEvents = [...state.meetings];   await f.integration.calendar.worker!.publish(principal, state);   const rows = (await f.integration.calendar.inventory!('toc')).meetings;
  assert.equal(rows.length, 5);   const server = await startTestServer(buildTestDeps({calendar: f.integration.calendar, keyStore: fakeKeyStore({operator: {tenantId: 'toc', scopes: ['calendar']}, denied: {tenantId: 'toc', scopes: ['gmail']}, foreign: {tenantId: 'foreign', scopes: ['calendar']}})}));   try {     const response = await fetch(server.baseUrl + '/calendar/upcoming', {headers: {authorization: 'Bearer operator'}});
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');     assert.equal((await response.json() as any).meetings[0].attendanceSkipReason, 'office-internal');     for (const key of ['denied', 'foreign']) assert.equal((await fetch(server.baseUrl + '/calendar/upcoming', {headers: {authorization: 'Bearer ' + key}})).status, key === 'denied' ? 403 : 503);     assert.equal((await fetch(server.baseUrl + '/calendar/upcoming?ownDomains=evil.test', {headers: {authorization: 'Bearer operator'}})).status, 400);
  } finally {await server.close();}   assert.deepEqual(rows.map((row: any) => row.attendanceSkipReason), ['office-internal', 'office-internal', undefined, undefined, undefined]);   const acquired = await f.integration.calendar.acquire!('toc');   assert.deepEqual(acquired.meetings, state.meetings); assert.deepEqual(acquired.sourceEvents, state.sourceEvents);
  f.tick();   await assert.rejects(f.integration.calendar.worker!.publish(principal, {...state, sequence: 2, checkedAt: f.date(), meetings: [{...state.meetings[0], attendanceSkipReason: 'office-internal'}]}), refuses(400));   await assert.rejects(f.integration.calendar.inventory!('foreign'), refuses(403)); });
 test("office inventory uses canonical tenant domains, rejects corrupt policy and never annotates acquisitions", async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'office-policy-'));   try {
    const env = {...workerEnv, LKB_JOIN_RULES_ENABLED: '1', LKB_JOIN_RULES_STATE_DIR: path.join(root, 'rules')};     const rules = buildCapturePolicyIntegrations({root, env}).joinRules!;
    await rules.saveIf('toc', 'absent', {version: 1, ownDomains: ['PARTNER.TEST.'], rules: [], attendanceMode: 'all'});     await rules.saveIf('other', 'absent', {version: 1, ownDomains: ['external.test'], rules: []});
    const f = workerFixture(), {generation} = await beginWorker(f), state: any = snapshot(f, generation);     state.meetings = ['host@dept.partner.test', 'host@notpartner.test', 'host@external.test', 'invalid sender'].map((organizer, i) => ({id: String(i), title: 'Retained source', startTime: '', endTime: '', organizer}));
    await f.integration.calendar.worker!.publish(principal, state);     const integration = buildCalendarWorkerIntegrations({db: f.db, env, now: () => new Date(f.date())})!;
    const inventory = await integration.calendar.inventory!('toc');     assert.deepEqual(inventory.meetings.map(row => row.attendanceSkipReason), ['office-internal', undefined, undefined, undefined]);
    assert.deepEqual((await integration.calendar.acquire!('toc')).meetings, state.meetings);     const {writeFile} = await import('node:fs/promises');
    await writeFile(path.join(root, 'rules', 'join-rules', 'toc.json'), '{invalid');     await assert.rejects(integration.calendar.inventory!('toc'));
  } finally {rmSync(root, {recursive: true, force: true});} });

test("new worker bootstrap exposes unknown counts without allowing snapshot acquisition",async()=>{   const f=workerFixture();assert.equal(await f.integration.gmailSummary("toc"),undefined); await assert.rejects(f.integration.listGmailCandidates("toc"),refuses(503)); const {generation}=await beginWorker(f);await f.integration.calendar.worker!.publish(principal,snapshot(f,generation)); assert.equal(await f.integration.gmailSummary("toc"),undefined);f.tick(11*60_000);assert.equal(await f.integration.gmailSummary("toc"),undefined);await assert.rejects(f.integration.listGmailCandidates("toc"),refuses(503)); });
