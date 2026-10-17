import { afterEach, expect, test, vi } from "vitest";
import { resolveNativeEvidence, type NativeSourceLocator } from "./nativeEvidence.js";

const doc: NativeSourceLocator = { kind: "document-page", documentId: "doc/1", sourceId: "source-1", documentSourceId: "immutable-1",
  headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 2, passage: { start: 3, end: 8, sha256: "b".repeat(64) } };
const message: NativeSourceLocator = { kind: "message", sourceId: "chat", revisionHash: "a".repeat(64), threadId: "thread/1",
  messageId: "message/1", passage: { start: 0, end: 5, sha256: "b".repeat(64) } };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

test.each([doc, message])("authenticated exact locator resolution for $kind never sends a tenant or audio field", async sourceLocator => {
  const fetcher = vi.fn().mockResolvedValue(reply({ evidence: { sourceLocator, quote: "hello", title: "Source" } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await resolveNativeEvidence("key", sourceLocator)).toEqual({ sourceLocator, quote: "hello", title: "Source" });
  const [url, init] = fetcher.mock.calls[0]!;
  expect(new URL(url, "http://x").pathname).toBe("/citations/native/resolve");
  expect(init.method).toBe("POST"); expect(init.headers.authorization).toBe("Bearer key");
  expect(JSON.parse(init.body)).toEqual({ sourceLocator });
});
test("invalid, legacy, unencodable and extra authority fields fail before fetch", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const { documentSourceId: _old, ...legacy } = doc;
  for (const value of [legacy, { ...doc, headRevision: 0 }, { ...doc, tenantId: "foreign" }, { ...message, messageId: "\ud800" },
    { ...message, passage: { ...message.passage, start: -1 } }, { ...message, passage: { ...message.passage, end: 5000 } }]) {
    await expect(resolveNativeEvidence("key", value as NativeSourceLocator)).rejects.toMatchObject({ status: 400 });
  }
  await expect(resolveNativeEvidence(null, doc)).rejects.toMatchObject({ status: 401 }); expect(fetcher).not.toHaveBeenCalled();
});
test("mismatched revision/location or malformed quote cannot become evidence", async () => {
  for (const evidence of [{ sourceLocator: { ...doc, headRevision: 2 }, quote: "hello" },
    { sourceLocator: { ...doc, documentSourceId: "other" }, quote: "hello" }, { sourceLocator: doc, quote: "shorter!" },
    { sourceLocator: doc, quote: "     " }, { sourceLocator: doc, quote: "hello", title: {} }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ evidence })));
    await expect(resolveNativeEvidence("key", doc)).rejects.toMatchObject({ status: 503 });
  }
});
test.each([400, 403, 404, 503])("HTTP %s refuses evidence; repeated resolution always rechecks", async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ error: "unavailable" }, status))
    .mockResolvedValueOnce(reply({ evidence: { sourceLocator: doc, quote: "hello" } })); vi.stubGlobal("fetch", fetcher);
  await expect(resolveNativeEvidence("key", doc)).rejects.toMatchObject({ status });
  expect((await resolveNativeEvidence("key", doc)).quote).toBe("hello"); expect(fetcher).toHaveBeenCalledTimes(2);
});
