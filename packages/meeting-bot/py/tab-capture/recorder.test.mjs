import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { makeRecorderWorld, flush, deferred, okResponse, badResponse } from "./tab-capture-harness.mjs";

const T = { timeout: 20000 };
const unhandled = []; process.on("unhandledRejection", (e) => unhandled.push(e));
const seqOf = (c) => Number(new URL(c.url).searchParams.get("seq"));
const hold = () => {
  const pending = [];
  const handler = (c) => {
    if (!c.url.includes("/chunk")) return c.url.endsWith("/control") ? okResponse({ stop: false }) : okResponse();
    const d = deferred(); pending.push({ c, d }); return d.promise;
  };
  return { pending, handler };
};
const failChunks = (c) => { if (c.url.includes("/chunk")) throw new Error("down"); return okResponse({ stop: false }); };

test("P1/P7 start: capture-started, control polling, destination is only the configured endpoint with bearer", T, async () => {
  const w = makeRecorderWorld();
  assert.equal((await w.begin()).ok, true);
  const {mediaStartedAt, ...startEvent} = w.events()[0];
  assert.deepEqual(startEvent, { event: "capture-started", mimeType: "video/webm;codecs=vp8,opus" });
  assert.ok(Number.isFinite(mediaStartedAt) && mediaStartedAt > 0);
  assert.equal(w.recorder().timeslice, 2000);
  await w.timers.tick();
  for (const c of w.calls) { assert.ok(c.url.startsWith("http://127.0.0.1:4321/")); assert.equal(c.headers.Authorization, "Bearer tok-abc"); assert.equal(c.method, "POST"); }
  assert.ok(w.calls.some((c) => c.url.endsWith("/control")));
  assert.ok(w.calls.every((c) => c.signal?.timeoutMs > 0), "every request has an abort timeout");
});

test("P1 ordering: increasing seq, next chunk waits for the previous ack, bodies untouched", T, async () => {
  const h = hold(); const w = makeRecorderWorld({ handler: h.handler }); await w.begin();
  const r = w.recorder(); r.emit(100, "A"); r.emit(200, "B"); r.emit(300, "C"); await flush();
  assert.equal(h.pending.length, 1, "only chunk 0 in flight before its ack");
  assert.equal(seqOf(h.pending[0].c), 0); assert.equal(h.pending[0].c.body.tag, "A");
  assert.equal(h.pending[0].c.headers["Content-Type"], "video/webm");
  h.pending[0].d.resolve(okResponse()); await flush();
  assert.deepEqual(h.pending.map((p) => seqOf(p.c)), [0, 1]); assert.equal(h.pending[1].c.body.tag, "B");
  h.pending[1].d.resolve(okResponse()); await flush(); h.pending[2].d.resolve(okResponse()); await flush();
  assert.deepEqual(w.chunkCalls().map((c) => [seqOf(c), c.body.tag]), [[0, "A"], [1, "B"], [2, "C"]]);
  assert.equal(w.state().queuedBytes, 0);
  assert.equal(w.state().sequence, 3);
});

test("P1 empty chunks consume no sequence number", T, async () => {
  const w = makeRecorderWorld(); await w.begin(); const r = w.recorder();
  r.emit(0); r.emit(10, "A"); await flush();
  assert.deepEqual(w.chunkCalls().map(seqOf), [0]);
});

test("P1 a non-2xx response is not an acknowledgement: counted as failure and retried", T, async () => {
  let n = 0;
  const w = makeRecorderWorld({ handler: (c) => (c.url.includes("/chunk") ? (n++ < 1 ? badResponse(500) : okResponse()) : okResponse({ stop: false })) });
  await w.begin(); w.recorder().emit(10, "A"); await flush();
  assert.deepEqual(w.chunkCalls().map(seqOf), [0, 0]);
  assert.ok(!w.events().some((e) => e.event === "capture-error"));
});

