/**
 * packages/ingest/src/retention-sweep.test.ts — T-046. Pure fixtures, no I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPurgeEligible } from "@lkb/core";
import type { Media, Claims } from "@lkb/core";
import { planRetentionSweep, type RetentionSweepInput } from "./retention-sweep.js";

const T = "toc";
const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const MIN = 7 * 24 * 3600 * 1000;
const PARAMS = { minAgeAfterProcessedMs: MIN, clipPaddingSeconds: 15 };
const OLD = new Date(NOW - MIN - 1000).toISOString();

function media(id: string, o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: id, tenantId: T, sourceRef: "src", kind: "recording", turnRefs: [`t-${id}`],
    retention: { purgeAfterVerified: false }, processedAt: OLD, ...o,
  };
}
function claim(id: string, status: string, turnIds: string[], o: Record<string, unknown> = {}) {
  return { _id: id, tenantId: T, text: id, status, evidence: turnIds.map((turnId) => ({ turnId, sessionId: "s1" })), ...o };
}
function turn(id: string, tStart: number, tEnd: number, o: Record<string, unknown> = {}) {
  return { _id: id, tenantId: T, sessionId: "s1", speakerRef: "spk:0", tStart, tEnd, text: "x", ...o };
}
function input(o: Partial<RetentionSweepInput> = {}): RetentionSweepInput {
  return { tenantId: T, media: [], claims: [], turns: [], now: NOW, params: PARAMS, ...o };
}
function plan(i: RetentionSweepInput) {
  const r = planRetentionSweep(i);
  assert.equal(r.ok, true);
  return (r as { ok: true; plan: import("./retention-sweep.js").RetentionPlan }).plan;
}

test("eligible media (verified claims, processed long enough) is purge-eligible with windows retained", () => {
  const p = plan(input({
    media: [media("m1")],
    claims: [claim("c1", "verified", ["t-m1"])],
    turns: [turn("t-m1", 100, 110)],
  }));
  assert.deepEqual(p.purgeEligibleIds, ["m1"]);
  assert.equal(p.items[0]!.decision, "purge-eligible");
  assert.deepEqual(p.items[0]!.retainWindows, [{ sessionId: "s1", turnId: "t-m1", tStart: 85, tEnd: 125 }]);
});

test("window start clamps at 0 and padding is the explicit parameter", () => {
  const p = plan(input({
    media: [media("m1")], claims: [claim("c1", "verified", ["t-m1"])], turns: [turn("t-m1", 5, 10)],
    params: { ...PARAMS, clipPaddingSeconds: 30 },
  }));
  assert.deepEqual(p.items[0]!.retainWindows, [{ sessionId: "s1", turnId: "t-m1", tStart: 0, tEnd: 40 }]);
});

test("ineligible per policy: unverified claim, no claim, evidence-clip, no turnRefs", () => {
  const p = plan(input({
    media: [media("a"), media("b"), media("c", { kind: "evidence-clip" }), media("d", { turnRefs: [] })],
    claims: [claim("c1", "unverified", ["t-a"])],
    turns: [turn("t-a", 1, 2), turn("t-b", 1, 2)],
  }));
  assert.deepEqual(p.purgeEligibleIds, []);
  assert.equal(p.items.length, 4);
  assert.ok(p.items.every((i) => i.decision === "keep" && i.reason.length > 0));
});

test("claim whose evidence turn cannot be resolved keeps the media", () => {
  const p = plan(input({
    media: [media("m1")],
    claims: [claim("c1", "verified", ["t-m1", "t-ghost"])],
    turns: [turn("t-m1", 100, 110)],
  }));
  assert.equal(p.items[0]!.decision, "keep");
  assert.match(p.items[0]!.reason, /cannot be resolved/);
});

test("a turn from another tenant does not resolve evidence", () => {
  const p = plan(input({
    media: [media("m1")], claims: [claim("c1", "verified", ["t-m1"])],
    turns: [turn("t-m1", 100, 110, { tenantId: "other" })],
  }));
  assert.deepEqual(p.purgeEligibleIds, []);
});

test("malformed and partial media records are kept, never purge-eligible", () => {
  const good = { claims: [claim("c1", "verified", ["t-m1"])], turns: [turn("t-m1", 1, 2)] };
  const bad: unknown[] = [
    null, 42, "str", [], {},
    media("m1", { _id: undefined }), media("m2", { tenantId: undefined }),
    media("m3", { kind: "bogus" }), media("m4", { kind: undefined }), media("m5", { sourceRef: undefined }),
    media("m6", { retention: undefined }), media("m7", { retention: { purgeAfterVerified: "yes" } }),
    media("m8", { turnRefs: "t-m8" }), media("m9", { turnRefs: [1, 2] }), media("m10", { turnRefs: undefined }),
    media("m11", { retention: { purgeAfterVerified: false, purgedAt: "2026-01-01T00:00:00Z" } }),
    media("m12", { processedAt: undefined }), media("m13", { processedAt: "not a date" }),
    media("m14", { processedAt: new Date(NOW + 1000).toISOString() }), media("m15", { processedAt: 12345 }),
  ];
  const p = plan(input({ media: bad, ...good }));
  assert.equal(p.items.length, bad.length);
  assert.deepEqual(p.purgeEligibleIds, []);
  assert.ok(p.items.every((i) => i.decision === "keep" && i.reason.length > 0));
});

test("malformed claims block: unreadable evidence blocks all, readable-but-bad blocks matching turns", () => {
  const turns = [turn("t-m1", 1, 2), turn("t-m2", 1, 2)];
  const ok = claim("c1", "verified", ["t-m1"]);
  const ok2 = claim("c2", "verified", ["t-m2"]);
  const all = plan(input({
    media: [media("m1"), media("m2")], turns,
    claims: [ok, ok2, { _id: "bad", tenantId: T, status: "verified" }],
  }));
  assert.deepEqual(all.purgeEligibleIds, []);
  const some = plan(input({
    media: [media("m1"), media("m2")], turns,
    claims: [ok, ok2, claim("c3", "verified", ["t-m2"], { status: undefined })],
  }));
  assert.deepEqual(some.purgeEligibleIds, ["m1"]);
});

test("another tenant's claim neither blocks nor satisfies", () => {
  const p = plan(input({
    media: [media("m1")], turns: [turn("t-m1", 1, 2)],
    claims: [claim("c1", "verified", ["t-m1"], { tenantId: "other" })],
  }));
  assert.deepEqual(p.purgeEligibleIds, []); // no own claim has cited it
  assert.match(p.items[0]!.reason, /no claim has cited/);
});

test("mixed-tenant input: other tenant media is a violation, excluded from items and purge list", () => {
  const p = plan(input({
    media: [media("mine"), media("theirs", { tenantId: "other" })],
    claims: [claim("c1", "verified", ["t-mine"]), claim("c2", "verified", ["t-theirs"], { tenantId: "other" })],
    turns: [turn("t-mine", 1, 2)],
  }));
  assert.deepEqual(p.purgeEligibleIds, ["mine"]);
  assert.deepEqual(p.items.map((i) => i.mediaId), ["mine"]);
  assert.deepEqual(p.tenancyViolations, [{ mediaId: "theirs", foundTenantId: "other", requestedTenantId: T }]);
});

test("duplicate media ids are all kept", () => {
  const p = plan(input({
    media: [media("m1"), media("m1")], claims: [claim("c1", "verified", ["t-m1"])], turns: [turn("t-m1", 1, 2)],
  }));
  assert.deepEqual(p.purgeEligibleIds, []);
  assert.equal(p.items.length, 2);
});

test("missing, zero, negative, NaN or wrongly typed thresholds return an error, not a plan", () => {
  const cases: unknown[] = [
    undefined, {}, { clipPaddingSeconds: 15 }, { minAgeAfterProcessedMs: MIN },
    { minAgeAfterProcessedMs: 0, clipPaddingSeconds: 15 }, { minAgeAfterProcessedMs: MIN, clipPaddingSeconds: -1 },
    { minAgeAfterProcessedMs: NaN, clipPaddingSeconds: 15 }, { minAgeAfterProcessedMs: Infinity, clipPaddingSeconds: 15 },
    { minAgeAfterProcessedMs: "604800000", clipPaddingSeconds: 15 }, null,
  ];
  for (const params of cases) {
    const r = planRetentionSweep(input({ params: params as never, media: [media("m1")] }));
    assert.equal(r.ok, false, JSON.stringify(params));
    assert.ok(!r.ok && r.errors.length > 0);
  }
});

test("missing tenant, bad now and non-array inputs are errors", () => {
  assert.equal(planRetentionSweep(input({ tenantId: "" })).ok, false);
  assert.equal(planRetentionSweep(input({ now: NaN })).ok, false);
  assert.equal(planRetentionSweep(input({ media: undefined as never })).ok, false);
  assert.equal(planRetentionSweep(input({ claims: undefined as never })).ok, false);
  assert.equal(planRetentionSweep(input({ turns: undefined as never })).ok, false);
  assert.equal(planRetentionSweep(undefined as never).ok, false);
});

test("boundary: age exactly at the threshold is eligible, one ms under is kept", () => {
  const base = { claims: [claim("c1", "verified", ["t-m1"])], turns: [turn("t-m1", 1, 2)] };
  const at = plan(input({ ...base, media: [media("m1", { processedAt: new Date(NOW - MIN).toISOString() })] }));
  assert.deepEqual(at.purgeEligibleIds, ["m1"]);
  const under = plan(input({ ...base, media: [media("m1", { processedAt: new Date(NOW - MIN + 1).toISOString() })] }));
  assert.deepEqual(under.purgeEligibleIds, []);
  assert.match(under.items[0]!.reason, /under the/);
  const future = plan(input({ ...base, media: [media("m1", { processedAt: new Date(NOW).toISOString() })] }));
  assert.deepEqual(future.purgeEligibleIds, []); // age 0 < MIN
});

test("empty input gives an empty plan", () => {
  const p = plan(input());
  assert.deepEqual(p, { tenantId: T, items: [], purgeEligibleIds: [], tenancyViolations: [] });
});

test("planner does not mutate its inputs", () => {
  const i = input({ media: [media("m1")], claims: [claim("c1", "verified", ["t-m1"])], turns: [turn("t-m1", 1, 2)] });
  const before = JSON.stringify(i);
  planRetentionSweep(i);
  assert.equal(JSON.stringify(i), before);
});

test("property: never purge-eligible when isPurgeEligible says no (seeded random)", () => {
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pick = <X>(a: X[]): X => a[Math.floor(rnd() * a.length)]!;
  const statuses = ["verified", "unverified", "disputed", "pending", undefined];
  let eligibleSeen = 0;
  let ineligibleSeen = 0;
  for (let n = 0; n < 300; n++) {
    const ids = ["a", "b", "c"];
    const medias = ids.map((id) => media(id, {
      tenantId: rnd() < 0.1 ? "other" : T,
      kind: pick(["recording", "video", "evidence-clip", "audio", "weird"]),
      turnRefs: rnd() < 0.15 ? [] : [`t-${id}`, ...(rnd() < 0.3 ? ["t-shared"] : [])],
      processedAt: rnd() < 0.2 ? undefined : new Date(NOW - Math.floor(rnd() * 2 * MIN)).toISOString(),
    }));
    const claims = Array.from({ length: Math.floor(rnd() * 5) }, (_, k) =>
      claim(`c${k}`, pick(statuses) as string, [pick(["t-a", "t-b", "t-c", "t-shared", "t-ghost"])],
        rnd() < 0.1 ? { tenantId: "other" } : {}));
    const turns = ["t-a", "t-b", "t-c", "t-shared"].filter(() => rnd() < 0.8).map((id) => turn(id, 10, 20));
    const r = planRetentionSweep(input({ media: medias, claims, turns }));
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    const tenantClaims = claims.filter((c) => c.tenantId === T) as unknown as Claims[];
    for (const item of r.plan.items) {
      const m = medias.find((x) => x._id === item.mediaId)!;
      const policy = isPurgeEligible(m as unknown as Media, tenantClaims);
      if (item.decision === "purge-eligible") {
        eligibleSeen++;
        assert.equal(policy.eligible, true, `iter ${n} ${item.mediaId}`);
        assert.equal(m.tenantId, T);
        assert.ok(item.retainWindows.length > 0);
      } else {
        ineligibleSeen++;
      }
    }
    for (const id of r.plan.purgeEligibleIds) assert.notEqual(medias.find((x) => x._id === id)!.tenantId, "other");
  }
  assert.ok(eligibleSeen > 0 && ineligibleSeen > 0, `eligible=${eligibleSeen} ineligible=${ineligibleSeen}`);
});
