/**
 * packages/meeting-bot/src/capture/reconnect-gaps.test.ts — T-029. No browser/OBS/ffmpeg: pure
 * mapping (gapsForSourceDoc) and event-collection (collectGapEvent) logic only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

import { collectGapEvent, gapsForSourceDoc, validateCaptureControlGaps, installCaptureControl, launchControlledRecording, type RecordingControl, type GapWindow } from "./reconnect-gaps.js";

test("gapsForSourceDoc converts epoch-second windows to ISO timestamps, keeping reason/recovered", () => {
  const gaps: GapWindow[] = [
    { start: 1_700_000_000, end: 1_700_000_025, reason: "banner", recovered: true },
    { start: 1_700_000_100, end: 1_700_000_140, reason: "offline", recovered: false },
  ];
  const out = gapsForSourceDoc(gaps);
  assert.deepEqual(out, [
    { start: new Date(1_700_000_000 * 1000).toISOString(), end: new Date(1_700_000_025 * 1000).toISOString(), reason: "banner", recovered: true },
    { start: new Date(1_700_000_100 * 1000).toISOString(), end: new Date(1_700_000_140 * 1000).toISOString(), reason: "offline", recovered: false },
  ]);
});

test("gapsForSourceDoc on an empty run is an empty array", () => {
  assert.deepEqual(gapsForSourceDoc([]), []);
});

test("collectGapEvent pushes a well-formed gap event", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 10, end: 35, reason: "banner", recovered: true });
  assert.deepEqual(gaps, [{ start: 10, end: 35, reason: "banner", recovered: true }]);
});

test("collectGapEvent ignores every non-gap event (heartbeat, clicked, ended, reconnect-reload)", () => {
  const gaps: GapWindow[] = [];
  for (const event of ["heartbeat", "clicked", "ended", "reconnect-reload", "reconnect-giveup", "opened"]) {
    collectGapEvent(gaps, { event, t: 1 });
  }
  assert.deepEqual(gaps, []);
});

test("collectGapEvent defaults a missing reason/recovered rather than throwing", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 5, end: 9 });
  assert.deepEqual(gaps, [{ start: 5, end: 9, reason: "unknown", recovered: false }]);
});

test("collectGapEvent accumulates multiple gaps across a run in order", () => {
  const gaps: GapWindow[] = [];
  collectGapEvent(gaps, { event: "gap", t: 1, start: 0, end: 25, reason: "banner", recovered: true });
  collectGapEvent(gaps, { event: "heartbeat", t: 2 });
  collectGapEvent(gaps, { event: "gap", t: 3, start: 200, end: 400, reason: "offline", recovered: false });
  assert.equal(gaps.length, 2);
  assert.equal(gaps.at(1)?.reason, "offline");
  assert.equal(gaps.at(1)?.recovered, false);
});


test("managed IPC validates complete capability and exact command; manual mode remains unchanged", () => {
  const token = "a".repeat(64), generation = "11111111-1111-4111-8111-111111111111";
  const context = {tenantId: "owned", sessionId: "session", until: Date.now() + 60000, startedAt: Date.now() - 1000};
  const fake = (env: NodeJS.ProcessEnv, connected = true) => Object.assign(new EventEmitter(), {env, connected,
    send: (value: unknown, callback: () => void) => {acks.push(value); callback();}, disconnect(this: any) {this.connected = false; this.emit("disconnect");}}) as any;
  const acks: unknown[] = [];
  for (const env of [{LKB_CAPTURE_CONTROL_TOKEN: token}, {LKB_CAPTURE_CONTROL_GENERATION: generation},
    {LKB_CAPTURE_CONTROL_TOKEN: "invalid", LKB_CAPTURE_CONTROL_GENERATION: generation}]) assert.throws(() => installCaptureControl(context, fake(env)), /managed/);
  assert.throws(() => installCaptureControl(context, fake({LKB_CAPTURE_CONTROL_TOKEN: token,LKB_CAPTURE_CONTROL_GENERATION: generation}, false)), /managed/);
  const manual = fake({}), control = installCaptureControl(context, manual); manual.emit("disconnect");
  assert.equal(control.request(), undefined); assert.equal(manual.listenerCount("message"), 0); control.dispose();
  const processLike = fake({LKB_CAPTURE_CONTROL_TOKEN: token,LKB_CAPTURE_CONTROL_GENERATION: generation});
  const managed = installCaptureControl(context, processLike);
  const command = {version: 1,type: "stop",tenantId: "owned",sessionId: "session",generation,token,reason: "cancelled"};
  for (const value of [null, [], {...command,version: true}, {...command,type: "ack"}, {...command,tenantId: "foreign"},
    {...command,sessionId: "foreign"}, {...command,generation: "22222222-2222-4222-8222-222222222222"},
    {...command,token: "b".repeat(64)}, {...command,reason: "kill"}, {...command,extra: true}, {...command,reason: "x".repeat(5000)}]) {
    processLike.emit("message", value); assert.equal(managed.request(), undefined);
  }
  processLike.emit("message", command); const accepted = managed.request();
  processLike.emit("message", command); assert.equal(managed.request(), accepted); assert.equal(acks.length, 2);
  processLike.emit("message", {...command,reason: "rescheduled"}); assert.equal(acks.length, 2);
  assert.equal(managed.gap()?.reason, "capture-control-cancelled"); assert.equal(managed.gap()?.recovered, false);
  assert.ok(managed.gap()!.start >= context.startedAt / 1000); assert.equal(managed.gap()?.end, context.until / 1000);
  managed.dispose(); managed.dispose(); processLike.emit("message", command); assert.equal(acks.length, 2);
  assert.equal(processLike.listenerCount("message"), 0); assert.equal(processLike.listenerCount("disconnect"), 0);
  const disconnected = installCaptureControl(context, fake({LKB_CAPTURE_CONTROL_TOKEN: token,LKB_CAPTURE_CONTROL_GENERATION: generation}));
  const another = fake({LKB_CAPTURE_CONTROL_TOKEN: token,LKB_CAPTURE_CONTROL_GENERATION: generation}), disconnectedControl = installCaptureControl(context, another);
  another.emit("disconnect"); assert.equal(disconnectedControl.request()?.reason, "controller-disconnected");
  disconnected.dispose(); disconnectedControl.dispose();
});

test("real child IPC accepts before graceful flush and disconnect conservatively stops managed capture", {timeout: 15000}, async () => {
  const token = "a".repeat(64), generation = "11111111-1111-4111-8111-111111111111";
  const moduleUrl = new URL("./reconnect-gaps.ts", import.meta.url).href;
  for (const disconnect of [false, true]) {
    const code = `import {installCaptureControl} from ${JSON.stringify(moduleUrl)};
      const control=installCaptureControl({tenantId:'owned',sessionId:'session',until:Date.now()+60000,startedAt:Date.now()});
      process.send({fixture:'ready'});
      const poll=setInterval(()=>{const request=control.request();if(!request)return;clearInterval(poll);
        console.log('stop:'+request.reason);setTimeout(()=>{console.log('flush-complete');control.dispose();process.exit(0);},20);},10);`;
    const childEnv: NodeJS.ProcessEnv = {...process.env,LKB_CAPTURE_CONTROL_TOKEN: token,LKB_CAPTURE_CONTROL_GENERATION: generation}; delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {env: childEnv,stdio: ["ignore","pipe","pipe","ipc"],windowsHide: true});
    let output = "", acknowledged = false; child.stdout!.on("data", data => {output += data;}); child.stderr!.on("data", () => {});
    const closed = new Promise<number | null>((resolve,reject) => {child.once("error",reject);child.once("exit",resolve);});
    await new Promise<void>((resolve,reject) => {child.once("close",()=>reject(new Error("Fixture closed before IPC ready"))); child.on("message", (message: any) => {
      if (message.fixture === "ready") resolve(); else if (message.type === "ack") {acknowledged = true; assert.ok(!output.includes("flush-complete"));}
    });});
    if (disconnect) child.disconnect();
    else {child.send({version:1,type:"stop",tenantId:"owned",sessionId:"session",generation,token,reason:"rescheduled"});}
    assert.equal(await closed, 0); assert.ok(output.includes(`stop:${disconnect ? "controller-disconnected" : "rescheduled"}`));
    assert.ok(output.includes("flush-complete")); assert.equal(acknowledged, !disconnect);
  }
});

test("controlled launcher refuses absent or conflicting owner before spawn", async () => {
  await assert.rejects(launchControlledRecording(process.cwd(), ["record"], {LKB_TENANT_ID:"owned"}, () => {}), /owner/);
  await assert.rejects(launchControlledRecording(process.cwd(), ["record","--session-id","session","--tenant","foreign"], {LKB_TENANT_ID:"owned"}, () => {}), /owner/);
});


test("launcher actual IPC ignores foreign ACK, deduplicates accepted request and retires late handle", {timeout: 10000}, async () => {
  let control: RecordingControl | undefined;
  const launch = ((exe: string, args: string[], options: any) => {
    assert.equal(exe, process.execPath); assert.deepEqual(args.slice(0,2), ["--import","tsx"]);
    assert.ok(args[2]?.endsWith("packages\\meeting-bot\\src\\cli.ts") || args[2]?.endsWith("packages/meeting-bot/src/cli.ts"));
    assert.equal(options.shell,false); assert.equal(options.windowsHide,true); assert.deepEqual(options.stdio,["ignore","pipe","pipe","ipc"]);
    assert.match(options.env.LKB_CAPTURE_CONTROL_TOKEN,/^[0-9a-f]{64}$/); delete options.env.NODE_TEST_CONTEXT;
    const code = `process.on('message',m=>{process.send({...m,type:'ack',tenantId:'foreign'});
      setTimeout(()=>{process.send({...m,type:'ack'});process.send({...m,type:'ack'});},30);
      setTimeout(()=>{process.disconnect();process.exit(0);},150);});`;
    return spawn(exe,["--input-type=module","-e",code],options);
  }) as typeof spawn;
  const finished = launchControlledRecording(process.cwd(), ["record","--session-id","session"], {LKB_TENANT_ID:"owned"}, () => {}, value => {control=value;}, launch);
  assert.ok(control); const first = control.stop("cancelled"), duplicate = control.stop("cancelled"); assert.equal(first,duplicate);
  assert.equal(await first,"accepted"); assert.equal(await control.stop("rescheduled"),"unavailable");
  await finished; assert.equal(await control.stop("cancelled"),"unavailable");
});

test("launcher five-second ACK timeout reports unavailable without killing actual child", {timeout: 12000}, async () => {
  let control: RecordingControl | undefined, exited = false;
  const launch = ((exe: string, args: string[], options: any) => {
    assert.deepEqual(args.slice(0,2),["--import","tsx"]); assert.equal(options.shell,false); assert.equal(options.windowsHide,true);
    delete options.env.NODE_TEST_CONTEXT;
    const child=spawn(exe,["--input-type=module","-e","process.on('message',()=>{});setTimeout(()=>{process.disconnect();process.exit(0);},6100);"],options);
    child.on("exit",()=>{exited=true;}); return child;
  }) as typeof spawn;
  const finished=launchControlledRecording(process.cwd(),["record","--session-id","session"],{LKB_TENANT_ID:"owned"},()=>{}, value=>{control=value;},launch);
  const started=Date.now();assert.ok(control);assert.equal(await control.stop("cancelled"),"unavailable");
  assert.ok(Date.now()-started>=4500);assert.equal(exited,false);await finished;assert.equal(exited,true);
});


test("strict gap unions retain controls and computed recovery only, with bounded deduplication", () => {
  const gap={start:100,end:200,reason:"capture-control-cancelled",recovered:false}, recovery={...gap,reason:"controller-interrupted-coverage-unverified"};
  assert.deepEqual(validateCaptureControlGaps([gap,gap]),[gap]);
  assert.deepEqual(validateCaptureControlGaps([...Array(8).fill(gap),...Array(8).fill(gap)],"combined-control"),[gap]);
  assert.throws(()=>validateCaptureControlGaps([recovery]));assert.throws(()=>validateCaptureControlGaps([recovery],"combined-control"));
  assert.deepEqual(validateCaptureControlGaps([gap,recovery,gap,recovery],"recovery"),[gap,recovery]);
  for(const value of [null,{},Array(25).fill(gap),[{...gap,start:Infinity}],[{...gap,end:-1}],[{...gap,recovered:true}],
    [{...gap,extra:true}],[{...gap,reason:"invented"}],[{...gap,end:253402300800}]]) assert.throws(()=>validateCaptureControlGaps(value,"recovery"));
});
