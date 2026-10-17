import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRecordConsent } from "./context.js";
import { preparePrivateCaptureAudio, publishPrivateCaptureTurns } from "./downstream.js";

function receipt() {
  const row = createRecordConsent([], {tenantId: "fixture", sessionId: "session", meetingUrl: "https://meet.google.com/abc-defg-hij"},
    {LKB_CAPTURE_APPROVED_BY: "Umesh", LKB_CAPTURE_APPROVAL_REF: "D-165", LKB_CAPTURE_RECORDED_BY: "operator-id"});
  row.privateWindows = [{tStart: 5, tEnd: 10}]; row.mediaStartedAt=Date.parse(row.operationalApproval.appliedAt); return row;
}
test("provider input redaction is bounded argv-only ffmpeg and refuses failed or wholly private input", () => {
  const row = receipt(), calls: unknown[][] = [];
  const run = ((...args: unknown[]) => {calls.push(args); return {status: 0};}) as never;
  assert.match(preparePrivateCaptureAudio("/fixture/audio.m4a", row, 20, run), /audio\.privacy-[a-f0-9-]{36}\.m4a$/);
  assert.equal(calls.length, 1);
  const args = calls[0]![1] as string[];
  assert.equal(args[0], "-n");
  assert.equal(args[args.indexOf("-af") + 1], `aeval='if(between(t,${5-0.100001},${10+0.100001}),0,val(0))'`);
  assert.deepEqual(calls[0]![2], {encoding: "utf8", timeout: 600000});
  assert.throws(() => preparePrivateCaptureAudio("audio.m4a", row, 20, (() => ({status: 1})) as never), /redaction failed/);
  row.privateWindows = [{tStart: 0, tEnd: 5}, {tStart: 5, tEnd: 20}];
  assert.throws(() => preparePrivateCaptureAudio("audio.m4a", row, 20, run), /Entire capture/);
  assert.equal(calls.length, 1); // no provider/ffmpeg call for wholly private captures
});

test("actual persisted downstream transcript excludes private and overlapping turns", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lkb-private-turns-")), file = path.join(dir, "turns.json");
  try {
    writeFileSync(file, JSON.stringify([{tStart: 0, tEnd: 4.8, text: "public"}, {tStart: 4, tEnd: 6, text: "private-boundary"},
      {tStart: 6, tEnd: 8, text: "private-secret"}, {tStart:4.95,tEnd:4.98,text:"muted-leading-margin"},
      {tStart:10.02,tEnd:10.08,text:"muted-tail-margin"}, {tStart: 10.2, tEnd: 20, text: "public-after"}]));
    assert.deepEqual(publishPrivateCaptureTurns(file, receipt()), {inputTurns: 6, publicTurns: 2, excludedTurns: 4});
    const consumed = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(consumed.map((turn: {text: string}) => turn.text), ["public", "public-after"]);
    assert.equal(readFileSync(file, "utf8").includes("private-secret"), false);
    writeFileSync(file, JSON.stringify([{tStart: 6, tEnd: 8, text: "private-secret"}]));
    assert.throws(() => publishPrivateCaptureTurns(file, receipt()), /No public/);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), []);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