test("P2 retry: transient failures retry the SAME chunk, chunks behind it wait (no reorder)", T, async () => {
  let n = 0;
  const w = makeRecorderWorld({ handler: (c) => { if (c.url.includes("/chunk") && seqOf(c) === 0 && n++ < 2) throw new Error("ECONNRESET"); return okResponse({ stop: false }); } });
  await w.begin(); const r = w.recorder(); r.emit(10, "A"); r.emit(10, "B"); await flush();
  assert.deepEqual(w.chunkCalls().map((c) => [seqOf(c), c.body.tag]), [[0, "A"], [0, "A"], [0, "A"], [1, "B"]]);
  assert.equal(w.state().failed, false);
});

test("P2 retry is bounded at exactly 3 attempts (code has no backoff delay); then capture-error", T, async () => {
  const w = makeRecorderWorld({ handler: failChunks });
  await w.begin(); w.recorder().emit(10, "A"); await flush();
  assert.equal(w.chunkCalls().filter((c) => seqOf(c) === 0).length, 3);
  assert.equal(w.state().failed, true);
  assert.deepEqual(w.events().filter((e) => e.event === "capture-error").map((e) => e.error), ["down"]);
});

test("P2 memory bound: stalled receiver, 10,000 x 1 MiB chunks -> capture fails at the 16 MiB bound", T, async () => {
  const h = hold(); const w = makeRecorderWorld({ handler: h.handler }); await w.begin(); const r = w.recorder();
  for (let i = 0; i < 10000; i++) r.emit(1024 * 1024, i);
  await flush();
  assert.equal(w.state().sequence, 16, "no more than 16 MiB ever queued");
  assert.equal(w.state().failed, true);
  assert.match(w.events().find((e) => e.event === "capture-error").error, /backlog exceeded/);
  assert.equal(r.stopCalls, 1);
});

test("P2 a single chunk over 8 MiB fails capture", T, async () => {
  const w = makeRecorderWorld(); await w.begin(); w.recorder().emit(8 * 1024 * 1024 + 1); await flush();
  assert.equal(w.state().failed, true); assert.equal(w.chunkCalls().length, 0);
});

test("P3 fail closed: control poll to a dead receiver stops capture and reports failure", T, async () => {
  const w = makeRecorderWorld({ handler: (c) => { if (c.url.endsWith("/control")) throw new Error("ECONNREFUSED"); return okResponse(); } });
  await w.begin(); await w.timers.tick(); await flush();
  assert.equal(w.recorder().state, "inactive"); assert.equal(w.timers.live.size, 0);
  assert.ok(w.events().some((e) => e.event === "capture-error" && /ECONNREFUSED/.test(e.error)));
  assert.deepEqual(w.events().at(-1), { event: "capture-stopped", failed: true });
  assert.ok(w.tracks.every((t) => t.stopped)); assert.ok(w.contexts[0].closed);
});

test("P3 fail closed: receiver fully gone ends cleanly, no unhandled rejection", T, async () => {
  const live = { down: false };
  const w = makeRecorderWorld({ handler: () => { if (live.down) throw new Error("gone"); return okResponse({ stop: false }); } });
  await w.begin(); live.down = true; w.recorder().emit(10); await flush(); await w.timers.tick(); await flush();
  assert.equal(w.state().failed, true); assert.equal(w.recorder().state, "inactive"); assert.equal(w.timers.live.size, 0);
  assert.equal(unhandled.length, 0);
});

test("P3 control non-2xx is a failure", T, async () => {
  const w = makeRecorderWorld({ handler: (c) => (c.url.endsWith("/control") ? badResponse(401) : okResponse()) });
  await w.begin(); await w.timers.tick(); await flush();
  assert.ok(w.events().some((e) => /control returned 401/.test(e.error || "")));
  assert.equal(w.recorder().state, "inactive");
});

