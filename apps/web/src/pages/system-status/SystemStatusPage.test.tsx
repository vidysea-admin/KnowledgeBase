import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { NavSidebar } from "../../layout/NavSidebar.js";
import appSource from "../../App.tsx?raw";
import { SystemStatusPage } from "./SystemStatusPage.js";

const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const healthy = { db: "ok", collections: { sessions: 3, claims: 0 } };
const ALL_TENANT = { db: "ok", collections: { sessions: 987654, claims: 123456 }, watchSilent: 7, watchUnreadable: 5 };

function Controls() {
  const { setApiKey } = useAuth();
  return <button onClick={() => setApiKey("new-key")}>Switch key</button>;
}
function renderPage() { return render(<AuthProvider><Controls /><SystemStatusPage /></AuthProvider>); }

beforeEach(() => { localStorage.setItem("lkbApiKey", "k1"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("System status page: states", () => {
  test("loading, then loaded state shows checks and a collections table", async () => {
    fetchMock.mockResolvedValue(response(healthy));
    renderPage();
    expect(screen.getByText("Loading system status…")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Collections" });
    expect(screen.getByText("Database: reachable")).toBeInTheDocument();
    expect(screen.getByText("Collections with no documents: 1")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("3 documents in total");
    expect(screen.getByRole("rowheader", { name: "claims" })).toBeInTheDocument();
  });

  test("empty state: db ok but no collections reported", async () => {
    fetchMock.mockResolvedValue(response({ db: "ok", collections: {} }));
    renderPage();
    await screen.findByText("The service reported no collections.");
    expect(screen.getByText(/Watchers silent: unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("db error is shown as NOT reachable, not as healthy", async () => {
    fetchMock.mockResolvedValue(response({ db: "error", collections: {} }));
    renderPage();
    await screen.findByText("Database: NOT reachable");
  });

  test("401 is handled by AuthContext: key dropped, sign-in note shown, no retry loop, one request", async () => {
    fetchMock.mockResolvedValueOnce(response({ message: "x" }, 401));
    renderPage();
    await screen.findByText("Sign in with an API key to view system status.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("403 is a counts-unavailable state and not an empty state", async () => {
    fetchMock.mockResolvedValueOnce(response({ message: "x" }, 403));
    renderPage();
    await screen.findByText(/Counts unavailable: this API key is not permitted/);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("The service reported no collections.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("5xx shows an error not an empty state; Retry re-fetches exactly once per click, no auto-retry", async () => {
    fetchMock.mockResolvedValue(response({ db: "error" }, 503));
    renderPage();
    await screen.findByText(/Counts unavailable/);
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("The service reported no collections.")).not.toBeInTheDocument();
    fetchMock.mockResolvedValue(response(healthy));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Collections" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("network failure is a counts-unavailable error state", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Counts unavailable");
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("503 (no reader wired / db error) is a counts-unavailable state", async () => {
    fetchMock.mockResolvedValueOnce(response({ db: "error", collections: {} }, 503));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Counts unavailable: the system status reader is not available");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("The service reported no collections.")).toBeNull();
  });
});

describe("System status page: requests and auth", () => {
  test("no key: no request is made and a sign-in note is shown", () => {
    localStorage.clear();
    renderPage();
    expect(screen.getByText("Sign in with an API key to view system status.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("request is a GET to /system-status carrying the bearer key, with no key or tenant in the URL", async () => {
    fetchMock.mockResolvedValue(response(healthy));
    renderPage();
    await screen.findByRole("heading", { name: "Collections" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/system-status$/);
    expect(init.method).toBe("GET");
    expect(init.headers.authorization).toBe("Bearer k1");
    expect(String(url)).not.toMatch(/k1|tenant/i);
  });

  test("rotating the key re-fetches with the new key", async () => {
    fetchMock.mockResolvedValue(response(healthy));
    renderPage();
    await screen.findByRole("heading", { name: "Collections" });
    fireEvent.click(screen.getByText("Switch key"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![1].headers.authorization).toBe("Bearer new-key");
  });
});

describe("System status page: tenant scope (ISS-T057SCREEN-001 / ISS-STATUSSCOPE-001)", () => {
  // URL-routing mock: /health answers with LARGE all-tenant counts, /system-status per the case.
  function route(systemStatus: () => unknown) {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("/health") ? response(ALL_TENANT) : (systemStatus() as ReturnType<typeof response>));
  }
  const requested = () => fetchMock.mock.calls.map(([u]) => String(u));

  test("counts come from /system-status; /health is never requested and its all-tenant numbers never render", async () => {
    route(() => response(healthy));
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Collections" });
    expect(requested().every((u) => u.endsWith("/system-status"))).toBe(true);
    expect(requested().some((u) => u.includes("/health"))).toBe(false);
    expect(container.textContent).toContain("3 documents in total");
    for (const leaked of ["987654", "123456"]) expect(container.textContent).not.toContain(leaked);
  });

  test("watchSilent/watchUnreadable are shown as unavailable, even if /system-status ever carried them", async () => {
    route(() => response({ ...healthy, watchSilent: 42, watchUnreadable: 43 }));
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Collections" });
    expect(screen.getByText("Watchers silent: unavailable (no tenant-scoped source)")).toBeInTheDocument();
    expect(screen.getByText("Watchers unreadable: unavailable (no tenant-scoped source)")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/42|43/);
  });

  test.each([[401], [403], [503], [500]])("status %i: counts unavailable, no table, /health counts never shown, /health never fetched", async (status) => {
    route(() => response({ db: "ok", collections: {} }, status));
    const { container } = renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("table")).toBeNull();
    for (const leaked of ["987654", "123456"]) expect(container.textContent).not.toContain(leaked);
    expect(requested().some((u) => u.includes("/health"))).toBe(false);
    if (status !== 401) expect(screen.getByRole("alert")).toHaveTextContent("Counts unavailable");
    else expect(screen.getByText("Sign in with an API key to view system status.")).toBeInTheDocument();
  });

  test("network failure on /system-status never falls back to /health", async () => {
    route(() => { throw new TypeError("offline"); });
    const { container } = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Counts unavailable");
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toContain("987654");
    expect(requested().some((u) => u.includes("/health"))).toBe(false);
  });
});

describe("System status page: hostile payloads", () => {
  const rtl = "‮evil‬";
  const long = "x".repeat(5000);

  test("hostile collection names render as inert text: no elements, no links, no script", async () => {
    const hostile = { "<script>window.__pwned=1</script>": 1, "javascript:alert(1)": 2, [rtl]: 3, [long]: 4 };
    fetchMock.mockResolvedValue(response({ db: "ok", collections: hostile }));
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Collections" });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(screen.getByText("<script>window.__pwned=1</script>")).toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    const cell = screen.getByText(long);
    expect(cell.textContent).toHaveLength(5000);
    expect(cell).toHaveStyle({ overflow: "hidden", textOverflow: "ellipsis" });
  });

  test.each([
    ["null body", null],
    ["array body", []],
    ["db wrong type", { db: 1, collections: {} }],
    ["collections null", { db: "ok", collections: null }],
    ["collections array", { db: "ok", collections: [] }],
    ["count is string", { db: "ok", collections: { a: "5" } }],
    ["count negative", { db: "ok", collections: { a: -1 } }],
    ["count float", { db: "ok", collections: { a: 1.5 } }],
  ])("malformed response (%s) is an error state, never rendered as data", async (_name, body) => {
    fetchMock.mockResolvedValue(response(body));
    const { container } = renderPage();
    await screen.findByRole("alert");
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByText("The service reported no collections.")).not.toBeInTheDocument();
  });

  test("error message is fixed text: server message text never reaches the page", async () => {
    fetchMock.mockResolvedValue(response({ message: "<img src=x onerror=alert(1)>" }, 500));
    const { container } = renderPage();
    await screen.findByRole("alert");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("onerror");
  });
});

describe("System status route and nav", () => {
  test("/status route is declared exactly once in App.tsx", () => {
    const paths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.filter((p) => p === "/status")).toHaveLength(1);
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
  });

  test("sidebar has exactly one System status entry pointing at /status", () => {
    render(<MemoryRouter><NavSidebar /></MemoryRouter>);
    const links = screen.getAllByRole("link", { name: "System status" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/status");
  });
});
