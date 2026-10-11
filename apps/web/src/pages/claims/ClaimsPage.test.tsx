import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { ClaimsPage } from "./ClaimsPage.js";

const fetchMock = vi.fn();
const row = (id: string, extra: object = {}) => ({ _id: id, text: `claim ${id}`, status: "verified", evidence: [{ turnId: `t-${id}`, sessionId: "s1", sessionTitle: "Intro session" }], ...extra });
const page = (claims: unknown[], offset = 0, truncated = false) => ({ claims, limit: 25, offset, truncated });
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const renderPage = () => render(<MemoryRouter><AuthProvider><ClaimsPage /></AuthProvider></MemoryRouter>);

beforeEach(() => { localStorage.setItem("lkbApiKey", "key-1"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Claims page (source scope; no live browser)", () => {
  test("lists claims with their source citation linking to the session", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1", { confidence: 0.8, topicRefs: ["a", "b"] })])));
    renderPage();
    await screen.findByText("claim c1");
    expect(screen.getByText(/Status: verified · Confidence: 0.8 · Topics: a, b/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Intro session" });
    expect(link).toHaveAttribute("href", "/sessions/s1");
    expect(screen.getByText(/turn t-c1/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/claims\?limit=25&offset=0$/);
    expect(fetchMock.mock.calls[0]![1].method ?? "GET").toBe("GET");
  });

  test("falls back to the session id when the session title is gone; renders text as plain text", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1", { text: "<img src=x onerror=alert(1)>", evidence: [{ turnId: "t1", sessionId: "gone-9", sessionTitle: null }] })])));
    renderPage();
    await screen.findByRole("link", { name: "gone-9" });
    expect(document.querySelector("img")).toBeNull();
  });

  test("status filter refetches from offset 0 with the status param", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1")])));
    renderPage();
    await screen.findByText("claim c1");
    fetchMock.mockResolvedValue(response(page([row("c2", { status: "conflicting" })])));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "conflicting" } });
    await screen.findByText("claim c2");
    expect(String(fetchMock.mock.calls.at(-1)![0])).toMatch(/limit=25&offset=0&status=conflicting$/);
  });

  test("changing the status filter while on page 2 returns to offset 0", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1")], 0, true)));
    renderPage();
    await screen.findByText("claim c1");
    fetchMock.mockResolvedValue(response(page([row("c26")], 25, true)));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("claim c26");
    fetchMock.mockResolvedValue(response(page([row("c9", { status: "needs-review" })])));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "needs-review" } });
    await screen.findByText("claim c9");
    expect(String(fetchMock.mock.calls.at(-1)![0])).toMatch(/limit=25&offset=0&status=needs-review$/);
  });

  test("paging uses offset; Next disabled when not truncated; Previous disabled at the start", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1")], 0, true)));
    renderPage();
    await screen.findByText("claim c1");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fetchMock.mockResolvedValue(response(page([row("c26")], 25, false)));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("claim c26");
    expect(String(fetchMock.mock.calls.at(-1)![0])).toMatch(/offset=25/);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 26–26");
  });

  test("empty, 403 and malformed-response states", async () => {
    fetchMock.mockResolvedValue(response(page([])));
    renderPage();
    await screen.findByText("No claims found for this tenant.");
    cleanup();
    fetchMock.mockResolvedValue(response({ error: "forbidden" }, 403));
    renderPage();
    await screen.findByText("This API key needs citations permission to read claims.");
    cleanup();
    fetchMock.mockResolvedValue(response({ claims: [{ _id: "x" }], limit: 25, offset: 0, truncated: false }));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByText("claim x")).not.toBeInTheDocument();
  });

  test("read-only: no approve, edit or delete controls", async () => {
    fetchMock.mockResolvedValue(response(page([row("c1")])));
    renderPage();
    await screen.findByText("claim c1");
    expect(screen.queryByRole("button", { name: /approve|edit|delete|reject|publish/i })).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Previous", "Next"]);
  });
});
