import test from "node:test";
import assert from "node:assert/strict";
import { createRecordConsent } from "./context.js";
import { publicRecordCaptureIntervals, recordPrivacyMaskIntervals, recordGuardedPrivacyMaskIntervals } from "./coverage.js";

const owner = {tenantId: "fixture", sessionId: "session", meetingUrl: "https://meet.google.com/abc-defg-hij"};
test("validated private intervals become intentional gaps, never invented transcript turns", () => {
  const receipt = createRecordConsent([], owner, {LKB_CAPTURE_APPROVED_BY: "Umesh", LKB_CAPTURE_APPROVAL_REF: "D-165", LKB_CAPTURE_RECORDED_BY: "fixture-operator"});
  receipt.privateWindows = [{tStart: 5, tEnd: 10}, {tStart: 8, tEnd: 15}, {tStart: 20, tEnd: 25}, {tStart: 40, tEnd: 50}];
  receipt.mediaStartedAt=Date.parse(receipt.operationalApproval.appliedAt);
  assert.deepEqual(publicRecordCaptureIntervals(receipt, owner, {tStart: 0, tEnd: 30}),
    [{tStart: 0, tEnd: 5}, {tStart: 15, tEnd: 20}, {tStart: 25, tEnd: 30}]);
  assert.deepEqual(publicRecordCaptureIntervals(receipt, owner, {tStart: 9, tEnd: 12}), []);
  assert.throws(() => publicRecordCaptureIntervals(receipt, {...owner, tenantId: "foreign"}, {tStart: 0, tEnd: 30}), /mismatched/);
  assert.throws(() => publicRecordCaptureIntervals(receipt, owner, {tStart: -1, tEnd: 30}), /coverage range/);
  assert.deepEqual(recordPrivacyMaskIntervals(receipt, owner, 22), [{start: 5, end: 15}, {start: 20, end: 22}]);
  assert.throws(() => recordPrivacyMaskIntervals(receipt, {...owner, tenantId: "foreign"}, 22), /mismatched/);
  const original=structuredClone(receipt.privateWindows);
  assert.deepEqual(publicRecordCaptureIntervals(receipt,owner,{tStart:0,tEnd:22},"audio"),
    [{tStart:0,tEnd:5-0.100001},{tStart:15+0.100001,tEnd:20-0.100001}]);
  assert.deepEqual(recordGuardedPrivacyMaskIntervals(receipt,owner,22,"video"),
    [{start:5-0.200001,end:15+0.200001},{start:20-0.200001,end:22}]);
  assert.deepEqual(receipt.privateWindows,original); // actual audit marks never rewritten as encoder padding
  const noOrigin={...receipt,mediaStartedAt:undefined};
  assert.deepEqual(publicRecordCaptureIntervals(noOrigin,owner,{tStart:0,tEnd:22},"audio"),[]);
  assert.deepEqual(recordPrivacyMaskIntervals(noOrigin,owner,22),[{start:0,end:22}]);
  const historical={...receipt,generation:undefined};
  assert.deepEqual(publicRecordCaptureIntervals(historical,owner,{tStart:0,tEnd:22},"audio"),[]);
  assert.deepEqual(recordPrivacyMaskIntervals(historical,owner,22),[{start:0,end:22}]);
});
