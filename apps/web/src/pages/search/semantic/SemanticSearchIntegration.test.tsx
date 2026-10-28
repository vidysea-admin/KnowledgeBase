import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../../auth/AuthContext.js";
import { SearchPage } from "../SearchPage.js";

const reply = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, mode: "chunks", hits }), { headers: { "content-type": "application/json" } });
const lexical = { turnId: "t/1", sessionId: "s/1", score: 1,
  turn: { _id: "t/1", sessionId: "s/1", speakerRef: "spk:0", tStart: 0, tEnd: 10, text: "Exact lexical passage" },
  session: { _id: "s/1", title: "Lexical session", date: "2026-10-14", status: { transcribe: "done", index: "done" } } };
const semantic = { chunkId: "c/1", sessionId: "s/2", score: 0.5, session: { _id: "s/2", title: "Semantic session", date: "2026-10-14" },
  turnIds: ["t/2"], tStart: 1, tEnd: 2, quote: { turnId: "t/2", charStart: 0, charEnd: 17, text: "Semantic passage.", speakerRef: "expert", tStart: 1, tEnd: 2 } };
function Controls() {
  const navigate = useNavigate(); const auth = useAuth();
  return <><button onClick={() => navigate("/search?q=next")}>Next query</button><button onClick={() => auth.setApiKey("replacement")}>Switch owner</button></>;
}
function show() { localStorage.setItem("lkbApiKey", "key"); render(<AuthProvider><MemoryRouter initialEntries={["/search?q=first"]}><Controls /><SearchPage /></MemoryRouter></AuthProvider>); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

test("actual SearchPage keeps lexical passages and adds semantic matches only after explicit action", async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input, "http://local.invalid");
    return reply(url.searchParams.get("q")!, url.pathname === "/search/semantic" ? [semantic] : [lexical]);
  });
  vi.stubGlobal("fetch", fetcher); show(); await screen.findByText("Exact lexical passage");
  expect(fetcher).toHaveBeenCalledTimes(1); expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("/search/semantic");
  fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" }));
  expect(await screen.findByRole("link", { name: "Semantic session" })).toHaveAttribute("href", "/sessions/s%2F2");
  expect(screen.getByRole("link", { name: "Open transcript" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2F1");
  expect(screen.getByText("Exact lexical passage")).toBeInTheDocument(); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Semantic passage.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open cited passage" })).toHaveAttribute("href", "/sessions/s%2F2#turn-t%2F2");
  const [input, options] = (fetcher.mock.calls[1] as unknown as [string, RequestInit]);
  expect(new URL(input, "http://local.invalid").searchParams.get("q")).toBe("first");
  expect(options.headers).toMatchObject({ authorization: "Bearer key" });
});
test("actual URL navigation makes lexical request but never automatic semantic request or stale semantic output", async () => {
  let resolve!: (value: Response) => void; const pending = new Promise<Response>(r => { resolve = r; });
  const fetcher = vi.fn(async (input: string) => { const url = new URL(input, "http://local.invalid"); return url.pathname === "/search/semantic" ? pending : reply(url.searchParams.get("q")!, []); });
  vi.stubGlobal("fetch", fetcher); show(); await screen.findByText("No passages found for “first”.");
  fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" })); fireEvent.click(screen.getByRole("button", { name: "Next query" }));
  await screen.findByText("No passages found for “next”.");
  await act(async () => { resolve(reply("first", [semantic])); });
  expect(screen.queryByText("Semantic session")).toBeNull(); expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/search/semantic"))).toHaveLength(1);
});
test("actual AuthProvider owner replacement clears semantic output and executed query without embedding", async () => {
  const fetcher = vi.fn(async (input: string) => { const url = new URL(input, "http://local.invalid"); return reply(url.searchParams.get("q")!, url.pathname === "/search/semantic" ? [semantic] : []); });
  vi.stubGlobal("fetch", fetcher); show(); await screen.findByText("No passages found for “first”.");
  fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" })); await screen.findByText("Semantic session");
  fireEvent.click(screen.getByRole("button", { name: "Switch owner" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Search semantic matches" })).toBeDisabled());
  expect(screen.queryByText("Semantic session")).toBeNull(); expect(screen.getByRole("searchbox")).toHaveValue(""); expect(fetcher).toHaveBeenCalledTimes(2);
});
