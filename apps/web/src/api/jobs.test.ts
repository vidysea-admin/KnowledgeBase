import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { listJobs } from "./jobs.js";
import { API_BASE_URL } from "./client.js";

const job = { _id: "audit1", kind: "extract", status: "done", createdAt: "2026-10-09T12:00:00Z", provider: "example", updatedAt: "2026-10-09T13:00:00+01:00" };
const fetchMock = vi.fn();
const envelope = (jobs: unknown[] = [job], limit = 50, truncated = false) => ({ jobs, limit, truncated });
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("provider audit jobs client", () => {
  test("uses the real API wrapper, default limit and bearer key with canonical response", async () => {
    respond(envelope());
    expect(await listJobs("test-key")).toEqual(envelope());
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/jobs?limit=50`, expect.objectContaining({ method: "GET", headers: { authorization: "Bearer test-key" } }));
  });

  test.each([1, 100])("accepts bounded explicit limit %s and exact truncation metadata", async (limit) => {
    const jobs = Array.from({ length: limit }, (_, index) => ({ ...job, _id: `audit${index}` }));
    respond(envelope(jobs, limit, true));
    expect((await listJobs("test-key", limit)).truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/jobs?limit=${limit}`, expect.anything());
  });

  test.each([0, -1, 101, 1.5, NaN, Infinity])("refuses invalid limit %s without fetching", async (limit) => {
    await expect(listJobs("test-key", limit)).rejects.toMatchObject({ status: 400, message: "Invalid jobs limit." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not fetch without a key", async () => {
    await expect(listJobs(null)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["null envelope", null], ["missing jobs", { limit: 50, truncated: false }],
    ["extra envelope", { ...envelope(), tenantId: "other" }], ["nonarray", { ...envelope(), jobs: {} }],
    ["wrong limit", { ...envelope(), limit: 100 }], ["string limit", { ...envelope(), limit: "50" }],
    ["missing truncation", { jobs: [job], limit: 50 }], ["string truncation", { ...envelope(), truncated: "false" }],
    ["over limit", envelope(Array.from({ length: 51 }, () => job))], ["short truncated page", envelope([job], 50, true)],
    ["null row", envelope([null])], ["inherited fields", envelope([Object.create(job)])],
    ["missing id", envelope([{ kind: "x", status: "done", createdAt: job.createdAt }])],
    ["empty kind", envelope([{ ...job, kind: " " }])], ["unknown status", envelope([{ ...job, status: "completed" }])],
    ["date-only", envelope([{ ...job, createdAt: "2026-10-09" }])], ["impossible date", envelope([{ ...job, createdAt: "2026-02-30T12:00:00Z" }])],
    ["hour24", envelope([{ ...job, createdAt: "2026-10-09T24:00:00Z" }])], ["null provider", envelope([{ ...job, provider: null }])],
    ["invalid update", envelope([{ ...job, updatedAt: "unknown" }])], ["bad last row", envelope([job, { ...job, status: "unknown" }])],
    ["raw request", envelope([{ ...job, request: { apiKey: "secret" } }])], ["raw response", envelope([{ ...job, response: "secret" }])],
    ["tenant", envelope([{ ...job, tenantId: "other" }])], ["credential", envelope([{ ...job, credentials: "secret" }])],
  ])("refuses malformed or poisoned payload: %s", async (_name, payload) => {
    respond(payload);
    await expect(listJobs("test-key")).rejects.toMatchObject({ status: 503, message: "Invalid provider audit response." });
  });

  test("accepts empty responses, absent optional metadata and a valid leap day", async () => {
    respond(envelope([]));
    expect((await listJobs("test-key")).jobs).toEqual([]);
    respond(envelope([{ _id: "x", kind: "summarize", status: "pending", createdAt: "2024-02-29T23:59:59.1Z" }]));
    expect((await listJobs("test-key")).jobs).toHaveLength(1);
  });

  test.each(["2026-10-09t12:00:00Z", "2026-10-09T12:00:00z", "2026-10-09t12:00:00z"])("accepts valid RFC3339 case variants literally: %s", async (timestamp) => {
    const lowercase = { ...job, createdAt: timestamp, updatedAt: timestamp };
    respond(envelope([lowercase]));
    expect((await listJobs("test-key")).jobs[0]).toEqual(lowercase);
  });

  test("preserves HTTP status for sanitized page-level permission handling", async () => {
    respond({ message: "private backend error" }, 403);
    await expect(listJobs("test-key")).rejects.toMatchObject({ status: 403 });
  });
});
