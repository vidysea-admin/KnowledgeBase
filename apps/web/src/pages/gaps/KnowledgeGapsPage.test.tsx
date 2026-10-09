import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { KnowledgeGapsPage } from "./KnowledgeGapsPage.js";
import { gapsResponse } from "./gapsFixtures.js";
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred() { let resolve!: (value: ReturnType<typeof response>) => void, reject!: (error: unknown) => void; const promise = new Promise<ReturnType<typeof response>>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Controls() { const { setApiKey, clearApiKey } = useAuth(); return <><button onClick={() => setApiKey("next-key")}>Switch key</button><button onClick={clearApiKey}>Log out</button></>; }
function mount() { render(<AuthProvider><Controls /><KnowledgeGapsPage /></AuthProvider>); }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "sample-key"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("read client -> dashboard filters -> grounded optional inspection with coherent counts", async () => {
  fetchMock.mockResolvedValue(response(gapsResponse)); mount(); await screen.findByText(/5 returned gaps:/);
  expect(screen.getByRole("region", { name: "Gap summary" })).toHaveTextContent("2 open; 1 received; 1 expired; 1 unknown status");
  fireEvent.click(screen.getByRole("button", { name: "Inspect gap/a" })); const inspection = screen.getByRole("region", { name: "Gap inspection" });
  expect(inspection).toHaveTextContent("Requested from: org:toc"); expect(inspection).toHaveTextContent("Due at: 2026-10-04T12:00:00Z");
  fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "vector-pending" } }); expect(screen.getByText("Showing 2 of 5 returned gaps.")).toBeInTheDocument();
  expect(inspection).toHaveTextContent("selected gap is outside"); expect(inspection).not.toHaveTextContent("org:toc");
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } }); fireEvent.change(screen.getByLabelText("Search gaps"), { target: { value: "not indexed" } });
  expect(screen.getByText("Showing 1 of 5 returned gaps.")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Inspect gap-d" })); expect(inspection).toHaveTextContent("Due at: Invalid recorded value");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" })); expect(screen.getByText("Showing 5 of 5 returned gaps.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/gaps$/); expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe("Bearer sample-key");
});
test("empty/filter-empty/malformed/error distinguish unknown from success and refresh recovers", async () => {
  fetchMock.mockResolvedValue(response({ gaps: [] })); mount(); await screen.findByText("No gaps were returned for this tenant.");
  fetchMock.mockResolvedValue(response(gapsResponse)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/5 returned gaps:/);
  fireEvent.change(screen.getByLabelText("Search gaps"), { target: { value: "not-present" } }); expect(screen.getByText("No returned gaps match these filters.")).toBeInTheDocument();
  fetchMock.mockResolvedValue(response({ gaps: [{}] })); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("alert"); expect(screen.queryByText(/returned gaps:/)).not.toBeInTheDocument();
  fetchMock.mockResolvedValue(response({ message: "private backend" }, 503)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("alert"); expect(document.body.textContent).not.toContain("private backend");
});
test.each(["success", "failure", "401"])("late old-key %s cannot replace current context", async outcome => {
  const old = deferred(); fetchMock.mockImplementationOnce(() => old.promise).mockResolvedValue(response(gapsResponse)); mount(); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); await screen.findByText(/5 returned gaps:/);
  await act(async () => { if (outcome === "failure") old.reject(new Error("private")); else old.resolve(response({ gaps: [] }, outcome === "401" ? 401 : 200)); });
  expect(screen.getByText(/5 returned gaps:/)).toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("next-key"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("key rotation/logout hide old data immediately; late result and anonymous reads refused", async () => {
  fetchMock.mockResolvedValue(response(gapsResponse)); mount(); await screen.findByText(/5 returned gaps:/); fireEvent.click(screen.getByRole("button", { name: "Inspect gap/a" }));
  const next = deferred(); fetchMock.mockReturnValue(next.promise); fireEvent.click(screen.getByRole("button", { name: "Switch key" })); expect(screen.queryByRole("region", { name: "Gap inspection" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); await act(async () => next.resolve(response(gapsResponse))); expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument();
  cleanup(); fetchMock.mockClear(); mount(); expect(fetchMock).not.toHaveBeenCalled();
});
test("refresh cancels prior selection; active401 invalidates key and403 has actionable permission message", async () => {
  fetchMock.mockResolvedValue(response(gapsResponse)); mount(); await screen.findByText(/5 returned gaps:/); fireEvent.click(screen.getByRole("button", { name: "Inspect gap/a" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/5 returned gaps:/); expect(screen.getByRole("region", { name: "Gap inspection" })).not.toHaveTextContent("Requested from: org:toc");
  fetchMock.mockResolvedValue(response({}, 403)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/needs gaps permission/);
  fetchMock.mockResolvedValue(response({}, 401)); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByText(/Sign in with an API key/); expect(localStorage.getItem("lkbApiKey")).toBeNull();
});
test("unknown status and recorded text are honest, escaped, and never invented source links", async () => {
  fetchMock.mockResolvedValue(response({ gaps: [{ _id: "<img src=x>", kind: "new-kind", status: "unrecognised", description: "<script>alert(1)</script>", sourceRef: "source:a/b" }] })); mount();
  await screen.findByRole("button", { name: "Inspect <img src=x>" }); fireEvent.click(screen.getByRole("button", { name: "Inspect <img src=x>" }));
  const inspection = screen.getByRole("region", { name: "Gap inspection" }); expect(inspection).toHaveTextContent("unknown (unrecognised)"); expect(inspection).toHaveTextContent("Source reference: source:a/b");
  expect(within(inspection).queryByRole("link")).not.toBeInTheDocument(); expect(document.querySelector("img")).toBeNull(); expect(document.querySelector("script")).toBeNull();
});
