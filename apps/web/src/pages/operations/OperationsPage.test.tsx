import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { OperationsPage } from "./OperationsPage.js";
import { integrationPayload } from "../operations-integrations/integrationFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = (id: string, transcribe = "done", index = "done") => ({ _id: id, title: id, date: "2026-10-14", status: { transcribe, index } });
const queue = { jobs: [], limit: 50, truncated: false, observedAt: "2026-10-14T00:00:00.000Z" };
const notifications = { notifications: [], limit: 50, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } };
const sourcePayload = (url: string) => url.endsWith("/sources") ? { sources: [] } : url.endsWith("/watch-state") ? { state: [], heartbeats: [] } : integrationPayload(url);
function fixtures() { fetchMock.mockImplementation((url: string) => Promise.resolve(response(sourcePayload(url) ?? (url.endsWith("/sessions") ? { sessions: [session("ready/a"), session("failed", "failed"), session("running", "processing", "pending"), session("unknown", "done", "unrecognized")] } : url.includes("/activity-health") ? queue : notifications)))); }
function Controls() {
  const { setApiKey, clearApiKey } = useAuth(), navigate = useNavigate(), location = useLocation();
  return <><button onClick={() => setApiKey("new-key")}>Change key</button><button onClick={() => setApiKey("sample-key")}>Reauthenticate</button><button onClick={clearApiKey}>Log out</button><button onClick={() => navigate(-1)}>Back</button><output data-testid="location">{location.pathname}{location.search}</output></>;
}
function mount(path = "/operations") { return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Controls /><OperationsPage /></AuthProvider></MemoryRouter>); }
function deferred() { let resolve!: (value: Response) => void, reject!: (reason: unknown) => void; const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
beforeEach(() => { localStorage.clear(); localStorage.setItem("lkbApiKey", "sample-key"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test("real clients power triage, saved replay, back navigation and encoded Explorer actions", async () => {
  fixtures(); mount("/operations?view=attention");
  await screen.findByText("2 shown of 4 returned session rows; 1 with unknown status.");
  expect(screen.queryByText("ready/a")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
  expect(localStorage.getItem("lkbOperationViewPresets.v1")).toBe('["attention"]');
  fireEvent.change(screen.getByLabelText("Worklist view"), { target: { value: "ready" } });
  await screen.findByText("ready/a"); expect(screen.getByRole("link", { name: "Explore knowledge" })).toHaveAttribute("href", "/explorer?session=ready%2Fa&tab=Overview");
  expect(screen.getByRole("link", { name: "Inspect session" })).toHaveAttribute("href", "/sessions/ready%2Fa");
  fireEvent.click(screen.getByRole("button", { name: "Back" })); await screen.findByText("failed"); expect(screen.getByLabelText("Worklist view")).toHaveValue("attention");
  const before = fetchMock.mock.calls.length; fireEvent.click(screen.getByRole("link", { name: "Open Needs attention" }));
  await screen.findByText("2 shown of 4 returned session rows; 1 with unknown status."); expect(fetchMock.mock.calls.length).toBe(before + 7);
  fireEvent.click(screen.getByRole("button", { name: "Remove Needs attention saved view" })); expect(localStorage.getItem("lkbOperationViewPresets.v1")).toBe("[]");
  expect(fetchMock.mock.calls.every(call => call[1].headers.authorization === "Bearer sample-key")).toBe(true);
  expect(fetchMock.mock.calls.every(call => !call[1].method || call[1].method === "GET")).toBe(true);
});
test.each([403, 503, 200])("one failed/malformed panel %s retains siblings and refresh recovers", async status => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith("/sessions") ? response({ private: "SECRET" }, status) : response(sourcePayload(url) ?? (url.includes("activity-health") ? queue : notifications))));
  mount(); await screen.findByRole("alert"); expect(screen.getByText(/0 returned queue jobs/)).toBeInTheDocument(); expect(screen.getByText(/0 returned failure notifications/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain("SECRET");
  fixtures(); fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" })); await screen.findByText("4 shown of 4 returned session rows; 1 with unknown status.");
});
test("source outage and capped notification window remain visible", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(sourcePayload(url) ?? (url.endsWith("/sessions") ? { sessions: [] } : url.includes("activity-health") ? queue : { ...notifications, truncated: true, sources: { ...notifications.sources, watcher: "unavailable" } }))));
  mount(); await screen.findByText("No sessions returned."); expect(screen.getByText(/watcher unavailable/)).toBeInTheDocument(); expect(screen.getByText("No failures in the sources that could be read.")).toBeInTheDocument(); expect(screen.getByText("Older failure notifications are not included.")).toBeInTheDocument();
});
test("actual strict queue sample reports limit, truncation, retries and meaningful notifications", async () => {
  const jobs = Array.from({ length: 50 }, (_, index) => ({ id: index.toString(16).padStart(64, "0"), status: "failed", createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z", deadlineAt: "2026-10-15T00:00:00.000Z", attempts: 2, maxAttempts: 2, automaticRetryCount: 1, errorClass: "timeout-or-failure" }));
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(sourcePayload(url) ?? (url.endsWith("/sessions") ? { sessions: [] } : url.includes("activity-health") ? { ...queue, jobs, truncated: true } : { ...notifications, notifications: [{ id: "provider-jobs:safe", source: "provider-jobs", severity: "error", title: "Provider operation failed", detail: null, occurredAt: "2026-10-14T00:00:00.000Z" }] }))));
  mount(); await screen.findByText(/50 returned queue jobs/); expect(screen.getByText(/50 observed automatic retries/)).toBeInTheDocument(); expect(screen.getByText("Older queue jobs are not included.")).toBeInTheDocument(); expect(screen.getByText("Provider operation failed")).toBeInTheDocument();
});
test("current 401 signs out, and filtered-empty differs from an empty returned source", async () => {
  fetchMock.mockResolvedValue(response({}, 401)); mount(); await screen.findByText(/Sign in with an API key to open/); expect(localStorage.getItem("lkbApiKey")).toBeNull();
  cleanup(); localStorage.setItem("lkbApiKey", "sample-key"); fetchMock.mockImplementation((url: string) => Promise.resolve(response(sourcePayload(url) ?? (url.endsWith("/sessions") ? { sessions: [session("pending", "pending", "pending")] } : url.includes("activity-health") ? queue : notifications))));
  mount("/operations?view=ready"); await screen.findByText("No returned sessions match this view."); expect(screen.getByText("0 shown of 1 returned session rows; 0 with unknown status.")).toBeInTheDocument(); expect(screen.queryByText("No sessions returned.")).not.toBeInTheDocument();
});
test("blocked storage produces usable session-only Save/Open/Remove without false persistence", async () => {
  fixtures(); mount(); await screen.findByText("ready/a");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  fireEvent.click(screen.getByRole("button", { name: "Save current view" })); expect(screen.getByText(/was not persisted/)).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Open All sessions" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove All sessions saved view" })); expect(screen.queryByRole("link", { name: "Open All sessions" })).not.toBeInTheDocument();
});
test.each(["success", "failure", "401"])("same-key reauthentication fences obsolete %s including refresh", async outcome => {
  fixtures(); mount(); await screen.findByText("ready/a"); const old = deferred(); fetchMock.mockReturnValue(old.promise);
  fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" })); expect(screen.queryByText("ready/a")).not.toBeInTheDocument();
  fixtures(); fireEvent.click(screen.getByRole("button", { name: "Reauthenticate" })); await screen.findByText("ready/a");
  await act(async () => { if (outcome === "failure") old.reject(new Error("SECRET")); else old.resolve(response({ sessions: [session("obsolete")] }, outcome === "401" ? 401 : 200)); });
  expect(screen.queryByText("obsolete")).not.toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("sample-key");
});
test("rotation/logout hide content immediately and anonymous page never fetches", async () => {
  fixtures(); mount(); await screen.findByText("ready/a"); const pending = deferred(); fetchMock.mockReturnValue(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Change key" })); expect(screen.queryByText("ready/a")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); await act(async () => pending.resolve(response({ sessions: [] })));
  expect(screen.getByText(/Sign in with an API key to open/)).toBeInTheDocument(); cleanup(); fetchMock.mockClear(); mount(); expect(fetchMock).not.toHaveBeenCalled();
});
test("invalid query safely recovers and backend labels render as text", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(sourcePayload(url) ?? (url.endsWith("/sessions") ? { sessions: [session("<img src=x>")] } : url.includes("activity-health") ? queue : notifications))));
  mount("/operations?view=ready&view=attention&tenant=other"); await screen.findByText("<img src=x>"); expect(screen.getByRole("alert")).toHaveTextContent("Invalid view link"); expect(document.querySelector("img")).toBeNull();
  expect(within(screen.getByRole("region", { name: "Session worklist" })).getByText(/1 shown of 1 returned/)).toBeInTheDocument();
});
