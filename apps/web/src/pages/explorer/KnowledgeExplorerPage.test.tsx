import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { KnowledgeExplorerPage } from "./KnowledgeExplorerPage.js";
import { graph, sessions } from "./explorerFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred() { let resolve!: (value: ReturnType<typeof response>) => void; let reject!: (error: unknown) => void; const promise = new Promise<ReturnType<typeof response>>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function Controls() { const { setApiKey, clearApiKey } = useAuth(); return <><button onClick={() => setApiKey("next-key")}>Switch key</button><button onClick={clearApiKey}>Log out</button></>; }
function renderPage() { render(<MemoryRouter><AuthProvider><Controls /><KnowledgeExplorerPage /></AuthProvider></MemoryRouter>); }
function fixtures() { fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions } : graph))); }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("real clients render year/month/session drill-down and all four scoped tabs with exact consumer links", async () => {
  fixtures(); renderPage(); expect(screen.getByRole("status")).toHaveTextContent("Loading"); await screen.findByText("2026-07");
  expect(screen.getByText("2026").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("2026")); fireEvent.click(screen.getByText("2026-07"));
  expect(screen.getByText("2026").closest("details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "First" }));
  expect(screen.getByLabelText("Session scope")).toHaveValue("s/1");
  expect(screen.getByText("Recorded date: 2026-07-30")).toBeInTheDocument();
  expect(screen.getByText(/Transcription status: done; index status: done/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open selected session" })).toHaveAttribute("href", "/sessions/s%2F1");
  expect(screen.getAllByRole("link", { name: "Open session" })[0]).toHaveAttribute("href", "/sessions/s%2F1");
  fireEvent.click(screen.getByRole("tab", { name: "Topics" }));
  expect(screen.getByRole("link", { name: "Scholarships" })).toHaveAttribute("href", "/brain?node=topic%3Aone");
  expect(screen.queryByText("Unrelated topic")).not.toBeInTheDocument();
  expect(screen.getByText(/inferred relationship/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Speakers" })); expect(screen.getByRole("link", { name: "Speaker one" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Orgs" })); expect(screen.getByRole("link", { name: "Organization one" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Session scope"), { target: { value: "s3" } }); expect(screen.queryByText("Organization one")).not.toBeInTheDocument();
  expect(screen.getByText(/No organizations are linked/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(fetchMock.mock.calls.every(call => call[1].headers.authorization === "Bearer sample-key")).toBe(true);
});
test("empty ledger and graph 404 remain distinct from failure and date-unavailable sessions", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith("/sessions") ? response({ sessions: [] }) : response({}, 404)));
  renderPage(); await screen.findByText("No sessions were returned for this tenant."); expect(screen.getByText(/No knowledge graph has been indexed/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Topics" })); expect(screen.getByText(/No topics are linked/)).toBeInTheDocument();
});
test.each([403, 503])("sanitizes failure %s then refresh consumes new successful records", async status => {
  fetchMock.mockResolvedValue(response({ message: "private backend body" }, status)); renderPage(); const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(status === 403 ? "sessions and graph permissions" : "Unable to load"); expect(document.body.textContent).not.toContain("private backend");
  fixtures(); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText("Date unavailable (1)");
});
test("malformed graph produces no partial data or raw exception", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions } : { ...graph, nodes: null })));
  renderPage(); await screen.findByRole("alert"); expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});
test.each(["success", "failure", "401"])("late old-key %s cannot replace new scoped selection", async outcome => {
  const old = deferred(); fetchMock.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => old.promise);
  fixtures(); renderPage(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByText("2026-07");
  fireEvent.change(screen.getByLabelText("Session scope"), { target: { value: "s3" } });
  await act(async () => { if (outcome === "failure") old.reject(new Error("private")); else old.resolve(response({ sessions: [] }, outcome === "401" ? 401 : 200)); });
  expect(screen.getByLabelText("Session scope")).toHaveValue("s3"); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("next-key");
});
test("replacement/logout immediately hide old session/graph data and anonymous page never fetches", async () => {
  fixtures(); renderPage(); await screen.findByText("2026-07"); const next = deferred(); fetchMock.mockReturnValue(next.promise);
  fireEvent.click(screen.getByRole("button", { name: "Switch key" })); expect(screen.queryByText("2026-07")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); await act(async () => { next.resolve(response({ sessions: [] })); });
  expect(screen.getByText("Sign in with an API key to view the knowledge explorer.")).toBeInTheDocument();
  cleanup(); fetchMock.mockClear(); renderPage(); expect(fetchMock).not.toHaveBeenCalled();
});
test("active 401 clears the key and raw labels remain escaped React text", async () => {
  fetchMock.mockResolvedValue(response({ message: "secret" }, 401)); renderPage(); await screen.findByText("Sign in with an API key to view the knowledge explorer.");
  expect(localStorage.getItem("lkbApiKey")).toBeNull(); cleanup(); localStorage.setItem("lkbApiKey", "sample-key");
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions: [{ ...sessions[0], title: "<img src=x>" }] } : graph)));
  renderPage(); await screen.findByRole("button", { name: "<img src=x>" }); expect(document.querySelector("img")).toBeNull();
});