test("P3 fail closed: level-meter event failure fails capture", T, async () => {
  const w = makeRecorderWorld({ handler: (c) => { if (c.url.endsWith("/event") && /capture-level/.test(c.body)) throw new Error("meter-down"); return okResponse({ stop: false }); } });
  await w.begin(); await w.timers.tick(); await flush();
  assert.equal(w.state().failed, true); assert.equal(w.recorder().state, "inactive");
});

test("P3 MediaRecorder error: capture-error then capture-stopped failed:true", T, async () => {
  const w = makeRecorderWorld(); await w.begin(); w.recorder().onerror({ error: new Error("encoder died") }); await flush();
  const ev = w.events(); assert.ok(ev.some((e) => e.event === "capture-error" && e.error === "encoder died"));
  assert.deepEqual(ev.at(-1), { event: "capture-stopped", failed: true });
});

test("P3 track ending stops the recorder and releases everything (reported as FAILED: ISS-T034EXT-002)", T, async () => {
  const w = makeRecorderWorld(); await w.begin(); w.tracks[1].end(); await flush();
  assert.equal(w.recorder().state, "inactive"); assert.equal(w.timers.live.size, 0); assert.ok(w.contexts[0].closed);
  assert.deepEqual(w.events().at(-1), { event: "capture-stopped", failed: true });
});

test("ISS-T034EXT-002: unexpected audio track end reports capture-error and capture-stopped failed:true", T, async () => {
  const w = makeRecorderWorld(); await w.begin(); w.tracks[0].end(); await flush();
  const ev = w.events(); assert.ok(ev.some((e) => e.event === "capture-error" && /audio track ended unexpectedly/.test(e.error)));
  assert.deepEqual(ev.at(-1), { event: "capture-stopped", failed: true });
});

test("ISS-T034EXT-002: a deliberate (bot-requested) stop is clean even if the tracks then report ended", T, async () => {
  let stop = false;
  const w = makeRecorderWorld({ handler: (c) => (c.url.endsWith("/control") ? okResponse({ stop }) : okResponse()) });
  await w.begin(); stop = true; await w.timers.tick(); await flush(); w.tracks.forEach((t) => t.end()); await flush();
  assert.ok(!w.events().some((e) => e.event === "capture-error"));
  assert.deepEqual(w.events().at(-1), { event: "capture-stopped", failed: false });
});

test("ISS-T034EXT-001: after a chunk exhausts retries, chunks queued behind it are NOT sent", T, async () => {
  const w = makeRecorderWorld({ handler: (c) => { if (c.url.includes("/chunk") && seqOf(c) === 0) throw new Error("boom"); return okResponse({ stop: false }); } });
  await w.begin(); const r = w.recorder(); r.emit(10, "A"); r.emit(10, "B"); await flush();
  assert.deepEqual([...new Set(w.chunkCalls().map(seqOf))], [0], "seq 1 must never be sent after seq 0 was lost");
});

test("P1 stop flush: final chunk acknowledged BEFORE capture-stopped is reported", T, async () => {
  const h = hold(); const w = makeRecorderWorld({ handler: h.handler }); await w.begin(); const r = w.recorder(); r.finalSize = 50;
  r.emit(10, "A"); await flush(); h.pending[0].d.resolve(okResponse()); await flush();
  w.calls.length = 0;
  r.stop(); await flush();
  assert.ok(!w.events().some((e) => e.event === "capture-stopped"), "not reported while final chunk unacknowledged");
  const fin = h.pending.find((p) => p.c.body?.final); assert.ok(fin, "final chunk was sent"); assert.equal(seqOf(fin.c), 1);
  fin.d.resolve(okResponse()); await flush();
  const order = w.calls.map((c) => (c.url.includes("/chunk") ? "chunk" : JSON.parse(c.body).event));
  assert.deepEqual(order, ["chunk", "capture-stopped"]);
  assert.deepEqual(w.events().at(-1), { event: "capture-stopped", failed: false });
});

