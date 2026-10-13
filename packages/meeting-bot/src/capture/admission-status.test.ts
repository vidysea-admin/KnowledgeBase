/**
 * ISS-CAPTUREFIX-001 (capadmit): a capture is never marked "recording" -- tab status file, "Joined"
 * notification -- while the bot is unadmitted. Real tab receiver + fake join script (no browser, no
 * network beyond loopback); the wait hook samples the status file on every controller poll.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdmissionGate } from "./admission-gate.js";
import { runRecord } from "./record-commands.js";
import { createTabBrowserDeps } from "./tab-browser.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

test("gate.state: lobby -> admitted; lobby -> failed on timeout; late timeout after admitted stays admitted", () => {
  const a = createAdmissionGate();
  assert.equal(a.state, "lobby");
  a.onEvent({ event: "admitted" });
  assert.equal(a.state, "admitted");
  a.onEvent({ event: "admission_timeout", seconds: 9, limit: 9 });
  assert.equal(a.state, "admitted");
  const b = createAdmissionGate();
  b.onEvent({ event: "watchdog-reload" });
  assert.equal(b.state, "lobby");
  b.onEvent({ event: "admission_timeout", seconds: 901, limit: 900 });
  assert.equal(b.state, "failed");
});

const FAKE = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1], scenario = process.env.FAKE_CAPADMIT;',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8"));',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'const ev = (o) => post("/event", JSON.stringify(o));',
  'const out = (e) => console.log(JSON.stringify({t: Date.now() / 1000, ...e}));',
  'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
  'const giveUp = Date.now() + 40000;',
  'out({event: "opened"}); await ev({event: "capture-started"}); await post("/chunk?seq=0", "partial-media");',
  'await sleep(1500);',
  'if (scenario === "admitted" || scenario === "admitted-first") out({event: "admitted"});',
  'if (scenario === "timeout") out({event: "admission_timeout", seconds: 901, limit: 900});',
  'for (;;) { if (Date.now() > giveUp) process.exit(0); if ((await (await post("/control", "{}")).json()).stop) break; await sleep(30); }',
  'await ev({event: "capture-stopped", failed: false}); process.exit(0);',
].join("\n");

async function drive(scenario: string, untilMs: number) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-capadmit-")), script = join(dir, "fake-join.mjs"), recordDir = join(dir, "record");
  writeFileSync(script, FAKE);
  process.env.FAKE_CAPADMIT = scenario;
  const states: string[] = [], joined: number[] = [];
  const telegram = new Proxy({ enabled: false, notifyJoined: () => { joined.push(states.length); } } as any,
    { get: (t, k) => (k in t ? t[k] : () => {}) });
  try {
    let error: unknown;
    await runRecord(["https://meet.google.com/abc-defg-hij", "--until", new Date(Date.now() + untilMs).toISOString(), "--backend", "tab",
      "--session-id", "capadmit", "--tenant", "fixture", "--title", "fixture"], {
      recordDir, telegram, finalize: async () => {},
      wait: async () => {
        await new Promise((r) => setTimeout(r, 20));
        try {
          const f = readdirSync(recordDir).find((n) => n.endsWith(".status.json"));
          if (f) { const s = JSON.parse(readFileSync(join(recordDir, f), "utf8")).state; if (states[states.length - 1] !== s) states.push(s); }
        } catch { /* mid-write */ }
      },
      tab: (onEvent) => createTabBrowserDeps({ python: process.execPath, joinScript: script, profileDir: join(dir, "profile"), recordDir,
        extensionDir: join(REPO_ROOT, "packages/meeting-bot/py/tab-capture"), sessionId: "capadmit", tenantId: "fixture",
        startupTimeoutMs: 15000, log: () => {}, onEvent }),
    }).catch((e) => { error = e; });
    return { error: error as Error | undefined, states, joined };
  } finally { delete process.env.FAKE_CAPADMIT; rmSync(dir, { recursive: true, force: true }); }
}
const T = { timeout: 60000 };

test("runRecord: lobby the whole run -> status never 'recording', no Joined notification", T, async () => {
  const r = await drive("lobby", 9000);
  assert.ok(r.states.includes("starting"), `states ${r.states} err ${r.error?.message}`);
  assert.ok(!r.states.includes("recording"), `states ${r.states}`);
  assert.equal(r.joined.length, 0);
});

test("runRecord: admitted -> status goes starting -> recording; exactly one Joined, only after admission", T, async () => {
  const r = await drive("admitted", 10000);
  const i = r.states.indexOf("recording");
  assert.ok(i > 0 && r.states[i - 1] === "starting", `states ${r.states}`);
  assert.equal(r.joined.length, 1);
  assert.ok((r.joined[0] ?? 0) >= 1, "Joined fired before any status sample, i.e. not at join time: " + r.joined);
});

test("runRecord: admission_timeout -> typed failure, never 'recording', no Joined", T, async () => {
  const r = await drive("timeout", 120000);
  assert.match(r.error?.message ?? "", /^admission_timeout: /);
  assert.ok(!r.states.includes("recording"), `states ${r.states}`);
  assert.equal(r.joined.length, 0);
});
