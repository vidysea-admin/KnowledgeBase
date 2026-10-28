import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDom, React } from "../../../.cache/coordination/safe-test-runtime/react-harness.mjs";
const harness = installDom();
const { render, screen, fireEvent, waitFor, act } = harness;
const { TranscriptReview } = await import("../../../apps/web/src/pages/transcript-review/TranscriptReview.js");
const originalFetch = globalThis.fetch;
afterEach(() => { harness.cleanupTesting(); globalThis.fetch = originalFetch; });
after(() => harness.cleanup());
const snapshot = (revision = "r1", text = "Original") => ({ sessionId: "s1", revision, refresh: "pending", turns: [
  { _id: "t1", tStart: 0, tEnd: 10, speakerRef: "spk:0", text },
] });
const response = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
function wireResponses(...replies: unknown[]) {
  const calls: Array<{ url: string; options: any }> = [];
  globalThis.fetch = (async (url: any, options: any) => {
    calls.push({ url: String(url), options });
    const reply = replies.shift();
    if (typeof reply === "function") return reply();
    return response(reply);
  }) as any;
  return calls;
}
async function edit() {
  fireEvent.change(await screen.findByLabelText("Corrected text"), { target: { value: "Reviewed" } });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Recording checked" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
}
test("real client sends revision precondition and editor consumes committed canonical revision", async () => {
  const calls = wireResponses(snapshot(), { sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" }, snapshot("r2", "Reviewed"));
  render(<TranscriptReview apiKey="owned-key" sessionId="s1" onCommitted={() => { throw new Error("consumer failed"); }} />);
  await edit();
  await waitFor(() => assert.equal((screen.getByLabelText("Corrected text") as HTMLTextAreaElement).value, "Reviewed"));
  const { url, options } = calls[1]!;
  assert.match(url, /\/sessions\/s1\/transcript-review$/);
  assert.equal(options.method, "POST"); assert.equal(options.headers["If-Match"], '"r1"');
  assert.equal(options.headers.authorization, "Bearer owned-key");
  assert.deepEqual(JSON.parse(options.body), { expectedRevision: "r1", reason: "Recording checked", corrections: [{ turnId: "t1", text: "Reviewed" }] });
  assert.match(screen.getByRole("status").textContent!, /Transcript saved\. Knowledge refresh pending/);
  assert.equal(screen.queryByRole("alert"), null);
});
test("real client to editor refuses stale post-commit GET without losing commit truth", async () => {
  wireResponses(snapshot(), { sessionId: "s1", revision: "r2", commit: "committed", refresh: "failed" }, snapshot());
  render(<TranscriptReview apiKey="key" sessionId="s1" />); await edit();
  const notice = await screen.findByRole("alert");
  assert.match(notice.textContent!, /Transcript saved\. Knowledge refresh failed/);
  assert.match(notice.textContent!, /Reload did not return the committed revision/);
  assert.equal(screen.queryByLabelText("Corrected text"), null);
  assert.equal(screen.queryByRole("button", { name: "Save reviewed changes" }), null);
});
test("unmount invalidates real in-flight receipt, with no callback or canonical reload", async () => {
  let release!: (v: ReturnType<typeof response>) => void;
  const calls = wireResponses(snapshot(), () => new Promise(r => { release = r; }));
  let callbacks = 0;
  const view = render(<TranscriptReview apiKey="key" sessionId="s1" onCommitted={() => { callbacks++; }} />);
  await edit(); view.unmount();
  await act(async () => { release(response({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "complete" })); });
  assert.equal(callbacks, 0); assert.equal(calls.length, 2);
});
test("a synchronous unmount callback cannot start a canonical reload", async () => {
  const calls = wireResponses(snapshot(), { sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" }, snapshot("r2", "Reviewed"));
  let view!: ReturnType<typeof render>; let callbacks = 0;
  view = render(<TranscriptReview apiKey="key" sessionId="s1" onCommitted={() => { callbacks++; view.unmount(); }} />);
  await edit(); await waitFor(() => assert.equal(callbacks, 1));
  assert.equal(calls.length, 2);
});
test("real mapping wire names only the chosen block and requires reason", async () => {
  const value = snapshot(); value.turns.push(
    { _id: "t2", tStart: 10, tEnd: 20, speakerRef: "spk:0", text: "Second" },
    { _id: "t3", tStart: 20, tEnd: 30, speakerRef: "spk:1", text: "Other" },
    { _id: "t4", tStart: 30, tEnd: 40, speakerRef: "spk:0", text: "Repeated" });
  const calls = wireResponses(value, { sessionId: "s1", revision: "r2", commit: "committed", refresh: "pending" }, { ...value, revision: "r2" });
  render(<TranscriptReview apiKey="key" sessionId="s1" />); await screen.findByLabelText("Block end");
  fireEvent.change(screen.getByLabelText("Block end"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Speaker reference"), { target: { value: "person:owner" } });
  fireEvent.change(screen.getByLabelText("Speaker name"), { target: { value: "Owner" } });
  assert.equal((screen.getByRole("button", { name: "Save reviewed changes" }) as HTMLButtonElement).disabled, true);
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Intro checked" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed changes" }));
  await waitFor(() => assert.equal(calls.length, 3));
  assert.deepEqual(JSON.parse(calls[1]!.options.body), { expectedRevision: "r1", reason: "Intro checked", corrections: [],
    mapping: { turnIds: ["t1", "t2"], speakerRef: "person:owner", speakerLabel: "Owner" } });
});
test("an invalid durable receipt retains draft and disables unsafe retry", async () => {
  wireResponses(snapshot(), { sessionId: "foreign", revision: "r2", commit: "committed", refresh: "complete" });
  render(<TranscriptReview apiKey="key" sessionId="s1" />); await edit();
  assert.match((await screen.findByRole("alert")).textContent!, /Save could not be confirmed\. Your draft is retained/);
  assert.equal((screen.getByLabelText("Corrected text") as HTMLTextAreaElement).value, "Reviewed");
  assert.equal((screen.getByRole("button", { name: "Save reviewed changes" }) as HTMLButtonElement).disabled, true);
});
test("a replaced key/session hides previous data and ignores its late receipt", async () => {
  let release!: (v: ReturnType<typeof response>) => void;
  const next = { ...snapshot(), sessionId: "s2" }; next.turns[0]!.text = "Next identity";
  const calls = wireResponses(snapshot(), () => new Promise(r => { release = r; }), next);
  let callbacks = 0;
  const view = render(<TranscriptReview apiKey="a" sessionId="s1" onCommitted={() => { callbacks++; }} />); await edit();
  view.rerender(<TranscriptReview apiKey="b" sessionId="s2" onCommitted={() => { callbacks++; }} />);
  assert.equal(screen.queryByLabelText("Corrected text"), null);
  await screen.findByText("Current text: Next identity");
  await act(async () => { release(response({ sessionId: "s1", revision: "r2", commit: "committed", refresh: "complete" })); });
  assert.equal(callbacks, 0); assert.equal(calls.length, 3);
  assert.equal((screen.getByLabelText("Corrected text") as HTMLTextAreaElement).value, "Next identity");
  assert.equal(screen.queryByRole("status"), null);
});
