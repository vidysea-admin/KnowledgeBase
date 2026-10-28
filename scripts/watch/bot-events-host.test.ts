import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendBotEvent } from "../../packages/meeting-bot/src/autojoin/bot-events.js";
import { createBotEventsDeps } from "./bot-events-host.js";

test("the host reader returns only the asked tenant's rows, newest first, bounded", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-bev-"));
  try {
    for (let i = 0; i < 5; i++) appendBotEvent(dir, { tenantId: "a", at: `2026-10-15T09:0${i}:00.000Z`, kind: "about-to-join", sessionKey: `s${i}`, title: `t${i}` });
    appendBotEvent(dir, { tenantId: "b", at: "2026-10-15T09:30:00.000Z", kind: "capture-failed", sessionKey: "x", title: "other tenant" });
    const deps = createBotEventsDeps({ stateDir: dir });
    const rows = (await deps.list("a", 3)) as { title: string }[];
    assert.deepEqual(rows.map((r) => r.title), ["t4", "t3", "t2"]);
    assert.deepEqual(await deps.list("nobody", 10), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
