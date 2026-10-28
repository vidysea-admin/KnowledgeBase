import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { React, installDom } from "../../../.cache/coordination/safe-test-runtime/react-harness.mjs";

const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const dom = installDom();
const { act, fireEvent, render, screen } = dom;
const { cleanup } = webRequire("@testing-library/react");
const { MemoryRouter } = webRequire("react-router-dom");
const { SemanticResults } = await import("../../../apps/web/src/pages/search/semantic/SemanticResults.js");
const { searchSemantic } = await import("../../../apps/web/src/api/search/semanticClient.js");
const { cosineSimilarity } = await import("../../../packages/index/src/vector/cosine.js");
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; localStorage.clear(); });
after(() => dom.cleanup());
const hit = (title: string, score = 0.5, id = "s/1") => ({ chunkId: "c/1", sessionId: id, score, session: { _id: id, title, date: "2026-10-14" } });
const reply = (query: string, title: string, score = 0.5, id = "s/1") => new Response(JSON.stringify({ query, hits: [hit(title, score, id)] }));
const view = (key = "key-A", query = "q") => <MemoryRouter><SemanticResults apiKey={key} query={query} /></MemoryRouter>;
const click = () => fireEvent.click(screen.getByRole("button", { name: "Search semantic matches" }));
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(r => { resolve = r; }), resolve: (value: Response) => resolve(value) }; }

test("real exact-cosine upstream output survives JSON client and session consumer", async () => {
  const score = cosineSimilarity([1, 1, 1], [1, 1, 1]); assert.ok(score > 1);
  globalThis.fetch = async () => reply("q", "Exact match", score);
  render(view()); click();
  assert.equal((await screen.findByRole("link", { name: "Exact match" })).getAttribute("href"), "/sessions/s%2F1");
  assert.ok(screen.getByText(/Retrieval score: 1.000/));
});

test("A-B-A key rotation never admits the first A request into the new A child", async () => {
  const old = deferred(); let calls = 0; globalThis.fetch = async () => ++calls === 1 ? old.promise : reply("q", "Fresh owner");
  const mounted = render(view()); click(); mounted.rerender(view("key-B")); mounted.rerender(view());
  assert.equal(calls, 1); click(); await screen.findByText("Fresh owner");
  await act(async () => { old.resolve(reply("q", "Abandoned private result")); });
  assert.equal(screen.queryByText("Abandoned private result"), null); assert.ok(screen.getByText("Fresh owner"));
});

test("q-new-q navigation does not revive an abandoned identical-query response", async () => {
  const old = deferred(); let calls = 0; globalThis.fetch = async () => ++calls === 1 ? old.promise : reply("q", "Current query");
  const mounted = render(view()); click(); mounted.rerender(view("key-A", "new")); mounted.rerender(view()); click(); await screen.findByText("Current query");
  await act(async () => { old.resolve(reply("q", "Abandoned query")); });
  assert.equal(screen.queryByText("Abandoned query"), null); assert.ok(screen.getByText("Current query"));
});

test("late old-key 401 leaves replacement storage and visible results intact", async () => {
  const old = deferred(); let calls = 0; globalThis.fetch = async () => ++calls === 1 ? old.promise : reply("q", "Replacement evidence");
  localStorage.setItem("lkbApiKey", "key-A"); const mounted = render(view()); click();
  localStorage.setItem("lkbApiKey", "key-B"); mounted.rerender(view("key-B")); click(); await screen.findByText("Replacement evidence");
  await act(async () => { old.resolve(new Response("{}", { status: 401 })); });
  assert.equal(localStorage.getItem("lkbApiKey"), "key-B"); assert.ok(screen.getByText("Replacement evidence")); assert.equal(screen.queryByRole("alert"), null);
});

test("untrusted identifier and title remain inert internal navigation", async () => {
  const id = "//evil.invalid/?q=<script>#turn-evil";
  globalThis.fetch = async () => reply("q", "<img src=x onerror=alert(1)>", 0.5, id); render(view()); click();
  const link = await screen.findByRole("link", { name: "<img src=x onerror=alert(1)>" });
  assert.equal(link.getAttribute("href"), `/sessions/${encodeURIComponent(id)}`); assert.equal(document.querySelector("img"), null);
});

test("surrogate query matches wire query; malformed identifiers and material scores refuse", async () => {
  globalThis.fetch = async (url) => reply(new URL(String(url), "https://fixture.invalid").searchParams.get("q")!, "Unicode result");
  assert.equal((await searchSemantic("key-A", "\ud800")).query, "\ufffd");
  for (const [score, id] of [[1.00001, "s/1"], [-1.00001, "s/1"], [0.5, "\ud800"]] as const) {
    globalThis.fetch = async () => reply("q", "Malformed", score, id); await assert.rejects(searchSemantic("key-A", "q"), { status: 503 });
  }
});
