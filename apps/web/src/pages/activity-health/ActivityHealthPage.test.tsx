import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { ActivityHealthPage } from "./ActivityHealthPage.js";
const body = { jobs: [{ id: "a".repeat(64), status: "failed", createdAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:01:00.000Z", deadlineAt: "2026-10-09T12:30:00.000Z", attempts: 2, maxAttempts: 2, automaticRetryCount: 1, errorClass: "operation-failed" }], limit: 50, truncated: false, observedAt: "2026-10-09T12:02:00.000Z" };
const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
const fetcher = vi.fn();
function deferred() { let resolve!: (value: ReturnType<typeof response>) => void, reject!: (error: unknown) => void; const promise = new Promise<ReturnType<typeof response>>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Controls() { const { setApiKey, clearApiKey } = useAuth(); return <><button onClick={() => setApiKey("next-key")}>Switch key</button><button onClick={clearApiKey}>Log out</button></>; }
function mount() { render(<AuthProvider><Controls /><ActivityHealthPage /></AuthProvider>); }
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); localStorage.setItem("lkbApiKey", "old-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("consumer renders sampled statuses, safe error, queue freshness and observed automatic retry", async () => {
  fetcher.mockResolvedValue(response(body)); mount(); await screen.findByText(/^1 returned upload operations/);
  expect(screen.getByRole("region", { name: "Queue health summary" })).toHaveTextContent("1 failed in this returned sample");
  expect(screen.getByText("1 automatic retries observed in this returned sample.")).toBeInTheDocument();
  expect(screen.getByText("Error class: operation-failed.")).toBeInTheDocument();
  expect(screen.getByText(/Latest returned queue activity:/)).toHaveTextContent(body.jobs[0]!.updatedAt);
  expect(screen.getByText(/does not establish transcript/)).toBeInTheDocument(); expect(fetcher.mock.calls[0]?.[1].headers.authorization).toBe("Bearer old-key");
});
test("capped/empty/error/malformed views do not claim a successful health total", async () => {
  fetcher.mockResolvedValue(response({ ...body, limit: 1, truncated: true })); mount(); await screen.findByText(/total unknown/);
  fetcher.mockResolvedValue(response({ ...body, jobs: [] })); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/No upload operations/);
  fetcher.mockResolvedValue(response({ message: "PRIVATE backend" }, 503)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("PRIVATE"); expect(screen.queryByRole("region", { name: "Queue health summary" })).not.toBeInTheDocument();
  fetcher.mockResolvedValue(response({ jobs: [{}] })); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/Unable to load activity/);
});
test.each(["success", "failure", "401"])("late old-key %s cannot overwrite replacement-key state", async outcome => {
  const old = deferred(); fetcher.mockImplementationOnce(() => old.promise).mockResolvedValue(response(body)); mount(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByText(/^1 returned upload operations/);
  await act(async () => { if (outcome === "failure") old.reject(new Error("PRIVATE")); else old.resolve(response({ ...body, jobs: [] }, outcome === "401" ? 401 : 200)); });
  expect(screen.getByText(/^1 returned upload operations/)).toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("next-key"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("rotation/logout immediately hide old results and late response cannot restore them", async () => {
  fetcher.mockResolvedValue(response(body)); mount(); await screen.findByText(/^1 returned upload operations/);
  const next = deferred(); fetcher.mockReturnValue(next.promise); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); expect(screen.queryByRole("list", { name: "Upload operations" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); await act(async () => next.resolve(response(body))); expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument();
  cleanup(); fetcher.mockClear(); mount(); expect(fetcher).not.toHaveBeenCalled();
});
test("permission failure is actionable; current401 logs out and hides all records", async () => {
  fetcher.mockResolvedValue(response({}, 403)); mount(); await screen.findByText(/needs jobs permission/);
  fetcher.mockResolvedValue(response({}, 401)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/Sign in with an API key/); expect(localStorage.getItem("lkbApiKey")).toBeNull();
});
