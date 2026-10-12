import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getUsage } from "./usage.js";
import { API_BASE_URL } from "./client.js";

const fetchMock = vi.fn();
const fig = (total: number, errors: number) => ({ total, errors, errorRate: total ? errors / total : null });
const body = (days = 2) => ({
  days, from: "2026-10-11", to: "2026-10-12", truncated: false,
  byDay: Array.from({ length: days }, (_, i) => ({ day: `2026-10-${11 + i}`, ask: fig(i, 0), search: fig(0, 0) })),
  totals: { ask: fig(1, 0), search: fig(0, 0) },
});
function respond(b: unknown, status = 200) { fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => b }); }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("usage client", () => {
  test("GETs /usage?days=N with the bearer key and returns the validated body", async () => {
    respond(body());
    expect(await getUsage("k", 2)).toEqual(body());
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/usage?days=2`, expect.objectContaining({ method: "GET", headers: { authorization: "Bearer k" } }));
  });
  test.each([0, -1, 91, 1.5, NaN])("refuses days=%s without fetching", async (d) => {
    await expect(getUsage("k", d)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test.each([
    ["extra field", { ...body(), tenantId: "x" }],
    ["wrong days", { ...body(), days: 3 }],
    ["short byDay", { ...body(), byDay: body().byDay.slice(1) }],
    ["errors > total", { ...body(), totals: { ask: { total: 1, errors: 2, errorRate: 2 }, search: fig(0, 0) } }],
    ["rate disagrees with counts", { ...body(), totals: { ask: { total: 4, errors: 1, errorRate: 0.9 }, search: fig(0, 0) } }],
    ["null rate with calls", { ...body(), totals: { ask: { total: 4, errors: 1, errorRate: null }, search: fig(0, 0) } }],
    ["bad day", { ...body(), byDay: [{ ...body().byDay[0]!, day: "yesterday" }, body().byDay[1]!] }],
    ["non-object", []],
  ])("rejects a malformed response (%s) as an error", async (_n, b) => {
    respond(b);
    await expect(getUsage("k", 2)).rejects.toMatchObject({ status: 503 });
  });
  test("403 surfaces as an ApiError and does not clear the signed-in key", async () => {
    localStorage.setItem("lkbApiKey", "k"); respond({ error: "forbidden" }, 403);
    await expect(getUsage("k", 2)).rejects.toMatchObject({ status: 403 });
    expect(localStorage.getItem("lkbApiKey")).toBe("k");
  });
});
