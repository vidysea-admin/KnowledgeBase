/**
 * ISS-CAPTUREFIX-001: the silence watchdog is suspended until sb_join.py reports `admitted`; no
 * reload is requested in the lobby; admission_timeout and post-admission reload kills are reported
 * clearly. Unit tests drive the gate with a fake watchdog; the runRecord tests use the real tab
 * receiver with a fake join script (no browser) and spy on the watchdog's level subscription,
 * which createAudioWatchdog().start() performs exactly once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdmissionGate, RELOAD_CAUSE_WINDOW_MS } from "./admission-gate.js";
import { runRecord } from "./record-commands.js";
import { createTabBrowserDeps } from "./tab-browser.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// ---- unit ----

test("gate: watchdog is NOT started by lobby traffic, started exactly once by admitted", () => {
  let starts = 0;
  const g = createAdmissionGate();
  g.attach({ start: () => { starts++; } });
  for (const event of ["opened", "clicked", "heartbeat", "watchdog-reload-suppressed", "capture-level"]) g.onEvent({ event });
  assert.equal(starts, 0);
  assert.equal(g.admitted, false);
  g.onEvent({ event: "admitted" });
  assert.equal(starts, 1);
});

test("gate: admitted arriving BEFORE attach starts the watchdog on attach", () => {
  let starts = 0;
  const g = createAdmissionGate();
  g.onEvent({ event: "admitted" });
  g.attach({ start: () => { starts++; } });
  assert.equal(starts, 1);
});

test("gate: admission_timeout is a typed, readable failure", () => {
  const msg = createAdmissionGate().onEvent({ event: "admission_timeout", seconds: 901, limit: 900 });
  assert.match(msg ?? "", /^admission_timeout: .*900s.*901s/);
});

test("gate: capture-error after an admitted-state reload names the reload; without one it is untouched", () => {
  let t = 1_000_000;
  const g = createAdmissionGate(() => t);
  g.onEvent({ event: "admitted" });
  assert.equal(g.onEvent({ event: "capture-error", error: "audio track ended unexpectedly" }), undefined);
  g.onEvent({ event: "watchdog-reload" });
  t += 5_000;
  const msg = g.onEvent({ event: "capture-error", error: "audio track ended unexpectedly" });
  assert.match(msg ?? "", /audio track ended unexpectedly.*after a page reload \[watchdog-reload\] following admission/);
  t += RELOAD_CAUSE_WINDOW_MS + 1;
  assert.equal(g.onEvent({ event: "capture-error", error: "x" }), undefined, "stale reload is not blamed");
});

test("gate: a reload seen before admission is not blamed as a post-admission reload", () => {
  const g = createAdmissionGate();
  g.onEvent({ event: "reconnect-reload" });
  g.onEvent({ event: "admitted" });
  assert.equal(g.onEvent({ event: "capture-error", error: "x" }), undefined);
});

test("gate: admission info carries assumed + reason from the admitted event; positive admission is not assumed", () => {
  const g = createAdmissionGate();
  assert.equal(g.admission, undefined);
  g.onEvent({ event: "admitted", assumed: true, reason: "no-lobby-signal" });
  assert.deepEqual(g.admission, { assumed: true, reason: "no-lobby-signal" });
  assert.equal(g.admitted, true);
  g.onEvent({ event: "admitted", assumed: false });
  assert.equal((g as { admission?: { assumed: boolean } }).admission?.assumed, true, "first admission wins");
  const h = createAdmissionGate();
  h.onEvent({ event: "admitted", assumed: false });
  assert.deepEqual(h.admission, { assumed: false });
  const k = createAdmissionGate();
  k.onEvent({ event: "admitted" });
  assert.equal(k.admission?.assumed, false, "an admitted event without assumed is a positive admission");
});

// ---- runRecord with a fake join script ----

const FAKE = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1], scenario = process.env.FAKE_ADM;',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8"));',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'const ev = (o) => post("/event", JSON.stringify(o));',
  'const out = (e) => console.log(JSON.stringify({t: Date.now() / 1000, ...e}));',
  'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
  'const giveUp = Date.now() + 8000;',
  'out({event: "opened"}); await ev({event: "capture-started"}); await post("/chunk?seq=0", "partial-media");',
  'await sleep(800);',
  'if (scenario === "admitted") out({event: "admitted"});',
  'if (scenario === "timeout") out({event: "admission_timeout", seconds: 901, limit: 900});',
  'if (scenario === "reload-kill") { out({event: "admitted"}); await sleep(300); out({event: "watchdog-reload", reason: "audio-silence"}); await sleep(300); await ev({event: "capture-error", error: "audio track ended unexpectedly"}); }',
  'for (;;) { if (Date.now() > giveUp) process.exit(0); if ((await (await post("/control", "{}")).json()).stop) break; await sleep(30); }',
  'await ev({event: "capture-stopped", failed: false}); process.exit(0);',
].join("\n");

async function drive(scenario: string, untilMs: number) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-adm-")), script = join(dir, "fake-join.mjs"), recordDir = join(dir, "record");
  writeFileSync(script, FAKE);
  process.env.FAKE_ADM = scenario;
  let levelSubscriptions = 0;
  try {
    const t0 = Date.now();
    let error: unknown;
    await runRecord(["https://meet.google.com/abc-defg-hij", "--until", new Date(t0 + untilMs).toISOString(), "--backend", "tab",
      "--session-id", "adm", "--tenant", "fixture", "--title", "fixture",
      "--capture-approved-by", "fixture", "--capture-approval-ref", "fixture", "--recorded-by", "fixture"], {
      recordDir, wait: async () => { await new Promise((r) => setTimeout(r, 20)); }, finalize: async () => {},
      tab: (onEvent) => {
        const t = createTabBrowserDeps({ python: process.execPath, joinScript: script, profileDir: join(dir, "profile"), recordDir,
          extensionDir: join(REPO_ROOT, "packages/meeting-bot/py/tab-capture"), sessionId: "adm", tenantId: "fixture",
          startupTimeoutMs: 15000, log: () => {}, onEvent });
        const sub = t.subscribeLevel;
        t.subscribeLevel = (l: (db: number) => void) => { levelSubscriptions++; return sub(l); };
        return t;
      },
    }).catch((e) => { error = e; });
    return { error: error as Error | undefined, levelSubscriptions };
  } finally { delete process.env.FAKE_ADM; rmSync(dir, { recursive: true, force: true }); }
}
const T = { timeout: 60000 };

test("runRecord: lobby the whole run -> watchdog never starts (no level subscription)", T, async () => {
  const r = await drive("lobby", 3500);
  assert.equal(r.levelSubscriptions, 0);
  if (r.error) assert.doesNotMatch(r.error.message, /admission_timeout|page reload/);
});

test("runRecord: admitted -> watchdog starts (exactly one level subscription)", T, async () => {
  const r = await drive("admitted", 3500);
  assert.equal(r.levelSubscriptions, 1);
});

test("runRecord: admission_timeout fails the capture with a typed message and never starts the watchdog", T, async () => {
  const r = await drive("timeout", 120000);
  assert.match(r.error?.message ?? "", /^admission_timeout: /);
  assert.equal(r.levelSubscriptions, 0);
});

test("runRecord: a reload that ends the audio track after admission is reported as such", T, async () => {
  const r = await drive("reload-kill", 120000);
  assert.match(r.error?.message ?? "", /audio track ended unexpectedly.*page reload \[watchdog-reload\] following admission/);
  assert.equal(r.levelSubscriptions, 1);
});
