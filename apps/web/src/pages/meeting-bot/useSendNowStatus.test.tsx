import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "../../api/client.js";
import * as api from "../../api/send-now.js";
import { STATUS_MAX_POLLS, STATUS_POLL_MS, STATUS_REQUEST_MS, useSendNowStatus } from "./useSendNowStatus.js";

const ID = "send-now-20261014100000-abcdef";
const OTHER = "send-now-20261014100001-abcdef";
const reply = (status: api.SendNowStatus["status"], jobId = ID): api.SendNowStatus => ({ jobId, status, joined: "unknown" });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const flush = () => act(async () => { await Promise.resolve(); });
const tick = (ms = STATUS_POLL_MS) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

test("polls sequentially through launching/running/not-running, always admission unknown, then stops", async () => {
  const get = vi.spyOn(api, "getSendNowStatus").mockResolvedValueOnce(reply("launching")).mockResolvedValueOnce(reply("running")).mockResolvedValueOnce(reply("not-running"));
  const h = renderHook(() => useSendNowStatus("key", ID)); await flush();
  expect(h.result.current).toContain("Launching");
  await tick(); expect(h.result.current).toContain("Running"); expect(h.result.current).toContain("admission is unknown");
  await tick(); expect(h.result.current).toContain("Not running");
  await tick(60_000); expect(get).toHaveBeenCalledTimes(3);
});

test("slow request never overlaps and stops at its deadline", async () => {
  let resolve!: (v: api.SendNowStatus) => void;
  const get = vi.spyOn(api, "getSendNowStatus").mockImplementation(() => new Promise(r => { resolve = r; }));
  const h = renderHook(() => useSendNowStatus("key", ID));
  await tick(STATUS_REQUEST_MS - 1); expect(get).toHaveBeenCalledTimes(1);
  await tick(1); expect(h.result.current).toContain("Automatic checks stopped");
  await act(async () => { resolve(reply("running")); });
  expect(h.result.current).toContain("Automatic checks stopped"); await tick(60_000); expect(get).toHaveBeenCalledTimes(1);
});

test("bounded to 60 checks even if the recorder stays alive", async () => {
  const get = vi.spyOn(api, "getSendNowStatus").mockResolvedValue(reply("running"));
  const h = renderHook(() => useSendNowStatus("key", ID)); await flush();
  await tick(STATUS_POLL_MS * STATUS_MAX_POLLS);
  expect(get).toHaveBeenCalledTimes(STATUS_MAX_POLLS); expect(h.result.current).toContain("stopped after 60 requests");
  await tick(60_000); expect(get).toHaveBeenCalledTimes(STATUS_MAX_POLLS);
});

test.each([404, 503, 401, 403, 0])("HTTP %i stops, never infers admission", async code => {
  const get = vi.spyOn(api, "getSendNowStatus").mockRejectedValue(new ApiError(code, "secret-server-detail"));
  const h = renderHook(() => useSendNowStatus("key", ID)); await flush();
  expect(h.result.current).toContain("unknown"); expect(h.result.current).not.toContain("secret-server-detail");
  await tick(60_000); expect(get).toHaveBeenCalledTimes(1);
});

test("key/job change rejects late result and unmount cancels future checks", async () => {
  let resolve!: (v: api.SendNowStatus) => void;
  const get = vi.spyOn(api, "getSendNowStatus").mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(reply("running", OTHER));
  const h = renderHook(({ key, id }) => useSendNowStatus(key, id), { initialProps: { key: "old", id: ID } });
  h.rerender({ key: "new", id: OTHER }); await flush();
  await act(async () => { resolve(reply("not-running")); });
  expect(h.result.current).toContain("Running"); expect(get).toHaveBeenLastCalledWith("new", OTHER);
  h.unmount(); await tick(60_000); expect(get).toHaveBeenCalledTimes(2);
});

test("disabled, malformed job, and cancellation make no subsequent requests", async () => {
  const get = vi.spyOn(api, "getSendNowStatus").mockResolvedValue(reply("running"));
  const initialProps: { key: string | null; id: string | null } = { key: null, id: ID };
  const h = renderHook(({ key, id }) => useSendNowStatus(key, id), { initialProps });
  expect(get).not.toHaveBeenCalled(); h.rerender({ key: "key", id: "../../evil" }); expect(get).not.toHaveBeenCalled();
  h.rerender({ key: "key", id: ID }); await flush(); h.rerender({ key: "key", id: null });
  expect(h.result.current).toBeNull(); await tick(60_000); expect(get).toHaveBeenCalledTimes(1);
});

test("client uses exact scoped GET and rejects mismatched/malformed responses", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reply("running")), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  try {
    expect(await api.getSendNowStatus("key", ID)).toEqual(reply("running"));
    expect(fetch.mock.calls[0]![0]).toContain(`/calendar/send-now/${ID}`); expect(fetch.mock.calls[0]![1].headers.authorization).toBe("Bearer key");
    for (const bad of [reply("running", OTHER), { ...reply("running"), joined: true }, { ...reply("running"), status: "joined" }]) {
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(bad), { status: 200 }));
      await expect(api.getSendNowStatus("key", ID)).rejects.toThrow("invalid send-now status");
    }
    await expect(api.getSendNowStatus("key", "../../evil")).rejects.toThrow("invalid send-now job");
    expect(fetch).toHaveBeenCalledTimes(4);
  } finally { vi.unstubAllGlobals(); }
});
