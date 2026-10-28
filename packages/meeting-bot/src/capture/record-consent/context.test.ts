import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync,writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRecordConsent, recordConsentSourceFields, recordMeetingHash, recordProvidedFirstWarning, validateRecordConsent } from "./context.js";
import { readRecordConsent, writeRecordConsent } from "./receipt-store.js";
import { prepareRecordConsent } from "./runtime.js";
import { privateCaptureTurns } from "./privacy.js";

const owner = {tenantId: "tenant-one", sessionId: "webinar-one", meetingUrl: "https://meet.google.com/abc-defg-hij?token=private"};
const env = {LKB_CAPTURE_APPROVED_BY: "Umesh", LKB_CAPTURE_APPROVAL_REF: "D-165",
  LKB_CAPTURE_RECORDED_BY: "approved-operator-profile-17"};
const now = new Date("2026-10-14T13:00:00.000Z");
function temporary() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lkb-consent-"));
  return {dir, clean: () => rmSync(dir, {recursive: true, force: true})};
}

test("D165 operational authority preserves unknown organizer facts and unconfirmed alternatives", () => {
  const receipt = createRecordConsent([], owner, env, now);
  assert.equal(receipt.organizerConsent, "unknown");
  assert.deepEqual(receipt.consent, {given: false, recordedBy: env.LKB_CAPTURE_RECORDED_BY});
  assert.deepEqual(receipt.operationalApproval, {approvedBy: "Umesh", reference: "D-165", appliedAt: now.toISOString()});
  assert.match(recordProvidedFirstWarning(receipt)!, /did not confirm/);
  assert.equal(JSON.stringify(receipt).includes("token=private"), false);
});

test("no approval, missing actor, malformed flags and recorded refusal produce zero capture effects", () => {
  const f = temporary(); let joined = 0;
  try {
    for (const badEnv of [{}, {...env, LKB_CAPTURE_RECORDED_BY: undefined}, {...env, LKB_CAPTURE_APPROVAL_REF: undefined}]) {
      assert.throws(() => {prepareRecordConsent([], owner, f.dir, now.getTime(), badEnv); joined++;}, /consent receipt/);
    }
    assert.throws(() => createRecordConsent(["--recorded-by"], owner, env, now), /requires a value/);
    assert.throws(() => createRecordConsent(["--recorded-by", "one", "--recorded-by", "two"], owner, env, now), /Duplicate/);
    assert.throws(() => createRecordConsent(["--organizer-consent", "refused"], owner, env, now), /refusal/);
    assert.throws(() => createRecordConsent([], owner, {...env, LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE: "1"}, now), /true or false/);
    assert.equal(joined, 0);
  } finally {f.clean();}
});

test("explicit organizer facts roundtrip unchanged through durable recovery and source projection", () => {
  const f = temporary();
  try {
    const receipt = createRecordConsent(["--organizer-consent", "given", "--consent-note", "Approved under the meeting's recorded policy",
      "--confirmed-no-alternative"], owner, env, now);
    writeRecordConsent(f.dir, receipt);
    assert.throws(() => writeRecordConsent("\\\\example.invalid\\share", receipt), /Local absolute/);
    assert.throws(() => writeRecordConsent("//example.invalid/share", receipt), /Local absolute/);
    const recovered = readRecordConsent(f.dir, {...owner, meetingHash: recordMeetingHash(owner.meetingUrl)});
    assert.deepEqual(recovered, receipt);
    assert.equal(recordProvidedFirstWarning(recovered), undefined);
    const fields = recordConsentSourceFields(recovered);
    assert.deepEqual(fields.consent, receipt.consent);
    assert.equal(fields.captureMode, "silent");
    assert.equal(fields.organizerConsent, "given");
    assert.deepEqual(fields.operationalApproval, receipt.operationalApproval);
    assert.throws(() => readRecordConsent(f.dir, {tenantId: "tenant-two", sessionId: owner.sessionId}), /ENOENT/);
    assert.throws(() => readRecordConsent(f.dir, {...owner, meetingHash: recordMeetingHash("https://zoom.us/j/123456789")}), /mismatched/);
    assert.throws(() => validateRecordConsent({...receipt, consent: {...receipt.consent, given: false}}, owner), /mismatched/);
    assert.throws(() => writeRecordConsent(f.dir, {...receipt, consent: {...receipt.consent, recordedBy: "invented"}}), /cannot be replaced/);
  } finally {f.clean();}
});

test("before-join hook durably records actual actor and warns without disclosing join credentials", () => {
  const f = temporary(), warnings: string[] = [];
  try {
    const run = prepareRecordConsent([], owner, f.dir, now.getTime(), env, warning => warnings.push(warning));
    const read = readRecordConsent(f.dir, owner);
    assert.deepEqual(run.receipt, read);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.includes("token="), false);
    assert.equal(read.consent.given, false);
    run.privacy.dispose();
  } finally {f.clean();}
});

