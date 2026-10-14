// T-034 (lane tabcapture): the REAL tab-capture receiver (tab-browser.ts) on an ephemeral 127.0.0.1 port,
// driven by fake extension clients (plain fetch / a child node process). No Chrome, no OBS, no browser.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTabBrowserDeps, createTabCaptureReceiver } from "./tab-browser.js";

const ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXT_DIR = fileURLToPath(new URL("../../py/tab-capture", import.meta.url));
const auth = (token: string, origin = ORIGIN) => ({Origin: origin, Authorization: `Bearer ${token}`});
const tmp = () => mkdtempSync(path.join(tmpdir(), "lkb-tabrecv-"));

// ---- wiring guard (CI discovery): the extension logic tests must stay inside `pnpm -r test` ----
test("T-034: package.json test script runs the extension logic tests (CI runs `pnpm -r test`)", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.test, /py\/tab-capture\/\*\.test\.mjs/);
  assert.match(pkg.scripts.test, /src\/\*\*\/\*\.test\.ts/, "TS tests (this file) are still discovered");
  const found = readdirSync(EXT_DIR).filter((f) => f.endsWith(".test.mjs")).sort();
  assert.deepEqual(found, ["background.test.mjs", "recorder-bitrate.test.mjs", "recorder.test.mjs"], "a new *.test.mjs is picked up by the glob; update this list on purpose");
  const ci = readFileSync(new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /run:\s*pnpm -r test/);
});

// ---- chunk ordering ----
test("receiver: 25 in-order chunks land byte-exact; gaps, replays with different bytes and bad seq are refused and write nothing", async () => {
  const dir = tmp(), output = path.join(dir, "a.webm"), events: string[] = [];
  const r = await createTabCaptureReceiver(output, (e) => events.push(e.event));
  const post = (seq: string, body: string) => fetch(`${r.endpoint}/chunk?seq=${seq}`, {method: "POST", headers: auth(r.token), body});
  try {
    let expected = "";
    for (let i = 0; i < 25; i++) { const c = `<c${i}>`; assert.equal((await post(String(i), c)).status, 200); expected += c; }
    assert.equal(readFileSync(output, "utf8"), expected);
    for (const [seq, body] of [["26", "gap"], ["30", "far"], ["3", "old"], ["24", "different-last"]] as const) {
      assert.equal((await post(seq, body)).status, 409, `seq ${seq}`);
    }
    for (const seq of ["", "-1", "1.5", "0x1", "abc", "1e3"]) assert.equal((await post(seq, "x")).status, 400, `seq '${seq}'`);
    assert.equal((await post("25", "")).status, 400, "empty chunk");
    assert.equal((await post("24", "<c24>")).status, 200, "acknowledged-but-lost retry of the last chunk is idempotent");
    assert.equal(readFileSync(output, "utf8"), expected);
    assert.equal(r.bytes(), Buffer.byteLength(expected));
    assert.equal((await post("25", "<c25>")).status, 200);
    assert.equal(readFileSync(output, "utf8"), expected + "<c25>");
  } finally { await r.close(); rmSync(dir, {recursive: true, force: true}); }
});

test("receiver: a burst of simultaneous chunk POSTs never reorders or interleaves bytes on disk", async () => {
  const dir = tmp(), output = path.join(dir, "a.webm");
  const r = await createTabCaptureReceiver(output, () => {});
  try {
    const bodies = Array.from({length: 12}, (_, i) => `[${i}]`.repeat(2000));
    const results = await Promise.all(bodies.map((b, i) => fetch(`${r.endpoint}/chunk?seq=${i}`, {method: "POST", headers: auth(r.token), body: b}).then((x) => x.status)));
    for (const s of results) assert.ok(s === 200 || s === 409, `status ${s}`);
    assert.ok(results.includes(200));
    // Whatever was accepted must be a gapless prefix of the sequence, byte-exact.
    const onDisk = readFileSync(output, "utf8");
    assert.equal(onDisk.length, r.bytes());
    let prefix = "";
    for (const b of bodies) { if (prefix.length >= onDisk.length) break; prefix += b; }
    assert.equal(onDisk, prefix);
  } finally { await r.close(); rmSync(dir, {recursive: true, force: true}); }
});

