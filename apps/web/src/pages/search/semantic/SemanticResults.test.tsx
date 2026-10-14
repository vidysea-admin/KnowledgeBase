import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { SemanticResults } from "./SemanticResults.js";

const hit = (title = "A session") => ({ chunkId: "c/1", sessionId: "s/1", score: -0.2, session: { _id: "s/1", title, date: "2026-10-14" } });
const reply = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
function view(key: string | null = "key", query = "q") { return <MemoryRouter><SemanticResults apiKey={key} query={query} /></MemoryRouter>; }
function click() { fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" })); }
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(r => { resolve = r; }), resolve: (value: Response) => resolve(value) }; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

test("mount and query changes make no embedding request; explicit action returns session-level matches", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply("new", [hit("<script>literal 世界</script>")])); vi.stubGlobal("fetch", fetcher);
  const mounted = render(view()); mounted.rerender(view("key", "new")); expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(/may incur charges/)).toBeInTheDocument(); click();
  const link = await screen.findByRole("link", { name: "<script>literal 世界</script>" });
  expect(link).toHaveAttribute("href", "/sessions/s%2F1"); expect(link.getAttribute("href")).not.toContain("#turn");
  expect(document.querySelector("script")).toBeNull(); expect(screen.getByText(/Retrieval score: -0.200/)).toBeInTheDocument(); expect(fetcher).toHaveBeenCalledTimes(1);
});
test("anonymous, blank and oversized queries cannot dispatch", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const mounted = render(view(null)); expect(screen.queryByRole("button")).toBeNull();
  for (const query of [" ", "a".repeat(513)]) { mounted.rerender(view("key", query)); expect(screen.getByRole("button")).toBeDisabled(); click(); }
  expect(fetcher).not.toHaveBeenCalled();
});
test("in-flight repeated action is bounded, empty and unavailable joins remain explicit", async () => {
  const pending = deferred(), fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(reply("q", [])); vi.stubGlobal("fetch", fetcher); render(view());
  click(); click(); expect(fetcher).toHaveBeenCalledTimes(1); expect(screen.getByRole("status")).toHaveTextContent("Searching semantic");
  await act(async () => { pending.resolve(reply("q", [{ ...hit(), session: null }])); });
  expect(screen.getByText("Session unavailable")).toBeInTheDocument(); expect(screen.queryByRole("link")).toBeNull();
  click(); expect(await screen.findByText("No semantic matches found.")).toBeInTheDocument(); expect(screen.queryByText("Session unavailable")).toBeNull();
});
test.each([[404, "not enabled"], [403, "needs search access"], [401, "Sign in"], [503, "unavailable"]])("safe error for HTTP %s supports explicit retry", async (status, text) => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "SECRET backend detail" }), { status: Number(status) })).mockResolvedValueOnce(reply("q", [hit()]));
  vi.stubGlobal("fetch", fetcher); render(view()); click(); expect(await screen.findByRole("alert")).toHaveTextContent(String(text)); expect(document.body.textContent).not.toContain("SECRET");
  click(); expect(await screen.findByRole("link")).toHaveTextContent("A session");
});
test("key replacement immediately hides old evidence and ignores late old-key successes", async () => {
  const pending = deferred(); vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("q", [hit("Old visible")])).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(reply("q", [hit("New owner")])));
  const mounted = render(view()); click(); await screen.findByText("Old visible"); click(); mounted.rerender(view("replacement"));
  expect(screen.queryByText("Old visible")).toBeNull(); click(); await screen.findByText("New owner");
  await act(async () => { pending.resolve(reply("q", [hit("Late private data")])); }); expect(screen.queryByText("Late private data")).toBeNull(); expect(screen.getByText("New owner")).toBeInTheDocument();
});
test("superseded query errors cannot replace the current query results", async () => {
  const old = deferred(), fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("new", [hit("Current result")])); vi.stubGlobal("fetch", fetcher);
  const mounted = render(view()); click(); mounted.rerender(view("key", "new")); expect(fetcher).toHaveBeenCalledTimes(1); click(); await screen.findByText("Current result");
  await act(async () => { old.resolve(new Response("{}", { status: 503 })); }); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByText("Current result")).toBeInTheDocument();
});
test("late old-key 401 neither removes replacement auth nor displays stale failure", async () => {
  const old = deferred(); vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("q", [hit("Replacement evidence")])));
  localStorage.setItem("lkbApiKey", "key"); const mounted = render(view()); click();
  localStorage.setItem("lkbApiKey", "replacement"); mounted.rerender(view("replacement")); click(); await screen.findByText("Replacement evidence");
  await act(async () => { old.resolve(new Response("{}", { status: 401 })); });
  expect(localStorage.getItem("lkbApiKey")).toBe("replacement"); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByText("Replacement evidence")).toBeInTheDocument();
});
