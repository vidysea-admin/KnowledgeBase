/**
 * w17-wireweb -- pins that the built T-056 (answer policy / answer review), T-054 (transcript review),
 * T-008 (knowledge outputs), U2.2 (extraction review) and championship pages are mounted behind the
 * login gate and linked from the nav; and that signed-out visitors see only the gate.
 */
import { render, screen } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { App } from "./App.js";
import appSource from "./App.tsx?raw";

const ROUTES = [
  { path: "/extraction-review", navLabel: "Extraction review" },
  { path: "/label-review", navLabel: "Label review" },
  { path: "/championship", navLabel: "Championship" },
  { path: "/answer-policy", navLabel: "Answer policy" },
  { path: "/answer-review", navLabel: "Answer review" },
  { path: "/transcript-review", navLabel: "Transcript review" },
  { path: "/knowledge-outputs", navLabel: "Knowledge outputs" },
];

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("w17 wired routes", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  });

  test.each(ROUTES)("$path is declared once in the route table", ({ path }) => {
    const paths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.filter((p) => p === path)).toHaveLength(1);
  });

  test.each(ROUTES)("$path signed out shows only the login gate", ({ path, navLabel }) => {
    const { container } = renderAt(path);
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toBeNull();
    expect(screen.queryByText(navLabel)).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  test.each(ROUTES)("$path signed in renders inside the shell with an active nav link", ({ path, navLabel }) => {
    localStorage.setItem("lkbApiKey", "test-key");
    const { container } = renderAt(path);
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    const main = container.querySelector(".app-shell main.app-main");
    expect(main).not.toBeNull();
    const link = screen.getByRole("link", { name: navLabel });
    expect(link.getAttribute("href")).toBe(path);
    expect(link.className).toContain("active");
  });
});