// ---- refused non-loopback / foreign origins ----
test("receiver: only a chrome-extension origin plus the token is served; every other origin (incl. non-loopback) is refused on every route and writes nothing", async () => {
  const dir = tmp(), output = path.join(dir, "a.webm"), events: string[] = [];
  const r = await createTabCaptureReceiver(output, (e) => events.push(e.event));
  const bad = ["https://evil.example", "http://evil.example:80", "http://127.0.0.1:1", "http://localhost", "null", "",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.evil.example", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "chrome-extension://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "chrome-extension://aaaa", "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
  try {
    for (const origin of bad) {
      const h: Record<string, string> = {Authorization: `Bearer ${r.token}`}; if (origin) h.Origin = origin;
      for (const [route, method, body] of [["/chunk?seq=0", "POST", "evil-bytes"], ["/event", "POST", '{"event":"capture-started"}'],
        ["/control", "POST", "{}"], ["/control", "GET", undefined]] as const) {
        const res = await fetch(`${r.endpoint}${route}`, {method, headers: h, body});
        assert.equal(res.status, 403, `${method} ${route} origin='${origin}'`);
      }
    }
    assert.equal(r.bytes(), 0); assert.equal(readFileSync(output, "utf8"), ""); assert.deepEqual(events, []);
    for (const authorization of [undefined, "Bearer ", "Bearer x", `Bearer ${r.token}x`, `Bearer ${r.token.slice(1)}`]) {
      const h: Record<string, string> = {Origin: ORIGIN}; if (authorization !== undefined) h.Authorization = authorization;
      assert.equal((await fetch(`${r.endpoint}/chunk?seq=0`, {method: "POST", headers: h, body: "x"})).status, 403);
    }
    assert.equal(r.bytes(), 0);
    assert.equal((await fetch(`${r.endpoint}/chunk?seq=0`, {method: "POST", headers: auth(r.token), body: "ok"})).status, 200);
  } finally { await r.close(); rmSync(dir, {recursive: true, force: true}); }
});

test("receiver: listens on 127.0.0.1 only (a non-loopback interface address refuses the connection)", async () => {
  const dir = tmp(), r = await createTabCaptureReceiver(path.join(dir, "a.webm"), () => {});
  try {
    assert.match(r.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
    const port = Number(r.endpoint.split(":")[2]);
    const external = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
    for (const host of external) {
      const outcome = await new Promise<string>((resolve) => {
        const s = connect({host, port, timeout: 3000}); s.once("connect", () => { s.destroy(); resolve("connected"); });
        s.once("error", (e) => resolve((e as NodeJS.ErrnoException).code ?? "error")); s.once("timeout", () => { s.destroy(); resolve("timeout"); });
      });
      assert.notEqual(outcome, "connected", `reachable on ${host}`);
    }
  } finally { await r.close(); rmSync(dir, {recursive: true, force: true}); }
});

// ---- two tab sessions in parallel: receiver level ----
test("two receivers (two tabs) fed interleaved chunks concurrently never mix bytes; a token/endpoint from the other session is refused", async () => {
  const dir = tmp(), outA = path.join(dir, "a.webm"), outB = path.join(dir, "b.webm");
  const evA: any[] = [], evB: any[] = [];
  const A = await createTabCaptureReceiver(outA, (e) => evA.push(e)), B = await createTabCaptureReceiver(outB, (e) => evB.push(e));
  try {
    assert.notEqual(A.endpoint, B.endpoint); assert.notEqual(A.token, B.token);
    const send = async (r: typeof A, tag: string) => {
      await fetch(`${r.endpoint}/event`, {method: "POST", headers: auth(r.token), body: JSON.stringify({event: "capture-started", tag})});
      for (let i = 0; i < 30; i++) assert.equal((await fetch(`${r.endpoint}/chunk?seq=${i}`, {method: "POST", headers: auth(r.token), body: `${tag}${i};`})).status, 200);
      await fetch(`${r.endpoint}/event`, {method: "POST", headers: auth(r.token), body: JSON.stringify({event: "capture-stopped", failed: false, tag})});
    };
    const cross = (async () => {  // tab A's client holding B's endpoint (and vice versa) with its own token
      for (let i = 0; i < 10; i++) {
        assert.equal((await fetch(`${B.endpoint}/chunk?seq=${i}`, {method: "POST", headers: auth(A.token), body: "A-into-B"})).status, 403);
        assert.equal((await fetch(`${A.endpoint}/event`, {method: "POST", headers: auth(B.token), body: '{"event":"capture-error","error":"B-into-A"}'})).status, 403);
      }
    })();
    await Promise.all([send(A, "A"), send(B, "B"), cross]);
    const want30 = (tag: string) => Array.from({length: 30}, (_, i) => `${tag}${i};`).join("");
    assert.equal(readFileSync(outA, "utf8"), want30("A")); assert.equal(readFileSync(outB, "utf8"), want30("B"));
    assert.deepEqual(evA.map((e) => [e.event, e.tag]), [["capture-started", "A"], ["capture-stopped", "A"]]);
    assert.deepEqual(evB.map((e) => [e.event, e.tag]), [["capture-started", "B"], ["capture-stopped", "B"]]);
  } finally { await A.close(); await B.close(); rmSync(dir, {recursive: true, force: true}); }
});

// ---- full deps (launch/stop) with a fake extension child process ----
const fake = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1];',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8")), S = process.env.FAKE_SCENARIO ?? "clean", TAG = process.env.FAKE_TAG ?? "T";',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'const ev = (o) => post("/event", JSON.stringify(o));',
  'if (S === "exit-before-start") process.exit(3);',
  'await ev({event: "capture-started"});',
  'for (let i = 0; i < 20; i++) { await post("/chunk?seq=" + i, TAG + i + ";"); await new Promise((r) => setTimeout(r, 5)); }',
  // Crash only once the test drops a sentinel (after launch() has returned): exiting on a fixed delay raced launch()'s 250ms startup poll,
  // which rejects launch when the child is already dead (seen on fast Linux CI). Dies with an exit code only, no capture-stopped.
  'if (S === "crash-exit-code-only") { const {existsSync} = await import("node:fs"); const sentinel = ext + "/../.crash-now"; while (!existsSync(sentinel)) await new Promise((r) => setTimeout(r, 10)); process.exit(7); }',
  'for (;;) { if ((await (await post("/control", "{}")).json()).stop) break; await new Promise((r) => setTimeout(r, 30)); }',
  'if (S === "error-then-clean-stop") await ev({event: "capture-error", error: "track lost"});',
  'await ev({event: "capture-stopped", failed: S === "failed-stop"});',
].join("\n");

