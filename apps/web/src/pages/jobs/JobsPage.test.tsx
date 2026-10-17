import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { JobsPage } from "./JobsPage.js";

const fetchMock = vi.fn();
const record = { _id: "audit-old", kind: "extract", status: "done", createdAt: "2026-10-09T12:00:00Z", provider: "Provider A" };
const next = { ...record, _id: "audit-new", kind: "summarize", status: "failed", provider: "Provider B" };
const payload = (jobs: unknown[] = [record], truncated = false) => ({ jobs, limit: 50, truncated });
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof response>>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function Controls() {
  const { setApiKey, clearApiKey } = useAuth();
  return <><button onClick={() => setApiKey("new-key")}>Switch key</button><button onClick={clearApiKey}>Log out</button></>;
}
function renderPage() { return render(<AuthProvider><Controls /><JobsPage /></AuthProvider>); }

beforeEach(() => { localStorage.setItem("lkbApiKey", "old-key"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Provider jobs page through real jobs client", () => {
  test("renders only real provider metadata, plain text and provider-call meaning", async () => {
    fetchMock.mockResolvedValue(response(payload([{ ...record, kind: "<img src=x onerror=alert(1)>", updatedAt: "2026-10-09T13:00:00Z" }])));
    renderPage();
    expect(screen.getByText("Loading provider audit records…")).toBeInTheDocument();
    await screen.findByText("Showing 1 of 1 returned provider audit records.");
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> · done/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/Provider: Provider A · Updated:/)).toBeInTheDocument();
    expect(screen.getByText(/does not establish end-to-end pipeline completion/)).toBeInTheDocument();
  });

  test.each(["2026-10-09t12:00:00Z", "2026-10-09T12:00:00z", "2026-10-09t12:00:00z"])("preserves RFC3339 case variant through real client and page: %s", async (timestamp) => {
    fetchMock.mockResolvedValue(response(payload([{ ...record, createdAt: timestamp, updatedAt: timestamp }])));
    renderPage();
    await screen.findByText(`ID: audit-old · Created: ${timestamp}`);
    expect(screen.getByText(`Provider: Provider A · Updated: ${timestamp}`)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("composes local kind/status filters and counts only the returned subset", async () => {
    fetchMock.mockResolvedValue(response(payload([record, next, { ...record, _id: "pending", status: "pending" }])));
    renderPage();
    await screen.findByRole("combobox", { name: "Kind" });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "extract" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3 returned");
    expect(screen.queryByText(/ID: audit-old/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    expect(screen.getByText("No returned records match these filters.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refreshes real endpoint and displays honest bounded truncation", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ ...record, _id: `audit${index}` }));
    fetchMock.mockResolvedValueOnce(response(payload(rows, true))).mockResolvedValueOnce(response(payload([])));
    renderPage();
    await screen.findByText(/More records exist beyond this 50-record response/);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 50 of 50 returned");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.queryByText(/ID: audit0/)).not.toBeInTheDocument();
    await screen.findByText("No provider audit records were returned.");
    expect(screen.queryByText(/More records exist/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each([403, 503])("sanitizes backend error %s and explains dedicated permission", async (status) => {
    fetchMock.mockResolvedValue(response({ message: "old-key secret backend paths" }, status));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(status === 403 ? "needs jobs permission" : "Unable to load provider audit records");
    expect(screen.queryByText(/old-key secret/)).not.toBeInTheDocument();
    expect(screen.queryByText("No provider audit records were returned.")).not.toBeInTheDocument();
  });

  test("malformed poisoned response fails closed instead of displaying partial rows", async () => {
    fetchMock.mockResolvedValue(response(payload([record, { ...next, request: { secret: "private payload" } }])));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByText(/ID: audit-old/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("private payload");
  });

  test("immediately hides prior rows on key change and renders the new key's result", async () => {
    const pending = deferred();
    fetchMock.mockResolvedValueOnce(response(payload())).mockReturnValueOnce(pending.promise);
    renderPage();
    await screen.findByText(/ID: audit-old/);
    fireEvent.click(screen.getByRole("button", { name: "Switch key" }));
    expect(screen.queryByText(/ID: audit-old/)).not.toBeInTheDocument();
    expect(screen.getByText("Loading provider audit records…")).toBeInTheDocument();
    await act(async () => { pending.resolve(response(payload([next]))); });
    expect(screen.getByText(/ID: audit-new/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe("Bearer new-key");
  });

  test.each(["success", "rejection", "401"])("ignores late old-key %s after a new key succeeds", async (outcome) => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(payload([next])));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Switch key" }));
    await screen.findByText(/ID: audit-new/);
    await act(async () => {
      if (outcome === "rejection") pending.reject(new Error("old-key secret"));
      else pending.resolve(response(outcome === "401" ? { message: "old-key secret" } : payload(), outcome === "401" ? 401 : 200));
    });
    expect(screen.getByText(/ID: audit-new/)).toBeInTheDocument();
    expect(screen.queryByText(/ID: audit-old/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem("lkbApiKey")).toBe("new-key");
  });

  test.each(["success", "rejection"])("ignores late %s after logout and makes no anonymous request", async (outcome) => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await act(async () => {
      if (outcome === "rejection") pending.reject(new Error("private old error"));
      else pending.resolve(response(payload()));
    });
    expect(screen.getByText("Sign in with an API key to view provider audit records.")).toBeInTheDocument();
    expect(screen.queryByText(/ID: audit-old/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading provider audit records…")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("old-key errors disappear immediately on switch and a valid new response recovers", async () => {
    const pending = deferred();
    fetchMock.mockResolvedValueOnce(response({ message: "private" }, 403)).mockReturnValueOnce(pending.promise);
    renderPage();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Switch key" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => { pending.resolve(response(payload([next]))); });
    expect(screen.getByText(/ID: audit-new/)).toBeInTheDocument();
  });
});
