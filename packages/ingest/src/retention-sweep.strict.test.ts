/**
 * packages/ingest/src/retention-sweep.strict.test.ts — T-046 fix cycle 1. Replays the EXACT recorded
 * reproductions of ISS-T046-001/-002/-003 verbatim, then hostile shapes for every decision field.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planRetentionSweep, type RetentionPlan, type RetentionSweepInput } from "./retention-sweep.js";
import { parseIsoInstant } from "./strict-record.js";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const MIN = 604800000;
const PARAMS = { minAgeAfterProcessedMs: MIN, clipPaddingSeconds: 15 };
const OLD = "2026-10-03T11:59:59.000Z";

/** The ledger's recorded input (ISS-T046-001/-002/-003 share it), media supplied by the case. */
function ledgerInput(media: unknown[]): RetentionSweepInput {
  return {
    tenantId: "toc", media,
    claims: [{ _id: "c1", tenantId: "toc", text: "x", status: "verified", evidence: [{ turnId: "t1", sessionId: "s1" }] }],
    turns: [{ _id: "t1", tenantId: "toc", sessionId: "s1", speakerRef: "a", tStart: 100, tEnd: 110, text: "x" }],
    now: NOW, params: { minAgeAfterProcessedMs: 604800000, clipPaddingSeconds: 15 },
  };
}
const good = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  _id: "m1", tenantId: "toc", sourceRef: "s", kind: "recording", turnRefs: ["t1"],
  retention: { purgeAfterVerified: false }, processedAt: OLD, ...o,
});
function run(media: unknown[], over: Partial<RetentionSweepInput> = {}): RetentionPlan {
  const r = planRetentionSweep({ ...ledgerInput(media), ...over });
  assert.equal(r.ok, true);
  return (r as { ok: true; plan: RetentionPlan }).plan;
}
function withProto(proto: Record<string, unknown>, own: Record<string, unknown>): Record<string, unknown> {
  return Object.assign(Object.create(proto) as Record<string, unknown>, own);
}

test("sanity: the ledger's good record is purge-eligible", () => {
  assert.deepEqual(run([good()]).purgeEligibleIds, ["m1"]);
});

test("ISS-T046-001 verbatim: tenantId inherited from the prototype is KEEP, not purge-eligible", () => {
  const o = Object.assign(Object.create({ tenantId: "toc" }), {
    _id: "m1", sourceRef: "s", kind: "recording", turnRefs: ["t1"],
    retention: { purgeAfterVerified: false }, processedAt: "2026-10-03T11:59:59.000Z",
  });
  const p = run([o]);
  assert.deepEqual(p.purgeEligibleIds, []);
  assert.equal(p.items[0]!.decision, "keep");
  assert.match(p.items[0]!.reason, /^malformed record/);
  assert.deepEqual(p.tenancyViolations, []);
});

test("ISS-T046-002 verbatim: processedAt '1','0','12','2020' are KEEP 'malformed processedAt'", () => {
  for (const V of ["1", "0", "12", "2020"]) {
    const p = run([{ _id: "m1", tenantId: "toc", sourceRef: "s", kind: "recording", turnRefs: ["t1"],
      retention: { purgeAfterVerified: false }, processedAt: V }]);
    assert.deepEqual(p.purgeEligibleIds, [], V);
    assert.equal(p.items[0]!.reason, "malformed processedAt", V);
  }
  for (const V of ["garbage", "tomorrow", "2026-09-26x"]) {
    assert.deepEqual(run([good({ processedAt: V })]).purgeEligibleIds, [], V);
  }
});

test("ISS-T046-003: a valid purgedAt is never purge-eligible; a malformed purgedAt is KEEP", () => {
  const purged = run([good({ retention: { purgeAfterVerified: true, purgedAt: "2020-01-01T00:00:00.000Z" } })]);
  assert.deepEqual(purged.purgeEligibleIds, []);
  assert.match(purged.items[0]!.reason, /already purged/);
  for (const bad of ["2020", 0, 1700000000000, "yesterday", "2020-01-01", "2020-13-01T00:00:00Z", true, {}, []]) {
    const p = run([good({ retention: { purgeAfterVerified: true, purgedAt: bad } })]);
    assert.deepEqual(p.purgeEligibleIds, [], JSON.stringify(bad));
    assert.equal(p.items[0]!.decision, "keep");
    assert.match(p.items[0]!.reason, /malformed record/, JSON.stringify(bad));
  }
  assert.deepEqual(run([good({ retention: { purgeAfterVerified: true, purgedAt: null } })]).purgeEligibleIds, ["m1"]);
  assert.deepEqual(run([good({ retention: { purgeAfterVerified: true } })]).purgeEligibleIds, ["m1"]);
});

