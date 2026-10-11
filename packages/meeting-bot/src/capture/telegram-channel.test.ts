/**
 * packages/meeting-bot/src/capture/telegram-channel.test.ts — U3. NEVER calls the real Telegram
 * API: every test injects a fake `send` transport.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { SKIP_REASON_MEANING } from "../calendar/skip-describe.js";
import { createOperationNotifications, createTelegramChannel } from "./telegram-channel.js";

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

test("operation alerts name every SkipReason as-is and map an unknown reason to the neutral label (ISS-T037W1-003)", async () => {
  const SKIP_REASONS = Object.keys(SKIP_REASON_MEANING); // total Record<SkipReason,string>: one entry per SkipReason
  assert.equal(SKIP_REASONS.length, 14);
  for (const r of ["opted-out", "rule-denied", "rules-unevaluable"]) assert.ok(SKIP_REASONS.includes(r), r);
  const sent: Array<{ reason?: string }> = [];
  const state: Record<string, any> = { operations: {} };
  [...SKIP_REASONS, "brand-new-reason"].forEach((reason, i) => { state.operations[`op-${i}`] = { status: "action_required", reason }; });
  const n = createOperationNotifications({ state, save: () => {}, log: () => {}, now: () => "2026-10-11T00:00:00.000Z",
    notifyOperation: async (notice) => { sent.push(notice); return "sent"; } });
  for (const id of Object.keys(state.operations)) n.enqueue(id);
  await n.wait();
  assert.deepEqual(sent.map((s) => s.reason), [...SKIP_REASONS, "pipeline-failed"]);
});
