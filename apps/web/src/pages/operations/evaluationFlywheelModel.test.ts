import { afterEach, expect, test, vi } from "vitest";
import { loadFlywheel, openFlywheel, readFlywheelHead, readRetestResult, retestFlywheel } from "./evaluationFlywheelModel.js";

const head = () => ({ _id: "gap-1", kind: "source-pending", status: "open", flywheel: {
  version: 1, originalEvalRunId: "loss/1", revision: 0, stage: "awaiting-source",
  loss: { question: "Original question", score: { ai: 1, counsellor: 3 }, credibility: "internal" },
} });
const child = () => ({ _id: "child-1", question: "Original question", credibility: "internal",
  aiAnswer: { text: "Insufficient evidence", sources: { internal: [], web: [] } },
  flywheel: { version: 1, originalEvalRunId: "loss/1", gapId: "gap-1", requestId: "attempt-1",
    comparison: "needs-review", index: { sessionId: "session-1", generation: "generation-1" } },
});
const response = (raw: unknown) => new Response(JSON.stringify(raw), { status: 200, headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); });
test("loss snapshot retains original scores and source-pending meaning", () => {
  expect(readFlywheelHead(head(), "loss/1")).toMatchObject({ question: "Original question", stage: "awaiting-source", gapStatus: "open",
    originalScore: { ai: 1, counsellor: 3 }, credibility: "internal" });
});
test.each([null, {}, { ...head(), status: "resolved" }, { ...head(), kind: "recording-pending" },
  { ...head(), flywheel: { ...head().flywheel, originalEvalRunId: "foreign" } },
  { ...head(), flywheel: { ...head().flywheel, revision: -1 } },
  { ...head(), flywheel: { ...head().flywheel, loss: { ...head().flywheel.loss, score: { ai: 3, counsellor: 3 } } } },
  { ...head(), flywheel: { ...head().flywheel, loss: { ...head().flywheel.loss, score: { ai: NaN, counsellor: 3 } } } },
  { ...head(), flywheel: { ...head().flywheel, stage: "retested" } }])("rejects malformed/foreign/false-complete head %j", raw => {
  expect(() => readFlywheelHead(raw, "loss/1")).toThrow("Invalid evaluation recovery response");
});
test("received capture preserves failed index and safe active lease", () => {
  const raw = { ...head(), status: "received", sourceRef: "source-1", flywheel: { ...head().flywheel, stage: "captured",
    capture: { sourceId: "source-1", sessionId: "session-1" },
    failure: { stage: "index", requestId: "attempt-1", at: "2026-10-15T00:00:00Z" },
    lock: { requestId: "attempt-1", expiresAt: "2026-10-15T00:10:00Z" } } };
  expect(readFlywheelHead(raw, "loss/1")).toMatchObject({ gapStatus: "received", stage: "captured", captureSessionId: "session-1",
    failure: { stage: "index" }, lock: { requestId: "attempt-1" } });
  expect(() => readFlywheelHead({ ...raw, sourceRef: "different" }, "loss/1")).toThrow();
});
test("new child remains unscored and needs-review; retry score stays internal", () => {
  const raw = child(), parsed = readRetestResult(raw, "loss/1", "attempt-1");
  expect(parsed).toMatchObject({ childEvalRunId: "child-1", credibility: "internal", comparison: "needs-review", answer: "Insufficient evidence" });
  expect(parsed.score).toBeUndefined();
  expect(readRetestResult({ ...raw, score: { ai: 4, counsellor: 3 } }, "loss/1", "attempt-1")).toMatchObject({ score: { ai: 4, counsellor: 3 }, comparison: "needs-review" });
});
test.each([
  { ...child(), _id: "loss/1" }, { ...child(), credibility: "independent-human" },
  { ...child(), flywheel: { ...child().flywheel, originalEvalRunId: "other" } },
  { ...child(), flywheel: { ...child().flywheel, requestId: "other" } },
  { ...child(), flywheel: { ...child().flywheel, comparison: "improved" } },
  { ...child(), score: { ai: Infinity, counsellor: 3 } },
])("rejects child lineage/approval/score substitution %j", raw => {
  expect(() => readRetestResult(raw, "loss/1", "attempt-1")).toThrow();
});
test("authenticated client encodes original ID and sends exact minimal write bodies", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(head())).mockResolvedValueOnce(response(head())).mockResolvedValueOnce(response(child()));
  vi.stubGlobal("fetch", fetchMock);
  await loadFlywheel("test-key", "loss/1"); await openFlywheel("test-key", "loss/1");
  await retestFlywheel("test-key", "loss/1", "https://example.test/source?private=1", "attempt-1");
  const [inspectCall, gapCall, retestCall] = fetchMock.mock.calls;
  if (!inspectCall || !gapCall || !retestCall) throw new Error("Expected all three authenticated requests");
  expect(inspectCall[0]).toContain("/evaluations/loss%2F1/flywheel");
  expect(gapCall[1].body).toBe("{}");
  expect(JSON.parse(retestCall[1].body)).toEqual({ sourceUrl: "https://example.test/source?private=1", requestId: "attempt-1" });
  expect(fetchMock.mock.calls.every(call => call[1].headers.authorization === "Bearer test-key")).toBe(true);
});
test("invalid local input refuses before transport without echoing private URL", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(loadFlywheel("test-key", " loss ")).rejects.toThrow("exact original");
  await expect(retestFlywheel("test-key", "loss/1", "https://user:secret@example.test", "attempt-1")).rejects.toThrow("without embedded credentials");
  await expect(retestFlywheel("test-key", "loss/1", "file:///private", "attempt-1")).rejects.toThrow();
  await expect(retestFlywheel("test-key", "loss/1", "https://example.test", "request space")).rejects.toThrow("request ID");
  expect(fetchMock).not.toHaveBeenCalled();
});
