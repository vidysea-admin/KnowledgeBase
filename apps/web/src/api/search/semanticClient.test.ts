import { afterEach, expect, test, vi } from "vitest";
import { searchSemantic, inspectSemanticIndex } from "./semanticClient.js";

const hit = () => ({ chunkId: "c/1", sessionId: "s/1", score: -0.25, session: { _id: "s/1", title: "世界", date: "2026-10-14" } });
const reply = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

test("readiness is an authenticated query-free request and rejects fabricated readiness counts", async () => {
  const value = { status: "ready", total: 2, bound: 2, legacy: 0, stale: 0, invalidVectors: 0, invalidModels: 0,
    modelCount: 1, dimensionCount: 1, uncoveredTurns: 0, pendingGaps: 0, queryModelCompatibility: "checked-on-search" };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher); expect((await inspectSemanticIndex("key")).status).toBe("ready");
  const [url, request] = fetcher.mock.calls[0]!; expect(String(url)).toContain("/search/semantic/readiness");
  expect(String(url)).not.toContain("?q="); expect(request.headers.authorization).toBe("Bearer key");
  for (const malformed of [{ ...value, bound: 1 }, { ...value, total: -1 }, { ...value, modelCount: 2 },
    { ...value, status: "empty" }, { ...value, queryModelCompatibility: "guaranteed" },
    { ...value, uncoveredTurns: 1 }, { ...value, pendingGaps: 1 }, { ...value, total: Number.MAX_SAFE_INTEGER + 1 }]) {
    fetcher.mockResolvedValue(new Response(JSON.stringify(malformed), { headers: { "content-type": "application/json" } }));
    await expect(inspectSemanticIndex("key")).rejects.toMatchObject({ status: 503 });
  }
});

test("chunk mode accepts distinct same-source passages only with complete consistent evidence", async () => {
  const passage = { ...hit(), turnIds: ["t/1"], tStart: 3, tEnd: 9,
    quote: { turnId: "t/1", charStart: 4, charEnd: 9, text: "quote", speakerRef: "expert", tStart: 4, tEnd: 8 } };
  const wire = (hits: unknown[], mode: unknown = "chunks") => new Response(JSON.stringify({ query: "q", mode, hits }), { headers: { "content-type": "application/json" } });
  const fetcher = vi.fn().mockResolvedValue(wire([passage, { ...passage, chunkId: "c/2" }])); vi.stubGlobal("fetch", fetcher);
  expect((await searchSemantic("key", "q", 20, "chunks")).hits).toHaveLength(2);
  fetcher.mockResolvedValue(wire([{ ...passage, sourceSpans: [{ turnId: "t/1", charStart: 0, charEnd: 10 }], rawTextSha256: "a".repeat(64) }]));
  expect((await searchSemantic("key", "q", 20, "chunks")).hits[0]!.sourceSpans).toHaveLength(1);
  expect(new URL(String(fetcher.mock.calls[0]![0]), "http://local.invalid").searchParams.get("mode")).toBe("chunks");
  const bad = [hit(), { ...passage, session: null }, { ...passage, turnIds: [] }, { ...passage, turnIds: ["t/1", "t/1"] },
    { ...passage, quote: { ...passage.quote, turnId: "foreign" } },
    { ...passage, quote: { ...passage.quote, charStart: -1 } },
    { ...passage, quote: { ...passage.quote, charEnd: 10 } },
    { ...passage, quote: { ...passage.quote, text: " " } },
    { ...passage, quote: { ...passage.quote, text: "\ud800abcd" } },
    { ...passage, quote: { ...passage.quote, speakerRef: " " } },
    { ...passage, quote: { ...passage.quote, tEnd: 10 } },
    { ...passage, quote: { ...passage.quote, occurredAt: "yesterday" } },
    { ...passage, sourceSpans: [{ turnId: "t/1", charStart: 10, charEnd: 20 }], rawTextSha256: "a".repeat(64) },
    { ...passage, sourceSpans: [{ turnId: "t/1", charStart: 0, charEnd: 20 }], rawTextSha256: "wrong" },
    { ...passage, tEnd: 2 }, { ...passage, tStart: null },
    { ...passage, quote: { ...passage.quote, turnId: "\ud800" }, turnIds: ["\ud800"] }];
  for (const value of bad) {
    fetcher.mockResolvedValue(wire([value]));
    await expect(searchSemantic("key", "q", 20, "chunks")).rejects.toMatchObject({ status: 503 });
  }
  fetcher.mockResolvedValue(new Response(JSON.stringify({ query: "q", hits: [passage] }), { headers: { "content-type": "application/json" } }));
  await expect(searchSemantic("key", "q", 20, "chunks")).rejects.toMatchObject({ status: 503 });
});

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
