/**
 * packages/core/src/alerts/alert-sink.test.ts — U4b/R2 (D-053). NEVER calls the real Telegram API
 * (outward-facing sends gate to the human): every test injects a fake `send` transport, exactly
 * like meeting-bot's telegram-alerts.test.ts does for the structurally-identical notifier.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createTelegramAlertSink, type TelegramAlertSinkDeps, type AlertSink } from "./alert-sink.js";

type SendCall = { token: string; chatId: string; text: string };

/** Resolves once pending microtasks (the fire-and-forget chain's `.then`/`.catch`) have run. */
function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

function fakeTransport(behavior: "ok" | "reject" = "ok") {
  const calls: SendCall[] = [];
  const send = async (token: string, chatId: string, text: string): Promise<void> => {
    calls.push({ token, chatId, text });
    if (behavior === "reject") throw new Error(`boom token=${token}`);
  };
  return { calls, send };
}

function logCapture() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

function sinkDeps(overrides: Partial<TelegramAlertSinkDeps> = {}): TelegramAlertSinkDeps {
  const { send } = fakeTransport();
  return { token: "T-TOKEN-SECRET", chatId: "12345", send, ...overrides };
}

test("createTelegramAlertSink satisfies the AlertSink shape WatchSilenceDeps.notifyWatchSilent requires", () => {
  const sink: AlertSink = createTelegramAlertSink(sinkDeps());
  assert.equal(typeof sink.notifyWatchSilent, "function");
});

test("missing token/chatId disables the sink, logs once, never sends", async () => {
  const { lines, log } = logCapture();
  const { calls, send } = fakeTransport();
  const sink = createTelegramAlertSink({ token: undefined, chatId: undefined, send, log });
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /disabled/);
});

test("configured sink sends the watch-silent alert with tenant, sourceType and interval", async () => {
  const { calls, send } = fakeTransport();
  const sink = createTelegramAlertSink(sinkDeps({ send }));
  sink.notifyWatchSilent("toc", "drive", "2026-09-28T08:00:00Z", 3_600_000);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.token, "T-TOKEN-SECRET");
  assert.equal(calls[0]!.chatId, "12345");
  assert.match(calls[0]!.text, /drive/);
  assert.match(calls[0]!.text, /toc/);
  assert.match(calls[0]!.text, /last completed run: 2026-09-28T08:00:00Z/);
  assert.match(calls[0]!.text, /60m/);
});

test("a null lastHeartbeatAt is worded as 'no run has ever completed', not a stale timestamp", async () => {
  const { calls, send } = fakeTransport();
  const sink = createTelegramAlertSink(sinkDeps({ send }));
  sink.notifyWatchSilent("toc", "gmail", null, 3_600_000);
  await flush();
  assert.match(calls[0]!.text, /no run has ever completed/);
});

test("matches meeting-bot's TelegramNotifier.notifyWatchSilent wording for the same inputs (disclosed duplication, kept in sync by this assertion)", async () => {
  const { calls, send } = fakeTransport();
  const sink = createTelegramAlertSink(sinkDeps({ send }));
  sink.notifyWatchSilent("toc", "drive", "2026-09-28T08:00:00Z", 3_600_000);
  await flush();
  const expected =
    "🔕 Watch gone quiet: drive (tenant toc) — last completed run: 2026-09-28T08:00:00Z, " +
    "expected within 60m. This means polling itself has stopped, not that a poll failed — " +
    "check the watcher process/task, not the credential.";
  assert.equal(calls[0]!.text, expected);
});

test("a send failure is caught, redacted and logged — never thrown to the caller", async () => {
  const { lines, log } = logCapture();
  const { send } = fakeTransport("reject");
  const sink = createTelegramAlertSink(sinkDeps({ send, log }));
  assert.doesNotThrow(() => sink.notifyWatchSilent("toc", "calendar", null, 3_600_000));
  await flush();
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /send failed/);
  assert.doesNotMatch(lines[0]!, /T-TOKEN-SECRET/);
  assert.match(lines[0]!, /\[REDACTED\]/);
});

test("notifyWatchSilent never returns a Promise the caller could await/throw on", () => {
  const { send } = fakeTransport();
  const sink = createTelegramAlertSink(sinkDeps({ send }));
  const result = sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  assert.equal(result, undefined);
});
