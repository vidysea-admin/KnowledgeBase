import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { installDom } from "../../../.cache/coordination/safe-test-runtime/react-harness.mjs";
const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));

test("real grounded component and client: literal evidence, uncertainty, tenant-session changes and failure", async () => {
  const ui = installDom();
  const previousFetch = globalThis.fetch;
  const { MemoryRouter } = webRequire("react-router-dom");
  const { GroundedContentPanel } = await import("../../../apps/web/src/pages/sessions/grounded/GroundedContentPanel.tsx");
  const ref = { turnId: "turn 1", sessionId: "s", quote: "Keep evidence.", available: true, tStart: 12, tEnd: 19, speaker: "Expert" };
  const data = { sessionId: "s", notes: [{ id: "n", kind: "insight", text: "Keep evidence.", origin: "screen-ocr", verification: "unverified", evidence: [ref] }],
    qa: [{ id: "q", question: "Question?", answer: null, status: "unanswered", questionEvidence: [ref], answerEvidence: [] }], claims: [] };
  const calls = [];
  let respond = async () => new Response(JSON.stringify(data), { status: 200 });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  const element = (apiKey, sessionId) => ui.React.createElement(MemoryRouter, {}, ui.React.createElement(GroundedContentPanel, { apiKey, sessionId }));
  try {
    const view = ui.render(element("key", "s"));
    await ui.screen.findByText("insight · Screen text");
    assert.equal(ui.screen.getByText("Unanswered in the source").textContent, "Unanswered in the source");
    assert.equal(ui.screen.getAllByRole("link")[0].getAttribute("href"), "/sessions/s#turn-turn%201");
    assert.equal(calls[0].options.headers.authorization, "Bearer key");
    assert.ok(calls[0].url.endsWith("/sessions/s/grounded-content"));
    respond = async () => new Response(JSON.stringify({ ...data, sessionId: "other", qa: [], notes: [{ ...data.notes[0], evidence: [{ ...ref, available: false }] }] }), { status: 200 });
    view.rerender(element("key", "other"));
    await ui.screen.findByText("Source unavailable or quote could not be resolved");
    assert.equal(ui.screen.queryByRole("link"), null);
    let finish;
    respond = () => new Promise((resolve) => { finish = resolve; });
    view.rerender(element("old", "old-session"));
    await ui.waitFor(() => assert.ok(finish));
    respond = async () => new Response(JSON.stringify({ sessionId: "new", notes: [], qa: [], claims: [] }), { status: 200 });
    view.rerender(element("new-key", "new"));
    await ui.screen.findByText("No grounded notes or Q&A published for this session.");
    await ui.act(async () => { finish(new Response(JSON.stringify(data), { status: 200 })); });
    assert.equal(ui.screen.queryByText("insight · Screen text"), null);
    assert.equal(calls.at(-1).options.headers.authorization, "Bearer new-key");
    respond = async () => new Response(JSON.stringify({ error: "unavailable", message: "Read unavailable" }), { status: 503 });
    view.rerender(element("new-key", "failed"));
    assert.equal((await ui.screen.findByRole("alert")).textContent, "Read unavailable");
  } finally { globalThis.fetch = previousFetch; ui.cleanup(); }
});