test("P4 control stop: timers, tracks and audio context released; repeated stop harmless", T, async () => {
  let stop = false;
  const w = makeRecorderWorld({ handler: (c) => (c.url.endsWith("/control") ? okResponse({ stop }) : okResponse()) });
  await w.begin(); assert.equal(w.timers.live.size, 2); stop = true; await w.timers.tick(); await flush();
  assert.equal(w.timers.live.size, 0); assert.ok(w.tracks.every((t) => t.stopped)); assert.ok(w.contexts[0].closed);
  assert.equal(w.recorder().stopCalls, 1);
  w.recorder().stop(); await flush();
  assert.equal(w.events().filter((e) => e.event === "capture-stopped").length, 1);
});

test("P4 stop during a pending send completes cleanly once the send settles", T, async () => {
  const h = hold(); const w = makeRecorderWorld({ handler: h.handler }); await w.begin(); const r = w.recorder();
  r.emit(10, "A"); await flush(); r.stop(); await flush();
  assert.ok(!w.events().some((e) => e.event === "capture-stopped"));
  h.pending[0].d.resolve(okResponse()); await flush();
  assert.deepEqual(w.events().at(-1), { event: "capture-stopped", failed: false });
});

test("P4 double start is refused; second getUserMedia never happens", T, async () => {
  const w = makeRecorderWorld(); const first = w.send(w.startMsg); assert.equal(first.ret, true, "ISS-T034EXT-007: async channel kept open"); await first.reply; await flush(); const second = await w.send(w.startMsg).reply;
  assert.equal(second.ok, false); assert.match(second.error, /already active/); assert.equal(w.getUserMediaCalls, 1);
});

test("ISS-T034EXT-003: two start messages in the same tick open only one capture", T, async () => {
  const w = makeRecorderWorld(); const a = w.send(w.startMsg), b = w.send(w.startMsg); await Promise.all([a.reply, b.reply]); await flush();
  assert.equal(w.getUserMediaCalls, 1);
});

test("EXPECTED FAIL ISS-T034EXT-004: after a finished capture a new start in the same document works or is cleanly reset", { ...T, todo: "ISS-T034EXT-004" }, async () => {
  const w = makeRecorderWorld(); await w.begin(); w.recorder().stop(); await flush();
  const again = await w.send(w.startMsg).reply; assert.equal(again.ok, true);
});

test("P4 start failure: tracks released, error returned", T, async () => {
  const w = makeRecorderWorld({ handler: (c) => { if (c.url.endsWith("/event")) throw new Error("no receiver"); return okResponse(); } });
  const reply = await w.send(w.startMsg).reply; await flush();
  assert.equal(reply.ok, false); assert.match(reply.error, /no receiver/); assert.ok(w.tracks.every((t) => t.stopped));
});

test("P4 start refuses a stream missing audio or video", T, async () => {
  const w = makeRecorderWorld(); w.stream.getVideoTracks = () => [];
  const reply = await w.send(w.startMsg).reply; assert.equal(reply.ok, false); assert.match(reply.error, /Audio and video/);
  assert.equal(w.recorders.length, 0);
});

test("P6 only target=recorder,type=start messages are handled; others ignored without side effects", T, async () => {
  const w = makeRecorderWorld();
  for (const m of [{ type: "start" }, { target: "recorder", type: "stop" }, { target: "other", type: "start", streamId: "x", config: w.config }, { target: "recorder" }]) {
    assert.equal(w.send(m, { url: "https://evil.example/" }).ret, undefined);
  }
  await flush(); assert.equal(w.getUserMediaCalls, 0); assert.equal(w.calls.length, 0);
});

test("P6/P7 no external surface: manifest has no externally_connectable/content_scripts/web_accessible_resources; host scope 127.0.0.1 only", T, () => {
  const m = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
  for (const k of ["externally_connectable", "content_scripts", "web_accessible_resources"]) assert.equal(m[k], undefined, k);
  assert.deepEqual(m.host_permissions, ["http://127.0.0.1/*"]);
});

