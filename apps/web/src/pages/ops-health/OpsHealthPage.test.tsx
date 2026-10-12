import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { OpsHealthPage } from "./OpsHealthPage.js";
import { loadWatchRuns, providerJobsHealth, queueHealth } from "./opsHealthModel.js";

const fetchMock = vi.fn();
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });
const hex = (c: string) => c.repeat(64);
const job = (id: string, status: string, over: Record<string, unknown> = {}) => ({ id: hex(id), status, createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:05:00.000Z",
  deadlineAt: "2026-10-12T09:00:00.000Z", attempts: 1, maxAttempts: 2, automaticRetryCount: 0, errorClass: null, ...over });
const queue = { jobs: [job("a", "done"), job("b", "failed", { attempts: 2, automaticRetryCount: 1, errorClass: "timeout-or-failure", updatedAt: "2026-10-12T08:30:00.000Z" }),
  job("c", "pending", { attempts: 0 })], limit: 50, truncated: false, observedAt: "2026-10-12T09:00:00.000Z" };
const provider = { jobs: [{ _id: "j1", kind: "k", status: "done", createdAt: "2026-10-01T00:00:00Z" }, { _id: "j2", kind: "k", status: "failed", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }], limit: 50, truncated: false };
const runs = { runs: [{ id: "r1", runAt: "2026-10-12T10:00:00.000Z", mode: "watch", driveNewFound: 2, driveIngested: 1, driveFailed: 1, errorCount: 2 },
  { id: "r2", runAt: "2026-10-11T10:00:00.000Z", mode: "ingest", driveNewFound: null, driveIngested: null, driveFailed: null, errorCount: 0 }], limit: 50, truncated: false,
  summary: { runs: 2, runsWithFailures: 1, totalDriveFailed: 1, totalErrors: 2, lastFailureAt: "2026-10-12T10:00:00.000Z" } };

function route(over: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url, "http://x").pathname;
    const body = path in over ? over[path] : ({ "/activity-health": queue, "/jobs": provider, "/watch-runs": runs } as Record<string, unknown>)[path];
    return body instanceof Error ? Promise.reject(body) : typeof body === "number" ? ok({ message: "x" }, body) : ok(body);
  });
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const mount = () => render(<AuthProvider><OpsHealthPage /></AuthProvider>);

test("renders failures, errors, retries and last failure from all three sources, GET only with the bearer key", async () => {
  route(); mount();
  await screen.findByText(/3 jobs: 1 pending; 0 processing; 1 done; 1 failed/);
  const q = screen.getByRole("region", { name: "Upload queue" });
  expect(q).toHaveTextContent("Automatic retries: 1 across 1 jobs");
  expect(q).toHaveTextContent("Failure classes: timeout-or-failure 1");
  expect(q).toHaveTextContent("Last failure: 2026-10-12T08:30:00.000Z");
  const p = await screen.findByRole("region", { name: "Provider jobs" });
  await waitFor(() => expect(p).toHaveTextContent("2 jobs: 0 pending; 0 processing; 1 done; 1 failed"));
  expect(p).toHaveTextContent("Retries: not recorded for provider jobs");
  expect(p).toHaveTextContent("Last failure: 2026-10-02T00:00:00Z");
  const w = await screen.findByRole("region", { name: "Watcher runs" });
  await waitFor(() => expect(w).toHaveTextContent("2 runs, 1 with failures or errors"));
  expect(w).toHaveTextContent("Drive recordings failed: 1; errors recorded: 2");
  expect(screen.getAllByText("not recorded").length).toBe(3);
  expect(fetchMock.mock.calls.every((c) => c[1].headers.authorization === "Bearer sample-key" && (c[1].method ?? "GET") === "GET")).toBe(true);
  expect(fetchMock.mock.calls.map((c) => new URL(c[0], "http://x").pathname).sort()).toEqual(["/activity-health", "/jobs", "/watch-runs"]);
});

test("empty tenant: three empty notes, no NaN or errors", async () => {
  route({ "/activity-health": { ...queue, jobs: [] }, "/jobs": { jobs: [], limit: 50, truncated: false },
    "/watch-runs": { runs: [], limit: 50, truncated: false, summary: { runs: 0, runsWithFailures: 0, totalDriveFailed: 0, totalErrors: 0, lastFailureAt: null } } });
  mount();
  await screen.findByText("No upload jobs recorded yet."); await screen.findByText("No provider jobs recorded yet."); await screen.findByText("No watcher runs recorded yet.");
  expect(screen.queryByRole("alert")).toBeNull(); expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
});

test("a source failing (403, 503, network, malformed) shows its own unavailable text while the others stay intact", async () => {
  route({ "/activity-health": 403, "/jobs": 503, "/watch-runs": { runs: "bad" } });
  mount();
  await screen.findByText("Upload queue health unavailable: this API key is not permitted to read it.");
  await screen.findByText("Provider job health unavailable: the service could not read it right now.");
  await screen.findByText("Watcher run history unavailable: the service could not read it right now.");
  expect(screen.getAllByRole("alert")).toHaveLength(3); expect(screen.queryByText(/No .* recorded yet/)).toBeNull();
  cleanup(); route({ "/activity-health": new Error("net"), "/jobs": provider, "/watch-runs": 503 }); mount();
  await screen.findByText("Provider jobs"); await screen.findByText(/2 jobs: 0 pending/);
  await screen.findByText("Upload queue health unavailable: unable to load it.");
  await screen.findByText("Watcher run history unavailable: the service could not read it right now.");
});

test("no key: sign-in note and no request; refresh refetches all three", async () => {
  localStorage.clear(); route(); mount();
  expect(screen.getByText("Sign in with an API key to view operations health.")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  cleanup(); localStorage.setItem("lkbApiKey", "k"); mount(); await screen.findByText(/3 jobs: 1 pending/);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
});

test("hostile text from the API is inert and a strict reader refuses wrong shapes", async () => {
  route({ "/watch-runs": { ...runs, runs: [{ ...runs.runs[0], id: "<img src=x onerror=alert(1)>" }] } }); mount();
  await screen.findByText(/2 runs, 1 with failures/); expect(document.body.textContent).not.toContain("onerror"); expect(document.querySelector("img")).toBeNull();
  for (const bad of [{ ...runs, limit: 10 }, { ...runs, summary: { ...runs.summary, totalErrors: -1 } }, { ...runs, runs: [{ ...runs.runs[0], mode: "x" }] }, { ...runs, runs: [{ ...runs.runs[0], errorCount: 1.5 }] }]) {
    route({ "/watch-runs": bad }); await expect(loadWatchRuns("k", 50)).rejects.toMatchObject({ status: 503 });
  }
  route({ "/watch-runs": runs }); await expect(loadWatchRuns("k", 50)).resolves.toMatchObject({ summary: { runs: 2 } });
  await expect(loadWatchRuns("k", 0)).rejects.toMatchObject({ status: 400 });
});

test("pure figures: no failures gives null last failure; retries counted from retry counts", () => {
  expect(providerJobsHealth({ jobs: [], limit: 50, truncated: false })).toMatchObject({ total: 0, lastFailureAt: null });
  expect(queueHealth({ ...queue, jobs: [queue.jobs[0]!] } as never)).toMatchObject({ retries: 0, retried: 0, lastFailureAt: null, errors: {} });
});

test("route /ops-health is mounted once and linked from the sidebar", async () => {
  route(); window.history.replaceState(null, "", "/ops-health"); render(<App />);
  await screen.findByRole("heading", { name: "Operations health" });
  expect(screen.getAllByRole("link", { name: "Operations health" })).toHaveLength(1);
});
