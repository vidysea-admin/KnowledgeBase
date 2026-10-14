import { afterEach, describe, expect, test, vi } from "vitest";
import { getTranscriptReview, saveTranscriptReview } from "./transcriptReview.js";
import * as client from "./client.js";
afterEach(() => vi.restoreAllMocks());
const valid = () => ({ sessionId: "s1", revision: "r1", refresh: "complete", turns: [
  { _id: "t1", speakerRef: "spk:0", text: "Text", tStart: 0, tEnd: 10 },
] });
describe("revision-bound review client", () => {
  test("reads bound snapshot and encodes session path", async () => {
    const call = vi.spyOn(client, "apiFetch").mockResolvedValue({ ...valid(), sessionId: "s/1" });
    expect((await getTranscriptReview("k", "s/1")).turns[0]!.text).toBe("Text");
    expect(call).toHaveBeenCalledWith("/sessions/s%2F1/transcript-review", "k");
  });
  test("refuses foreign, duplicate, unordered, malformed corpus or refresh states", async () => {
    const good = valid();
    for (const bad of [ { ...good, sessionId: "foreign" }, { ...good, revision: "" }, { ...good, refresh: "queued" },
      { ...good, turns: [...good.turns, ...good.turns] }, { ...good, turns: [{ ...good.turns[0], tEnd: -1 }] },
      { ...good, turns: [{ ...good.turns[0], tStart: 11, tEnd: 12 }, { ...good.turns[0], _id: "t2" }] } ]) {
      vi.spyOn(client, "apiFetch").mockResolvedValue(bad);
      await expect(getTranscriptReview("k", "s1")).rejects.toThrow("Invalid transcript review response");
    }
  });
  test("sends the loaded precondition and accepts only durable bound commit receipts", async () => {
    const request = { expectedRevision: "r1", reason: "Reviewed", corrections: [{ turnId: "t1", text: "Correct" }] };
    const call = vi.spyOn(client, "apiFetch").mockResolvedValue({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" });
    expect(await saveTranscriptReview("k", "s1", request)).toEqual({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" });
    expect(call).toHaveBeenCalledWith("/sessions/s1/transcript-review", "k", { method: "POST", headers: { "If-Match": '"r1"' }, body: request });
    for (const bad of [ { sessionId: "other", revision: "r2", commit: "committed", refresh: "complete" },
      { sessionId: "s1", revision: "r1", commit: "committed", refresh: "complete" },
      { sessionId: "s1", revision: "r2", commit: "accepted", refresh: "pending" } ]) {
      call.mockResolvedValue(bad); await expect(saveTranscriptReview("k", "s1", request)).rejects.toThrow("Invalid transcript review response");
    }
  });
});
