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

// --- ISS-U4BR2-001: backstop throttle -------------------------------------------------------
//
// Ledger row: qa/issues.u4br2.jsonl, found by qa/verdicts/u4b-r2-alert-interface.md. Both
// recorded reproductions are re-run verbatim below, at the level of the component this unit
// changes (the sink), not via apps/api's `detectSilentWatchers` — this unit's edit scope is
// `packages/core/src/alerts/alert-sink.ts`(+test) only, and a `packages/core` test importing
// `apps/api` would itself be a new cross-boundary dependency this unit has no authorization to
// add. The call shapes below are exactly what `detectSilentWatchers` (health.ts:134-155) does on
// each `/health` hit: for every stale (tenantId, sourceType) still stale on this pass, call
// `deps.notifyWatchSilent(tenantId, sourceType, lastHeartbeatAt, intervalMs)` — no memory of a
// prior call. Reproduced here by making exactly the same two rounds of calls the ledger's probe
// made and asserting the fake transport's call count, matching the ledger's own method.

test("ISS-U4BR2-001 repro 1: two /health-equivalent calls for one stale row now collapse to 1 send (was 2)", async () => {
  const { calls, send } = fakeTransport();
  let t = 1_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t }));
  // Round 1: detectSilentWatchers with expectedSourceTypes:['drive'] and one stale row.
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  // Round 2: the very next /health hit, clock barely moved (well inside the 60s throttle window).
  t += 1_000;
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  await flush();
  assert.equal(calls.length, 1, "ISS-U4BR2-001 repro 1: expected 1 send (throttled), not 2");
});

test("ISS-U4BR2-001 repro 2: 3 expected source types x 2 rounds now send 3 alerts (was 6)", async () => {
  const { calls, send } = fakeTransport();
  let t = 2_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t }));
  const expectedSourceTypes = ["drive", "gmail", "calendar"]; // EXPECTED_WATCH_SOURCE_TYPES, only 1 row present -> all 3 stale (D-048: a missing row is maximally stale)
  // Round 1.
  for (const sourceType of expectedSourceTypes) sink.notifyWatchSilent("toc", sourceType, null, 3_600_000);
  // Round 2: next /health hit, still inside the throttle window.
  t += 1_000;
  for (const sourceType of expectedSourceTypes) sink.notifyWatchSilent("toc", sourceType, null, 3_600_000);
  await flush();
  assert.equal(calls.length, 3, "ISS-U4BR2-001 repro 2: expected 3 sends (one per type, round 2 fully throttled), not 6");
});

test("throttle key includes tenantId, not just sourceType — a different tenant's first alert is never swallowed", async () => {
  const { calls, send } = fakeTransport();
  const t = 3_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t }));
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  sink.notifyWatchSilent("other-tenant", "drive", null, 3_600_000); // same instant, different tenant
  await flush();
  assert.equal(calls.length, 2);
});

test("throttle key includes sourceType, not just tenantId — a different source type's first alert is never swallowed", async () => {
  const { calls, send } = fakeTransport();
  const t = 4_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t }));
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  sink.notifyWatchSilent("toc", "gmail", null, 3_600_000); // same instant, same tenant, different source
  await flush();
  assert.equal(calls.length, 2);
});

test("a stale watcher is re-alerted once the throttle window has elapsed — throttle is temporary, not permanent silence", async () => {
  const { calls, send } = fakeTransport();
  let t = 5_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t, throttleMs: 60_000 }));
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  t += 30_000; // still inside the window
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  t += 31_000; // now 61s after the first send -> window has elapsed
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  await flush();
  assert.equal(calls.length, 2, "expected the 1st and 3rd calls to send, the 2nd to throttle");
});

test("default throttle window is 60s, matching notify-channels.ts's DEFAULT_THROTTLE_MS, when no throttleMs override is given", async () => {
  const { calls, send } = fakeTransport();
  let t = 6_000_000;
  const sink = createTelegramAlertSink(sinkDeps({ send, now: () => t })); // no throttleMs override
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  t += 59_999; // 1ms short of 60s
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  t += 2; // now 60_001ms after the first send
  sink.notifyWatchSilent("toc", "drive", null, 3_600_000);
  await flush();
  assert.equal(calls.length, 2, "expected the 1st and 3rd calls to send, the 2nd (still inside 60s) to throttle");
});
