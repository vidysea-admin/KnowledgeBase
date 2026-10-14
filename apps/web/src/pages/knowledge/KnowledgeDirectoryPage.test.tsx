import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { KnowledgeDirectoryPage } from "./KnowledgeDirectoryPage.js";
import { directoryGraph as graph, directorySessions as sessions, directorySources as sources } from "./knowledgeDirectoryFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const fixtures = () => fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions } : url.endsWith("/sources") ? { sources } : graph)));
function Controls() { const { setApiKey, clearApiKey } = useAuth(); return <><button onClick={() => setApiKey("new-key")}>Switch key</button><button onClick={clearApiKey}>Sign out</button></>; }
function mount(path = "/knowledge") { render(<MemoryRouter initialEntries={[path]}><AuthProvider><Controls /><KnowledgeDirectoryPage /></AuthProvider></MemoryRouter>); }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("actual clients -> entity detail -> neighbor drilldown -> exact transcript consumer URL", async () => {
  fixtures(); mount("/knowledge?entity=topic%3Acareer");
  await screen.findByRole("article", { name: "Selected entity" });
  expect(screen.getByText(/Inferred relationship/)).toHaveTextContent("confidence 0.70");
  expect(screen.getByRole("link", { name: "Source turn turn /#one" })).toHaveAttribute("href", "/sessions/session%2Fone#turn-turn%20%2F%23one");
  fireEvent.click(screen.getAllByRole("link", { name: "Speaker name" })[1]!);
  expect(screen.getByRole("heading", { name: "Speaker name" })).toBeInTheDocument();
  expect(screen.getByText(/Stated relationship/)).toHaveTextContent("confidence 1.00");
  expect(screen.getByRole("link", { name: "Source turn turn-2" })).toHaveAttribute("href", "/sessions/session%2Fone#turn-turn-2");
  expect(screen.getByText(/1 sessions reported missing/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.every(call => call[1].headers.authorization === "Bearer sample-key")).toBe(true);
});
test("derived collections and safe resource metadata preserve provenance without revealing local paths", async () => {
  fixtures(); mount(); await screen.findByRole("link", { name: "Careers" });
  fireEvent.click(screen.getByRole("tab", { name: "Collections" }));
  expect(screen.getByText(/saved, curated collections are not available/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Career session" })).toHaveAttribute("href", "/sessions/session%2Fone");
  fireEvent.click(screen.getByRole("tab", { name: "Resources" }));
  expect(screen.getByRole("link", { name: "Open source (example.com)" })).toHaveAttribute("rel", "noopener noreferrer");
  expect(document.body.textContent).not.toContain("C:/private/path.txt");
});
test("empty graph 404 retains sessions/resources and explicit missing entity state", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith("/graph") ? response({}, 404) : response(url.endsWith("/sessions") ? { sessions } : { sources: [] })));
  mount("/knowledge?entity=missing"); await screen.findByText(/No graph has been indexed/);
  expect(screen.getByText(/selected entity is unavailable/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Collections" })); expect(screen.getByRole("link", { name: "Career session" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Resources" })); expect(screen.getByText("No resources were returned.")).toBeInTheDocument();
});
test.each([403, 503])("sanitized %s error can refresh without leaking server text", async status => {
  fetchMock.mockResolvedValue(response({ message: "private backend detail" }, status)); mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(status === 403 ? "sessions, sources and graph permissions" : "Unable to load");
  expect(document.body.textContent).not.toContain("private backend");
  fixtures(); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("link", { name: "Careers" });
});
test("malformed resource response renders no partial graph", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions } : url.endsWith("/sources") ? { sources: null } : graph)));
  mount(); await screen.findByRole("alert"); expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
});
test("old-key completion cannot replace current-key records and sign out immediately removes data", async () => {
  const pending: ((value: ReturnType<typeof response>) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<ReturnType<typeof response>>(resolve => pending.push(resolve)));
  mount(); fixtures(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByRole("link", { name: "Careers" });
  await act(async () => { pending[0]!(response({ sessions: [{ ...sessions[0], title: "OLD PRIVATE TITLE" }] })); pending[1]!(response({ sources })); pending[2]!(response(graph)); });
  fireEvent.click(screen.getByRole("tab", { name: "Collections" })); expect(screen.queryByText("OLD PRIVATE TITLE")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" })); expect(screen.getByText("Sign in with an API key to view the knowledge directory.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Career session" })).not.toBeInTheDocument();
});
test.each([401, 503])("obsolete key failure %s cannot invalidate current data or credentials", async status => {
  const pending: ((value: ReturnType<typeof response>) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<ReturnType<typeof response>>(resolve => pending.push(resolve)));
  mount(); fixtures(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByRole("link", { name: "Careers" });
  await act(async () => { pending.forEach(resolve => resolve(response({ message: "old private error" }, status))); });
  expect(screen.getByRole("link", { name: "Careers" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("new-key");
});
test("logged out page makes no request and renders source labels as literal text", async () => {
  localStorage.clear(); mount(); expect(fetchMock).not.toHaveBeenCalled(); cleanup(); localStorage.setItem("lkbApiKey", "sample-key");
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions } : url.endsWith("/sources") ? { sources } : { ...graph, nodes: [{ ...graph.nodes[0], label: "<img src=x>" }] })));
  mount(); await screen.findByRole("link", { name: "<img src=x>" }); expect(document.querySelector("img")).toBeNull();
});
