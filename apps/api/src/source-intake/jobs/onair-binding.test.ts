import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { queueFixtureStore } from "./test-fixture.js";
import { approvedSourceSession, sourceSessionStillApproved } from "./source-privacy.js";
import { runSourceJob } from "./worker.js";
import type { SourceJobInput } from "./types.js";

// ISS-T045WORKER-002 negative matrix: tenant, approved event, replayed authority, rotated/revoked (expired) authority.
const row = (over: Record<string, unknown> = {}) => ({ id: "b1", tenantId: "tenant-a", accountId: "account-a", eventId: "event-one",
  actorKeyIds: ["actor-a"], providerProcessing: "approved-recording", approvalRef: "owner-permission-ref-fixture", ...over });
const envWith = (rows: unknown[]): NodeJS.ProcessEnv => ({ LKB_ONAIR_COOKIE_HEADER: "synthetic-session-only", LKB_ONAIR_SESSION_TENANT: "tenant-a",
  LKB_ONAIR_SESSION_ACCOUNT: "account-a", LKB_ONAIR_SOURCE_BINDINGS: JSON.stringify(rows) });
const input = (eventId: string, over: Partial<SourceJobInput> = {}): SourceJobInput => ({ tenantId: "tenant-a", actorKeyId: "actor-a",
  url: `https://cloudonair.withgoogle.com/events/${eventId}`, idempotencyKey: `k-${eventId}-${over.actorKeyId ?? "a"}`, ...over });
const refused = (fn: () => unknown) => assert.throws(fn, (e: { code?: string; message?: string; status?: number }) => /source_session_authorization_unavailable/.test(`${e.code}${e.message}`) || e.status === 403);
function root(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "lkb-onair-binding-test-")); chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true })); return dir;
}
async function queueWith(t: { after(fn: () => void): void }, i: SourceJobInput, authority: ReturnType<typeof approvedSourceSession>) {
  const store = queueFixtureStore(root(t));
  await store.enqueue(i, async s => ({ approvedBy: s.actorKeyId, approvalRef: "fixture-request-approval", sourceAuthority: authority }));
  return { store, job: (await store.claim(i.tenantId, "worker"))! };
}

test("cross-tenant: foreign tenant/actor, or a binding row owned by another tenant, never yields authority", () => {
  const env = envWith([row()]);
  refused(() => approvedSourceSession(env, input("event-one", { tenantId: "tenant-b", actorKeyId: "actor-b" })));
  refused(() => approvedSourceSession(env, input("event-one", { tenantId: "tenant-b" })));
  refused(() => approvedSourceSession(envWith([row({ tenantId: "tenant-b", actorKeyIds: ["actor-b"] })]), input("event-one", { tenantId: "tenant-b", actorKeyId: "actor-b" })));
  refused(() => approvedSourceSession({ ...env, LKB_ONAIR_SESSION_TENANT: undefined }, input("event-one")));
});

test("unapproved event or unnamed actor: refused even with a valid session for the tenant", () => {
  const env = envWith([row()]);
  refused(() => approvedSourceSession(env, input("event-two")));
  refused(() => approvedSourceSession(env, input("event-one", { actorKeyId: "actor-z" })));
  refused(() => approvedSourceSession(envWith([row(), row({ id: "b2" })]), input("event-one"))); // ambiguous duplicate grant
});

test("replayed authority for a different event, tenant or actor does not authorize; zero worker calls", async t => {
  const env = envWith([row(), row({ id: "b2", eventId: "event-two" }), row({ id: "b3", eventId: "event-three", actorKeyIds: ["actor-q"] })]);
  const one = approvedSourceSession(env, input("event-one"));
  assert.ok(one);
  const replays: SourceJobInput[] = [input("event-two"), input("event-one", { tenantId: "tenant-b", actorKeyId: "actor-b" })];
  for (const replay of replays) {
    const { store, job } = await queueWith(t, replay, one);
    assert.equal(sourceSessionStillApproved(env, job), false, replay.url + replay.tenantId);
    let calls = 0; const second = queueFixtureStore(root(t));
    await second.enqueue(replay, async s => ({ approvedBy: s.actorKeyId, approvalRef: "r", sourceAuthority: one }));
    await runSourceJob({ store: second, authorizeExecution: async j => sourceSessionStillApproved(env, j), intake: { intake: async () => { calls++; throw new Error("must not run"); } } }, replay.tenantId, "worker");
    assert.equal(calls, 0); void store;
  }
  // Authority forged field-by-field also fails the fresh comparison.
  const { job } = await queueWith(t, input("event-one"), { ...one, eventId: "event-two", bindingId: "b2" });
  assert.equal(sourceSessionStillApproved(env, job), false);
});

test("revoked, rotated or changed authority after queueing (expiry by removal) is refused; control still passes", async t => {
  const env = envWith([row()]);
  const { job } = await queueWith(t, input("event-one"), approvedSourceSession(env, input("event-one")));
  assert.equal(sourceSessionStillApproved(env, job), true); // control
  assert.equal(sourceSessionStillApproved(envWith([]), job), false);
  assert.equal(sourceSessionStillApproved(envWith([row({ actorKeyIds: ["actor-other"] })]), job), false);
  assert.equal(sourceSessionStillApproved(envWith([row({ approvalRef: "rotated-ref" })]), job), false);
  assert.equal(sourceSessionStillApproved({ ...env, LKB_ONAIR_SESSION_ACCOUNT: "account-b" }, job), false);
  assert.equal(sourceSessionStillApproved({ ...env, LKB_ONAIR_COOKIE_HEADER: "rotated-session" }, job), false);
});