test("ISS-T034EXT-005: start message from a foreign sender (other id / web URL) is refused", T, async () => {
  const w = makeRecorderWorld();
  const reply = await w.send(w.startMsg, { id: "other-extension", url: "https://evil.example/p.html" }).reply;
  assert.equal(reply.ok, false); assert.equal(w.getUserMediaCalls, 0);
});

test("ISS-T034EXT-005: a start message cannot redirect chunks to a non-loopback endpoint", T, async () => {
  const cfg = { endpoint: "https://evil.example", token: "stolen" }; const w = makeRecorderWorld({ config: cfg });
  const reply = await w.send({ ...w.startMsg, config: cfg }).reply; await flush();
  assert.equal(reply.ok, false); assert.ok(!w.calls.some((c) => c.url.startsWith("https://evil.example")));
});

test("P5 single-capture by design: second start for another stream refused (two-tab isolation NOT supported)", T, async () => {
  const w = makeRecorderWorld(); await w.begin();
  const r = await w.send({ ...w.startMsg, streamId: "sid-2", config: { endpoint: "http://127.0.0.1:9999", token: "t2" } }).reply;
  assert.equal(r.ok, false); assert.ok(!w.calls.some((c) => c.url.includes(":9999")));
});

const BAD_ENDPOINTS = ["https://evil.example", "http://127.0.0.1.evil.example", "http://127.0.0.1.evil.example:4321", "http://localhost@evil.example",
  "http://127.0.0.1@evil.example:80", "http://user:pw@127.0.0.1:4321", "http://[::ffff:127.0.0.1]:4321", "http://[::1]:4321", "http://localhost:4321",
  "http://192.168.1.20:4321", "http://127.0.0.1", "http://127.0.0.1:", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:99999999999",
  "http://127.0.0.1:4321/", "http://127.0.0.1:4321/x", "http://127.0.0.1:4321@evil.example", "https://127.0.0.1:4321", "HTTP://127.0.0.1:4321",
  " http://127.0.0.1:4321", "http://127.0.0.1:4321\n", "http://127.0.0.1:043x", "http://127.0.0.1:-1", "", undefined, null, 4321];
test("ISS-T034EXT-005: endpoint table, refused forms start nothing and NO fetch is ever made", T, async () => {
  for (const endpoint of BAD_ENDPOINTS) {
    const cfg = { endpoint, token: "stolen" }; const w = makeRecorderWorld({ config: cfg });
    const reply = await w.send({ ...w.startMsg, config: cfg }).reply; await flush();
    assert.equal(reply.ok, false, String(endpoint)); assert.equal(w.getUserMediaCalls, 0, String(endpoint));
    assert.equal(w.calls.length, 0, `no fetch for ${endpoint}`); assert.equal(w.recorders.length, 0);
  }
  for (const cfg of [undefined, null, { endpoint: "http://127.0.0.1:4321" }, { endpoint: "http://127.0.0.1:4321", token: "" }]) {
    const w = makeRecorderWorld(); const reply = await w.send({ ...w.startMsg, config: cfg }).reply; await flush();
    assert.equal(reply.ok, false); assert.equal(w.calls.length, 0);
  }
});

test("ISS-T034EXT-005: endpoint table, accepted loopback forms (127.0.0.1 with a numeric port 1..65535)", T, async () => {
  for (const port of ["1", "4321", "65535"]) {
    const cfg = { endpoint: `http://127.0.0.1:${port}`, token: "t" }; const w = makeRecorderWorld({ config: cfg });
    assert.equal((await w.begin()).ok, true, port);
    assert.ok(w.calls.length > 0 && w.calls.every((c) => c.url.startsWith(cfg.endpoint + "/")), "all traffic goes only to the loopback endpoint");
  }
});

