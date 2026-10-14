// zoomwebinar lane: ffmpeg -c copy recovery fallback for a stop whose final flush was never acknowledged.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remuxRecoveryEnabled, remuxWebmInPlace } from "./tab-remux.js";
import { createTabBrowserDeps } from "./tab-browser.js";

const playable = (f: string) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-f", "null", "-"]).status === 0;
function makeWebm(file: string) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=5:duration=2",
    "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libvpx", "-b:v", "50k", "-c:a", "libopus", "-f", "webm", file]);
  assert.equal(r.status, 0, String(r.stderr));
}

test("remuxRecoveryEnabled: only LKB_TAB_REMUX_RECOVERY=1 enables it", () => {
  assert.equal(remuxRecoveryEnabled({}), false);
  assert.equal(remuxRecoveryEnabled({ LKB_TAB_REMUX_RECOVERY: "0" }), false);
  assert.equal(remuxRecoveryEnabled({ LKB_TAB_REMUX_RECOVERY: "1" }), true);
});

test("remuxWebmInPlace: remuxes a real webm with -c copy, keeps the original as .raw", () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-remux-")), f = join(dir, "c.webm");
  try {
    makeWebm(f); const before = readFileSync(f);
    assert.deepEqual(remuxWebmInPlace(f), { ok: true });
    assert.ok(playable(f)); assert.deepEqual(readFileSync(`${f}.raw`), before); assert.ok(!existsSync(`${f}.remux.webm`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("remuxWebmInPlace: garbage or missing media fails closed and leaves the file untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-remux-")), f = join(dir, "c.webm");
  try {
    assert.equal(remuxWebmInPlace(f).ok, false);
    writeFileSync(f, "not media");
    const r = remuxWebmInPlace(f);
    assert.equal(r.ok, false); assert.equal(readFileSync(f, "utf8"), "not media");
    assert.ok(!existsSync(`${f}.raw`) && !existsSync(`${f}.remux.webm`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Fake join script = Chrome killed before the recorder flushes: delivers one real chunk, then exits on stop WITHOUT capture-stopped.
const FAKE = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1];',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8"));',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'await post("/event", JSON.stringify({event: "capture-started"}));',
  'await post("/chunk?seq=0", readFileSync(process.env.FAKE_CHUNK));',
  'for (;;) { if ((await (await post("/control", "{}")).json()).stop) process.exit(0); await new Promise((r) => setTimeout(r, 30)); }',
].join("\n");

async function stopWithoutAck(flag: string | undefined) {
  const dir = mkdtempSync(join(tmpdir(), "lkb-remux-")), script = join(dir, "fake-join.mjs"), recordDir = join(dir, "record"), chunk = join(dir, "chunk.webm");
  writeFileSync(script, FAKE); makeWebm(chunk);
  process.env.FAKE_CHUNK = chunk; if (flag) process.env.LKB_TAB_REMUX_RECOVERY = flag;
  try {
    const t = createTabBrowserDeps({ python: process.execPath, joinScript: script, profileDir: join(dir, "profile"), recordDir,
      extensionDir: join(process.cwd(), "py/tab-capture"), sessionId: "rx", tenantId: "fixture", startupTimeoutMs: 15000, log: () => {} });
    const { sessionHandle, mediaStream } = await t.deps.launch("https://zoom.us/wc/1/join", {tenantId: "fixture", consentNote: "fixture"});
    let error: Error | undefined;
    await t.deps.stop!(sessionHandle).catch((e) => { error = e; });
    return { error, mediaStream: String(mediaStream), status: JSON.parse(readFileSync(`${mediaStream}.status.json`, "utf8")) };
  } finally { delete process.env.FAKE_CHUNK; delete process.env.LKB_TAB_REMUX_RECOVERY; }
}

test("stop without a flush ack and Chrome gone: default = failed (unchanged); flag on = recovered playable file", { timeout: 60000 }, async () => {
  const off = await stopWithoutAck(undefined);
  assert.match(off.error?.message ?? "", /did not acknowledge final flush/); assert.equal(off.status.state, "failed");
  assert.ok(!existsSync(`${off.mediaStream}.raw`));
  const on = await stopWithoutAck("1");
  assert.equal(on.error, undefined); assert.equal(on.status.state, "stopped");
  assert.match(on.status.error, /recovered by ffmpeg -c copy/);
  assert.ok(playable(on.mediaStream) && existsSync(`${on.mediaStream}.raw`));
});