test("every decision field inherited from the prototype (not own) is KEEP", () => {
  const full = good();
  for (const field of ["_id", "tenantId", "sourceRef", "kind", "turnRefs", "retention", "processedAt"]) {
    const own: Record<string, unknown> = { ...full };
    const inherited = own[field];
    delete own[field];
    const rec = withProto({ [field]: inherited }, own);
    const p = run([rec]);
    assert.deepEqual(p.purgeEligibleIds, [], field);
    assert.equal(p.items.length, 1, field);
    assert.equal(p.items[0]!.decision, "keep", field);
  }
  // inherited nested retention fields
  const ret = withProto({ purgeAfterVerified: false }, {});
  assert.deepEqual(run([good({ retention: ret })]).purgeEligibleIds, []);
  const ret2 = withProto({ purgedAt: "2020-01-01T00:00:00.000Z" }, { purgeAfterVerified: false });
  assert.deepEqual(run([good({ retention: ret2 })]).purgeEligibleIds, []); // purgedAt read as not own: still strict about shape
});

test("polluted Object.prototype cannot supply a missing field", () => {
  const proto = Object.prototype as unknown as Record<string, unknown>;
  proto.tenantId = "toc";
  proto.processedAt = OLD;
  try {
    const own = good();
    delete own.tenantId;
    delete own.processedAt;
    assert.deepEqual(run([own]).purgeEligibleIds, []);
  } finally {
    delete proto.tenantId;
    delete proto.processedAt;
  }
});

test("accessor properties are malformed even when they would return valid values", () => {
  for (const field of ["_id", "tenantId", "sourceRef", "kind", "turnRefs", "retention", "processedAt"]) {
    const rec = good();
    const value = rec[field];
    let reads = 0;
    Object.defineProperty(rec, field, { enumerable: true, get() { reads++; return reads === 1 ? value : "1"; } });
    const p = run([rec]);
    assert.deepEqual(p.purgeEligibleIds, [], field);
    assert.equal(p.items[0]!.decision, "keep", field);
    assert.ok(reads <= 1, `${field} getter read ${reads} times`);
  }
  // getter that flips from a mismatching tenant to the right one must not match either
  let n = 0;
  const flip = good();
  Object.defineProperty(flip, "tenantId", { enumerable: true, get() { return n++ === 0 ? "other" : "toc"; } });
  assert.deepEqual(run([flip]).purgeEligibleIds, []);
  // accessor inside nested retention and inside claims/turns
  const ret = { purgeAfterVerified: false };
  Object.defineProperty(ret, "purgedAt", { enumerable: true, get: () => null });
  assert.deepEqual(run([good({ retention: ret })]).purgeEligibleIds, []);
  const claim = ledgerInput([]).claims[0] as Record<string, unknown>;
  Object.defineProperty(claim, "status", { enumerable: true, get: () => "verified" });
  assert.deepEqual(run([good()], { claims: [claim] }).purgeEligibleIds, []);
  const t = { ...(ledgerInput([]).turns[0] as object) } as Record<string, unknown>;
  Object.defineProperty(t, "tEnd", { enumerable: true, get: () => 110 });
  assert.deepEqual(run([good()], { turns: [t] }).purgeEligibleIds, []);
});

test("Proxies, class instances, arrays and non-enumerable fields are malformed", () => {
  class M { _id = "m1"; tenantId = "toc"; sourceRef = "s"; kind = "recording"; turnRefs = ["t1"];
    retention = { purgeAfterVerified: false }; processedAt = OLD; }
  const hidden = good();
  Object.defineProperty(hidden, "tenantId", { enumerable: false, value: "toc" });
  const turnRefsProxy = good({ turnRefs: new Proxy(["t1"], {}) });
  const retProxy = good({ retention: new Proxy({ purgeAfterVerified: false }, {}) });
  for (const rec of [new Proxy(good(), {}), new M(), [good()], hidden, turnRefsProxy, retProxy]) {
    const p = run([rec]);
    assert.deepEqual(p.purgeEligibleIds, []);
    assert.equal(p.items[0]!.decision, "keep");
  }
  const subclass = Object.setPrototypeOf(["t1"], { length: 1 });
  assert.deepEqual(run([good({ turnRefs: subclass })]).purgeEligibleIds, []);
});

test("wrong-typed or hostile values for every decision field are KEEP", () => {
  const cases: [string, unknown][] = [
    ["_id", 7], ["_id", ""], ["_id", ["m1"]], ["tenantId", ["toc"]], ["tenantId", 7], ["tenantId", ""],
    ["tenantId", new String("toc")], ["sourceRef", 1], ["kind", "RECORDING"], ["kind", ["recording"]],
    ["turnRefs", [1]], ["turnRefs", ["t1", ""]], ["turnRefs", new Array(1)], ["turnRefs", { 0: "t1", length: 1 }],
    ["retention", "x"], ["retention", []], ["retention", { purgeAfterVerified: 1 }], ["retention", { purgeAfterVerified: "true" }],
    ["processedAt", 1700000000000], ["processedAt", new Date(NOW - 2 * MIN)], ["processedAt", null],
    ["processedAt", new String(OLD)], ["path", 5], ["tStart", "1"], ["tEnd", NaN],
  ];
  for (const [field, value] of cases) {
    const p = run([good({ [field]: value })]);
    assert.deepEqual(p.purgeEligibleIds, [], `${field}=${String(value)}`);
  }
});

