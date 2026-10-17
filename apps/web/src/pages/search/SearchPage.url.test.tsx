import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { AppShell } from "../../layout/AppShell.js";
import { SearchPage } from "./SearchPage.js";
import { API_BASE_URL } from "../../api/client.js";
import { MAX_QUERY_CHARS } from "./query.js";

const hit = (text: string) => ({ turnId: "t1", sessionId: "s1", score: 1,
  turn: { _id: "t1", sessionId: "s1", speakerRef: "spk:0", speakerLabel: "A", tStart: 1, tEnd: 2, text },
  session: { _id: "s1", title: "S", date: "2026-08-20", status: { transcribe: "done", index: "pending" } } });
const echo = () => vi.fn(async (url: string) => {
  const q = new URL(String(url), "http://x.invalid").searchParams.get("q") ?? "";
  return new Response(JSON.stringify({ query: q, hits: [hit(`passage for ${q.slice(0, 20)}`)] }), { headers: { "content-type": "application/json" } });
});
const queries = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => new URL(String(c[0]), "http://x.invalid").searchParams.get("q"));
function Nav() {
  const n = useNavigate(), l = useLocation(), auth = useAuth();
  return <><button onClick={() => n(-1)}>Back</button><button onClick={() => n(1)}>Forward</button>
    <button onClick={() => auth.setApiKey("other-key")}>Replace key</button>
    <button onClick={() => auth.setApiKey("fixture-key")}>Reset same key</button><output data-testid="loc">{l.pathname + l.search}</output></>;
}
function mount(route: string, opts: { key?: string | null; strict?: boolean } = {}) {
  const key = opts.key === undefined ? "fixture-key" : opts.key;
  if (key) localStorage.setItem("lkbApiKey", key);
  const tree = <AuthProvider><MemoryRouter initialEntries={[route]}><AppShell><Nav /><Routes>
    <Route path="/search" element={<SearchPage />} /><Route path="*" element={<p>elsewhere</p>} /></Routes></AppShell></MemoryRouter></AuthProvider>;
  return render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree);
}
const bar = (v: string) => { fireEvent.change(screen.getByLabelText("Search all sessions"), { target: { value: v } }); fireEvent.submit(screen.getByRole("search")); };
const box = (v: string) => { fireEvent.change(screen.getByRole("searchbox"), { target: { value: v } }); fireEvent.submit(screen.getByRole("form", { name: "Search transcripts" })); };
const loc = () => screen.getByTestId("loc").textContent;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

describe("SearchPage ?q= URL sync", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  test("same credential in a new auth session clears executed query and previously visible results", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=private");
    await screen.findByText("passage for private"); fireEvent.click(screen.getByRole("button", { name: "Reset same key" }));
    expect(screen.queryByText("passage for private")).toBeNull(); expect(loc()).toBe("/search");
    expect(screen.getByRole("searchbox")).toHaveValue(""); expect(f).toHaveBeenCalledTimes(1);
  });

  test("missing or empty q: idle state, zero requests", async () => {
    const f = echo(); vi.stubGlobal("fetch", f);
    for (const route of ["/search", "/search?q=", "/search?q=%20%20", "/search?q=%07"]) {
      mount(route); await settle();
      expect(screen.getByText("Enter a query to search your transcripts.")).toBeInTheDocument(); cleanup();
    }
    expect(f).not.toHaveBeenCalled();
  });
  test("exactly ONE request per distinct q on load, also under StrictMode double-mount", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=ratios", { strict: true });
    expect(await screen.findByText("Results for “ratios”")).toBeInTheDocument();
    await settle();
    expect(queries(f)).toEqual(["ratios"]);
    expect(screen.getByRole("searchbox")).toHaveValue("ratios");
  });
  test("global bar from another route runs ONE search and nothing loops afterwards", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/sessions");
    bar("grade 8"); expect(await screen.findByText("Results for “grade 8”")).toBeInTheDocument();
    expect(loc()).toBe("/search?q=grade+8");
    await settle();
    expect(queries(f)).toEqual(["grade 8"]);
  });
  test("submitting the page box pushes the URL; Back and Forward re-run the earlier queries", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=first");
    await screen.findByText("Results for “first”"); box("second"); await screen.findByText("Results for “second”");
    expect(loc()).toBe("/search?q=second");
    fireEvent.click(screen.getByText("Back")); await screen.findByText("Results for “first”");
    expect(screen.getByRole("searchbox")).toHaveValue("first");
    fireEvent.click(screen.getByText("Forward")); await screen.findByText("Results for “second”");
    await settle();
    expect(queries(f)).toEqual(["first", "second", "first", "second"]);
  });
  test("resubmitting the same query retries in place (one more request, no URL push)", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=same"); await screen.findByText("Results for “same”");
    box("same"); await waitFor(() => expect(f).toHaveBeenCalledTimes(2)); expect(loc()).toBe("/search?q=same");
  });
  test("malformed percent-encoding does not throw; it is decoded exactly once by the platform parser and searched", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=%E0%A4%A");
    const decoded = new URLSearchParams("q=%E0%A4%A").get("q") ?? "";
    expect(await screen.findByText(`Results for “${decoded}”`)).toBeInTheDocument(); expect(queries(f)).toEqual([decoded]);
  });
  test("hostile q renders inert, bounded, control/bidi stripped; exactly one request goes to the search API", async () => {
    const f = echo(); vi.stubGlobal("fetch", f);
    const hostile = `<script>alert(1)</script><img src=x onerror=alert(2)>javascript:alert(3)‮evil\u0007${"z".repeat(10_000)}`;
    mount(`/search?q=${encodeURIComponent(hostile)}`);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    await settle();
    const sent = queries(f)[0] ?? "";
    expect(Array.from(sent).length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect(sent).not.toMatch(/[‮\u0007]/); expect(sent).toContain("<script>");
    expect(new URL(String(f.mock.calls[0]?.[0])).origin).toBe(new URL(API_BASE_URL).origin); expect(new URL(String(f.mock.calls[0]?.[0])).pathname).toBe("/search");
    expect(document.querySelector("script")).toBeNull(); expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("‮");
    // The router probe echoes the raw URL; everything the app itself renders stays bounded.
    expect((document.body.textContent ?? "").replace(loc() ?? "", "").length).toBeLessThan(2_000);
    expect(screen.getByRole("searchbox")).toHaveValue(sent);
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    expect(loc()).toContain("/search?q="); expect(f).toHaveBeenCalledTimes(1);
  });
  test("no request without a key (even with ?q=) and no bar", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=ratios", { key: null }); await settle();
    expect(f).not.toHaveBeenCalled(); expect(screen.queryByRole("search")).toBeNull();
  });
  test("changing the key clears the URL query and does not search for the new key", async () => {
    const f = echo(); vi.stubGlobal("fetch", f); mount("/search?q=ratios"); await screen.findByText("Results for “ratios”");
    fireEvent.click(screen.getByText("Replace key")); await settle();
    expect(loc()).toBe("/search"); expect(f).toHaveBeenCalledTimes(1); expect(screen.getByRole("searchbox")).toHaveValue("");
  });
});
