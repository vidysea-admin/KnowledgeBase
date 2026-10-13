import { describe, test, expect } from "vitest";
import type { SessionSummary } from "../../api/types.js";
import { NO_FILTERS, filterOptions, filterSessions, monthOf, overallStatus, processedShare } from "./sessionsFilterModel.js";

const mk = (id: string, date: string, t: string, i: string, org?: string, participants?: string[]): SessionSummary =>
  ({ _id: id, title: id, date, org, participants, status: { transcribe: t, index: i } });
const rows = [
  mk("a", "2026-04-21", "done", "done", "TOC", ["Ann", "Bob"]),
  mk("b", "2026-04-30", "done", "processing", "TOC", ["Bob"]),
  mk("c", "2026-05-02", "failed", "done", "Acme"),
  mk("d", "garbage", "queued", "queued"),
];

describe("sessions filter model", () => {
  test("monthOf only trusts YYYY-MM prefixes", () => {
    expect(monthOf("2026-04-21")).toBe("2026-04");
    expect(monthOf("garbage")).toBe("");
    expect(monthOf(undefined)).toBe("");
  });
  test("overallStatus: failed beats processing beats done", () => {
    expect(rows.map(overallStatus)).toEqual(["done", "processing", "failed", "other"]);
  });
  test("each filter and their conjunction", () => {
    const ids = (f: Partial<typeof NO_FILTERS>) => filterSessions(rows, { ...NO_FILTERS, ...f }).map((r) => r._id);
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
    expect(ids({ month: "2026-04" })).toEqual(["a", "b"]);
    expect(ids({ status: "failed" })).toEqual(["c"]);
    expect(ids({ org: "TOC" })).toEqual(["a", "b"]);
    expect(ids({ participant: "Bob" })).toEqual(["a", "b"]);
    expect(ids({ participant: "Ann", status: "processing" })).toEqual([]);
  });
  test("options are deduped, month newest first, sessions without data tolerated", () => {
    expect(filterOptions(rows)).toEqual({ months: ["2026-05", "2026-04"], orgs: ["Acme", "TOC"], participants: ["Ann", "Bob"] });
  });
  test("processedShare counts only fully processed rows; empty gives null", () => {
    expect(processedShare(rows)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(processedShare([])).toEqual({ done: 0, total: 0, percent: null });
  });
});
