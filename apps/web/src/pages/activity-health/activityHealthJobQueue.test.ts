// D-158: the public client validator accepts safe job-queue rows and still rejects anything outside the allow-list.
import { describe, expect, it } from "vitest";
import { readActivitySnapshot } from "./activityHealthModel.js";

const row = { source: "job-queue", id: "run-1", status: "failed", createdAt: "2026-10-12T09:59:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", deadlineAt: null, attempts: 3, maxAttempts: 3, automaticRetryCount: 2, errorClass: "plan-invalid" };
const snap = (jobs: object[]) => ({ jobs, limit: 10, truncated: false, observedAt: "2026-10-12T12:00:00.000Z" });

describe("activity snapshot validator, job-queue rows", () => {
  it("projects a job-queue row with source and null deadline", () => {
    expect(readActivitySnapshot(snap([row])).jobs[0]).toEqual(row);
  });
  it("rejects raw error text, wrong source, a deadline, a bad id and an upload-style status", () => {
    for (const bad of [{ ...row, errorClass: "sk-LEAK raw" }, { ...row, source: "other" }, { ...row, deadlineAt: "2026-10-12T09:00:00.000Z" }, { ...row, id: "a/b" }, { ...row, status: "done" }, { ...row, maxAttempts: 101 }])
      expect(() => readActivitySnapshot(snap([bad]))).toThrow();
  });
});
