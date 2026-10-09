import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { ConfidenceGraphPage } from "./ConfidenceGraphPage.js";
import { graph } from "./confidenceFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred() { let resolve!: (value: ReturnType<typeof response>) => void; let reject!: (error: unknown) => void; const promise = new Promise<ReturnType<typeof response>>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function Controls() { const { setApiKey, clearApiKey } = useAuth(); return <><button onClick={() => setApiKey("next-key")}>Switch key</button><button onClick={clearApiKey}>Log out</button></>; }
function renderPage(entry = "/graph-confidence") { render(<MemoryRouter initialEntries={[entry]}><AuthProvider><Controls /><ConfidenceGraphPage /></AuthProvider></MemoryRouter>); }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("actual read client -> inclusive edge graph -> consistent neighbours/provenance/evidence -> reset", async () => {
  fetchMock.mockResolvedValue(response(graph)); renderPage(); await screen.findByTestId("confidence-counts");
  expect(screen.getByTestId("confidence-quality")).toHaveTextContent("1 have no recorded confidence; 1 have invalid confidence");
  fireEvent.click(screen.getByRole("button", { name: "session: First session" }));
  const inspection = screen.getByRole("region", { name: "Relationship inspection" });
  expect(within(inspection).getByText(/confidence not recorded/)).toBeInTheDocument(); expect(within(inspection).getByText(/invalid confidence/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Minimum confidence"), { target: { value: "0.8" } });
  expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 2 of 2 matching relationships (5 returned); 3 of 3 matching endpoint nodes (6 returned)");
  expect(screen.queryByRole("button", { name: "topic: Lower confidence topic" })).not.toBeInTheDocument();
  expect(within(inspection).queryByRole("link", { name: "Evidence: t/low" })).not.toBeInTheDocument();
  expect(within(inspection).getByRole("link", { name: "Evidence: t/high" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2Fhigh");
  expect(within(inspection).getByRole("link", { name: "Evidence: t/topic" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2Ftopic");
  expect(within(inspection).getByText(/graph_edges · inferred · confidence 0.8/)).toBeInTheDocument();
  expect(within(inspection).getByRole("link", { name: "Open session" })).toHaveAttribute("href", "/sessions/s%2F1");
  fireEvent.click(within(inspection).getByRole("button", { name: "→ Higher confidence topic" }));
  fireEvent.change(screen.getByLabelText("Minimum confidence"), { target: { value: "0.9" } });
  expect(within(inspection).getByText(/selected node is outside/)).toBeInTheDocument(); expect(within(inspection).queryByRole("link", { name: /Evidence/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All confidence values" })); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 5 of 5 matching relationships (5 returned); 6 of 6 matching endpoint nodes (6 returned)");
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/graph$/); expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe("Bearer sample-key");
});
test("URL threshold/node are consumed; malformed threshold never widens data silently", async () => {
  fetchMock.mockResolvedValue(response(graph)); renderPage("/graph-confidence?minConfidence=0.8&node=session%3As%2F1");
  await screen.findByRole("heading", { name: "First session" }); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 2 of 2 matching relationships (5 returned)");
  cleanup(); renderPage("/graph-confidence?minConfidence=2"); await screen.findByRole("alert"); expect(screen.queryByTestId("brain-graph-svg")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All confidence values" })); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 5 of 5 matching relationships (5 returned)");
});
test.each([403, 503])("sanitized %s failure recovers on refresh", async status => {
  fetchMock.mockResolvedValue(response({ message: "private backend body" }, status)); renderPage(); await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("private backend"); fetchMock.mockResolvedValue(response(graph)); fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByTestId("confidence-counts");
});
test("404, empty graph and malformed graph have distinct truthful states", async () => {
  fetchMock.mockResolvedValue(response({}, 404)); renderPage(); await screen.findByText(/No knowledge graph has been indexed/);
  fetchMock.mockResolvedValue(response({ ...graph, nodes: [], edges: [] })); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText("No relationships were returned for this tenant.");
  fetchMock.mockResolvedValue(response({ ...graph, edges: null })); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("alert"); expect(screen.queryByTestId("confidence-counts")).not.toBeInTheDocument();
});
test("filtered empty is distinct from returned empty; refresh hides and clears the prior inspection", async () => {
  fetchMock.mockResolvedValue(response({ ...graph, edges: [graph.edges[2]] })); renderPage("/graph-confidence?minConfidence=0.8");
  await screen.findByText("No relationships match this confidence threshold."); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 0 of 0 matching relationships (1 returned)");
  cleanup(); fetchMock.mockResolvedValue(response(graph)); renderPage("/graph-confidence?node=session%3As%2F1"); await screen.findByRole("heading", { name: "First session" });
  const pending = deferred(); fetchMock.mockReturnValue(pending.promise); fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.queryByRole("region", { name: "Relationship inspection" })).not.toBeInTheDocument(); await act(async () => pending.resolve(response(graph)));
  expect(screen.queryByRole("heading", { name: "First session" })).not.toBeInTheDocument(); expect(screen.getByText(/Select a node to inspect/)).toBeInTheDocument();
});
test.each(["success", "failure", "401"])("old-key late %s cannot replace current graph or invalidate new auth", async outcome => {
  const old = deferred(); fetchMock.mockImplementationOnce(() => old.promise).mockResolvedValue(response(graph)); renderPage(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByTestId("confidence-counts");
  fireEvent.change(screen.getByLabelText("Minimum confidence"), { target: { value: "0.9" } });
  await act(async () => { if (outcome === "failure") old.reject(new Error("private")); else old.resolve(response({ ...graph, edges: [] }, outcome === "401" ? 401 : 200)); });
  expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 1 of 1 matching relationships (5 returned)"); expect(localStorage.getItem("lkbApiKey")).toBe("next-key"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("key rotation/logout immediately hide old graph; anonymous page never reads; current401 invalidates auth", async () => {
  fetchMock.mockResolvedValue(response(graph)); renderPage(); await screen.findByTestId("confidence-counts"); const next = deferred(); fetchMock.mockReturnValue(next.promise);
  fireEvent.click(screen.getByRole("button", { name: "Switch key" })); expect(screen.queryByTestId("brain-graph-svg")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); await act(async () => next.resolve(response(graph))); expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument();
  cleanup(); fetchMock.mockClear(); renderPage(); expect(fetchMock).not.toHaveBeenCalled(); cleanup(); localStorage.setItem("lkbApiKey", "sample-key");
  fetchMock.mockResolvedValue(response({}, 401)); renderPage(); await screen.findByText(/Sign in with an API key/); expect(localStorage.getItem("lkbApiKey")).toBeNull();
});
test("labels remain escaped; absent evidence session gives text rather than a fabricated link", async () => {
  const input = { ...graph, nodes: graph.nodes.map(node => node.kind === "session" ? { ...node, label: "<img src=x>" } : node), edges: [{ ...graph.edges[0]!, sessionRef: undefined, evidence: [{ turnId: "no-session" }] }] };
  fetchMock.mockResolvedValue(response(input)); renderPage(); await screen.findByRole("button", { name: "session: <img src=x>" }); fireEvent.click(screen.getByRole("button", { name: "session: <img src=x>" }));
  expect(document.querySelector("img")).toBeNull(); expect(screen.getByText(/Evidence: no-session \(session not recorded\)/)).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Evidence: no-session" })).not.toBeInTheDocument();
});
