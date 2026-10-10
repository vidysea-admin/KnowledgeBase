import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { AuthProvider } from "../../auth/AuthContext.js";
import { AnalyticsPage } from "./AnalyticsPage.js";

const fetchMock = vi.fn();
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const sessions = { sessions: [
  { _id: "s1", title: "A", date: "2026-10-02", status: { transcribe: "done", index: "done" } },
  { _id: "s2", title: "B", date: "2026-09-02", status: { transcribe: "done", index: "pending" } },
] };
const detail = { session: sessions.sessions[0], page: null, claims: [{ _id: "c1", text: "x", status: "verified" }, { _id: "c2", text: "y", status: "needs-review" }],
  turns: [{ _id: "t1", speakerRef: "spk:1", speakerLabel: "Asha", tStart: 0, tEnd: 1, text: "hi" }, { _id: "t2", speakerRef: "spk:2", tStart: 1, tEnd: 2, text: "yo" }] };
const graph = { nodes: [], edges: [{ source: "a", target: "b", type: "t", inferred: false, origin: "graph_edges", evidence: [{ turnId: "t1" }] }, { source: "a", target: "c", type: "t", inferred: true, origin: "tree_index" }],
  stats: { sessionsTotal: 2, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 1 } } };
const gaps = { gaps: [{ _id: "g1", kind: "k", status: "open" }, { _id: "g2", kind: "k", status: "received" }] };
const jobs = { jobs: [{ _id: "j1", kind: "k", status: "done", createdAt: "2026-10-01T00:00:00Z" }, { _id: "j2", kind: "k", status: "failed", createdAt: "2026-10-01T00:00:00Z" }], limit: 50, truncated: false };

function route(overrides: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url, "http://x").pathname;
    const body = overrides[path] ?? ({ "/sessions": sessions, "/sessions/s1": detail, "/sessions/s2": { ...detail, claims: [], turns: [] }, "/graph": graph, "/gaps": gaps, "/jobs": jobs } as Record<string, unknown>)[path];
    return body instanceof Error ? Promise.reject(body) : typeof body === "number" ? ok({}, body) : ok(body);
  });
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
const mount = () => render(<AuthProvider><AnalyticsPage /></AuthProvider>);

test("renders every figure from the fetched data with its source line", async () => {
  route(); mount(); await screen.findByText(/2 sessions; 1 with index status done/);
  expect(screen.getByRole("region", { name: "Claims and speakers" })).toHaveTextContent("2 claims in 1 of 2 sampled sessions; verified claims: 50% (1 of 2)");
  expect(screen.getByRole("region", { name: "Claims and speakers" })).toHaveTextContent("Turns with a resolved speaker name: 50% (1 of 2)");
  expect(screen.getByRole("region", { name: "Citation coverage" })).toHaveTextContent("Graph edges with evidence: 50% (1 of 2)");
  expect(screen.getByRole("region", { name: "Knowledge gaps" })).toHaveTextContent("2 returned: 1 open; 1 received; 0 expired");
  expect(screen.getByRole("region", { name: "Recent provider jobs" })).toHaveTextContent("2 returned: 0 pending; 0 processing; 1 done; 1 failed");
  expect(screen.getAllByText(/^Source: GET /)).toHaveLength(5);
  expect(fetchMock.mock.calls.every(c => c[1].headers.authorization === "Bearer sample-key" && (c[1].method ?? "GET") === "GET")).toBe(true);
  expect(screen.queryByRole("textbox")).toBeNull();
});
test("empty tenant shows explicit empty states and no invented percentages", async () => {
  route({ "/sessions": { sessions: [] }, "/graph": { nodes: [], edges: [], stats: {} }, "/gaps": { gaps: [] }, "/jobs": { jobs: [], limit: 50, truncated: false } }); mount();
  await screen.findByText("No sessions were returned for this tenant.");
  expect(screen.getByText("No session details were available to analyse.")).toBeInTheDocument();
  expect(screen.getByText("The graph returned no edges.")).toBeInTheDocument();
  expect(screen.getByText("No gaps were returned for this tenant.")).toBeInTheDocument();
  expect(screen.getByText("No provider jobs were returned.")).toBeInTheDocument();
  expect(document.body.textContent).toContain("n/a (no rows)"); expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
});
test("one failing source shows its own alert and does not blank the others; 403 is explained", async () => {
  route({ "/jobs": 403, "/gaps": 503 }); mount(); await screen.findByText(/2 sessions;/);
  expect(screen.getByRole("region", { name: "Recent provider jobs" })).toHaveTextContent("This API key lacks permission to read provider jobs.");
  expect(screen.getByRole("region", { name: "Knowledge gaps" })).toHaveTextContent("Unable to load knowledge gaps.");
  expect(screen.getByRole("region", { name: "Citation coverage" })).toHaveTextContent("50% (1 of 2)");
});
test("logged-out reads nothing; refresh refetches", async () => {
  localStorage.clear(); route(); mount(); expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  cleanup(); localStorage.setItem("lkbApiKey", "sample-key"); mount(); await screen.findByText(/2 sessions;/);
  const before = fetchMock.mock.calls.length; fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/2 sessions;/);
  expect(fetchMock.mock.calls.length).toBe(before * 2);
});
test("registered in the protected router and navigation", async () => {
  route(); window.history.replaceState(null, "", "/analytics"); render(<App />);
  await screen.findByRole("heading", { name: "Analytics" });
  expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/analytics"); expect(screen.getByRole("link", { name: "Analytics" })).toHaveClass("active");
});
test("direct route without a key shows the login gate and performs no read", () => {
  localStorage.clear(); window.history.replaceState(null, "", "/analytics"); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});
