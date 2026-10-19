import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptAiLabel, acceptHighConfidence, getLabelReview, overrideLabel, type LabelRow } from "./client.js";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../api/client.js", () => ({ apiFetch: mocks.fetch }));
beforeEach(() => vi.clearAllMocks());
const row = { id: "u22:c/01", revision: 3, inputSha256: "a".repeat(64) } as LabelRow;
describe("label review transport", () => {
  it("reads the view with the authenticated wrapper", async () => {
    await getLabelReview("k"); expect(mocks.fetch).toHaveBeenCalledWith("/label-review", "k");
  });
  it("accept sends only revision and input hash: no label, source, reviewer or humanGold", async () => {
    await acceptAiLabel("k", row);
    expect(mocks.fetch).toHaveBeenCalledWith("/label-review/items/u22%3Ac%2F01/accept", "k", { method: "POST", body: { expectedRevision: 3, inputSha256: "a".repeat(64) } });
  });
  it("override sends the label and a trimmed note only when given", async () => {
    await overrideLabel("k", row, "unsupported", " why ");
    expect(mocks.fetch).toHaveBeenLastCalledWith("/label-review/items/u22%3Ac%2F01/override", "k", { method: "POST", body: { expectedRevision: 3, inputSha256: "a".repeat(64), label: "unsupported", note: "why" } });
    await overrideLabel("k", row, 0.5, "  ");
    expect(mocks.fetch).toHaveBeenLastCalledWith("/label-review/items/u22%3Ac%2F01/override", "k", { method: "POST", body: { expectedRevision: 3, inputSha256: "a".repeat(64), label: 0.5 } });
  });
  it("bulk accept optionally scopes to a set", async () => {
    await acceptHighConfidence("k"); await acceptHighConfidence("k", "t022");
    expect(mocks.fetch.mock.calls).toEqual([["/label-review/accept-high-confidence", "k", { method: "POST", body: {} }], ["/label-review/accept-high-confidence", "k", { method: "POST", body: { set: "t022" } }]]);
  });
  it("propagates refusal without inventing state", async () => {
    mocks.fetch.mockRejectedValue(new Error("label_review_forbidden"));
    await expect(getLabelReview("k")).rejects.toThrow("label_review_forbidden");
  });
});
