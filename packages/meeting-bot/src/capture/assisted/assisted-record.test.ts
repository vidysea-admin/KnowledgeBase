import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createAssistedDeps, isEnded, isPlaying, type AssistedPage, type AssistedMediaState } from "./assisted-record.js";

const st = (o: Partial<AssistedMediaState> = {}): AssistedMediaState => ({ hasVideo: true, paused: false, ended: false, currentTime: 0, duration: 100, readyState: 4, ...o });
function fakePage(script: Array<AssistedMediaState | null>) {
  let i = 0, started = false, closed = false; let cb: ((b: Buffer) => void) | undefined; const clicks: string[] = [];
  const page: AssistedPage = {
    snapshot: async () => script[Math.min(i++, script.length - 1)] ?? null,
    startRecording: async (c) => { started = true; cb = c; c(Buffer.from("webm-bytes")); },
    stopRecording: async () => { cb?.(Buffer.from("-tail")); },
    close: async () => { closed = true; },
  };
  return { page, state: () => ({ started, closed, polls: i, clicks }) };
}
function harness(script: Array<AssistedMediaState | null>, extra: { playTimeoutMs?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "assisted-")), events: string[] = [];
  let t = 0; const fp = fakePage(script);
  const a = createAssistedDeps({ recordDir: dir, connect: async () => fp.page, now: () => (t += 1000), sleep: async () => {}, pollMs: 1, log: () => {},
    onEvent: (_h, e) => events.push(e.event), ...extra });
  return { a, fp, events };
}

test("isPlaying needs currentTime advancing while not paused", () => {
  assert.equal(isPlaying(undefined, st()), false);
  assert.equal(isPlaying(st({ currentTime: 1 }), st({ currentTime: 1 })), false);
  assert.equal(isPlaying(st({ currentTime: 1 }), st({ currentTime: 2, paused: true })), false);
  assert.equal(isPlaying(st({ currentTime: 1 }), st({ currentTime: 2 })), true);
  assert.equal(isPlaying(st(), null), false);
});
test("isEnded: ended flag, tab gone, or paused at duration; not mid-play", () => {
  assert.equal(isEnded(st({ ended: true })), true);
  assert.equal(isEnded(null), true);
  assert.equal(isEnded(st({ paused: true, currentTime: 99.8 })), true);
  assert.equal(isEnded(st({ currentTime: 50 })), false);
  assert.equal(isEnded(st({ paused: true, currentTime: 10 })), false);
});
test("waits through paused/idle polls, then starts recording once playback is detected", async () => {
  const { a, fp, events } = harness([st({ paused: true }), st({ paused: true }), st({ currentTime: 1 }), st({ currentTime: 2 }), st({ currentTime: 3 })]);
  const { sessionHandle } = await a.deps.launch("https://www.youtube.com/watch?v=x", {} as never);
  assert.equal(fp.state().started, true);
  assert.deepEqual(events, ["admitted", "capture-started"]);
  await a.deps.stop!(sessionHandle);
  assert.equal(readFileSync(a.outputPath(sessionHandle)!, "utf8"), "webm-bytes-tail");
  assert.equal(fp.state().closed, true);
  assert.deepEqual(events, ["admitted", "capture-started", "capture-stopped"]);
});
test("browserExited resolves after the media ends (ended confirmed over several polls)", async () => {
  const { a } = harness([st({ currentTime: 1 }), st({ currentTime: 2 }), st({ currentTime: 3 }), st({ currentTime: 99, ended: true, paused: true })]);
  const { sessionHandle } = await a.deps.launch("u", {} as never);
  assert.equal(await a.browserExited(sessionHandle), 0);
  await a.deps.stop!(sessionHandle);
});
test("a single transient ended blip does not stop the recording", async () => {
  const { a } = harness([st({ currentTime: 1 }), st({ currentTime: 2 }), st({ ended: true }), st({ currentTime: 5 }), st({ currentTime: 6 }), null]);
  const { sessionHandle } = await a.deps.launch("u", {} as never);
  assert.equal(await a.browserExited(sessionHandle), 0); // resolves only via the tab closing (null), after playback resumed
  await a.deps.stop!(sessionHandle);
});
test("refuses with no recording when nothing plays within the timeout", async () => {
  const { a, fp } = harness([st({ paused: true })], { playTimeoutMs: 30_000 });
  await assert.rejects(() => a.deps.launch("u", {} as never), /nothing played within 0\.5 minutes; refusing/);
  assert.equal(fp.state().started, false);
  assert.equal(fp.state().closed, true);
});
test("the bot never reloads the human's page", () => {
  const { a } = harness([st()]);
  assert.equal(a.triggerReload(), undefined);
});
