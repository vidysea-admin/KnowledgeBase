import { render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";


afterEach(() => { vi.resetModules(); delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__; });

describe("runtime base path wiring", () => {
  it("api client sends requests to <basePath>/api when config.js sets a base path (production build)", async () => {
    (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "" };
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_BASE_URL", "");
    const { apiFetch, API_BASE_URL } = await import("../api/client.js");
    expect(API_BASE_URL).toBe("/knowledgebase/api");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/sessions", "key");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/knowledgebase/api/sessions");
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  it("App router mounts under the configured basename", async () => {
    (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "" };
    const { routerBasename } = await import("./runtime.js");
    expect(routerBasename).toBe("/knowledgebase");
  });

  it("router basename is / for the default root deployment", async () => {
    const { routerBasename } = await import("./runtime.js");
    expect(routerBasename).toBe("/");
  });

  it("a router Link renders the base path in its href (what the former hard-coded <a href> could not do)", () => {
    render(<MemoryRouter basename="/knowledgebase" initialEntries={["/knowledgebase/watch"]}><Link to="/calendar">Calendar</Link></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/knowledgebase/calendar");
  });

  it("the real App routes /knowledgebase/ask to the Ask page when mounted under /knowledgebase", async () => {
    (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "" };
    localStorage.setItem("lkbApiKey", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"policies":[],"history":[],"sessions":[]}', { status: 200, headers: { "content-type": "application/json" } })));
    window.history.pushState({}, "", "/knowledgebase/ask");
    const { App } = await import("../App.js");
    render(<App />);
    expect(screen.getAllByLabelText("Question")).toHaveLength(1);
    vi.unstubAllGlobals(); localStorage.clear();
  });
});
