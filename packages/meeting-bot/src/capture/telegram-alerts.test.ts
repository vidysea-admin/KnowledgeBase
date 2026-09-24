/**
 * packages/meeting-bot/src/capture/telegram-alerts.test.ts — T-030. NEVER calls the real Telegram
 * API (outward-facing sends gate to the human): every test injects a fake `send` transport.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createTelegramNotifier, readTurnCount, type TelegramNotifierDeps } from "./telegram-alerts.js";
import type { BotEvent } from "./obs-windows.js";

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

function notifierDeps(overrides: Partial<TelegramNotifierDeps> = {}): TelegramNotifierDeps {
  const { send } = fakeTransport();
  return { token: "T-TOKEN-SECRET", chatId: "12345", send, ...overrides };
}

test("missing token/chatId disables alerts, logs once, never sends", async () => {
  const { lines, log } = logCapture();
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier({ token: undefined, chatId: undefined, send, log });
  assert.equal(notifier.enabled, false);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /disabled/);
  notifier.notifyJoined("Session", "zoho");
  await flush();
  assert.equal(calls.length, 0);
});

test("enabled notifier does not log the disabled line", () => {
  const { lines, log } = logCapture();
  createTelegramNotifier(notifierDeps({ log }));
  assert.equal(lines.length, 0);
});

test("notifyJoined sends title and platform", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyJoined("Weekly Sync", "zoho");
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.token, "T-TOKEN-SECRET");
  assert.equal(calls[0]!.chatId, "12345");
  assert.match(calls[0]!.text, /Weekly Sync/);
  assert.match(calls[0]!.text, /zoho/);
});

test("notifyDisconnected sends the reason", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyDisconnected("banner");
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Disconnected/);
  assert.match(calls[0]!.text, /banner/);
});

test("notifyRecovered sends reason and formatted duration", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyRecovered("offline", 75);
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Recovered/);
  assert.match(calls[0]!.text, /offline/);
  assert.match(calls[0]!.text, /1m15s/);
});

test("notifySilence sends formatted duration", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifySilence(130);
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Silent/);
  assert.match(calls[0]!.text, /2m10s/);
});

test("notifyFinished includes duration/gaps and, when present, transcript+turns", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyFinished({
    title: "Weekly Sync", sessionId: "s1", durationSec: 3661, gapCount: 2,
    transcriptPath: "data/toc-migrated/s1/turns.json", turnCount: 42,
  });
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Weekly Sync/);
  assert.match(calls[0]!.text, /1h1m1s|61m1s/); // formatDuration only guarantees m/s granularity
  assert.match(calls[0]!.text, /gaps: 2/);
  assert.match(calls[0]!.text, /turns\.json/);
  assert.match(calls[0]!.text, /turns: 42/);
});

test("notifyFinished omits transcript/turns lines when there was no transcript", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyFinished({ title: "T", sessionId: "s2", durationSec: 10, gapCount: 0 });
  await flush();
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0]!.text, /transcript:/);
  assert.doesNotMatch(calls[0]!.text, /turns:/);
});

test("onBotEvent: reconnect-reload triggers a disconnected alert with the event's reason", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  const ev: BotEvent = { event: "reconnect-reload", t: 1, reason: "offline", attempt: 1 };
  notifier.onBotEvent(ev);
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Disconnected/);
  assert.match(calls[0]!.text, /offline/);
});

test("onBotEvent: a recovered gap alerts with the gap's own duration (end - start)", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  const ev: BotEvent = { event: "gap", t: 100, start: 100, end: 145, reason: "banner", recovered: true };
  notifier.onBotEvent(ev);
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /Recovered/);
  assert.match(calls[0]!.text, /45s/);
});

test("onBotEvent: an UNRECOVERED gap (end-of-run) sends nothing", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  const ev: BotEvent = { event: "gap", t: 100, start: 100, end: 145, reason: "banner", recovered: false };
  notifier.onBotEvent(ev);
  await flush();
  assert.equal(calls.length, 0);
});

test("onBotEvent: heartbeat/clicked/opened/closed are no-ops", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  for (const event of ["heartbeat", "clicked", "opened", "closed", "tab-switch", "warn"]) {
    notifier.onBotEvent({ event, t: 1 });
  }
  await flush();
  assert.equal(calls.length, 0);
});

test("throttle: two disconnected alerts within the window collapse to one send", async () => {
  let clock = 0;
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send, now: () => clock, throttleMs: 60_000 }));
  notifier.notifyDisconnected("banner");
  clock = 5_000;
  notifier.notifyDisconnected("banner");
  await flush();
  assert.equal(calls.length, 1);
});

test("throttle: a second alert after the window elapses sends again", async () => {
  let clock = 0;
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send, now: () => clock, throttleMs: 60_000 }));
  notifier.notifyDisconnected("banner");
  clock = 60_001;
  notifier.notifyDisconnected("banner");
  await flush();
  assert.equal(calls.length, 2);
});

test("throttle keys are independent per state — joined then disconnected both send", async () => {
  const { calls, send } = fakeTransport();
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  notifier.notifyJoined("S", "zoho");
  notifier.notifyDisconnected("banner");
  await flush();
  assert.equal(calls.length, 2);
});

test("a send failure is logged WITHOUT the token ever appearing in the log line", async () => {
  const { lines, log } = logCapture();
  const { send } = fakeTransport("reject");
  const notifier = createTelegramNotifier(notifierDeps({ send, log }));
  notifier.notifyDisconnected("banner");
  await flush();
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /send failed/);
  assert.doesNotMatch(lines[0]!, /T-TOKEN-SECRET/);
  assert.match(lines[0]!, /REDACTED/);
});

test("notify* calls are fire-and-forget: they return undefined synchronously, never a Promise", () => {
  const { send } = fakeTransport("reject");
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  const result = notifier.notifyDisconnected("banner");
  assert.equal(result, undefined);
});

test("a rejecting transport never throws out of the notifier call itself", () => {
  const { send } = fakeTransport("reject");
  const notifier = createTelegramNotifier(notifierDeps({ send }));
  assert.doesNotThrow(() => notifier.notifyFinished({ title: "T", sessionId: "s", durationSec: 1, gapCount: 0 }));
});

test("readTurnCount: missing file -> undefined", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-telegram-turns-"));
  try {
    assert.equal(readTurnCount(path.join(dir, "nope.json")), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readTurnCount: malformed JSON -> undefined, never throws", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-telegram-turns-"));
  try {
    const p = path.join(dir, "turns.json");
    writeFileSync(p, "{not json");
    assert.equal(readTurnCount(p), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readTurnCount: a real turns array -> its length", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-telegram-turns-"));
  try {
    const p = path.join(dir, "turns.json");
    writeFileSync(p, JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]));
    assert.equal(readTurnCount(p), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
