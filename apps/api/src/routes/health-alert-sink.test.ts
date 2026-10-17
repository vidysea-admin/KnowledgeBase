/** ISS-U4BR2-001: actual detector -> actual sink, entirely fake Telegram transport and DB reads. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramAlertSink } from "@lkb/core";
import { detectSilentWatchers } from "./health.js";

for (const expectedSourceTypes of [["drive"], ["drive", "gmail", "calendar"]]) {
  test(`ISS-U4BR2-001: repeated health probes send ${expectedSourceTypes.length} alerts per minute`, async () => {
    let time = Date.parse("2026-10-09T12:00:00Z");
    const sent: string[] = [];
    const sink = createTelegramAlertSink({
      token: "FAKE-TEST-TOKEN", chatId: "FAKE-TEST-CHAT", now: () => time,
      send: async (_token, _chatId, text) => { sent.push(text); },
    });
    const deps = {
      tenantIds: ["toc"], intervalMs: 3_600_000,
      expectedSourceTypes: expectedSourceTypes.length === 1 ? expectedSourceTypes : undefined,
      listHeartbeats: async () => [{ tenantId: "toc", sourceType: "drive", lastHeartbeatAt: "2026-10-09T08:00:00Z" }],
      now: () => new Date(time), notifyWatchSilent: sink.notifyWatchSilent,
    };
    // Replay the recorded reproduction verbatim: the detector still calls a recording fake twice
    // per stale type. The fix belongs at the transport sink, not by hiding current silent counts.
    let notifyCalls = 0;
    const recordingDeps = { ...deps, notifyWatchSilent: () => { notifyCalls++; } };
    await detectSilentWatchers(recordingDeps);
    await detectSilentWatchers(recordingDeps);
    assert.equal(notifyCalls, expectedSourceTypes.length * 2);
    for (let probe = 0; probe < 2; probe++) {
      assert.deepEqual(await detectSilentWatchers(deps), { silent: expectedSourceTypes.length, unreadable: 0 });
    }
    assert.equal(sent.length, expectedSourceTypes.length);
    assert.equal(new Set(sent).size, expectedSourceTypes.length);
    time += 59_999;
    await detectSilentWatchers(deps);
    assert.equal(sent.length, expectedSourceTypes.length);
    time += 1;
    await detectSilentWatchers(deps);
    assert.equal(sent.length, expectedSourceTypes.length * 2);
  });
}
