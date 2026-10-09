import { expect, test } from "vitest";
import { emptyGapFilters, gapsModel, readGaps, recordedDate } from "./gapsModel.js";
import { gapsResponse } from "./gapsFixtures.js";
const now = Date.parse("2026-10-09T12:00:00Z");
test("actual returned records reconcile status/kind totals and optional metadata without mutation", () => {
  const before = JSON.stringify(gapsResponse), rows = readGaps(gapsResponse), model = gapsModel(rows, emptyGapFilters, now);
  expect(model).toMatchObject({ total: 5, counts: { open: 2, received: 1, expired: 1, unknown: 1 }, overdue: 1, openDated: 1, openDueMissing: 0, openDueInvalid: 1 });
  expect(model.kinds.find(([kind]) => kind === "vector-pending")).toEqual(["vector-pending", 2]);
  expect(rows[0]?.requestedFrom.value).toBe("org:toc"); expect(rows[1]?.sourceRef.value).toBe("source:b"); expect(rows[4]?.rawStatus).toBe("future-status");
  expect(JSON.stringify(gapsResponse)).toBe(before);
});
test("combined filters preserve IDs and original totals; unknown records remain reachable", () => {
  const rows = readGaps(gapsResponse);
  expect(gapsModel(rows, { status: "open", kind: "vector-pending", query: "NOT INDEXED" }, now).visible.map(row => row.id)).toEqual(["gap-d"]);
  expect(gapsModel(rows, { ...emptyGapFilters, query: "org:toc" }, now).visible.map(row => row.id)).toEqual(["gap/a"]);
  expect(gapsModel(rows, { ...emptyGapFilters, status: "unknown" }, now).visible.map(row => row.id)).toEqual(["gap-e"]);
  expect(gapsModel(rows, { ...emptyGapFilters, query: "absent" }, now)).toMatchObject({ total: 5, visible: [] });
});
test("overdue uses only open status, valid exact due date and strictly earlier snapshot", () => {
  const rows = readGaps({ gaps: ["open", "received", "expired"].map((status, i) => ({ _id: String(i), kind: "source-pending", status, sla: { dueAt: "2026-10-09T12:00:00Z" } })) });
  expect(gapsModel(rows, emptyGapFilters, now).overdue).toBe(0); expect(gapsModel(rows, emptyGapFilters, now + 1).overdue).toBe(1);
  const missing = readGaps({ gaps: [{ _id: "x", kind: "source-pending", status: "open" }] }); expect(gapsModel(missing, emptyGapFilters, now).openDueMissing).toBe(1);
});
test("missing/invalid optional fields are explicit; bad dates and malformed base records fail honestly", () => {
  for (const value of ["2026-02-30T12:00:00Z", "2026-10-09T24:00:00Z", "2026-01-01", "bad", 1, null]) expect(recordedDate(value).state).toBe("invalid");
  expect(recordedDate("2024-02-29T12:00:00+05:30").state).toBe("recorded"); expect(recordedDate(undefined).state).toBe("missing");
  const row = readGaps({ gaps: [{ _id: "x", kind: "source-pending", status: "open", requestedFrom: {}, sourceRef: 5, sla: null }] })[0];
  expect(row).toMatchObject({ requestedFrom: { state: "invalid" }, sourceRef: { state: "invalid" }, dueAt: { state: "invalid" } });
  for (const input of [{}, { gaps: null }, { gaps: [{}] }, { gaps: [gapsResponse.gaps[0], gapsResponse.gaps[0]] }]) expect(() => readGaps(input)).toThrow();
  expect(() => gapsModel([], emptyGapFilters, NaN)).toThrow();
});
