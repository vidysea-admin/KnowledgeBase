import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { KnowledgeExplorerPage } from "./KnowledgeExplorerPage.js";
import { graph, sessions } from "./explorerFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function Controls() { const { setApiKey, clearApiKey } = useAuth(), navigate = useNavigate(), location = useLocation(); return <><button onClick={() => setApiKey("same")}>Reauthenticate</button><button onClick={clearApiKey}>Log out</button><button onClick={() => navigate(-1)}>Back</button><output data-testid="location">{location.search}</output></>; }
function mount(path: string) { render(<MemoryRouter initialEntries={[path]}><AuthProvider><Controls /><KnowledgeExplorerPage /></AuthProvider></MemoryRouter>); }
function fixtures(rows = sessions) { fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/sessions") ? { sessions: rows } : graph))); }
beforeEach(() => { localStorage.clear(); localStorage.setItem("lkbApiKey", "same"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
test("replays encoded session/tab and interactive navigation follows URL/back", async () => {
  fixtures(); mount("/explorer?session=s%2F1&tab=Topics"); await screen.findByRole("link", { name: "Scholarships" }); expect(screen.queryByText("Unrelated topic")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Session scope")).toHaveValue("s/1"); expect(screen.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Speakers" })); expect(screen.getByTestId("location")).toHaveTextContent("session=s%2F1&tab=Speakers"); expect(screen.getByRole("link", { name: "Speaker one" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" })); expect(screen.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(screen.getByLabelText("Session scope"), { target: { value: "s3" } }); expect(screen.queryByRole("link", { name: "Scholarships" })).not.toBeInTheDocument(); expect(screen.getByTestId("location")).toHaveTextContent("session=s3&tab=Topics");
});
test("removed URL selection explicitly refuses entity substitution and can recover", async () => {
  fixtures(); mount("/explorer?session=s%2F1&tab=Topics"); await screen.findByRole("link", { name: "Scholarships" });
  fixtures(sessions.slice(1)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/requested session is unavailable/);
  expect(screen.queryByRole("link", { name: "Scholarships" })).not.toBeInTheDocument(); expect(screen.getByText(/Select an available session/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show all returned sessions" })); expect(screen.getByRole("link", { name: "Scholarships" })).toBeInTheDocument(); expect(screen.getByTestId("location")).toHaveTextContent("?tab=Topics");
});
test.each(["session=missing&tab=Orgs", "session=s%2F1&tab=evil", "session=s%2F1&session=s3&tab=Topics", "tenant=other"])("unknown/invalid URL %s has honest recovery", async query => {
  fixtures(); mount(`/explorer?${query}`); await screen.findByRole("alert"); expect(screen.queryByRole("link", { name: "Organization one" })).not.toBeInTheDocument();
});
test.each(["success", "failure", "401"])("same-key new auth generation fences old Explorer %s", async outcome => {
  let resolve!: (response: Response) => void, reject!: (reason: unknown) => void; const old = new Promise<Response>((done, fail) => { resolve = done; reject = fail; }); fetchMock.mockReturnValue(old);
  mount("/explorer?session=s%2F1&tab=Topics"); fixtures(); fireEvent.click(screen.getByRole("button", { name: "Reauthenticate" })); await screen.findByRole("link", { name: "Scholarships" });
  await act(async () => { if (outcome === "failure") reject(new Error("private")); else resolve(response({ sessions: [] }, outcome === "401" ? 401 : 200)); });
  expect(screen.getByRole("link", { name: "Scholarships" })).toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("same");
});