test("ISS-T034EXT-005: sender table, foreign id / content-script tab / web url are ignored; own background and offscreen senders work", T, async () => {
  const own = "chrome-extension://ext-id/";
  for (const sender of [{ id: "other-extension" }, { id: "ext-id", tab: { id: 7 } }, { id: "ext-id", url: "https://evil.example/p.html" },
    { id: "ext-id", url: "chrome-extension://other-id/x.html" }, { url: own + "background.js" }, {}, null]) {
    const w = makeRecorderWorld(); const reply = await w.send(w.startMsg, sender).reply; await flush();
    assert.equal(reply.ok, false, JSON.stringify(sender)); assert.equal(w.getUserMediaCalls, 0); assert.equal(w.calls.length, 0); assert.equal(w.recorders.length, 0);
  }
  for (const sender of [{ id: "ext-id", url: own + "background.js" }, { id: "ext-id" }]) {
    const w = makeRecorderWorld(); assert.equal((await w.send(w.startMsg, sender).reply).ok, true);
  }
});

test("ISS-T034EXT-005: a refused start does not poison the recorder: a later valid start from the real sender works", T, async () => {
  const w = makeRecorderWorld(); await w.send(w.startMsg, { id: "other-extension" }).reply;
  assert.equal((await w.begin()).ok, true);
});

// ISS-T034EXT-005 regression (lane recsender): replays the ledger row's OWN recorded reproductions, read from the row at test time.
const ledgerRow = () => readFileSync(new URL("../../../../qa/issues.t034ext.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).find((r) => r.id === "ISS-T034EXT-005");
test("ISS-T034EXT-005 ledger replay 1/2: recorded foreign sender {id:'other-extension', url:'https://evil.example/p.html'} start is refused", T, async () => {
  assert.ok(ledgerRow().evidence.includes("{id:'other-extension', url:'https://evil.example/p.html'}"), "row still records this reproduction");
  const w = makeRecorderWorld(); const reply = await w.send(w.startMsg, { id: "other-extension", url: "https://evil.example/p.html" }).reply; await flush();
  assert.equal(reply.ok, false); assert.equal(w.getUserMediaCalls, 0); assert.equal(w.calls.length, 0); assert.equal(w.recorders.length, 0);
});
test("ISS-T034EXT-005 ledger replay 2/2: recorded config {endpoint:'https://evil.example', token:'stolen'} starts nothing and POSTs nowhere", T, async () => {
  assert.ok(ledgerRow().evidence.includes("{endpoint:'https://evil.example', token:'stolen'}"), "row still records this reproduction");
  const cfg = { endpoint: "https://evil.example", token: "stolen" }; const w = makeRecorderWorld({ config: cfg });
  const reply = await w.send({ ...w.startMsg, config: cfg }).reply; await flush();
  assert.equal(reply.ok, false); assert.equal(w.getUserMediaCalls, 0); assert.equal(w.calls.length, 0);
});
test("ISS-T034EXT-005 fail closed: runtime id missing/empty/non-string refuses even a sender with an equally missing id; null/odd messages do not throw", T, async () => {
  for (const id of [undefined, "", null, 7]) {
    const w = makeRecorderWorld(); vm.runInContext("chrome.runtime.id = __id", Object.assign(w.ctx, { __id: id }));
    const reply = await w.send(w.startMsg, { id }).reply; await flush();
    assert.equal(reply.ok, false, String(id)); assert.equal(w.getUserMediaCalls, 0);
  }
  const w = makeRecorderWorld();
  for (const m of [null, undefined, 5, "start", []]) assert.equal(w.send(m, { id: "ext-id" }).ret, undefined);
  assert.equal(w.getUserMediaCalls, 0); assert.equal(w.calls.length, 0);
  for (const sender of [{ id: "ext-id", url: 5 }, { id: "ext-id", url: { startsWith: () => true } }]) {
    const x = makeRecorderWorld(); assert.equal((await x.send(x.startMsg, sender).reply).ok, false);
  }
});
