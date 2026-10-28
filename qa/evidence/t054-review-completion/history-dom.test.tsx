import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDom, React } from "../../../.cache/coordination/safe-test-runtime/react-harness.mjs";
const harness = installDom();
const { render, screen, fireEvent, waitFor, act } = harness;
const { ReviewHistory } = await import("../../../apps/web/src/pages/transcript-review/ReviewHistory.js");
const { TranscriptReview } = await import("../../../apps/web/src/pages/transcript-review/TranscriptReview.js");
const originalFetch = globalThis.fetch;
afterEach(() => { harness.cleanupTesting(); globalThis.fetch = originalFetch; });
after(() => harness.cleanup());
const response = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
const audit = { sessionId: "s1", revisions: [{ revision: "r1", parentRevision: "base-r0", actorRef: "apikey:trusted", reviewedAt: "2026-10-14T10:00:00Z", reason: "Reviewed <b>recording</b>",
  changes: [{ turnId: "t1", before: { text: "Original", speakerRef: "spk:0" }, after: { text: "Corrected", speakerRef: "person:mapped", speakerLabel: "<img onerror=alert(1)>" } }] }] };

test("real history client sends bearer and renders trusted before/after/reason as literal text", async () => {
  const calls: any[] = [];
  globalThis.fetch = (async (url, options) => { calls.push({ url: String(url), options }); return response(audit); }) as any;
  const view = render(<ReviewHistory apiKey="owned" sessionId="s1" revision="r1" refresh="complete" disabled={false} onRefreshed={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Show review history" }));
  await screen.findByText("Reason: Reviewed <b>recording</b>");
  assert.equal(calls[0].options.headers.authorization, "Bearer owned"); assert.match(calls[0].url, /\/history$/);
  assert.equal(view.container.querySelector("img,b"), null); assert.match(view.container.textContent!, /Before: Original/); assert.match(view.container.textContent!, /After: Corrected/);
});
test("refresh uses loaded revision and failed retry honest completion invokes reload", async () => {
  let calls = 0, reloads = 0;
  globalThis.fetch = (async (_url, options: any) => {
    calls++; assert.equal(options.headers["If-Match"], '"r1"'); assert.equal(options.method, "POST");
    return response({ sessionId: "s1", revision: "r1", refresh: "complete", completed: ["claims", "session-page", "chunks", "tree", "graph"] });
  }) as any;
  render(<ReviewHistory apiKey="owned" sessionId="s1" revision="r1" refresh="failed" disabled={false} onRefreshed={() => { reloads++; throw new Error("consumer failed"); }} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry knowledge refresh" }));
  await waitFor(() => assert.equal(reloads, 1)); assert.equal(calls, 1); assert.match(screen.getByRole("status").textContent!, /Knowledge refresh complete/);
  assert.equal(screen.queryByRole("alert"), null);
});
test("late history cannot expose old identity and late refresh after unmount cannot reload", async () => {
  let release!: (value: any) => void;
  globalThis.fetch = (() => new Promise((r) => { release = r; })) as any;
  let reloads = 0;
  const view = render(<ReviewHistory apiKey="a" sessionId="s1" revision="r1" refresh="pending" disabled={false} onRefreshed={() => { reloads++; }} />);
  fireEvent.click(screen.getByRole("button", { name: "Show review history" }));
  view.rerender(<ReviewHistory apiKey="b" sessionId="s2" revision="r2" refresh="pending" disabled={false} onRefreshed={() => { reloads++; }} />);
  await act(async () => { release(response(audit)); });
  assert.equal(screen.queryByText("Reason: Reviewed <b>recording</b>"), null);
  fireEvent.click(screen.getByRole("button", { name: "Refresh knowledge" })); view.unmount();
  await act(async () => { release(response({ sessionId: "s2", revision: "r2", refresh: "complete", completed: ["claims"] })); });
  assert.equal(reloads, 0);
});
test("entire source disappearance remains visible with history and actionable refresh retry", async () => {
  globalThis.fetch = (async () => response({ sessionId: "s1", revision: "r1", refresh: "failed", turns: [], orphanedTurnIds: ["missing-turn"] })) as any;
  render(<TranscriptReview apiKey="owned" sessionId="s1" />);
  await screen.findByText("No transcript turns to review.");
  assert.match(screen.getByRole("alert").textContent!, /missing-turn/);
  assert.ok(screen.getByRole("button", { name: "Show review history" })); assert.ok(screen.getByRole("button", { name: "Retry knowledge refresh" }));
  assert.equal(screen.queryByRole("button", { name: "Save reviewed changes" }), null);
});
