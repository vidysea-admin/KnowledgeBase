import { describe, expect, test } from "vitest";
import { claimsPerSession, formatPercent, gapCounts, graphEvidence, jobCounts, ratio, sessionsOverTime, speakerResolution } from "./analyticsModel.js";

describe("ratio", () => {
  test("percent and one-decimal rounding", () => {
    expect(ratio(1, 3).percent).toBe(33.3);
    expect(ratio(2, 2).percent).toBe(100);
    expect(ratio(0, 5).percent).toBe(0);
  });
  test("zero denominator and invalid inputs give null, never NaN or Infinity", () => {
    for (const [n, d] of [[0, 0], [3, 0], [NaN, 4], [1, Infinity], [-1, 4], [5, 4]] as const) expect(ratio(n, d).percent).toBeNull();
    expect(formatPercent(ratio(0, 0))).toBe("n/a (no rows)");
    expect(formatPercent(ratio(1, 4))).toBe("25% (1 of 4)");
  });
});
describe("sessionsOverTime", () => {
  test("empty and non-array input", () => {
    for (const v of [[], undefined, null, "x", {}]) expect(sessionsOverTime(v)).toEqual({ total: 0, months: [], undated: 0, indexed: 0, malformed: 0 });
  });
  test("groups by month, sorts ascending, counts indexed", () => {
    const f = sessionsOverTime([
      { _id: "a", date: "2026-10-02", status: { index: "done" } }, { _id: "b", date: "2026-09-30", status: { index: "pending" } },
      { _id: "c", date: "2026-10-31T10:00:00Z", status: { index: "done" } },
    ]);
    expect(f.months).toEqual([{ month: "2026-09", count: 1 }, { month: "2026-10", count: 2 }]);
    expect(f.total).toBe(3); expect(f.indexed).toBe(2);
  });
  test("partial and malformed rows are counted, not invented", () => {
    const f = sessionsOverTime([{ _id: "a" }, { date: "2026-13-01" }, { date: 5 }, "junk", null, { date: "2026-01-05", status: "done" }]);
    expect(f.total).toBe(4); expect(f.undated).toBe(3); expect(f.malformed).toBe(2); expect(f.indexed).toBe(0);
    expect(f.months).toEqual([{ month: "2026-01", count: 1 }]);
  });
});
describe("claimsPerSession", () => {
  test("totals, verified share, per-session counts", () => {
    const f = claimsPerSession([
      { sessionId: "s1", turns: [], claims: [{ _id: "1", status: "verified" }, { _id: "2", status: "needs-review" }] },
      { sessionId: "s2", turns: [], claims: [] }, { sessionId: "s3", turns: [], claims: [{ _id: "3", status: "verified" }, { _id: "4", status: "conflicting" }] },
    ]);
    expect(f).toMatchObject({ sessionsSampled: 3, sessionsWithClaims: 2, totalClaims: 4, malformed: 0 });
    expect(f.verified).toEqual({ numerator: 2, denominator: 4, percent: 50 });
    expect(f.perSession.map(s => s.claims)).toEqual([2, 0, 2]);
  });
  test("empty input has null percent", () => {
    expect(claimsPerSession([]).verified.percent).toBeNull();
    expect(claimsPerSession([{ sessionId: "s", claims: [], turns: [] }]).totalClaims).toBe(0);
  });
  test("malformed claims and non-array claims are excluded and counted", () => {
    const f = claimsPerSession([{ sessionId: "s", turns: [], claims: [{ _id: "1", status: "verified" }, { status: "verified" }, { _id: "", status: "verified" }, { _id: "x" }, 7] }, { sessionId: "t", turns: [], claims: "nope" }]);
    expect(f.totalClaims).toBe(1); expect(f.malformed).toBe(4); expect(f.verified.percent).toBe(100);
  });
});
describe("speakerResolution", () => {
  test("only a non-empty speakerLabel counts as resolved", () => {
    const f = speakerResolution([{ sessionId: "s", claims: [], turns: [{ speakerRef: "spk:1" }, { speakerRef: "spk:2", speakerLabel: "Asha" }, { speakerLabel: "  " }, { speakerLabel: 3 }] }]);
    expect(f.turns).toBe(4); expect(f.resolved).toEqual({ numerator: 1, denominator: 4, percent: 25 });
  });
  test("no turns and malformed turns", () => {
    expect(speakerResolution([]).resolved.percent).toBeNull();
    const f = speakerResolution([{ sessionId: "s", claims: [], turns: [null, "x", { speakerLabel: "B" }] }]);
    expect(f.turns).toBe(1); expect(f.malformed).toBe(2); expect(f.resolved.percent).toBe(100);
  });
});
describe("graphEvidence", () => {
  test("share of edges with at least one evidence turnId, plus stats", () => {
    const f = graphEvidence({ edges: [{ evidence: [{ turnId: "t1" }] }, { evidence: [] }, {}, { evidence: [{ sessionId: "s" }] }], stats: { sessionsInGraph: 3, sessionsTotal: 5 } });
    expect(f.withEvidence).toEqual({ numerator: 1, denominator: 4, percent: 25 }); expect(f.sessionsInGraph).toBe(3); expect(f.sessionsTotal).toBe(5);
  });
  test("empty, missing and malformed graph", () => {
    expect(graphEvidence({ edges: [], stats: {} })).toMatchObject({ edges: 0, sessionsInGraph: null, sessionsTotal: null });
    expect(graphEvidence({ edges: [], stats: {} }).withEvidence.percent).toBeNull();
    expect(graphEvidence(null).edges).toBe(0);
    const f = graphEvidence({ edges: [1, null, { evidence: [{ turnId: "a" }] }], stats: { sessionsInGraph: -1, sessionsTotal: 2.5 } });
    expect(f.malformed).toBe(2); expect(f.edges).toBe(1); expect(f.sessionsInGraph).toBeNull(); expect(f.sessionsTotal).toBeNull();
  });
});
describe("gapCounts and jobCounts", () => {
  test("counts known statuses, others, malformed", () => {
    const g = gapCounts([{ status: "open" }, { status: "open" }, { status: "received" }, { status: "weird" }, {}, 3]);
    expect(g).toEqual({ total: 5, counts: { open: 2, received: 1, expired: 0 }, other: 2, malformed: 1 });
    const j = jobCounts([{ status: "done" }, { status: "failed" }, { status: "failed" }]);
    expect(j.counts).toEqual({ pending: 0, processing: 0, done: 1, failed: 2 }); expect(j.other).toBe(0);
  });
  test("empty and non-array input", () => {
    expect(gapCounts([]).total).toBe(0); expect(jobCounts(undefined)).toEqual({ total: 0, counts: { pending: 0, processing: 0, done: 0, failed: 0 }, other: 0, malformed: 0 });
  });
});
