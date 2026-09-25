/**
 * packages/meeting-bot/src/capture/whatsapp-channel.test.ts — U3. Confirms the stub sends
 * nothing (no transport exists to call) and always logs the one clear "not configured" line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWhatsAppChannel } from "./whatsapp-channel.js";

function logCapture() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

test("createWhatsAppChannel always returns a channel named 'whatsapp'", () => {
  const channel = createWhatsAppChannel();
  assert.equal(channel.name, "whatsapp");
});

test("send() resolves without throwing and never contacts any transport", async () => {
  const channel = createWhatsAppChannel();
  await assert.doesNotReject(() => channel.send("hello"));
});

test("send() logs the 'not configured' line every call", async () => {
  const { lines, log } = logCapture();
  const channel = createWhatsAppChannel({ log });
  await channel.send("first");
  await channel.send("second");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /whatsapp.*not configured/);
  assert.match(lines[1]!, /whatsapp.*not configured/);
});

test("send() never includes the message text in its log line (nothing to leak, but stays a pure status line)", async () => {
  const { lines, log } = logCapture();
  const channel = createWhatsAppChannel({ log });
  await channel.send("super secret digest contents");
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /super secret/);
});
