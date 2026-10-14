import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { NavSidebar } from "../../layout/NavSidebar.js";
import appSource from "../../App.tsx?raw";
import { SetupWizardPage } from "./SetupWizardPage.js";

type Reply = { status: number; body?: unknown } | "network";
const fetchMock = vi.fn();
const VIEW_STORED = { ruleSet: { version: 1, ownDomains: ["vidysea.com"], rules: [{ id: "r1", effect: "allow", match: { domain: "vidysea.com" } }] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
const VIEW_EMPTY = { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } };
const HEALTHY: Record<string, Reply> = {
  "/system-status": { status: 200, body: { db: "ok", collections: { sessions: 3 } } },
  "/setup/status": { status: 200, body: { configured: { gemini: true, tavily: true, langfuse: true } } },
  "/calendar/join-rules": { status: 200, body: VIEW_STORED },
  "/watched-sources": { status: 200, body: { sources: [{ _id: "a" }, { _id: "b" }] } },
};

function route(overrides: Record<string, Reply> = {}) {
  const table = { ...HEALTHY, ...overrides };
  fetchMock.mockImplementation(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const r = table[path];
    if (!r) throw new Error(`unexpected ${path}`);
    if (r === "network") throw new TypeError("Failed to fetch");
    return { ok: r.status < 400, status: r.status, headers: new Headers(), json: async () => r.body ?? {} };
  });
}
const item = (id: string) => screen.findByTestId(`item-${id}`);
const renderPage = () => render(<AuthProvider><SetupWizardPage /></AuthProvider>);

