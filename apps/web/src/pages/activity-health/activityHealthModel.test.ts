import { expect, test } from "vitest";
import { activityHealthModel, readActivitySnapshot } from "./activityHealthModel.js";
const time = "2026-10-09T12:00:00.000Z";
const job = { id: "a".repeat(64), status: "processing", createdAt: time, updatedAt: "2026-10-09T12:01:00.000Z", deadlineAt: "2026-10-09T12:30:00.000Z", attempts: 2, maxAttempts: 2, automaticRetryCount: 1, errorClass: null };
test("safe projection gives truthful sampled counts, freshness and real retry observation", () => {
  const snapshot = readActivitySnapshot({ jobs: [{ ...job, request: "SECRET", claimToken: "SECRET" }], limit: 1, truncated: true, observedAt: time, tenantId: "SECRET" });
  expect(JSON.stringify(snapshot)).not.toContain("SECRET");
  expect(activityHealthModel(snapshot)).toEqual({ counts: { pending: 0, processing: 1, done: 0, failed: 0 }, retryCount: 1, latestQueueActivityAt: job.updatedAt, returned: 1, total: null, observedAt: time, futureTimestampCount: 1 });
  expect(activityHealthModel(readActivitySnapshot({ jobs: [], limit: 50, truncated: false, observedAt: time }))).toMatchObject({ total: 0, latestQueueActivityAt: null, retryCount: 0 });
});
test("rejects malformed envelope, duplicate IDs, unsafe errors and impossible retry numbers", () => {
  const envelope = { jobs: [job], limit: 50, truncated: false, observedAt: time };
  for (const change of [{ limit: 0 }, { limit: 101 }, { truncated: true }, { observedAt: "2026-02-30T12:00:00.000Z" }, { jobs: [job, job] }, { jobs: null }]) expect(() => readActivitySnapshot({ ...envelope, ...change })).toThrow();
  for (const change of [{ id: "private/path" }, { status: "unknown" }, { attempts: 3 }, { maxAttempts: "2" }, { automaticRetryCount: 0 }, { errorClass: "SECRET" }, { status: "failed" }, { createdAt: "2026-02-30T12:00:00.000Z" }, { updatedAt: undefined }]) expect(() => readActivitySnapshot({ ...envelope, jobs: [{ ...job, ...change }] })).toThrow();
});
