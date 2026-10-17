import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { getCatalogResources, getCatalogTopic } from "./knowledgeCatalogClient.js";
const mock = vi.fn(); const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); }); afterEach(() => vi.unstubAllGlobals());
test("catalog resource DTO refuses credential/unsafe links and fake verified program claims", async () => {
  for (const url of ["https://user:pass@example.org", "javascript:alert(1)", " https://example.org"]) {
    mock.mockResolvedValue(reply({ resources: [{ id: "r", kind: "url", createdAt: "now", url }], programs: [], truncated: false }));
    await expect(getCatalogResources("k")).rejects.toMatchObject({ status: 503 });
  }
  mock.mockResolvedValue(reply({ resources: [], programs: [{ id: "p", name: "Program", classification: "verified", organization: "unverified", sessions: [] }], truncated: false }));
  await expect(getCatalogResources("k")).rejects.toMatchObject({ status: 503 });
});
test("topic detail must exactly match selected persisted ID and retain nonempty evidence", async () => {
  const value = { id: "a:visas", name: "Visas", classification: "unclassified", sessions: [], documents: [], claims: [{ id: "c", text: "Claim", status: "needs-review", evidence: [] }], withheldClaims: 0, truncated: false };
  mock.mockResolvedValue(reply(value)); await expect(getCatalogTopic("k", "a:visas")).rejects.toMatchObject({ status: 503 });
  mock.mockResolvedValue(reply({ ...value, id: "b:visas", claims: [] })); await expect(getCatalogTopic("k", "a:visas")).rejects.toMatchObject({ status: 503 });
});
