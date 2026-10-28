import { afterEach, expect, test, vi } from "vitest";
import * as transport from "../../api/client.js";
import { directAnswer } from "./client.js";

const payload = () => ({ id: "older", createdAt: "2026-10-14", query: "Fee?", questionClass: "fees", reason: "supported", replayAvailable: true,
  evidenceMode: false, filters: { sessionIds: ["s1"], sources: "internal", topicRefs: ["topic:fees"] }, result: {
    runId: "older", answer: "Fee is 100.", state: "allowed", verdict: "correct", web_used: false, insufficient_coverage: false,
    candidateDigest: "candidate", evidenceDigest: "evidence", policy: null, sources: { internal: [], web: [] },
    confidence: { basis: "retrieval", score: null, calibrated: false }, auditLog: [], sourceEvidence: [], followUps: [],
  } });
afterEach(() => vi.restoreAllMocks());
test("direct answer validates identity and exact original replay inputs", async () => {
  const fetch = vi.spyOn(transport, "apiFetch").mockResolvedValue(payload());
  const item = await directAnswer("key", "older");
  expect(fetch).toHaveBeenCalledWith("/answer-history/older", "key"); expect(item.filters).toEqual(payload().filters); expect(item.evidenceMode).toBe(false);
});
test("direct answer refuses legacy defaults, forged identity, malformed inputs and held candidate leakage", async () => {
  const fetch = vi.spyOn(transport, "apiFetch");
  for (const bad of [{ ...payload(), replayAvailable: false }, { ...payload(), id: "foreign" },
    { ...payload(), filters: { sessionIds: [], sources: "all", topicRefs: "forged" } },
    { ...payload(), result: { ...payload().result, runId: "foreign" } },
    { ...payload(), result: { ...payload().result, state: "review" } }]) {
    fetch.mockResolvedValue(bad); await expect(directAnswer("key", "older")).rejects.toBeInstanceOf(transport.ApiError);
  }
  fetch.mockClear(); await expect(directAnswer(null, "older")).rejects.toBeInstanceOf(transport.ApiError); expect(fetch).not.toHaveBeenCalled();
});
