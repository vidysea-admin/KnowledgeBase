import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { createReviewAdapters, createReviewPolicyResolver, type VerifiedReviewPrincipal } from "./policy.js";

const verified: VerifiedReviewPrincipal = { tenantId: "A", keyId: "key:human", scopes: ["sessions", "answer-policy:write"] };
const human = { keyId: "key:human", subject: "reviewer:alice", reviewerKind: "human", canPropose: true, canReview: true, answerActions: ["answer-review", "usefulness"] };
const automation = { keyId: "key:worker", subject: "worker:one", reviewerKind: "automation", canPropose: true, canReview: false, answerActions: [] };
const config = (keys: unknown[] = [human, automation]) => ({ version: 1, tenants: [{ tenantId: "A", keys }] });
function request(auth: unknown, extras: Record<string, unknown> = {}): Request {
  return { auth, body: { actor: "human:forged", isHuman: true, reviewerKind: "human", tenantId: "A" }, headers: { "x-actor-id": "forged", authorization: "Bearer RAW-SECRET" }, ...extras } as unknown as Request;
}
test("review authority unset configuration denies all and malformed input refuses startup", () => {
  for (const input of [undefined, "", JSON.stringify({ version: 1, tenants: [] })]) assert.equal(createReviewPolicyResolver(input).resolve(verified), null);
  for (const input of [" ", "{", "null", "[]", "{}", JSON.stringify({ ...config(), version: 2 }), JSON.stringify({ ...config(), secret: "RAW-SECRET" }), "x".repeat(131073), null, 1]) {
    assert.throws(() => createReviewPolicyResolver(input as string), /^Error: invalid_review_authority_config$/);
  }
});
test("review authority rejects duplicate tenants keys actions and malformed records atomically", () => {
  const bad = [
    { version: 1, tenants: [...config().tenants, ...config().tenants] },
    config([human, human]), config([{ ...human, answerActions: ["usefulness", "usefulness"] }]),
    config([{ ...human, answerActions: ["unknown"] }]), config([{ ...human, answerActions: "answer-review" }]),
    config([{ ...human, canReview: "true" }]), config([{ ...human, reviewerKind: "robot" }]),
    config([{ ...human, subject: " spaced " }]), config([{ ...human, subject: "x".repeat(201) }]),
    config([{ ...human, keyId: "" }]), config([{ ...human, rawKey: "RAW-SECRET" }]),
    config([{ ...human, isHuman: true }]), config([{ ...human, actorId: "forged" }]),
    config([{ ...automation, canReview: true }]), config([{ ...automation, answerActions: ["answer-review"] }]),
    { version: 1, tenants: [{ tenantId: " A", keys: [human] }] },
    { version: 1, tenants: [{ tenantId: "A", keys: [human], reviewerKind: "human" }] },
    { version: 1, tenants: [{ tenantId: "A", keys: {} }] },
    config([null]), config([{ keyId: "key:human" }]),
  ];
  for (const input of bad) assert.throws(() => createReviewPolicyResolver(JSON.stringify(input)), /^Error: invalid_review_authority_config$/);
});
test("review authority configuration bounds tenant key and total inventories", () => {
  assert.throws(() => createReviewPolicyResolver(JSON.stringify({ version: 1, tenants: Array.from({ length: 101 }, (_, i) => ({ tenantId: `tenant:${i}`, keys: [] })) })));
  assert.throws(() => createReviewPolicyResolver(JSON.stringify(config(Array.from({ length: 101 }, (_, i) => ({ ...human, keyId: `key:${i}` }))))));
  // This remains below the byte limit, exercising the total-key limit itself.
  const short = { keyId: "k", subject: "s", reviewerKind: "human", canPropose: false, canReview: false, answerActions: [] };
  const many = { version: 1, tenants: Array.from({ length: 11 }, (_, t) => ({ tenantId: `t${t}`, keys: Array.from({ length: t === 10 ? 1 : 100 }, (_, k) => ({ ...short, keyId: `k${k}` })) })) };
  // The byte bound can refuse first; both limits must fail closed without allocating authority.
  assert.throws(() => createReviewPolicyResolver(JSON.stringify(many)));
});
test("review authority resolves immutable tenant and nonsecret key identity only", () => {
  const input = { version: 1, tenants: [{ tenantId: "A", keys: [human] }, { tenantId: "B", keys: [{ ...human, subject: "reviewer:b" }] }] };
  const resolver = createReviewPolicyResolver(JSON.stringify(input));
  const p = resolver.resolve(verified); assert.ok(p); assert.equal(p.subject, "reviewer:alice");
  assert.equal(resolver.resolve({ ...verified, tenantId: "B" })?.subject, "reviewer:b");
  assert.equal(resolver.resolve({ ...verified, tenantId: "C" }), null);
  assert.equal(resolver.resolve({ ...verified, keyId: "unknown" }), null);
  assert.equal(resolver.resolve({ ...verified, keyId: "Bearer RAW-SECRET" }), null);
  assert.ok(Object.isFrozen(resolver)); assert.ok(Object.isFrozen(p)); assert.ok(Object.isFrozen(p.answerActions));
  assert.throws(() => { (p as { subject: string }).subject = "forged"; });
  assert.throws(() => { (p.answerActions as string[]).push("source-preference"); });
  human.subject = "reviewer:changed-after-parse";
  try { assert.equal(resolver.resolve(verified)?.subject, "reviewer:alice"); } finally { human.subject = "reviewer:alice"; }
});
test("review authority refuses malformed verified principals without scope-based promotion", async () => {
  const resolver = createReviewPolicyResolver(JSON.stringify(config())); const adapters = createReviewAdapters(resolver);
  for (const p of [undefined, null, {}, { ...verified, tenantId: " A" }, { ...verified, keyId: "" }, { ...verified, scopes: "sessions" }, { ...verified, scopes: [1] }]) {
    assert.equal(resolver.resolve(p as VerifiedReviewPrincipal), null);
    assert.equal(await adapters.answerReviewAuthority.verifyHuman(request(p), "answer-review"), null);
    assert.equal(await adapters.relationshipContextFor(p as VerifiedReviewPrincipal), null);
  }
  const unlisted = { ...verified, keyId: "key:unknown", scopes: ["*", "admin", "answer-policy:write", "sessions"] };
  assert.equal(await adapters.answerReviewAuthority.verifyHuman(request(unlisted), "answer-review"), null);
  assert.equal(await adapters.relationshipContextFor(unlisted), null);
});
test("review authority answer adapter grants only configured human actions ignoring caller claims", async () => {
  const adapters = createReviewAdapters(createReviewPolicyResolver(JSON.stringify(config())));
  for (const action of ["answer-review", "usefulness"] as const) assert.deepEqual(await adapters.answerReviewAuthority.verifyHuman(request(verified), action), { kind: "human", tenantId: "A", subject: "reviewer:alice" });
  assert.equal(await adapters.answerReviewAuthority.verifyHuman(request(verified), "source-preference"), null);
  assert.equal(await adapters.answerReviewAuthority.verifyHuman(request({ ...verified, keyId: automation.keyId }), "answer-review"), null);
  assert.equal(await adapters.answerReviewAuthority.verifyHuman(request(undefined), "answer-review"), null);
  // Scope requirements are enforced by existing routers in addition to this identity adapter.
  assert.deepEqual(await adapters.answerReviewAuthority.verifyHuman(request({ ...verified, scopes: [] }), "answer-review"), { kind: "human", tenantId: "A", subject: "reviewer:alice" });
});
test("review authority relationship adapter copies explicit policy without human inference", async () => {
  const adapters = createReviewAdapters(createReviewPolicyResolver(JSON.stringify(config())));
  assert.deepEqual(await adapters.relationshipContextFor(verified), { tenantId: "A", actorId: "reviewer:alice", reviewerKind: "human", canPropose: true, canReview: true });
  assert.deepEqual(await adapters.relationshipContextFor({ ...verified, keyId: automation.keyId }), { tenantId: "A", actorId: "worker:one", reviewerKind: "automation", canPropose: true, canReview: false });
  const disabled = createReviewAdapters(createReviewPolicyResolver(JSON.stringify(config([{ ...human, canPropose: false, canReview: false, answerActions: [] }]))));
  assert.deepEqual(await disabled.relationshipContextFor(verified), { tenantId: "A", actorId: "reviewer:alice", reviewerKind: "human", canPropose: false, canReview: false });
  assert.equal(await disabled.answerReviewAuthority.verifyHuman(request(verified), "answer-review"), null);
});
test("review authority adapters reject foreign resolver authority and propagate safe refusal failures", async () => {
  const known = createReviewPolicyResolver(JSON.stringify(config())).resolve(verified)!;
  const foreign = createReviewAdapters({ resolve() { return { ...known, tenantId: "FOREIGN" }; } });
  assert.equal(await foreign.answerReviewAuthority.verifyHuman(request(verified), "answer-review"), null);
  assert.equal(await foreign.relationshipContextFor(verified), null);
  const failure = createReviewAdapters({ resolve() { throw new Error("authority unavailable"); } });
  await assert.rejects(failure.answerReviewAuthority.verifyHuman(request(verified), "answer-review"), /authority unavailable/);
  await assert.rejects(failure.relationshipContextFor(verified), /authority unavailable/);
});
