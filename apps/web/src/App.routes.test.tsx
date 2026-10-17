/**
 * ISS-335 -- the route table declared /ask twice (AskPage, then DashboardPage). react-router v6
 * picks the first, so the second was dead code. These tests pin: the path is declared once, and
 * /ask renders the Ask page inside the same login gate and app shell as its siblings.
 */
import { render, screen } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { App } from "./App.js";
import appSource from "./App.tsx?raw";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App route table", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  });

  test("every <Route path> is declared exactly once (no dead duplicates)", () => {
    const paths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toContain("/ask");
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(dupes).toEqual([]);
    expect(paths.filter((p) => p === "/ask")).toHaveLength(1);
  });

  test("/ask is behind the login gate: no key shows the gate, not the Ask page", () => {
    renderAt("/ask");
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
  });

  test("/ask with a key renders the Ask page once, inside the app shell", () => {
    localStorage.setItem("lkbApiKey", "test-key");
    const { container } = renderAt("/ask");
    expect(screen.getAllByLabelText("Question")).toHaveLength(1);
    const shell = container.querySelector(".app-shell");
    expect(shell).not.toBeNull();
    expect(shell!.querySelector("nav, .nav-sidebar, aside")).not.toBeNull();
    expect(shell!.querySelector("main.app-main")!.contains(screen.getByLabelText("Question"))).toBe(true);
  });
});
