import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../client.js";
import { searchTranscripts } from "./client.js";
import type { NativeSourceLocator } from "../nativeEvidence.js";

const fixture = () => ({ turnId: "t/1", sessionId: "s/1", score: 0.5,
  turn: { _id: "t/1", tenantId: "toc", sessionId: "s/1", speakerRef: "spk:0", speakerLabel: "Sandeep", tStart: 516, tEnd: 546, text: "Class size is 23." },
  session: { _id: "s/1", tenantId: "toc", title: "Xavier", date: "2026-08-20", status: { transcribe: "done", index: "pending" } } });
const response = (query: string, hits: unknown[]) => new Response(JSON.stringify({ query, hits }), { headers: { "content-type": "application/json" } });
describe("searchTranscripts existing authenticated route", () => {
  const nativeSourceLocator: NativeSourceLocator = { kind: "document-page", documentId: "doc", sourceId: "stable", documentSourceId: "immutable",
    headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 2, passage: { start: 0, end: 5, sha256: "b".repeat(64) } };
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  test("mixed native and legacy hits preserve real identities without fabricated transcript fields", async () => {
    const native = { nativeSourceLocator, score: 0.5, title: "Document title" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: "size", hits: [fixture(), native], nativeTruncated: true }), { headers: { "content-type": "application/json" } })));
    const result = await searchTranscripts("key", "size"); expect(result.hits[1]).toEqual(native); expect(result.nativeTruncated).toBe(true);
    expect(result.hits[1]).not.toHaveProperty("sessionId"); expect(result.hits[1]).not.toHaveProperty("turnId");
  });
  test("native locator malformation, duplicate identity and invented transcript fields refuse", async () => {
    const native = { nativeSourceLocator, score: 1 };
    for (const hits of [[{ ...native, nativeSourceLocator: { ...nativeSourceLocator, headRevision: 0 } }],
      [{ ...native, turnId: "fake" }], [{ ...native, quote: "unverified" }], [native, native]]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("size", hits)));
      await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 503 });
    }
  });
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
  test("rejects unencodable session and turn identifiers before source links can render", async () => {
    const a = fixture();
    for (const badId of ["\ud800", "\udfff", "s\ud800/1"]) {
      for (const value of [
        { ...a, sessionId: badId, turn: { ...a.turn, sessionId: badId }, session: { ...a.session, _id: badId } },
        { ...a, turnId: badId, turn: { ...a.turn, _id: badId } },
      ]) {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("size", [value])));
        await expect(searchTranscripts("key", "size")).rejects.toMatchObject({ status: 503 });
      }
    }
    const valid = "世界/😀";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("size", [{ ...a, sessionId: valid,
      turn: { ...a.turn, sessionId: valid }, session: { ...a.session, _id: valid } }])));
    expect((await searchTranscripts("key", "size")).hits[0]?.sessionId).toBe(valid);
  });
  test("lone high/low surrogate queries refuse with ApiError 400 before fetch, never a raw URIError", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const q of ["\uD800", "a\uD83Db", "\uDC00", "x\uDE00y", "ok \uD800", "\uDC00\uD800"]) {
      const error = await searchTranscripts("key", q).then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError); expect(error).not.toBeInstanceOf(URIError);
      expect(error).toMatchObject({ status: 400 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("well-formed surrogate pairs (astral characters) still encode and search", async () => {
    const q = "\u{1F600} \u{20BB7}"; const fetcher = vi.fn().mockResolvedValue(response(q, [])); vi.stubGlobal("fetch", fetcher);
    expect((await searchTranscripts("key", q)).hits).toEqual([]);
    expect(new URL(String(fetcher.mock.calls[0]![0]), "http://local.invalid").searchParams.get("q")).toBe(q);
  });
});
