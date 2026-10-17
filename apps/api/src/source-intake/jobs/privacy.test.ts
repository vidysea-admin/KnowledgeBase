import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync, chmodSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { validatePrivateAclSnapshot, verifyPrivateDirectory } from "../../bot-privacy/private-acl.js";
import { createSourceJobStore } from "./store.js";
import { queueFixtureStore, FIXTURE_SID } from "./test-fixture.js";
import { approvedSourceSession, sourceSessionStillApproved, onairSessionFingerprint, guardedSourceMediaTransport } from "./source-privacy.js";
import { runSourceJob } from "./worker.js";
import type { SourceJobInput } from "./types.js";

type Reproduction = { case: string; input: string; expected: string };
const issues = readFileSync(new URL("../../../../../qa/issues.T045WORKER.jsonl", import.meta.url), "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
const floor = (id: string): Reproduction[] => {
  const issue = issues.find(row => row.id === id); assert.ok(issue); assert.equal(issue.reproduction_count, 4);
  assert.equal(issue.reproductions.length, 4); return issue.reproductions;
};
function fixture(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), "lkb-source-privacy-test-")); chmodSync(root, 0o700);
  t.after(() => { const path = relative(tmpdir(), root); assert.ok(path && !path.startsWith("..") && !isAbsolute(path) && path.startsWith("lkb-source-privacy-test-")); rmSync(root, { recursive: true, force: true }); });
  return root;
}
const approved = async (input: Readonly<SourceJobInput>) => ({ approvedBy: input.actorKeyId, approvalRef: "fixture-request-approval" });
const zoom: SourceJobInput = { tenantId: "tenant-a", actorKeyId: "actor-a", url: "https://zoom.us/rec/share/fixturebearer", idempotencyKey: "windows-acl-root" };

test("ISS-T045WORKER-001: all four exact filed ACL reproductions refuse before bearer append/read/execution (native-reader model)", async t => {
  for (const reproduction of floor("ISS-T045WORKER-001")) await t.test(`${reproduction.case}: ${reproduction.input}`, async sub => {
    const root = fixture(sub), tenant = join(root, createHash("sha256").update(zoom.tenantId).digest("hex"));
    const target = reproduction.case === "WINACL-ROOT-ALLOW-OTHER" || reproduction.case === "WINACL-OWNER-OTHER" ? root :
      reproduction.case === "WINACL-TENANT-ALLOW-OTHER" ? tenant : join(tenant, "audit.jsonl");
    if (target !== root) mkdirSync(tenant, { mode: 0o700 });
    if (target.endsWith("audit.jsonl")) writeFileSync(target, "invalid-secret-journal-must-not-be-read\n", { mode: 0o600 });
    const verify = (path: string) => validatePrivateAclSnapshot({ path, currentSid: FIXTURE_SID,
      ownerSid: path === target && reproduction.case === "WINACL-OWNER-OTHER" ? "S-1-5-21-444-555-666-1002" : FIXTURE_SID,
      rules: [{ sid: FIXTURE_SID, type: "Allow", rights: 2032127 },
        ...(path === target && reproduction.case !== "WINACL-OWNER-OTHER" ? [{ sid: "S-1-5-32-545", type: "Allow", rights: 131241 }] : [])],
    }, path);
    const verifier = { directory: verify, artifact: verify };
    let intakeCalls = 0;
    if (target === root) assert.throws(() => createSourceJobStore(root, { verifier }), /source_spool_unavailable/);
    else {
      const store = createSourceJobStore(root, { verifier });
      await assert.rejects(store.enqueue({ ...zoom, idempotencyKey: reproduction.case === "WINACL-TENANT-ALLOW-OTHER" ? "windows-acl-tenant" : "windows-acl-file" }, approved), /source_spool_unavailable/);
      await assert.rejects(store.poll(zoom.tenantId, "a".repeat(64)), /source_spool_unavailable/);
      await assert.rejects(runSourceJob({ store, authorizeExecution: async () => true, intake: { intake: async () => { intakeCalls++; throw new Error(); } } }, zoom.tenantId, "worker"), /source_spool_unavailable/);
    }
    assert.equal(intakeCalls, 0);
    if (target === root) assert.deepEqual(readdirSync(root), []);
    else if (target.endsWith("audit.jsonl")) assert.equal(readFileSync(target, "utf8"), "invalid-secret-journal-must-not-be-read\n");
    else assert.deepEqual(readdirSync(tenant), []);
  });
});

const binding = { id: "owner-approval-1", tenantId: "tenant-a", accountId: "account-a", eventId: "event-one",
  actorKeyIds: ["actor-a"], providerProcessing: "approved-recording", approvalRef: "actual-owner-permission-reference-fixture" };
const protectedEnv = (): NodeJS.ProcessEnv => ({ LKB_ONAIR_COOKIE_HEADER: "synthetic-session-only", LKB_ONAIR_SESSION_TENANT: "tenant-a",
  LKB_ONAIR_SESSION_ACCOUNT: "account-a", LKB_ONAIR_SOURCE_BINDINGS: JSON.stringify([binding]) });
