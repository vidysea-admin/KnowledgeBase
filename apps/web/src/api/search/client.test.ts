import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../client.js";
import { searchTranscripts } from "./client.js";

const fixture = () => ({ turnId: "t/1", sessionId: "s/1", score: 0.5,
  turn: { _id: "t/1", tenantId: "toc", sessionId: "s/1", speakerRef: "spk:0", speakerLabel: "Sandeep", tStart: 516, tEnd: 546, text: "Class size is 23." },
  session: { _id: "s/1", tenantId: "toc", title: "Xavier", date: "2026-08-20", status: { transcribe: "done", index: "pending" } } });
const response = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
describe("searchTranscripts existing authenticated route", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  test("encodes Unicode/query punctuation and sends only bearer auth and q/k", async () => {
    const fetcher = vi.fn().mockResolvedValue(response("世界 & size?", [fixture()])); vi.stubGlobal("fetch", fetcher);
    const result = await searchTranscripts("fixture-key", "  世界 & size?  ");
    expect(result.hits[0]?.turn?.text).toBe("Class size is 23.");
    const [url, init] = fetcher.mock.calls[0]!;
    const parsed = new URL(String(url), "http://local.invalid");
    expect(parsed.pathname).toBe("/search"); expect([...parsed.searchParams]).toEqual([["q", "世界 & size?"], ["k", "20"]]);
    expect(init.headers.authorization).toBe("Bearer fixture-key"); expect(init.body).toBeUndefined();
    expect(String(url)).not.toContain("fixture-key");
  });
  test("blank queries, malformed limits and absent auth fail before fetch", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const limit of [0, 51, 1.5, NaN]) await expect(searchTranscripts("key", "size", limit)).rejects.toBeInstanceOf(ApiError);
    await expect(searchTranscripts("key", "  ")).rejects.toMatchObject({ status: 400 });
    await expect(searchTranscripts(null, "size")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("null joins and zero hits remain explicit, without synthetic evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("size", [{ ...fixture(), turn: null, session: null }])).mockResolvedValueOnce(response("absent", [])));
    expect((await searchTranscripts("key", "size")).hits[0]?.turn).toBeNull();
    expect((await searchTranscripts("key", "absent")).hits).toEqual([]);
  });
  test("refuses mismatched IDs, owner joins, bad times, query mismatch and duplicate turns", async () => {
    const a = fixture();
    const bad = [
      { ...a, turn: { ...a.turn, _id: "wrong" } }, { ...a, turn: { ...a.turn, sessionId: "foreign" } },
      { ...a, session: { ...a.session, _id: "wrong" } }, { ...a, session: { ...a.session, tenantId: "foreign" } },
      { ...a, turn: { ...a.turn, tEnd: 1 } }, { ...a, score: "0.5" }, { ...a, turn: undefined },
    ];
    for (const value of bad) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("size", [value]))); await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 503 }); }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("different", [a]))); await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("size", [a, a]))); await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 503 });
  });
  test("401 uses shared invalidation and 403 preserves the key", async () => {
    localStorage.setItem("lkbApiKey", "key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 403 }); expect(localStorage.getItem("lkbApiKey")).toBe("key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 401 }); expect(localStorage.getItem("lkbApiKey")).toBeNull();
  });
});
