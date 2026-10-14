import { afterEach, expect, test, vi } from "vitest";
import { searchSemantic } from "./semanticClient.js";

const hit = () => ({ chunkId: "c/1", sessionId: "s/1", score: -0.25, session: { _id: "s/1", title: "世界", date: "2026-10-14" } });
const reply = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

test("authenticated bounded request encodes query once and accepts negative cosine scores", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply("世界 & size?", [hit()])); vi.stubGlobal("fetch", fetcher);
  const response = await searchSemantic("fixture-key", " 世界 & size? ", 5);
  expect(response.hits[0]?.score).toBe(-0.25);
  const [url, init] = fetcher.mock.calls[0]!; const parsed = new URL(String(url), "http://local.invalid");
  expect(parsed.pathname).toBe("/search/semantic"); expect([...parsed.searchParams]).toEqual([["q", "世界 & size?"], ["k", "5"]]);
  expect(init.headers.authorization).toBe("Bearer fixture-key"); expect(init.body).toBeUndefined(); expect(String(url)).not.toContain("fixture-key");
});
test("blank/oversized queries, invalid bounds and missing auth cause no network call", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const query of [" ", "a".repeat(513)]) await expect(searchSemantic("key", query)).rejects.toMatchObject({ status: 400 });
  for (const k of [0, 51, 1.5, NaN]) await expect(searchSemantic("key", "q", k)).rejects.toMatchObject({ status: 400 });
  await expect(searchSemantic(null, "q")).rejects.toMatchObject({ status: 401 }); expect(fetcher).not.toHaveBeenCalled();
});
test("null joins and empty results are accepted without synthesizing source evidence", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("q", [{ ...hit(), session: null }])).mockResolvedValueOnce(reply("q", [])));
  expect((await searchSemantic("key", "q")).hits[0]?.session).toBeNull(); expect((await searchSemantic("key", "q")).hits).toEqual([]);
});
test("preserves endpoint floating-point roundoff near cosine endpoints", async () => {
  for (const score of [1.0000000000000002, -1.0000000000000002]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", [{ ...hit(), score }])));
    expect((await searchSemantic("key", "q")).hits[0]?.score).toBe(score);
  }
});
test("refuses malformed scores, inconsistent joins, duplicates and wrong query", async () => {
  const bad = [
    { ...hit(), score: "0.5" }, { ...hit(), score: 1.01 }, { ...hit(), score: -1.01 },
    { ...hit(), score: null }, { ...hit(), session: undefined }, { ...hit(), session: { ...hit().session, _id: "wrong" } },
    { ...hit(), chunkId: " " }, { ...hit(), sessionId: null }, { ...hit(), sessionId: "\ud800", session: null },
  ];
  for (const value of bad) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", [value]))); await expect(searchSemantic("key", "q")).rejects.toMatchObject({ status: 503 }); }
  for (const hits of [[hit(), hit()], [hit(), { ...hit(), chunkId: "c/2" }], [hit(), { ...hit(), sessionId: "s/2", session: null }]]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", hits))); await expect(searchSemantic("key", "q")).rejects.toMatchObject({ status: 503 });
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("wrong", [hit()]))); await expect(searchSemantic("key", "q")).rejects.toMatchObject({ status: 503 });
});
test("refuses more rows than requested and preserves shared auth invalidation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("q", [hit(), { ...hit(), chunkId: "c/2", sessionId: "s/2", session: null }])));
  await expect(searchSemantic("key", "q", 1)).rejects.toMatchObject({ status: 503 });
  localStorage.setItem("lkbApiKey", "key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  await expect(searchSemantic("key", "q")).rejects.toMatchObject({ status: 401 }); expect(localStorage.getItem("lkbApiKey")).toBeNull();
});
