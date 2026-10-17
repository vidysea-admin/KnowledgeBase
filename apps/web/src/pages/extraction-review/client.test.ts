import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportExtractionReview, getExtractionReview, saveExtractionReview, type ExtractionReviewItem } from "./client.js";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../api/client.js", () => ({ apiFetch: mocks.fetch }));
beforeEach(() => vi.clearAllMocks());
describe("authenticated extraction review transport", () => {
  it("uses existing authenticated read and authoritative export routes", async () => {
    mocks.fetch.mockResolvedValue({ synthetic: true });
    await getExtractionReview("test-key"); await exportExtractionReview("test-key");
    expect(mocks.fetch.mock.calls).toEqual([["/extraction-review", "test-key"], ["/extraction-review/export", "test-key"]]);
  });
  it("sends one exact native option with current CAS and no tenant, actor or fabricated audit", async () => {
    const item = { id: "synthetic/item", revision: 7, inputSha256: "a".repeat(64) } as ExtractionReviewItem;
    const label = { supported: false, reason: "contradicted" };
    await saveExtractionReview("test-key", item, label, "Synthetic individual judgment");
    expect(mocks.fetch).toHaveBeenCalledWith("/extraction-review/items/synthetic%2Fitem", "test-key", { method: "POST", body: {
      expectedRevision: 7, inputSha256: "a".repeat(64), label, affirmIndividualReview: true, rationale: "Synthetic individual judgment",
    } });
  });
  it("propagates authority refusal without inventing saved state", async () => {
    mocks.fetch.mockRejectedValue(new Error("extraction_review_forbidden"));
    await expect(getExtractionReview("test-key")).rejects.toThrow("extraction_review_forbidden");
  });
});
