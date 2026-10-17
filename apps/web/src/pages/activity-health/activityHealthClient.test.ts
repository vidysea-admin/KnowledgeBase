import { afterEach, expect, test, vi } from "vitest";
import { loadActivityHealth } from "./activityHealthClient.js";
afterEach(() => vi.unstubAllGlobals());
test("uses public apiFetch transport with Bearer and strict bounded limit", async () => {
  const body = { jobs: [], limit: 1, truncated: false, observedAt: "2026-10-09T12:00:00.000Z" };
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => body })); vi.stubGlobal("fetch", fetcher);
  expect(await loadActivityHealth("test-key", 1)).toEqual(body);
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/activity-health\?limit=1$/);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", headers: { authorization: "Bearer test-key" } });
  for (const limit of [0, 101, 1.1, NaN]) await expect(loadActivityHealth("test-key", limit)).rejects.toThrow("Invalid activity limit");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test("malformed response fails and no missing-key read is attempted", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => ({ jobs: [] }) })); vi.stubGlobal("fetch", fetcher);
  await expect(loadActivityHealth("test-key")).rejects.toThrow("Invalid activity response");
  await expect(loadActivityHealth("")).rejects.toMatchObject({ status: 401 }); expect(fetcher).toHaveBeenCalledTimes(1);
});