beforeEach(() => { localStorage.setItem("lkbApiKey", "k1"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Setup wizard: item states", () => {
  test("all healthy: every checkable item is Ready; scopes and Google stay Unknown with an action", async () => {
    route(); renderPage();
    expect(screen.getByText("Running setup checks…")).toBeInTheDocument();
    for (const id of ["api", "db", "key", "gemini", "tavily", "langfuse", "join-rules", "sources"]) expect((await item(id)).dataset.status).toBe("ok");
    expect((await item("join-rules")).textContent).toContain("1 rule(s) and 1 own domain(s)");
    expect((await item("sources")).textContent).toContain("2 active watched source(s)");
    const scopes = await item("scopes");
    expect(scopes.dataset.status).toBe("unknown");
    expect(scopes.textContent).toContain("calendar granted, sources granted");
    const google = await item("google");
    expect(google.dataset.status).toBe("unknown");
    expect(google.textContent).toContain("gws auth status");
  });

  test("API unreachable: api is a Problem with a start command, db/key unknown, nothing claimed", async () => {
    route({ "/system-status": "network", "/setup/status": "network", "/calendar/join-rules": "network", "/watched-sources": "network" });
    renderPage();
    const api = await item("api");
    expect(api.dataset.status).toBe("problem");
    expect(api.textContent).toContain("VITE_API_BASE_URL");
    expect((await item("db")).dataset.status).toBe("unknown");
    expect((await item("key")).dataset.status).toBe("unknown");
    expect((await item("gemini")).dataset.status).toBe("unknown");
    expect((await item("sources")).textContent).toContain("could not be reached");
  });

  test("db error: reported as a Problem with the MONGO_URI action, not healthy", async () => {
    route({ "/system-status": { status: 200, body: { db: "error", collections: {} } } });
    renderPage();
    const db = await item("db");
    expect(db.dataset.status).toBe("problem");
    expect(db.textContent).toContain("MONGO_URI");
    expect((await item("api")).dataset.status).toBe("ok");
  });

  test("503 from the status reader: db Problem, api ok", async () => {
    route({ "/system-status": { status: 503, body: { db: "error", collections: {} } } });
    renderPage();
    expect((await item("db")).dataset.status).toBe("problem");
    expect((await item("api")).dataset.status).toBe("ok");
    expect((await item("key")).dataset.status).toBe("unknown");
  });

  test("a rejected key (401) is a key Problem", async () => {
    route({ "/system-status": { status: 401, body: { message: "bad" } } });
    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 401 clears the stored key (AuthContext); the page drops back to the sign-in note.
    await screen.findByText("Sign in with an API key to run the setup checks.");
  });

  test("integrations not configured: Gemini is a Problem, Tavily and Langfuse optional To do, each with an env action", async () => {
    route({ "/setup/status": { status: 200, body: { configured: { gemini: false, tavily: false, langfuse: false } } } });
    renderPage();
    const g = await item("gemini");
    expect(g.dataset.status).toBe("problem");
    expect(g.textContent).toContain("GEMINI_API_KEY");
    expect((await item("tavily")).dataset.status).toBe("todo");
    expect((await item("tavily")).textContent).toContain("TAVILY_API_KEY");
    const lf = await item("langfuse");
    expect(lf.dataset.status).toBe("todo");
    expect(lf.textContent).toContain("LANGFUSE_SECRET_KEY");
  });

  test("older API without /setup/status (404): integrations are Unknown, never reported as configured or missing", async () => {
    route({ "/setup/status": { status: 404, body: {} } });
    renderPage();
    for (const id of ["gemini", "tavily", "langfuse"]) {
      const el = await item(id);
      expect(el.dataset.status).toBe("unknown");
      expect(el.textContent).toContain("does not offer this check");
    }
  });

  test("malformed /setup/status body is Unknown, not a guess", async () => {
    route({ "/setup/status": { status: 200, body: { configured: { gemini: "yes" } } } });
    renderPage();
    expect((await item("gemini")).dataset.status).toBe("unknown");
  });

  test("join rules empty: To do with the /join-rules action; watched sources 0: To do", async () => {
    route({ "/calendar/join-rules": { status: 200, body: VIEW_EMPTY }, "/watched-sources": { status: 200, body: { sources: [] } } });
    renderPage();
    const jr = await item("join-rules");
    expect(jr.dataset.status).toBe("todo");
    expect(jr.textContent).toContain("/join-rules");
    const ws = await item("sources");
    expect(ws.dataset.status).toBe("todo");
    expect(ws.textContent).toContain("/watch");
  });

  test("403 on join rules / sources: Unknown naming the missing scope, and scopes item shows denied", async () => {
    route({ "/calendar/join-rules": { status: 403, body: {} }, "/watched-sources": { status: 403, body: {} } });
    renderPage();
    const jr = await item("join-rules");
    expect(jr.dataset.status).toBe("unknown");
    expect(jr.textContent).toContain('lacks the "calendar" scope');
    expect((await item("sources")).textContent).toContain('lacks the "sources" scope');
    expect((await item("scopes")).textContent).toContain("calendar denied (403), sources denied (403)");
  });

  test("malformed join-rules body is Unknown, not 'empty'", async () => {
    route({ "/calendar/join-rules": { status: 200, body: { nope: 1 } } });
    renderPage();
    expect((await item("join-rules")).dataset.status).toBe("unknown");
  });

  test("Re-check re-runs every read once", async () => {
    route(); renderPage();
    await item("api");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole("button", { name: "Re-check" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
  });

  test("no key: no request, sign-in note", () => {
    localStorage.clear(); route(); renderPage();
    expect(screen.getByText("Sign in with an API key to run the setup checks.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Setup wizard: no secrets, only existing read endpoints", () => {
  test("only GETs to the four known paths; the API key never appears in the page text", async () => {
    route(); const { container } = renderPage();
    await item("api");
    const paths = fetchMock.mock.calls.map((c) => String(c[0]).replace(/^https?:\/\/[^/]+/, "")).sort();
    expect(paths).toEqual(["/calendar/join-rules", "/setup/status", "/system-status", "/watched-sources"]);
    for (const c of fetchMock.mock.calls) expect((c[1] as { method?: string }).method ?? "GET").toBe("GET");
    expect(container.textContent).not.toContain("k1");
  });

  test("hostile extra fields in /setup/status are never rendered (booleans are read, nothing else)", async () => {
    route({ "/setup/status": { status: 200, body: { configured: { gemini: true, tavily: false, langfuse: false, geminiKey: "AIzaLEAK" }, secret: "sk-LEAK" } } });
    const { container } = renderPage();
    await item("gemini");
    expect(container.textContent).not.toContain("LEAK");
  });
});

describe("Setup wizard: route and nav", () => {
  test("App registers /setup and the sidebar links to it", () => {
    expect(appSource).toMatch(/path="\/setup" element=\{<SetupWizardPage \/>\}/);
    render(<MemoryRouter><NavSidebar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Setup wizard" })).toHaveAttribute("href", "/setup");
  });
});