test("prejoin retry reuses equal actual approval facts but never resets started/private evidence", () => {
  const f = temporary();
  try {
    const first = prepareRecordConsent([], owner, f.dir, now.getTime(), env, () => {}); first.privacy.dispose();
    const retry = prepareRecordConsent([], owner, f.dir, now.getTime() + 1000, env, () => {}); retry.privacy.dispose();
    assert.equal(retry.receipt.operationalApproval.appliedAt, first.receipt.operationalApproval.appliedAt);
    assert.equal(retry.receipt.generation,first.receipt.generation);
    assert.throws(() => prepareRecordConsent([], owner, f.dir, now.getTime() + 2000, {...env, LKB_CAPTURE_RECORDED_BY: "other"}, () => {}), /facts cannot be replaced/);
    writeRecordConsent(f.dir, {...retry.receipt, mediaStartedAt: now.getTime() + 1000});
    assert.throws(() => prepareRecordConsent([], owner, f.dir, now.getTime() + 3000, env, () => {}), /use recovery/);
    assert.equal(readRecordConsent(f.dir, owner).mediaStartedAt, now.getTime() + 1000);
  } finally {f.clean();}
});

test("privacy is consumed before downstream output, dropping entire boundary-straddling turns", () => {
  const receipt = createRecordConsent([], owner, env, now);
  receipt.privateWindows = [{tStart: 5, tEnd: 10}];
  receipt.mediaStartedAt=Date.parse(receipt.operationalApproval.appliedAt);
  const turns = [{tStart: 0, tEnd: 5, text: "public before"}, {tStart: 4, tEnd: 6, text: "straddling private"},
    {tStart: 6, tEnd: 9, text: "private"}, {tStart: 10, tEnd: 15, text: "public after"}];
  const delivered = privateCaptureTurns(turns as never, receipt);
  assert.deepEqual(delivered.map(turn => turn.text), ["public before", "public after"]);
  assert.equal(turns.length, 4);
  assert.throws(() => privateCaptureTurns(turns as never, {...receipt, privateWindows: [{tStart: NaN, tEnd: 10}]}), /Invalid private/);
});

test("receipt rejects tenant/session traversal and sensitive userinfo meeting URLs", () => {
  for (const bad of [{...owner, tenantId: "../other"}, {...owner, sessionId: "../other"},
    {...owner, meetingUrl: "https://user:password@meet.google.com/abc-defg-hij"}, {...owner, meetingUrl: "http://meet.google.com/abc-defg-hij"}]) {
    assert.throws(() => createRecordConsent([], bad, env, now));
  }
  const f = temporary();
  try {
    const receipt = createRecordConsent([], owner, env, now);
    writeRecordConsent(f.dir, receipt);
    assert.equal(readFileSync(path.join(f.dir, "record-consent", owner.tenantId, `${owner.sessionId}.json`), "utf8").includes(owner.meetingUrl), false);
  } finally {f.clean();}
});

test("actual generation follows inherited controller or standalone attempt, is immutable and never retrofits historical receipts",()=>{
  const f=temporary(),generation=randomUUID();
  try{
    const receipt=createRecordConsent([],owner,{...env,LKB_CAPTURE_CONTROL_GENERATION:generation},now);
    assert.equal(receipt.generation,generation);assert.equal(receipt.consent.given,false);
    assert.throws(()=>createRecordConsent([],owner,{...env,LKB_CAPTURE_CONTROL_GENERATION:"not-a-uuid"},now),/consent receipt/);
    writeRecordConsent(f.dir,receipt);assert.equal(readRecordConsent(f.dir,owner).generation,generation);
    assert.equal(recordConsentSourceFields(receipt).captureGeneration,generation);
    assert.throws(()=>writeRecordConsent(f.dir,{...receipt,generation:randomUUID()}),/generation cannot be replaced/);
    assert.throws(()=>prepareRecordConsent([],owner,f.dir,now.getTime(),{...env,LKB_CAPTURE_CONTROL_GENERATION:randomUUID()},()=>{}),/generation cannot be replaced/);
    const historical={...receipt,sessionId:"historical",generation:undefined};
    const file=path.join(f.dir,"record-consent",owner.tenantId,"historical.json");
    writeFileSync(file,JSON.stringify(historical));const before=readFileSync(file,"utf8");
    assert.equal(readRecordConsent(f.dir,{...owner,sessionId:"historical"}).generation,undefined);
    assert.throws(()=>prepareRecordConsent([],{...owner,sessionId:"historical"},f.dir,now.getTime(),env,()=>{}),/Historical capture/);
    assert.equal(readFileSync(file,"utf8"),before);
  }finally{f.clean();}
});
