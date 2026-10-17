import { expect, test } from "vitest";
import { sourceRegistryCounts, sourceWatcherHealth } from "./sourceHealthModel.js";
test("source counts preserve unknown kinds and exclude raw source locations", () => {
  const count = sourceRegistryCounts({ sources: [{ _id: "a", kind: "document", path: "private" }, { _id: "b", kind: "future-kind", url: "secret" }] });
  expect(count.returned).toBe(2); expect(count.counts.document).toBe(1); expect(count.unknown).toBe(1); expect(JSON.stringify(count)).not.toContain("secret");
});
test.each([null, { sources: [null] }, { sources: [{ _id: "a", kind: "url" }, { _id: "a", kind: "url" }] }])("invalid source counts refuse rather than render zero", raw => { expect(() => sourceRegistryCounts(raw)).toThrow(); });
test("watcher health uses producer state and server staleness without inventing health score", () => {
  const result = sourceWatcherHealth({ state: [{ sourceType: "drive", sourceId: "a", status: "failed", seenAt: "2026-10-14T00:00:00Z", failureReason: "SECRET" }], heartbeats: [{ sourceType: "drive", lastHeartbeatAt: "2026-10-14T00:00:00Z", stale: true }, { sourceType: "gmail", lastHeartbeatAt: null, stale: true }] });
  expect(result.counts.failed).toBe(1); expect(result.heartbeats[0]?.stale).toBe(true); expect(JSON.stringify(result)).not.toContain("SECRET");
  expect(sourceWatcherHealth({ state: [], heartbeats: [] })).toEqual({ returned: 0, counts: { seen: 0, ingested: 0, failed: 0 }, heartbeats: [] });
});
test.each([{ state: [], heartbeats: [{ sourceType: "drive", lastHeartbeatAt: null, stale: false }] }, { state: [{ sourceType: ["drive"], sourceId: "a", status: "seen", seenAt: "2026-10-14T00:00:00Z" }], heartbeats: [] }, { state: [], heartbeats: [{ sourceType: "drive", lastHeartbeatAt: "bad", stale: true }] }])("malformed watcher states cannot look healthy", raw => { expect(() => sourceWatcherHealth(raw)).toThrow(); });