test("numeric, date-only, offset, local and impossible timestamps are KEEP (no offset forms accepted)", () => {
  const bad = ["1", "0", "12", "2020", "2020-01-01", "2020-01-01T00:00:00", "2020-01-01 00:00:00Z",
    "2020-01-01T00:00:00+00:00", "2020-01-01T05:30:00+05:30", "2020-01-01T00:00:00.1Z", "2020-01-01T00:00:00.123456Z",
    "2020-13-01T00:00:00Z", "2020-02-30T00:00:00Z", "2021-02-29T00:00:00Z", "2020-01-01T24:00:00Z",
    "2020-01-01T00:00:60Z", "2020-01-32T00:00:00Z", " 2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z ",
    "2020-01-01t00:00:00z", "+002020-01-01T00:00:00Z", "1700000000000", "Sat, 03 Oct 2026 11:59:59 GMT"];
  for (const V of bad) {
    assert.equal(parseIsoInstant(V), null, V);
    assert.deepEqual(run([good({ processedAt: V })]).purgeEligibleIds, [], V);
  }
  assert.equal(parseIsoInstant("2020-02-29T00:00:00Z"), Date.parse("2020-02-29T00:00:00Z"));
  assert.deepEqual(run([good({ processedAt: "2026-10-03T11:59:59Z" })]).purgeEligibleIds, ["m1"]);
  assert.deepEqual(run([good({ processedAt: "2026-10-03T11:59:59.000Z" })]).purgeEligibleIds, ["m1"]);
  assert.deepEqual(run([good({ processedAt: "2099-01-01T00:00:00.000Z" })]).purgeEligibleIds, []); // future
});

test("malformed claims, turns and envelope values fail closed", () => {
  const claim = ledgerInput([]).claims[0] as Record<string, unknown>;
  const turn = ledgerInput([]).turns[0] as Record<string, unknown>;
  const protoClaim = withProto({ status: "verified" }, { _id: "c1", tenantId: "toc", evidence: claim.evidence });
  assert.deepEqual(run([good()], { claims: [protoClaim] }).purgeEligibleIds, []);
  const protoTurn = withProto({ tenantId: "toc" }, { _id: "t1", sessionId: "s1", tStart: 100, tEnd: 110 });
  assert.deepEqual(run([good()], { turns: [protoTurn] }).purgeEligibleIds, []);
  assert.deepEqual(run([good()], { turns: [{ ...turn, tStart: "100" }] }).purgeEligibleIds, []);
  assert.deepEqual(run([good()], { turns: [turn, { ...turn, tEnd: 900 }] }).purgeEligibleIds, []); // ambiguous duplicate turn
  assert.deepEqual(run([good()], { claims: [{ ...claim, evidence: "t1" }] }).purgeEligibleIds, []);
  assert.deepEqual(run([good()], { claims: [{ ...claim, evidence: [{ turnId: 1, sessionId: "s1" }] }] }).purgeEligibleIds, []);
  assert.deepEqual(run([good()], { claims: [{ ...claim, evidence: [] }] }).purgeEligibleIds, []);
  assert.deepEqual(run([good()], { claims: [claim, { ...claim, _id: "c2", status: "needs-review" }] }).purgeEligibleIds, []);
  for (const over of [{ now: "1760000000000" }, { now: -5 }, { now: 0 }, { now: Infinity }, { tenantId: ["toc"] }, { media: "x" },
    { media: new Proxy([], {}) }, { params: { minAgeAfterProcessedMs: "1", clipPaddingSeconds: 15 } },
    { params: withProto({ minAgeAfterProcessedMs: MIN, clipPaddingSeconds: 15 }, {}) }]) {
    assert.equal(planRetentionSweep({ ...ledgerInput([good()]), ...over } as never).ok, false, JSON.stringify(over));
  }
  assert.equal(planRetentionSweep(withProto(ledgerInput([good()]) as never, {}) as never).ok, false); // inherited envelope
});

