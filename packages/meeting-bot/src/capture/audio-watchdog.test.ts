/**
 * packages/meeting-bot/src/capture/audio-watchdog.test.ts — T-031. Every test drives
 * `createAudioWatchdog` with a fake clock, a manually-triggered fake meter source, and a fake
 * ticker — no real OBS/browser/Telegram anywhere near this file. `createRealLevelSource` is
 * tested separately below against a fake `MeterClient` (never a real websocket).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createAudioWatchdog,
  createRealLevelSource,
  mulToDb,
  peakMulFromLevels,
  SILENT_TRIGGER_SEC,
  type AudioWatchdogDeps,
  type MeterClient,
} from "./audio-watchdog.js";

/** Fake clock + fake tick/meter harness. `tick()` advances the fake clock by `sec` seconds, and
 * (unless `noTick` is passed) fires the watchdog's own tick callback once — matching a real
 * setInterval firing after that much wall time. `level(db)` simulates one meter reading. */
function harness() {
  let now = 0;
  let tickFn: (() => void) | undefined;
  let tickCanceled = 0;
  let levelFn: ((db: number) => void) | undefined;
  let unsubscribed = 0;
  const silenceAlerts: number[] = [];
  const reconnects: number[] = []; // records `now` at each reconnect() call
  const logs: string[] = [];

  const deps: AudioWatchdogDeps = {
    now: () => now,
    subscribeLevel: (onLevelDb) => {
      levelFn = onLevelDb;
      return () => {
        unsubscribed++;
        levelFn = undefined;
      };
    },
    scheduleTick: (fn) => {
      tickFn = fn;
      return () => {
        tickCanceled++;
        tickFn = undefined;
      };
    },
    notifySilence: (durationSec) => silenceAlerts.push(durationSec),
    reconnect: () => reconnects.push(now),
    log: (m) => logs.push(m),
  };

  return {
    deps,
    advance(sec: number, { fireTick = true } = {}) {
      now += sec * 1000;
      if (fireTick) tickFn?.();
    },
    level(db: number) {
      levelFn?.(db);
    },
    silenceAlerts,
    reconnects,
    logs,
    get tickCanceledCount() {
      return tickCanceled;
    },
    get unsubscribedCount() {
      return unsubscribed;
    },
    get hasActiveTick() {
      return tickFn !== undefined;
    },
    get hasActiveLevelListener() {
      return levelFn !== undefined;
    },
  };
}

// ---- core silence/alert/reconnect state machine ----------------------------

test("silent for 119s -> no alert, no reconnect", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(119);
  assert.equal(h.silenceAlerts.length, 0);
  assert.equal(h.reconnects.length, 0);
});

test("silent past 120s -> exactly one alert + one reconnect", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(121);
  assert.deepEqual(h.silenceAlerts, [121]);
  assert.equal(h.reconnects.length, 1);
});

test("alarmed stretch never fires twice while still silent (subsequent ticks are no-ops)", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(121); // fires
  h.advance(1); // still silent, already alarmed
  h.advance(1);
  assert.equal(h.silenceAlerts.length, 1);
  assert.equal(h.reconnects.length, 1);
});

test("audio returning re-arms (logs it), and a second silent stretch fires a second alert + reconnect", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(121); // first stretch fires
  assert.equal(h.silenceAlerts.length, 1);

  h.level(-10); // audio returns — re-arms
  assert.ok(h.logs.some((l) => l.includes("re-armed")));

  h.advance(121); // second full stretch, counted fresh from the return
  assert.deepEqual(h.silenceAlerts, [121, 121]);
  assert.equal(h.reconnects.length, 2);
});

test("a non-silent level just above the threshold counts as audible and resets the clock", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(100, { fireTick: false });
  h.level(-50); // AT the boundary — record-finalize.ts's isSilentCapture is "strictly below"
  h.advance(100); // only 100s since the -50 reading — must not fire yet
  assert.equal(h.silenceAlerts.length, 0);
});

test("a level just below the threshold does NOT reset the clock (stays silent)", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.advance(100, { fireTick: false });
  h.level(-50.1); // strictly below -50 — silent, does not touch lastAudibleAt
  h.advance(21); // total 121s since watchdog start, unaffected by the silent reading
  assert.deepEqual(h.silenceAlerts, [121]);
});

test("a muted tab (0 / -Infinity dB from the very start) still triggers the alert", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  h.level(mulToDb(0)); // exactly what a muted capture's peak multiplier converts to
  h.advance(121);
  assert.deepEqual(h.silenceAlerts, [121]);
  assert.equal(h.reconnects.length, 1);
});

// ---- stop() cleanliness -----------------------------------------------------

test("stop() cancels the tick and unsubscribes the level listener exactly once", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  assert.equal(h.hasActiveTick, true);
  assert.equal(h.hasActiveLevelListener, true);
  wd.stop();
  assert.equal(h.tickCanceledCount, 1);
  assert.equal(h.unsubscribedCount, 1);
  assert.equal(h.hasActiveTick, false);
  assert.equal(h.hasActiveLevelListener, false);
});

test("stop() before start() is a safe no-op", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.stop();
  assert.equal(h.tickCanceledCount, 0);
  assert.equal(h.unsubscribedCount, 0);
});