function makeDeps(dir: string, name: string, scenario: string, tag: string) {
  const script = path.join(dir, "fake-extension.mjs"); writeFileSync(script, fake);
  process.env.FAKE_SCENARIO = scenario; process.env.FAKE_TAG = tag;  // inherited by the child spawned at launch()
  return createTabBrowserDeps({python: process.execPath, joinScript: script, profileDir: path.join(dir, name, "profile"), recordDir: path.join(dir, name, "record"),
    extensionDir: EXT_DIR, sessionId: name, tenantId: "fixture", startupTimeoutMs: 15000, log: () => {}});
}
const want = (tag: string) => Array.from({length: 20}, (_, i) => `${tag}${i};`).join("");
const launchOpts = {tenantId: "fixture", consentNote: "fixture capture only"};

test("two tab sessions in parallel (two deps, two fake extension processes) record their own bytes only, both finish stopped", {timeout: 120000}, async () => {
  const dir = tmp();
  try {
    const a = makeDeps(dir, "tabA", "clean", "A");
    const hA = (await a.deps.launch("http://127.0.0.1/a", launchOpts)).sessionHandle;   // child A spawned with TAG=A
    const b = makeDeps(dir, "tabB", "clean", "B");
    const hB = (await b.deps.launch("http://127.0.0.1/b", launchOpts)).sessionHandle;   // child B spawned with TAG=B while A runs
    assert.notEqual(hA, hB);
    await new Promise((r) => setTimeout(r, 400));
    await Promise.all([a.deps.stop!(hA), b.deps.stop!(hB)]);
    assert.equal(readFileSync(a.outputPath(hA)!, "utf8"), want("A"));
    assert.equal(readFileSync(b.outputPath(hB)!, "utf8"), want("B"));
    assert.equal(JSON.parse(readFileSync(`${a.outputPath(hA)}.status.json`, "utf8")).state, "stopped");
    assert.equal(JSON.parse(readFileSync(`${b.outputPath(hB)}.status.json`, "utf8")).state, "stopped");
    assert.notEqual(a.outputPath(hA), b.outputPath(hB));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("one deps instance refuses an overlapping second capture (single active tab per controller)", {timeout: 60000}, async () => {
  const dir = tmp();
  try {
    const a = makeDeps(dir, "tabA", "clean", "A");
    const h = (await a.deps.launch("http://127.0.0.1/a", launchOpts)).sessionHandle;
    await assert.rejects(a.deps.launch("http://127.0.0.1/b", launchOpts), /already active/);
    await a.deps.stop!(h);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

// Every way a capture can fail must reject stop(), leave status "failed" (never "stopped"), keep the partial and carry a reason.
const FAILURES: [string, RegExp][] = [
  ["failed-stop", /reported a failed stop/],
  ["error-then-clean-stop", /track lost/],
  ["crash-exit-code-only", /did not acknowledge final flush/],   // ISS-T034FIX-005: the browser dies with only an exit code, no capture-stopped
];
for (const [scenario, reason] of FAILURES) {
  test(`a failed capture is never reported as success: ${scenario}`, {timeout: 90000}, async () => {
    const dir = tmp();
    try {
      const t = makeDeps(dir, "tab", scenario, "F");
      const h = (await t.deps.launch("http://127.0.0.1/", launchOpts)).sessionHandle;
      if (scenario === "crash-exit-code-only") writeFileSync(path.join(dir, "tab", "record", ".crash-now"), "1");   // child dies only now, after launch succeeded
      await new Promise((r) => setTimeout(r, 300));
      let outcome = "resolved";
      await t.deps.stop!(h).catch((e: Error) => { outcome = e.message; });
      assert.match(outcome, reason);
      const o = t.outputPath(h)!, status = JSON.parse(readFileSync(`${o}.status.json`, "utf8"));
      assert.equal(status.state, "failed"); assert.match(status.error, reason);
      assert.equal(readFileSync(o, "utf8"), want("F"), "partial media kept for recovery");
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });
}

test("a fake extension that exits before ever signalling capture-started makes launch reject and leaves no lock or extension copy", {timeout: 60000}, async () => {
  const dir = tmp();
  try {
    const t = makeDeps(dir, "tab", "exit-before-start", "X");
    await assert.rejects(t.deps.launch("http://127.0.0.1/", launchOpts));
    assert.equal(existsSync(path.join(dir, "tab", "profile", ".lkb-tab-capture.lock")), false);
    const rec = path.join(dir, "tab", "record");
    assert.ok(!readdirSync(rec).some((f) => f.startsWith(".extension-")));
    for (const f of readdirSync(rec).filter((n) => n.endsWith(".status.json"))) assert.equal(JSON.parse(readFileSync(path.join(rec, f), "utf8")).state, "failed");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
