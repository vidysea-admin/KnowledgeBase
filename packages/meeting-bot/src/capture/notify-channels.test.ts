/**
 * packages/meeting-bot/src/capture/notify-channels.test.ts — U3. Generic fan-out, throttle,
 * digest truncation and env/settings config precedence, all against FAKE `NotifyChannel`s (no
 * real transport of any kind, channel-agnostic by design).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotifier, truncateDigest, readNotifyEnvConfig, DIGEST_MAX_CHARS, type NotifyChannel } from "./notify-channels.js";

/** Resolves once pending microtasks (the fire-and-forget chain's `.then`/`.catch`) have run. */
function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

function fakeChannel(name: string, behavior: "ok" | "reject" = "ok") {
  const calls: string[] = [];
  const channel: NotifyChannel = {
    name,
    async send(text: string): Promise<void> {
      calls.push(text);
      if (behavior === "reject") throw new Error(`${name} boom`);
    },
  };
  return { channel, calls };
}

function logCapture() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

test("send() with zero channels is a no-op, never throws", () => {
  const notifier = createNotifier([]);
  assert.doesNotThrow(() => notifier.send("k", "text"));
});

test("send() fans a single call out to every channel", async () => {
  const a = fakeChannel("a");
  const b = fakeChannel("b");
  const notifier = createNotifier([a.channel, b.channel]);
  notifier.send("k", "hello");
  await flush();
  assert.deepEqual(a.calls, ["hello"]);
  assert.deepEqual(b.calls, ["hello"]);
});

test("fan-out isolation: one channel throwing never blocks or fails the others", async () => {
  const { lines, log } = logCapture();
  const bad = fakeChannel("bad", "reject");
  const good = fakeChannel("good", "ok");
  const notifier = createNotifier([bad.channel, good.channel], { log });
  notifier.send("k", "hello");
  await flush();
  assert.deepEqual(good.calls, ["hello"]); // good channel still received the send
  assert.equal(bad.calls.length, 1); // bad channel was still attempted
  assert.equal(lines.length, 1); // only the failure is logged
  assert.match(lines[0]!, /\[bad\] send failed: bad boom/);
});

test("send() returns void synchronously — fire-and-forget, never a Promise", () => {
  const bad = fakeChannel("bad", "reject");
  const notifier = createNotifier([bad.channel]);
  const result = notifier.send("k", "hello");
  assert.equal(result, undefined);
});

test("a rejecting channel never throws out of the notifier call itself", () => {
  const bad = fakeChannel("bad", "reject");
  const notifier = createNotifier([bad.channel]);
  assert.doesNotThrow(() => notifier.send("k", "hello"));
});

test("throttle: two sends for the same key within the window collapse to one", async () => {
  let clock = 0;
  const a = fakeChannel("a");
  const notifier = createNotifier([a.channel], { now: () => clock, throttleMs: 60_000 });
  notifier.send("k", "one");
  clock = 5_000;
  notifier.send("k", "two");
  await flush();
  assert.deepEqual(a.calls, ["one"]);
});

test("throttle: a second send after the window elapses goes through", async () => {
  let clock = 0;
  const a = fakeChannel("a");
  const notifier = createNotifier([a.channel], { now: () => clock, throttleMs: 60_000 });
  notifier.send("k", "one");
  clock = 60_001;
  notifier.send("k", "two");
  await flush();
  assert.deepEqual(a.calls, ["one", "two"]);
});

test("throttle keys are independent — different keys both send", async () => {
  const a = fakeChannel("a");
  const notifier = createNotifier([a.channel]);
  notifier.send("k1", "one");
  notifier.send("k2", "two");
  await flush();
  assert.deepEqual(a.calls, ["one", "two"]);
});

test("truncateDigest: text under the limit passes through unchanged", () => {
  const text = "short digest";
  assert.equal(truncateDigest(text), text);
});

test("truncateDigest: text over the limit is cut with a pointer to the source path", () => {
  const text = "x".repeat(DIGEST_MAX_CHARS + 500);
  const out = truncateDigest(text, "qa/watch/2026-09-25.md");
  assert.ok(out.length <= DIGEST_MAX_CHARS);
  assert.match(out, /full digest: qa\/watch\/2026-09-25\.md$/);
});

test("truncateDigest: no sourcePath still truncates, with a generic marker", () => {
  const text = "y".repeat(DIGEST_MAX_CHARS + 500);
  const out = truncateDigest(text);
  assert.ok(out.length <= DIGEST_MAX_CHARS);
  assert.match(out, /\(truncated\)$/);
});

test("notifyDigest sends the truncated text under the 'digest' key", async () => {
  const a = fakeChannel("a");
  const notifier = createNotifier([a.channel]);
  const text = "z".repeat(DIGEST_MAX_CHARS + 100);
  notifier.notifyDigest(text, "qa/watch/x.md");
  await flush();
  assert.equal(a.calls.length, 1);
  assert.ok(a.calls[0]!.length <= DIGEST_MAX_CHARS);
  // a second digest call within the throttle window collapses — same 'digest' key as any other
  notifier.notifyDigest("second", "qa/watch/x.md");
  await flush();
  assert.equal(a.calls.length, 1);
});

// --- readNotifyEnvConfig: env + settings precedence ---

test("readNotifyEnvConfig: no env at all defaults every class to ['telegram']", () => {
  const cfg = readNotifyEnvConfig({});
  assert.deepEqual(cfg.channelsByClass.digest, ["telegram"]);
  assert.deepEqual(cfg.channelsByClass["bot-status"], ["telegram"]);
});

test("readNotifyEnvConfig: NOTIFY_CHANNELS is the blanket default for every class", () => {
  const cfg = readNotifyEnvConfig({ NOTIFY_CHANNELS: "telegram,whatsapp" });
  assert.deepEqual(cfg.channelsByClass.digest, ["telegram", "whatsapp"]);
  assert.deepEqual(cfg.channelsByClass["bot-status"], ["telegram", "whatsapp"]);
});

test("readNotifyEnvConfig: a per-class env wins over the blanket NOTIFY_CHANNELS for that class only", () => {
  const cfg = readNotifyEnvConfig({ NOTIFY_CHANNELS: "telegram", NOTIFY_CHANNELS_DIGEST: "telegram,whatsapp" });
  assert.deepEqual(cfg.channelsByClass.digest, ["telegram", "whatsapp"]);
  assert.deepEqual(cfg.channelsByClass["bot-status"], ["telegram"]);
});

test("readNotifyEnvConfig: whitespace/empty entries in the list are dropped", () => {
  const cfg = readNotifyEnvConfig({ NOTIFY_CHANNELS: " telegram ,, whatsapp ," });
  assert.deepEqual(cfg.channelsByClass.digest, ["telegram", "whatsapp"]);
});

test("readNotifyEnvConfig: settingsOverride wins over every env for its class, leaves the other class to env", () => {
  const cfg = readNotifyEnvConfig(
    { NOTIFY_CHANNELS: "telegram", NOTIFY_CHANNELS_DIGEST: "telegram,whatsapp" },
    { digest: ["whatsapp"] },
  );
  assert.deepEqual(cfg.channelsByClass.digest, ["whatsapp"]); // settings beat the per-class env
  assert.deepEqual(cfg.channelsByClass["bot-status"], ["telegram"]); // untouched class falls through to env
});
