import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { AppShell } from "../layout/AppShell.js";
import { GlobalSearchBar } from "./GlobalSearchBar.js";
import { MAX_QUERY_CHARS } from "../pages/search/query.js";

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; }
function ResetOwner() { const auth = useAuth(); return <button onClick={() => auth.setApiKey("fixture-key")}>Reset same key</button>; }
function mount(route: string, key: string | null = "fixture-key") {
  if (key) localStorage.setItem("lkbApiKey", key);
  return render(<AuthProvider><MemoryRouter initialEntries={[route]}><GlobalSearchBar /><Probe /></MemoryRouter></AuthProvider>);
}
const loc = () => screen.getByTestId("loc").textContent ?? "";
const qOf = () => new URLSearchParams(loc().split("?")[1] ?? "").get("q");
function go(value: string) {
  fireEvent.change(screen.getByLabelText("Search all sessions"), { target: { value } });
  fireEvent.submit(screen.getByRole("search", { name: "Global search" }));
}

describe("GlobalSearchBar", () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  test.each(["/", "/sessions", "/ask", "/calendar", "/search"])("submit from %s navigates to /search?q= without any request", (route) => {
    mount(route); go("class size");
    expect(loc()).toBe("/search?q=class+size"); expect(fetch).not.toHaveBeenCalled();
  });
  test("blank and whitespace-only queries are refused (no navigation)", () => {
    mount("/sessions"); go(""); go("   \t "); go("‮\u0007 ");
    expect(loc()).toBe("/sessions");
  });
  test("query is trimmed", () => { mount("/"); go("  hello  "); expect(loc()).toBe("/search?q=hello"); });
  test("over-long query is bounded to MAX_QUERY_CHARS code points before navigation", () => {
    mount("/"); go("x".repeat(10_000));
    expect(qOf()).toHaveLength(MAX_QUERY_CHARS);
    go("😀".repeat(2000));
    expect(Array.from(qOf() ?? "")).toHaveLength(MAX_QUERY_CHARS);
  });
  test("special characters round-trip, encoded exactly once", () => {
    const cases = ["a&b", "c#d", "100%", "1+1", "what?", "say \"hi\" 'x'", "नमस्ते 世界", "😀 ok", "50%25", "a=b&c=d"];
    mount("/");
    for (const text of cases) {
      go(text);
      expect(qOf()).toBe(text);
      expect(loc()).toBe(`/search?${new URLSearchParams({ q: text }).toString()}`);
    }
    go("50%25"); expect(loc()).toContain("50%2525");
  });
  test("control characters and bidi overrides never reach the URL", () => {
    mount("/"); go("ab‮cd\u0000ef");
    expect(qOf()).toBe("ab cd ef");
  });
  test("shows the current q on /search, and is empty elsewhere", () => {
    mount("/search?q=size%20of%20class");
    expect(screen.getByLabelText("Search all sessions")).toHaveValue("size of class");
    cleanup(); mount("/sessions?q=leak"); expect(screen.getByLabelText("Search all sessions")).toHaveValue("");
  });
  test("malformed percent-encoding in the URL does not throw", () => {
    mount("/search?q=%E0%A4%A");
    expect(screen.getByLabelText("Search all sessions")).toHaveValue(new URLSearchParams("q=%E0%A4%A").get("q"));
  });
  test("a new auth session using the same credential clears an unsubmitted private draft", () => {
    localStorage.setItem("lkbApiKey", "fixture-key");
    render(<AuthProvider><MemoryRouter><GlobalSearchBar /><ResetOwner /></MemoryRouter></AuthProvider>);
    fireEvent.change(screen.getByLabelText("Search all sessions"), { target: { value: "private draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset same key" }));
    expect(screen.getByLabelText("Search all sessions")).toHaveValue(""); expect(fetch).not.toHaveBeenCalled();
  });
  test("is not rendered when signed out; the shell renders it once when signed in", () => {
    mount("/", null); expect(screen.queryByRole("search")).toBeNull(); cleanup();
    localStorage.setItem("lkbApiKey", "k");
    render(<AuthProvider><MemoryRouter><AppShell><Routes><Route path="*" element={<p>body</p>} /></Routes></AppShell></MemoryRouter></AuthProvider>);
    expect(screen.getAllByRole("search")).toHaveLength(1);
  });
});
