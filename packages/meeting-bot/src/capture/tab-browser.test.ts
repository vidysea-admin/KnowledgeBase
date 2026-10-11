import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTabBrowserDeps, createTabCaptureReceiver, writeOwnedTabStatus } from "./tab-browser.js";

const origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
test("tab receiver authenticates, persists ordered media and makes acknowledged retries idempotent", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-tab-")), output = path.join(dir, "capture.webm");
  const events: string[] = [];
  const receiver = await createTabCaptureReceiver(output, (event) => events.push(event.event));
  const headers = {Origin: origin, Authorization: `Bearer ${receiver.token}`};
  const post = (seq: string, body: string, override = headers) => fetch(`${receiver.endpoint}/chunk?seq=${seq}`, {method: "POST", headers: override, body});
  try {
    assert.equal((await post("0", "header", {...headers, Authorization: "Bearer wrong"})).status, 403);
    assert.equal((await post("0", "header", {...headers, Origin: "https://hostile.example"})).status, 403);
    assert.equal((await post("0", "header")).status, 200);
    assert.equal(readFileSync(output, "utf8"), "header", "response is sent only after bytes reach disk");
    assert.equal((await post("0", "header")).status, 200);
    assert.equal((await post("0", "changed retry")).status, 409);
    assert.equal((await post("2", "out of order")).status, 409);
    assert.equal((await post("1", "frames")).status, 200);
    assert.equal((await post("NaN", "invalid")).status, 400);
    assert.equal(readFileSync(output, "utf8"), "headerframes");
    assert.equal(receiver.bytes(), 12);
    await fetch(`${receiver.endpoint}/event`, {method: "POST", headers, body: JSON.stringify({event: "capture-started"})});
    assert.deepEqual(events, ["capture-started"]);
    const control = (override: Record<string, string> = headers, body = "{}") => fetch(`${receiver.endpoint}/control`, {method: "POST", headers: override, body});
    assert.deepEqual(await (await control()).json(), {stop: false});
    assert.equal((await control({Origin: origin})).status, 403);
    assert.equal((await control({...headers, Authorization: "Bearer wrong"})).status, 403);
    assert.equal((await control({...headers, Origin: "https://hostile.example"})).status, 403);
    assert.equal((await control({Authorization: headers.Authorization})).status, 403);
    assert.equal((await control(headers, "invalid JSON")).status, 400);
    assert.equal((await control(headers, "x".repeat(1025))).status, 400);
    assert.equal(receiver.bytes(), 12);
    assert.deepEqual(events, ["capture-started"], "control requests must not write events or media");
    receiver.stop();
    assert.deepEqual(await (await control()).json(), {stop: true});
    assert.deepEqual(await (await fetch(`${receiver.endpoint}/control`, {headers})).json(), {stop: true});
  } finally { await receiver.close(); await receiver.close(); rmSync(dir, {recursive: true, force: true}); }
});

test("tab receiver rejects malformed/oversized input and keeps file unchanged", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-tab-")), output = path.join(dir, "capture.webm");
  const events: string[] = [];
  const receiver = await createTabCaptureReceiver(output, (event) => events.push(event.event));
  const headers = {Origin: origin, Authorization: `Bearer ${receiver.token}`};
  try {
    const response = await fetch(`${receiver.endpoint}/chunk?seq=0`, {method: "POST", headers, body: Buffer.alloc(8 * 1024 * 1024 + 1)});
    assert.equal(response.status, 400);
    assert.equal(receiver.bytes(), 0);
    assert.equal((await fetch(`${receiver.endpoint}/event`, {method: "POST", headers, body: "invalid json"})).status, 400);
    assert.equal((await fetch(`${receiver.endpoint}/event`, {method: "POST", headers, body: JSON.stringify({event: "invented"})})).status, 400);
    assert.equal((await fetch(`${receiver.endpoint}/chunk?seq=0`, {method: "POST", headers, body: "valid"})).status, 200);
    assert.equal(readFileSync(output, "utf8"), "valid");
    assert.equal(events.filter((event) => event === "capture-error").length, 2);
  } finally { await receiver.close(); rmSync(dir, {recursive: true, force: true}); }
});


