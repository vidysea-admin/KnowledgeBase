/**
 * packages/meeting-bot/src/capture/telegram-channel.test.ts — U3. NEVER calls the real Telegram
 * API: every test injects a fake `send` transport.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createTelegramChannel } from "./telegram-channel.js";

function logCapture() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

test("missing token/chatId returns undefined and logs one disabled line", () => {
  const { lines, log } = logCapture();
  const channel = createTelegramChannel({ token: undefined, chatId: undefined, log });
  assert.equal(channel, undefined);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /disabled/);
});

test("missing only chatId still disables (both required)", () => {
  const { lines, log } = logCapture();
  const channel = createTelegramChannel({ token: "T", chatId: undefined, log });
  assert.equal(channel, undefined);
  assert.equal(lines.length, 1);
});

test("valid deps returns a channel named 'telegram', logs nothing", () => {
  const { lines, log } = logCapture();
  const channel = createTelegramChannel({ token: "T-TOKEN-SECRET", chatId: "12345", send: async () => {}, log });
  assert.ok(channel);
  assert.equal(channel!.name, "telegram");
  assert.equal(lines.length, 0);
});

test("send() calls the injected transport with token/chatId/text", async () => {
  const calls: Array<{ token: string; chatId: string; text: string }> = [];
  const channel = createTelegramChannel({
    token: "T-TOKEN-SECRET",
    chatId: "12345",
    send: async (token, chatId, text) => {
      calls.push({ token, chatId, text });
    },
  });
  await channel!.send("hello world");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.token, "T-TOKEN-SECRET");
  assert.equal(calls[0]!.chatId, "12345");
  assert.equal(calls[0]!.text, "hello world");
});

test("a rejecting transport's error has the token redacted before it leaves the channel", async () => {
  const channel = createTelegramChannel({
    token: "T-TOKEN-SECRET",
    chatId: "12345",
    send: async (token) => {
      throw new Error(`boom token=${token}`);
    },
  });
  await assert.rejects(
    () => channel!.send("hello"),
    (err: Error) => {
      assert.doesNotMatch(err.message, /T-TOKEN-SECRET/);
      assert.match(err.message, /REDACTED/);
      return true;
    },
  );
});
