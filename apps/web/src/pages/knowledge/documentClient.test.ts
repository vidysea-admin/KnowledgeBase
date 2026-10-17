import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { importPageDocument, saveDocumentHighlight } from "./documentClient.js";
const mock = vi.fn(); const version = "a".repeat(64); const id = `tenant-a:${version}`;
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); }); afterEach(() => vi.unstubAllGlobals());
test("malformed import success cannot establish source/version/pages", async () => {
  const file = { name: "sample.pdf", size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
  mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id, sourceId: "different", version, pageCount: 1 }) });
  await expect(importPageDocument("k", file, "Sample")).rejects.toMatchObject({ status: 503 });
});
test("malformed highlight success must not change page/quote or promote verification", async () => {
  const doc = { id, sourceId: id, version, title: "Sample", format: "pdf" as const, pageCount: 1 };
  for (const patch of [{ pageNumber: 2 }, { quote: "Different" }, { verification: "verified" }]) {
    mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ highlight: { id: "b".repeat(64), pageNumber: 1, quote: "Exact", text: "Exact", verification: "unverified", ...patch } }) });
    await expect(saveDocumentHighlight("k", doc, 1, "Exact")).rejects.toMatchObject({ status: 503 });
  }
});