test("owned status retains deduplicated durable control gaps and refuses corrupt identity without overwrite", () => {
  const dir=mkdtempSync(path.join(tmpdir(),"owned-status-")),output=path.join(dir,"tab-1234-aabbccdd.webm"),file=output+".status.json";
  const identity={output,pid:1234,handle:"tab-1234-aabbccdd",sessionId:"session",tenantId:"owned",profileDir:dir,recordDir:dir,controllerStartedAt:"opaque-start"};
  const gap={start:100,end:200,reason:"capture-control-controller-disconnected",recovered:false};
  try {
    writeOwnedTabStatus(file,identity,{state:"recording",controlGaps:[gap]});
    writeOwnedTabStatus(file,identity,{state:"stopped",controlGaps:[gap]});
    assert.deepEqual(JSON.parse(readFileSync(file,"utf8")).controlGaps,[gap]);
    const before=readFileSync(file,"utf8");
    for(const changes of [{pid:42},{tenantId:"foreign"},{output:output+"other"},{controllerStartedAt:"other"},
      {controlGaps:[{...gap,recovered:true}]},{controlGaps:[{...gap,start:NaN}]},{controlGaps:[{...gap,reason:"unknown"}]},
      {controlGaps:[{...gap,end:99}]},{controlGaps:Array(9).fill(gap)}]) {
      assert.throws(()=>writeOwnedTabStatus(file,identity,changes));assert.equal(readFileSync(file,"utf8"),before);
    }
    for(const patch of [{pid:0},{pid:true},{pid:2147483648},{output:output+"other"},{handle:"foreign"},{profileDir:"relative"},{recordDir:dir+path.sep},
      {tenantId:"foreign"},{sessionId:"foreign"},{controllerStartedAt:undefined}]) {
      assert.throws(()=>writeOwnedTabStatus(file,{...identity,...patch},{controlGaps:[gap]}));assert.equal(readFileSync(file,"utf8"),before);
    }
    for(const payload of ["{","[]",JSON.stringify({...identity,state:"stopped",controlGaps:[{...gap,recovered:true}]}),"x".repeat(8193)]) {
      writeFileSync(file,payload);assert.throws(()=>writeOwnedTabStatus(file,identity,{state:"stopped"}));assert.equal(readFileSync(file,"utf8"),payload);
    }
    rmSync(file);symlinkSync(path.join(dir,"absent"),file);assert.throws(()=>writeOwnedTabStatus(file,identity,{state:"stopped"}),/symlink/);
    assert.equal(existsSync(path.join(dir,"absent")),false);assert.ok(!readdirSync(dir).some(name=>name.endsWith(".tmp")));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

// ISS-T034EXT-002/-006: the extension's capture-stopped{failed} must decide the outcome (fake extension = a child node process).
const fakeExtension = [
  'import {readFileSync} from "node:fs";',
  'const argv = process.argv, ext = argv[argv.indexOf("--capture-extension") + 1];',
  'const cfg = JSON.parse(readFileSync(ext + "/config.json", "utf8")), scenario = process.env.FAKE_SCENARIO;',
  'const post = (route, body) => fetch(cfg.endpoint + route, {method: "POST", body, headers: {Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Authorization: "Bearer " + cfg.token}});',
  'const ev = (o) => post("/event", JSON.stringify(o));',
  'await ev({event: "capture-started"}); await post("/chunk?seq=0", "partial-media");',
  'for (;;) { if ((await (await post("/control", "{}")).json()).stop) break; await new Promise((r) => setTimeout(r, 30)); }',
  'if (scenario === "error-then-clean-stop") await ev({event: "capture-error", error: "track lost"});',
  'await ev({event: "capture-stopped", failed: scenario === "lost-error-failed-stop"});',
].join("\n");
async function runFake(scenario: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-tabfail-")), script = path.join(dir, "fake-extension.mjs");
  writeFileSync(script, fakeExtension); process.env.FAKE_SCENARIO = scenario;
  const tab = createTabBrowserDeps({python: process.execPath, joinScript: script, profileDir: path.join(dir, "profile"), recordDir: path.join(dir, "record"),
    extensionDir: fileURLToPath(new URL("../../py/tab-capture", import.meta.url)), sessionId: "fixture", tenantId: "fixture", startupTimeoutMs: 15000, log: () => {}});
  const {sessionHandle} = await tab.deps.launch("http://127.0.0.1/", {tenantId: "fixture", consentNote: "fixture capture only"});
  let outcome: unknown = "resolved";
  await tab.deps.stop!(sessionHandle).catch((error: Error) => { outcome = error.message; });
  const output = tab.outputPath(sessionHandle)!, status = JSON.parse(readFileSync(`${output}.status.json`, "utf8"));
  const media = existsSync(output) ? readFileSync(output, "utf8") : undefined;
  rmSync(dir, {recursive: true, force: true});
  return {outcome, status, media};
}
test("ISS-T034EXT-002/006: a normal stop is still a success (default parity)", {timeout: 60000}, async () => {
  const r = await runFake("clean");
  assert.equal(r.outcome, "resolved"); assert.equal(r.status.state, "stopped"); assert.equal(r.media, "partial-media");
});
test("ISS-T034EXT-006: capture-stopped failed:true with its capture-error POST lost is a FAILURE; partial media kept, status failed, not stopped", {timeout: 60000}, async () => {
  const r = await runFake("lost-error-failed-stop");
  assert.match(String(r.outcome), /failed stop; media is incomplete/);
  assert.equal(r.status.state, "failed"); assert.match(r.status.error, /incomplete/); assert.equal(r.status.bytes, 13);
  assert.equal(r.media, "partial-media", "the partial file is kept for recovery, never deleted or promoted");
});
test("ISS-T034EXT-002: a capture-error seen earlier is sticky even when the later capture-stopped says failed:false", {timeout: 60000}, async () => {
  const r = await runFake("error-then-clean-stop");
  assert.match(String(r.outcome), /track lost/); assert.equal(r.status.state, "failed"); assert.equal(r.media, "partial-media");
});
