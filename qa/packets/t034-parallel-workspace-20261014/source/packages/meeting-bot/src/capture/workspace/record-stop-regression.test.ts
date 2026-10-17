/** Existing failed-capture regressions; fixture authority, env load, encoding and notifications are controlled. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runRecord } from "../record-commands.js";
import { createTabBrowserDeps } from "../tab-browser.js";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
mock.method(process, "loadEnvFile", () => undefined);
const notifier: any = {notifyJoined() {}, notifySilence() {}, notifyFinished() {}, onBotEvent() {}};
// --- ISS-T034FIX-004: a rejected tab stop must never reach finalize (drives runRecord with an injected tab backend) ---
// The real tab receiver/deps run against a fake extension child process; only finalize and the loop poll are injected.
const FAKE_RC = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1], scenario = process.env.FAKE_RC;',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8"));',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'const ev = (o) => post("/event", JSON.stringify(o));',
  'const giveUp = Date.now() + 6000;',
  'await ev({event: "capture-started"}); await post("/chunk?seq=0", "partial-media");',
  'if (scenario.startsWith("early")) await new Promise((r) => setTimeout(r, 1000)); // let launch() resolve first: this must hit the RECORD LOOP, not startup',
  'if (scenario === "early-error") await ev({event: "capture-error", error: "lost audio"});',
  'if (scenario === "early-failed-stop") await ev({event: "capture-stopped", failed: true});',
  'for (;;) { if (Date.now() > giveUp) process.exit(0); if ((await (await post("/control", "{}")).json()).stop) break; await new Promise((r) => setTimeout(r, 30)); }',
  'if (scenario !== "early-failed-stop") await ev({event: "capture-stopped", failed: scenario !== "clean"});', 'process.exit(0);',
].join("\n");
async function driveRecord(scenario: string, untilMs: number) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-rc-")), script = join(dir, "fake-extension.mjs"), recordDir = join(dir, "record");
  assert.ok(dir.startsWith(join(tmpdir(), "lkb-rc-")));
  const keys=["LKB_BROWSER_PROFILE_DIRECTORY","LKB_CAPTURE_CONTROL_TOKEN","LKB_CAPTURE_CONTROL_GENERATION","LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE"];
  const saved=new Map(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];process.env.LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE="false";
  writeFileSync(script, FAKE_RC); process.env.FAKE_RC = scenario;
  const finalizeCalls: unknown[][] = []; let polls = 0, pollsAtEvent: number | undefined, pollsAtStop: number | undefined;
  try {
    const t0 = Date.now(); let error: unknown;
    await runRecord(["https://meet.google.com/abc-defg-hij", "--until", new Date(t0 + untilMs).toISOString(), "--backend", "tab",
      "--session-id", "t034-rc", "--tenant", "fixture", "--title", "fixture",
      "--recorded-by", "fixture-operator", "--capture-approved-by", "fixture-owner", "--capture-approval-ref", "fixture-only", "--organizer-consent", "unknown", "--consent-note", "fixture-only"], {
      recordDir, telegram: notifier, normalize: (video) => video, wait: async () => { polls++; await new Promise((r) => setTimeout(r, 20)); }, finalize: async (...args) => { finalizeCalls.push(args); },
      tab: (onEvent) => { const t = createTabBrowserDeps({python: process.execPath, joinScript: script, profileDir: join(dir, "profile"), recordDir,
        extensionDir: join(REPO_ROOT, "packages/meeting-bot/py/tab-capture"), sessionId: "t034-rc", tenantId: "fixture", startupTimeoutMs: 15000, log: () => {},
        onEvent: (h, e) => { if (e.event === "capture-error" || (e.event === "capture-stopped" && e.failed !== false)) pollsAtEvent ??= polls; onEvent(h, e); }});
        const stop = t.deps.stop!; t.deps.stop = async (h) => { pollsAtStop ??= polls; return stop(h); }; return t; },
    }).catch((e) => { error = e; });
    const webm = existsSync(recordDir) ? readdirSync(recordDir).filter((n) => n.endsWith(".webm")) : [];
    const status = webm.length ? JSON.parse(readFileSync(join(recordDir, webm[0]! + ".status.json"), "utf8")) : undefined;
    const media = webm.length ? readFileSync(join(recordDir, webm[0]!), "utf8") : undefined;
    return {error, finalizeCalls, pollsAtEvent, pollsAtStop, status, media};
  } finally { delete process.env.FAKE_RC;for(const [key,value] of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(dir, {recursive: true, force: true}); }
}
const T4 = {timeout: 60000};
// Deterministic, no clock: the loop must make ZERO further waits between the failure event and the stop call.
const assertLoopExitedAtOnce = (r: Awaited<ReturnType<typeof driveRecord>>) => { assert.notEqual(r.pollsAtEvent, undefined); assert.equal(r.pollsAtStop, r.pollsAtEvent, "loop waited again after the failure event"); };
const expectFailed = (r: Awaited<ReturnType<typeof driveRecord>>, reason: RegExp) => {
  assert.ok(r.error instanceof Error, "runRecord must reject (non-zero exit)"); assert.match((r.error as Error).message, reason);
  assert.equal(r.finalizeCalls.length, 0, "finalize/promote must never be called"); assert.equal(r.media, "partial-media", "partial file left in place");
  assert.equal(r.status?.state, "failed");
};
test("ISS-T034FIX-004: tab stop rejects (failed stop at end of recording) -> runRecord rejects with the reason, no finalize, partial kept, status failed", T4, async () => {
  expectFailed(await driveRecord("stop-failed", 4000), /failed stop; media is incomplete/);
});
test("ISS-T034FIX-004: a capture-error ends the record loop promptly and the capture fails (no finalize)", T4, async () => {
  const r = await driveRecord("early-error", 120000); expectFailed(r, /lost audio/);
  assertLoopExitedAtOnce(r);
});
test("ISS-T034FIX-004: an early capture-stopped failed:true ends the record loop promptly and the capture fails (no finalize)", T4, async () => {
  const r = await driveRecord("early-failed-stop", 120000); expectFailed(r, /failed stop; media is incomplete/);
  assertLoopExitedAtOnce(r);
});
test("ISS-T034FIX-004 parity: a clean tab stop is not a capture failure (status stopped; proceeds past stop into normalize/finalize)", T4, async () => {
  const r = await driveRecord("clean", 3000);
  assert.equal(r.status?.state, "stopped"); assert.equal(r.media, "partial-media");
  assert.equal(r.finalizeCalls.length, 1, "a clean fixture reaches the immediate finalizer without an encoder");
  if (r.error) assert.doesNotMatch((r.error as Error).message, /failed stop|lost audio|Malformed/);
});