test("property: hostile generator, 3000 seeded cases; every purge-eligible id is a clean, old, unpurged, own-tenant record", () => {
  let s = 20261010;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pick = <X>(a: X[]): X => a[Math.floor(rnd() * a.length)]!;
  const stamps: unknown[] = [OLD, "2026-10-03T11:59:59Z", new Date(NOW - 3 * MIN).toISOString(), "1", "0", "12", "2020", "2020-01-01",
    "2026-10-03", "2026-10-03T11:59:59", "2026-10-03T11:59:59+00:00", "2026-13-03T11:59:59Z", "2026-02-30T00:00:00Z", 1700000000000,
    new Date(NOW - 3 * MIN), null, undefined, "2099-01-01T00:00:00.000Z", new Date(NOW - 1000).toISOString()];
  const purged: unknown[] = [undefined, undefined, undefined, null, "2020-01-01T00:00:00.000Z", "2020", 5, "x", {}];
  const bases = ["recording", "audio", "video", "evidence-clip", "weird"];
  let eligible = 0, hostile = 0, total = 0;
  const own = (o: object, k: string) => {
    const d = Object.getOwnPropertyDescriptor(o, k);
    return d && "value" in d && d.enumerable ? d.value : undefined;
  };
  for (let n = 0; n < 3000; n++) {
    const media: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      let rec: Record<string, unknown> = good({
        _id: `m${i}`, turnRefs: [`t${i}`], kind: pick(bases), processedAt: pick(stamps),
        tenantId: rnd() < 0.1 ? "other" : "toc",
        retention: { purgeAfterVerified: rnd() < 0.9 ? rnd() < 0.5 : "yes", purgedAt: pick(purged) },
      });
      if (rec.retention && (rec.retention as { purgedAt: unknown }).purgedAt === undefined) delete (rec.retention as object as Record<string, unknown>).purgedAt;
      const mode = rnd();
      if (mode < 0.15) { // field moved to the prototype
        const f = pick(["_id", "tenantId", "sourceRef", "kind", "turnRefs", "retention", "processedAt"]);
        const { [f]: moved, ...rest } = rec;
        rec = withProto({ [f]: moved }, rest); hostile++;
      } else if (mode < 0.25) { // accessor that changes between reads
        const f = pick(["tenantId", "processedAt", "kind", "turnRefs", "retention"]);
        const v = rec[f]; let c = 0;
        Object.defineProperty(rec, f, { enumerable: true, get() { return c++ === 0 ? v : pick(stamps); } }); hostile++;
      } else if (mode < 0.32) { rec = new Proxy(rec, {}); hostile++; }
      else if (mode < 0.4) { rec[pick(["sourceRef", "turnRefs", "tenantId", "_id"])] = pick([1, null, [], {}, true]); hostile++; }
      media.push(rec);
    }
    const claims = [0, 1, 2, 3].map((i) => ({ _id: `c${i}`, tenantId: "toc", text: "x",
      status: rnd() < 0.85 ? "verified" : "needs-review", evidence: [{ turnId: `t${i}`, sessionId: "s1" }] }));
    const turns = [0, 1, 2, 3].map((i) => ({ _id: `t${i}`, tenantId: "toc", sessionId: "s1", speakerRef: "a", tStart: 10, tEnd: 20, text: "x" }));
    const r = planRetentionSweep({ tenantId: "toc", media, claims, turns, now: NOW, params: PARAMS });
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    total += media.length;
    for (const id of r.plan.purgeEligibleIds) {
      eligible++;
      const rec = media.find((m) => !(m instanceof Array) && typeof m === "object" && own(m as object, "_id") === id) as object | undefined;
      assert.ok(rec, `iter ${n} ${id}: eligible id has no plain record`);
      const proto = Object.getPrototypeOf(rec);
      assert.ok(proto === Object.prototype || proto === null, `iter ${n} ${id}: not plain`);
      assert.equal(own(rec, "tenantId"), "toc");
      assert.ok(["recording", "audio", "video"].includes(own(rec, "kind") as string));
      assert.ok(typeof own(rec, "sourceRef") === "string" && Array.isArray(own(rec, "turnRefs")));
      const ret = own(rec, "retention") as object;
      assert.ok(ret && typeof ret === "object" && typeof own(ret, "purgeAfterVerified") === "boolean", `iter ${n} ${id}: retention`);
      const pa = own(ret, "purgedAt");
      assert.ok(pa === undefined || pa === null, `iter ${n} ${id}: purgedAt ${String(pa)}`);
      const at = own(rec, "processedAt");
      assert.equal(typeof at, "string");
      assert.match(at as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      const ms = Date.parse(at as string);
      assert.equal(new Date(ms).toISOString().slice(0, 19), (at as string).slice(0, 19));
      assert.ok(ms <= NOW && NOW - ms >= MIN, `iter ${n} ${id}: not old enough`);
    }
    for (const v of r.plan.tenancyViolations) assert.ok(!r.plan.purgeEligibleIds.includes(v.mediaId));
  }
  assert.ok(eligible > 100 && hostile > 1000 && total === 12000, `eligible=${eligible} hostile=${hostile} total=${total}`);
});
