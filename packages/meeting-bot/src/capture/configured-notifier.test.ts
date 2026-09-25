/**
 * packages/meeting-bot/src/capture/configured-notifier.test.ts — U3. Assembles channels from
 * env config; every telegram/whatsapp transport is injected — NEVER a real send.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildChannels, createConfiguredNotifier, notifyDigest } from "./configured-notifier.js";

function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

function logCapture() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

test("buildChannels: 'telegram' with valid deps produces one enabled channel", () => {
  const channels = buildChannels(["telegram"], { telegram: { token: "T", chatId: "C", send: async () => {} } });
  assert.equal(channels.length, 1);
  assert.equal(channels[0]!.name, "telegram");
});

test("buildChannels: 'telegram' with missing creds is skipped (disabled), not thrown", () => {
  const { lines, log } = logCapture();
  const channels = buildChannels(["telegram"], { log, telegram: { token: undefined, chatId: undefined } });
  assert.equal(channels.length, 0);
  assert.match(lines.join("\n"), /disabled/);
});

test("buildChannels: 'whatsapp' always produces one (stub) channel", () => {
  const channels = buildChannels(["whatsapp"]);
  assert.equal(channels.length, 1);
  assert.equal(channels[0]!.name, "whatsapp");
});

test("buildChannels: an unknown channel name is logged and skipped, never throws", () => {
  const { lines, log } = logCapture();
  const channels = buildChannels(["carrier-pigeon"], { log });
  assert.equal(channels.length, 0);
  assert.match(lines.join("\n"), /unknown channel 'carrier-pigeon'/);
});

test("buildChannels: mixed known + unknown builds only the known ones", () => {
  const { log } = logCapture();
  const channels = buildChannels(["telegram", "carrier-pigeon", "whatsapp"], {
    log,
    telegram: { token: "T", chatId: "C", send: async () => {} },
  });
  assert.deepEqual(channels.map((c) => c.name).sort(), ["telegram", "whatsapp"]);
});

test("createConfiguredNotifier: reads NOTIFY_CHANNELS_DIGEST for the 'digest' class", async () => {
  const sent: string[] = [];
  const notifier = createConfiguredNotifier("digest", {
    env: { NOTIFY_CHANNELS_DIGEST: "telegram" } as NodeJS.ProcessEnv,
    telegram: { token: "T", chatId: "C", send: async (_t, _c, text) => { sent.push(text); } },
  });
  notifier.send("k", "hello");
  await flush();
  assert.deepEqual(sent, ["hello"]);
});

test("createConfiguredNotifier: unset env still defaults to telegram-only (backward compatible)", async () => {
  const sent: string[] = [];
  const notifier = createConfiguredNotifier("bot-status", {
    env: {} as NodeJS.ProcessEnv,
    telegram: { token: "T", chatId: "C", send: async (_t, _c, text) => { sent.push(text); } },
  });
  notifier.send("k", "hello");
  await flush();
  assert.deepEqual(sent, ["hello"]);
});

test("notifyDigest: fans out to every enabled channel, truncated", async () => {
  const telegramSent: string[] = [];
  const whatsappLog: string[] = [];
  const longDigest = "d".repeat(5000);
  notifyDigest(longDigest, "qa/watch/2026-09-25.md", {
    env: { NOTIFY_CHANNELS_DIGEST: "telegram,whatsapp" } as NodeJS.ProcessEnv,
    telegram: { token: "T", chatId: "C", send: async (_t, _c, text) => { telegramSent.push(text); } },
    log: (m) => whatsappLog.push(m),
  });
  await flush();
  assert.equal(telegramSent.length, 1);
  assert.ok(telegramSent[0]!.length <= 3500);
  assert.match(telegramSent[0]!, /full digest: qa\/watch\/2026-09-25\.md$/);
  assert.match(whatsappLog.join("\n"), /whatsapp.*not configured/);
});

test("notifyDigest: a telegram failure never blocks the whatsapp stub from being attempted", async () => {
  const logs: string[] = [];
  notifyDigest("short digest", undefined, {
    env: { NOTIFY_CHANNELS_DIGEST: "telegram,whatsapp" } as NodeJS.ProcessEnv,
    telegram: { token: "T", chatId: "C", send: async () => { throw new Error("network down"); } },
    log: (m) => logs.push(m),
  });
  await flush();
  assert.match(logs.join("\n"), /whatsapp.*not configured/);
  assert.match(logs.join("\n"), /\[telegram\] send failed/);
});
