import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { deleteSavedCollection, writeSavedCollection } from "./collectionsClient.js";
const mock = vi.fn(); const id = "a".repeat(64); const members = [{ kind: "document" as const, id: "doc" }];
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); }); afterEach(() => vi.unstubAllGlobals());
test("saved update response must match exact target ID and requested members", async () => {
  for (const patch of [{ id: "b".repeat(64) }, { members: [] }, { members: [{ kind: "document", id: "different" }] }]) {
    mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id, title: "Admissions", revision: 2, members, ...patch }) });
    await expect(writeSavedCollection("k", id, "Admissions", members, 1)).rejects.toMatchObject({ status: 503 });
  }
  mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id, title: "Admissions", revision: 2, members }) });
  await expect(writeSavedCollection("k", id, "Admissions", members, 1)).resolves.toBeUndefined();
});
test("delete success must carry actual durable deletion acknowledgment", async () => {
  const collection = { id, title: "Admissions", revision: 2, updatedAt: "now", members };
  mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: false }) });
  await expect(deleteSavedCollection("k", collection)).rejects.toMatchObject({ status: 503 });
});
