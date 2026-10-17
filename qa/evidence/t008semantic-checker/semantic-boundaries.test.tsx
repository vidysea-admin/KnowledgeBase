import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { SemanticResults } from "../../../apps/web/src/pages/search/semantic/SemanticResults.js";
import { searchSemantic } from "../../../apps/web/src/api/search/semanticClient.js";
import { cosineSimilarity } from "../../../packages/index/src/vector/cosine.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const hit = (title: string, score = 0.5, id = "s/1") => ({ chunkId: "c/1", sessionId: id, score, session: { _id: id, title, date: "2026-10-14" } });
const reply = (query: string, title: string, score = 0.5, id = "s/1") => new Response(JSON.stringify({ query, hits: [hit(title, score, id)] }));
const view = (key = "key-A", query = "q") => <MemoryRouter><SemanticResults apiKey={key} query={query} /></MemoryRouter>;
const click = () => fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" }));
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(r => { resolve = r; }), resolve: (value: Response) => resolve(value) }; }

test("real exact-cosine upstream output survives JSON client and session consumer", async () => {
  const score = cosineSimilarity([1, 1, 1], [1, 1, 1]);
  expect(score).toBeGreaterThan(1);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", "Exact match", score)));
  render(view()); click();
  expect(await screen.findByRole("link", { name: "Exact match" })).toHaveAttribute("href", "/sessions/s%2F1");
  expect(screen.getByText(/Retrieval score: 1.000/)).toBeInTheDocument();
});

test("A-B-A key rotation never admits the first A request into the new A child", async () => {
  const old = deferred(); const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("q", "Fresh owner")); vi.stubGlobal("fetch", fetcher);
  const mounted = render(view()); click(); mounted.rerender(view("key-B")); mounted.rerender(view());
  expect(fetcher).toHaveBeenCalledTimes(1); click(); await screen.findByText("Fresh owner");
  await act(async () => { old.resolve(reply("q", "Abandoned private result")); });
  expect(screen.queryByText("Abandoned private result")).toBeNull(); expect(screen.getByText("Fresh owner")).toBeInTheDocument();
});

test("q-new-q navigation does not revive an abandoned identical-query response", async () => {
  const old = deferred(); vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("q", "Current query")));
  const mounted = render(view()); click(); mounted.rerender(view("key-A", "new")); mounted.rerender(view()); click(); await screen.findByText("Current query");
  await act(async () => { old.resolve(reply("q", "Abandoned query")); });
  expect(screen.queryByText("Abandoned query")).toBeNull(); expect(screen.getByText("Current query")).toBeInTheDocument();
});

test("late old-key 401 leaves replacement storage and visible results intact", async () => {
  const old = deferred(); vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply("q", "Replacement evidence")));
  localStorage.setItem("lkbApiKey", "key-A"); const mounted = render(view()); click();
  localStorage.setItem("lkbApiKey", "key-B"); mounted.rerender(view("key-B")); click(); await screen.findByText("Replacement evidence");
  await act(async () => { old.resolve(new Response("{}", { status: 401 })); });
  expect(localStorage.getItem("lkbApiKey")).toBe("key-B"); expect(screen.getByText("Replacement evidence")).toBeInTheDocument(); expect(screen.queryByRole("alert")).toBeNull();
});

test("untrusted identifier and title remain inert internal navigation", async () => {
  const id = "//evil.invalid/?q=<script>#turn-evil";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", "<img src=x onerror=alert(1)>", 0.5, id))); render(view()); click();
  const link = await screen.findByRole("link", { name: "<img src=x onerror=alert(1)>" });
  expect(link).toHaveAttribute("href", `/sessions/${encodeURIComponent(id)}`); expect(document.querySelector("img")).toBeNull();
});

test("isolated surrogate query uses the actual wire query; malformed identifiers and material scores refuse", async () => {
  const fetcher = vi.fn().mockImplementation((url: string) => reply(new URL(url, "https://fixture.invalid").searchParams.get("q")!, "Unicode result")); vi.stubGlobal("fetch", fetcher);
  expect((await searchSemantic("key-A", "\ud800")).query).toBe("\ufffd");
  for (const [score, id] of [[1.00001, "s/1"], [-1.00001, "s/1"], [0.5, "\ud800"]] as const) {
    fetcher.mockResolvedValueOnce(reply("q", "Malformed", score, id)); await expect(searchSemantic("key-A", "q")).rejects.toMatchObject({ status: 503 });
  }
});