test("stop() is idempotent — a second call does not double-cancel", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  wd.stop();
  wd.stop();
  assert.equal(h.tickCanceledCount, 1);
  assert.equal(h.unsubscribedCount, 1);
});

test("after stop(), further clock advances never fire an alert", () => {
  const h = harness();
  const wd = createAudioWatchdog(h.deps);
  wd.start();
  wd.stop();
  h.advance(1000, { fireTick: false }); // tickFn is gone; nothing to fire even if we tried
  assert.equal(h.silenceAlerts.length, 0);
});

// ---- C3 — never touches mute state ------------------------------------------

test("C3: the watchdog's dependency surface has no mute-shaped field (structural, not behavioral)", () => {
  const h = harness();
  const keys = Object.keys(h.deps).sort();
  assert.deepEqual(keys, ["log", "notifySilence", "now", "reconnect", "scheduleTick", "subscribeLevel"]);
});

// ---- peakMulFromLevels / mulToDb --------------------------------------------

test("peakMulFromLevels takes the max peak (index 1) across channels", () => {
  // [magnitude, peak, peakUnaffected] per channel (Obs_VolumeMeter.cpp) — index 1 is "peak".
  const levels = [
    [0.1, 0.3, 0.3],
    [0.05, 0.8, 0.8],
  ];
  assert.equal(peakMulFromLevels(levels), 0.8);
});

test("peakMulFromLevels returns undefined for a malformed/empty payload", () => {
  assert.equal(peakMulFromLevels([]), undefined);
  assert.equal(peakMulFromLevels("not-an-array"), undefined);
  assert.equal(peakMulFromLevels([[]]), undefined);
});

test("mulToDb: 0 -> -Infinity, 1.0 -> 0dB, 0.5 -> ~-6.02dB", () => {
  assert.equal(mulToDb(0), -Infinity);
  assert.equal(mulToDb(1), 0);
  assert.ok(Math.abs(mulToDb(0.5) - -6.0206) < 0.01);
});

// ---- createRealLevelSource — fake MeterClient, never a real websocket ------

function fakeMeterClient() {
  const calls: { url: string; password: string; sub: { eventSubscriptions: number } }[] = [];
  let handler: ((data: { inputs: Array<Record<string, unknown>> }) => void) | undefined;
  let offCount = 0;
  let disconnectCount = 0;
  const client: MeterClient = {
    connect: async (url, password, identificationParams) => {
      calls.push({ url, password, sub: identificationParams });
    },
    on: (_event, cb) => {
      handler = cb;
    },
    off: (_event, cb) => {
      if (cb === handler) offCount++;
    },
    disconnect: async () => {
      disconnectCount++;
    },
  };
  return {
    client,
    calls,
    fireEvent: (data: { inputs: Array<Record<string, unknown>> }) => handler?.(data),
    get offCount() {
      return offCount;
    },
    get disconnectCount() {
      return disconnectCount;
    },
  };
}

/** Flushes the microtask queue so the fake client's async `connect().then(...)` has resolved
 * before assertions run. */
function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

test("createRealLevelSource connects with the InputVolumeMeters subscription bit set", async () => {
  const fake = fakeMeterClient();
  const source = createRealLevelSource(
    { obsUrl: "ws://x", obsPassword: "secret", inputName: "LKB Bot Audio" },
    () => fake.client,
  );
  source(() => {});
  await flush();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]!.url, "ws://x");
  assert.equal(fake.calls[0]!.password, "secret");
  // 4095 (All) | 65536 (InputVolumeMeters) = 69631
  assert.equal(fake.calls[0]!.sub.eventSubscriptions, 69631);
});

test("createRealLevelSource only reports the configured input's level, filtering others out", async () => {
  const fake = fakeMeterClient();
  const readings: number[] = [];
  const source = createRealLevelSource(
    { obsUrl: "ws://x", obsPassword: "p", inputName: "LKB Bot Audio" },
    () => fake.client,
  );
  const unsubscribe = source((db) => readings.push(db));
  await flush();
  fake.fireEvent({
    inputs: [
      { inputName: "Desktop Audio", inputLevelsMul: [[0.9, 0.9, 0.9]] },
      { inputName: "LKB Bot Audio", inputLevelsMul: [[0.5, 1.0, 1.0]] },
    ],
  });
  assert.deepEqual(readings, [0]); // mulToDb(1.0) = 0dB — only the matching input's peak (index 1)
  unsubscribe();
  assert.equal(fake.offCount, 1);
  assert.equal(fake.disconnectCount, 1);
});

test("createRealLevelSource unsubscribe before connect resolves still disconnects exactly once (no leaked handle)", async () => {
  const fake = fakeMeterClient();
  const source = createRealLevelSource(
    { obsUrl: "ws://x", obsPassword: "p", inputName: "LKB Bot Audio" },
    () => fake.client,
  );
  const unsubscribe = source(() => {});
  unsubscribe(); // called synchronously, before connect()'s microtask has even run — on() was
  // never reached, so there is nothing for off() to meaningfully unregister yet; the real risk
  // this test isolates is the connection itself never being closed (asserted below).
  assert.equal(fake.disconnectCount, 1);
  await flush(); // the deferred .then() branch also sees `stopped` — must not disconnect a 2nd time
  assert.equal(fake.disconnectCount, 1);
});
