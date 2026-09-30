import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTabCaptureReceiver, writeOwnedTabStatus } from "./tab-browser.js";

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