const onair: SourceJobInput = { ...zoom, url: "https://cloudonair.withgoogle.com/events/event-one", idempotencyKey: "onair-approved" };
test("ISS-T045WORKER-002: all four exact filed OnAir cases produce zero page/tool/provider calls", async t => {
  for (const reproduction of floor("ISS-T045WORKER-002")) await t.test(`${reproduction.case}: ${reproduction.input}`, async sub => {
    const store = queueFixtureStore(fixture(sub)), env = protectedEnv(); let input = { ...onair };
    if (reproduction.case === "ONAIR-FOREIGN-TENANT") input = { ...input, tenantId: "tenant-b", actorKeyId: "actor-b", url: "https://cloudonair.withgoogle.com/events/account-a-only" };
    if (reproduction.case === "ONAIR-UNAPPROVED-EVENT") input.url = "https://cloudonair.withgoogle.com/events/another-event";
    const authority = reproduction.case === "ONAIR-BINDING-CHANGED" ? approvedSourceSession(env, input) : undefined;
    const queued = await store.enqueue(input, async current => ({ ...await approved(current), ...(authority ? { sourceAuthority: authority } : {}) }));
    if (reproduction.case === "ONAIR-UNBOUND-ACCOUNT") delete env.LKB_ONAIR_SESSION_ACCOUNT;
    if (reproduction.case === "ONAIR-BINDING-CHANGED") env.LKB_ONAIR_SOURCE_BINDINGS = "[]";
    const counts = { page: 0, tool: 0, provider: 0 };
    await runSourceJob({ store, authorizeExecution: async job => sourceSessionStillApproved(env, job), intake: { intake: async () => {
      counts.page++; counts.tool++; counts.provider++; throw new Error("fixture-only execution");
    } } }, input.tenantId, "worker");
    assert.deepEqual(counts, { page: 0, tool: 0, provider: 0 });
    assert.equal((await store.poll(input.tenantId, queued.jobId))!.reason, "authorization-unavailable");
  });
});

test("OnAir owned-event/public-no-cookie controls and rotated session/event permission fences", async t => {
  const env = protectedEnv(), store = queueFixtureStore(fixture(t));
  const queued = await store.enqueue(onair, async input => ({ ...await approved(input), sourceAuthority: approvedSourceSession(env, input) }));
  const job = (await store.claim(onair.tenantId, "worker"))!;
  assert.equal(sourceSessionStillApproved(env, job), true);
  const apiEnv: NodeJS.ProcessEnv = { ...env, LKB_ONAIR_SESSION_FINGERPRINT: onairSessionFingerprint(env.LKB_ONAIR_COOKIE_HEADER!) }; delete apiEnv.LKB_ONAIR_COOKIE_HEADER;
  assert.deepEqual(approvedSourceSession(apiEnv, onair, { requireCookie: false }), job.approval.sourceAuthority);
  assert.equal(sourceSessionStillApproved(apiEnv, job), false);
  assert.equal(sourceSessionStillApproved({ ...env, LKB_ONAIR_COOKIE_HEADER: "different-synthetic-session" }, job), false);
  assert.equal(sourceSessionStillApproved({ ...env, LKB_ONAIR_SOURCE_BINDINGS: JSON.stringify([{ ...binding, providerProcessing: "not-approved" }]) }, job), false);
  assert.equal(JSON.stringify(await store.poll(onair.tenantId, queued.jobId)).includes("synthetic-session"), false);
  const publicJob = { ...job, approval: await approved(onair) };
  assert.equal(sourceSessionStillApproved({}, publicJob), true);
  assert.equal(sourceSessionStillApproved(env, publicJob), false);
});

test("actual native private-directory receipt prerequisite", { skip: !process.env.LKB_T045_NATIVE_ACL_PATH }, () => {
  verifyPrivateDirectory(process.env.LKB_T045_NATIVE_ACL_PATH!);
  console.log(JSON.stringify({ scope: "actual native private directory verification", platform: process.platform, providerCalls: 0 }));
});

test("actual POSIX private-root/tenant/artifact control", { skip: process.platform === "win32" }, async t => {
  const root = fixture(t), store = createSourceJobStore(root);
  const job = await store.enqueue(zoom, approved);
  assert.equal((await createSourceJobStore(root).poll(zoom.tenantId, job.jobId))!.state, "queued");
});

test("permission loss after acquisition blocks each provider processing request while allowing scoped cleanup", async () => {
  let allowed = true; const calls: string[] = [];
  const transport = guardedSourceMediaTransport(async () => allowed, async request => { calls.push(request.method); return { status: 200, headers: {} }; });
  const request = { method: "POST" as const, url: "https://generativelanguage.googleapis.com/upload/v1beta/files", headers: {} };
  await transport(request); allowed = false;
  for (const method of ["PUT", "GET", "POST"] as const) await assert.rejects(transport({ ...request, method }), /source_job_forbidden/);
  assert.deepEqual(calls, ["POST"]);
  await transport({ ...request, method: "DELETE", url: "https://generativelanguage.googleapis.com/v1beta/files/fixture" });
  assert.deepEqual(calls, ["POST", "DELETE"]);
});
