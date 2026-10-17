import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { reconcileWebinarSources } from "./calendar-client.js";
import { confirmWebinarRegistration, validateWebinarRegistration, prepareWebinarSourceState } from "./state/schedule-state.js";
import { reconcileWebinarRegistrationState } from "./auto-record-policy.js";
import { runWebinarRegistrations, registrationConfigurationReason, registrationConfigurationFailure,
  registrationResultReason, freshRegistrationConfirmation } from "./registration-workflow.js";
import type { AutoRecordCandidateInput } from "@lkb/core";

const NOW = "2026-10-14T10:00:00.000Z";
const source: AutoRecordCandidateInput = {id: "invite", title: "Career guidance webinar", status: "approved",
  senderEmail: "host@organizer.example", senderDomain: "organizer.example", senderAuthenticated: true,
  registrationOnly: true, registrationUrl: "https://organizer.example/register", messageId: "original", threadId: "thread",
  startTime: "2026-10-14T11:00:00.000Z", endTime: "2026-10-14T12:00:00.000Z"};
const config = () => ({python: resolve("fixture-python"), profileDir: resolve("fixture-profile"), allowedHosts: ["organizer.example"],
  operator: {firstName: "Fixture", lastName: "Operator", email: "fixture@example.test"},
  form: {mode: "native-html", formSelector: "form", submitSelector: "button[type=submit]",
    fields: {firstName: "#first", lastName: "#last", email: "#email"}}});
function fixture(candidate = source) {
  const state = {operations: {} as Record<string, Record<string, any>>};
  const acquisition = reconcileWebinarSources({tenantId: "fixture", checkedAt: NOW,
    calendarEvents: [], candidates: [candidate], acquisition: {complete: true, historyComplete: true}});
  const calls: unknown[] = [];
  return {state, candidate, calls, input: {state, tenantId: "fixture", candidates: [candidate], acquisition, now: () => NOW,
    config: (_candidate: AutoRecordCandidateInput) => config(),
    register: async (input: unknown) => {calls.push(input); return {status: "submitted", reason: "awaiting_confirmation"};},
    update: async (id: string, changes: Record<string, any>) => {state.operations[id] = {...state.operations[id], ...changes, tenantId: "fixture", updatedAt: NOW};},
    validate: validateWebinarRegistration, confirm: confirmWebinarRegistration, createUUID: randomUUID}};
}
const operation = (f: ReturnType<typeof fixture>) => Object.values(f.state.operations)[0]!;

test("only approved, authenticated auto-approved, positively classified sources can submit", async () => {
  for (const change of [{status: "pending"}, {status: "rejected"}, {cancelled: true},
    {status: "auto_approved", senderAuthenticated: false}, {title: "Monthly status update"}, {title: "Personal webinar catch-up"}]) {
    const f = fixture({...source, ...change} as AutoRecordCandidateInput);
    await runWebinarRegistrations(f.input); assert.equal(f.calls.length, 0, JSON.stringify(change));
    assert.equal(Object.values(f.state.operations).some(row => row.registration), false);
  }
  const approved = fixture(); let privateInput: any;
  approved.input.config = candidate => {privateInput = candidate; return config();};
  await runWebinarRegistrations(approved.input); assert.equal(approved.calls.length, 1);
  assert.deepEqual(privateInput.registrationIdentity.sourceIds, [source.id]);
  assert.equal((approved.calls[0] as any).registrationIdentity, undefined);
  assert.equal(operation(approved).registration.registrationIdentity, undefined);
  const automatic = fixture({...source, status: "auto_approved"});
  await runWebinarRegistrations(automatic.input); assert.equal(automatic.calls.length, 1);
});

test("unresolved acquisition cannot submit even with an otherwise approved source", async () => {
  const f = fixture(), row = Object.values(f.input.acquisition.state.occurrences)[0]!;
  row.unresolved = "source-discontinuity";
  await runWebinarRegistrations(f.input); assert.equal(f.calls.length, 0);
  assert.equal(operation(f).registrationReason, "source-unresolved");
});

test("missing or invalid config is visible and correction resumes before any submitting attempt", async () => {
  const f = fixture(); f.input.config = () => undefined as any;
  await runWebinarRegistrations(f.input);
  assert.equal(operation(f).status, "action_required"); assert.equal(operation(f).registrationReason, "configuration-required");
  assert.equal(operation(f).registration, undefined); assert.equal(f.calls.length, 0);
  f.input.config = () => config(); await runWebinarRegistrations(f.input);
  assert.equal(f.calls.length, 1); assert.equal(operation(f).registration.phase, "awaiting-confirmation");
  assert.equal(operation(f).registrationReason, "confirmation-pending");
  for (const change of [{operator: {...config().operator, email: "not-an-email"}},
    {form: {...config().form, fields: {email: "#email"}}}, {allowedHosts: ["foreign.example"]}, {profileDir: "relative"}]) {
    const blocked = fixture(); blocked.input.config = () => ({...config(), ...change}) as any;
    await runWebinarRegistrations(blocked.input); assert.equal(blocked.calls.length, 0);
    assert.equal(operation(blocked).registration, undefined); assert.ok(operation(blocked).registrationReason);
  }
});

test("candidate-bound policy resolution refuses denied approval without private diagnostics", async () => {
  const f = fixture(); let resolved: AutoRecordCandidateInput | undefined;
  f.input.config = candidate => {resolved = candidate; throw Object.assign(new Error("secret profile@example.test https://private.example"), {code: "denied"});};
  await runWebinarRegistrations(f.input); assert.equal(resolved?.id, source.id);
  assert.deepEqual((resolved as any).registrationIdentity.sourceIds, [source.id]);
  assert.equal(operation(f).registrationReason, "scope-denied"); assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(f.state).includes("profile@example.test"));
  assert.equal(registrationConfigurationFailure(new Error("opaque")), "configuration-invalid");
});

test("submitting is read back from storage before execution; disk failure prevents external work", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lkb-registration-"));
  try {
    const file = join(dir, "operations.json"), f = fixture();
    f.input.update = async (id, changes) => {
      f.state.operations[id] = {...f.state.operations[id], ...changes}; writeFileSync(file, JSON.stringify(f.state));
    };
    f.input.register = async () => {
      const disk = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(Object.values(disk.operations).map((row: any) => row.registration.phase)[0], "submitting");
      assert.ok(!JSON.stringify(disk).includes("fixture@example.test")); f.calls.push("executed");
      return {status: "submitted", reason: "awaiting_confirmation"};
    };
    await runWebinarRegistrations(f.input); assert.equal(f.calls.length, 1);
    const failed = fixture(); failed.input.update = async () => {throw new Error("disk refused");};
    await assert.rejects(runWebinarRegistrations(failed.input), /disk refused/); assert.equal(failed.calls.length, 0);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    rmSync(dir, {recursive: true, force: true});
  }
});

test("uncertain results and an interrupted restart never resubmit; browser reason is finite", async () => {
  const f = fixture(); f.input.register = async () => {f.calls.push("executed"); return {status: "uncertain", reason: "owned_cleanup_failed"};};
  await runWebinarRegistrations(f.input); await runWebinarRegistrations(f.input);
  assert.equal(f.calls.length, 1); assert.equal(operation(f).registrationReason, "owned-cleanup-failed");
  operation(f).registration.phase = "submitting";
  await runWebinarRegistrations({...f.input, acquisition: undefined});
  await runWebinarRegistrations(f.input); assert.equal(f.calls.length, 1);
  assert.equal(operation(f).registration.phase, "uncertain");
  assert.equal(registrationResultReason({status: "action_required", reason: "unknown_required"}), "missing-required-data");
  assert.equal(registrationResultReason({status: "action_required", reason: "required_consent"}), "consent-required");
  assert.equal(registrationResultReason({status: "action_required", reason: "secret@example.test"}), "unsupported-form");
});

test("provider receipt is required and bounded; a spoofed or old newly seen message is not fresh", () => {
  const mail = {...source, id: "confirmation", registrationOnly: false, status: "pending", receivedAt: NOW} as any;
  assert.equal(freshRegistrationConfirmation(mail, NOW, NOW), true);
  for (const change of [{receivedAt: undefined}, {receivedAt: "2026-10-14T09:59:59.999Z"},
    {receivedAt: "2026-10-14T10:00:00.001Z"}, {receivedAt: "2026-10-14T10:00:00Z"}, {senderAuthenticated: false}])
    assert.equal(freshRegistrationConfirmation({...mail, ...change}, NOW, NOW), false, JSON.stringify(change));
});

test("real confirmation consumer requires fresh exact lineage, authenticated evidence and literal direct join", async () => {
  const f = fixture(); await runWebinarRegistrations(f.input); const attempt = operation(f).registration;
  const mail = {...source, id: "confirmation", messageId: "new-message", registrationOnly: false, status: "pending",
    registrationUrl: undefined, meetingUrl: "https://meet.google.com/abc-defg-hij", receivedAt: NOW} as any;
  const confirmed = confirmWebinarRegistration(attempt, "fixture", [source, mail], NOW);
  assert.equal(confirmed?.phase, "confirmed"); assert.equal(confirmed?.confirmationMessageId, "new-message");
  for (const change of [{threadId: "foreign"}, {senderEmail: "foreign@organizer.example"}, {startTime: "2026-10-14T11:01:00.000Z"},
    {messageId: "original"}, {meetingUrl: source.registrationUrl}, {receivedAt: undefined}, {senderAuthenticated: false}, {status: "rejected"}])
    assert.equal(confirmWebinarRegistration(attempt, "fixture", [source, {...mail, ...change}], NOW), undefined, JSON.stringify(change));
  assert.equal(registrationConfigurationReason(config(), source), undefined);
  assert.equal(registrationConfigurationReason({...config(), browserExecutable: "cft"}, source), undefined);
});

test("reconciliation freezes confirmation to acquisition cutoff and preserves active-child operation fields", async () => {
  const f = fixture(); await runWebinarRegistrations(f.input);
  const child = "webinar-active-child", owned = {tenantId: "fixture", status: "recording", captureSlot: "lane", artifact: "owned.webm"};
  f.state.operations[child] = owned;
  const mail = {...source, id: "confirmation", messageId: "new-message", registrationOnly: false,
    registrationUrl: undefined, meetingUrl: "https://meet.google.com/abc-defg-hij", receivedAt: NOW};
  let writes = 0, saved: any;
  const state = {...f.state, tenantId: "fixture", version: 1 as const};
  const childUpdate = Promise.resolve().then(() => {
    state.operations[child] = {...owned, status: "ready", graphSourceFingerprint: "new-child-source"};
  });
  const prepared = await reconcileWebinarRegistrationState({state, tenantId: "fixture", candidates: [source, mail],
    now: () => "2026-10-14T10:00:05.000Z", checkedAt: NOW, createUUID: randomUUID,
    validate: validateWebinarRegistration, confirm: confirmWebinarRegistration,
    value: {version: 1, tenantId: "fixture", scope: "available-connected-source-state", complete: true,
      mode: "baseline", checkedAt: NOW, syncToken: "provider-token", sourceEvents: [], meetings: []},
    prepare: prepareWebinarSourceState,
    persistSync: value => {
      writes++; saved = JSON.parse(JSON.stringify(value));
      return undefined;
    }});
  await childUpdate;
  assert.equal(writes, 1); assert.equal(saved.operations[child].status, "ready");
  for (const actual of [state.operations[child], prepared.state.operations[child]]) {
    assert.equal(actual!.captureSlot, "lane"); assert.equal(actual!.artifact, "owned.webm");
    assert.equal(actual!.graphSourceFingerprint, "new-child-source"); assert.equal(actual!.status, "ready");
  }
  const confirmed = Object.values(state.operations).find(row => row.registration)?.registration;
  assert.equal(confirmed.phase, "confirmed"); assert.equal(confirmed.confirmedAt, NOW);
  assert.equal(prepared.candidates.find(row => row.id === source.id)?.registrationOnly, false);
});

test("async persistence is refused before invocation; synchronous write failure never commits a draft", async () => {
  const f = fixture(); await runWebinarRegistrations(f.input); let writes = 0;
  const request = {state: f.state, tenantId: "fixture", candidates: [] as AutoRecordCandidateInput[],
    now: () => NOW, checkedAt: NOW, createUUID: randomUUID,
    validate: validateWebinarRegistration, confirm: confirmWebinarRegistration, value: {},
    prepare: (state: typeof f.state) => ({state})};
  const before = JSON.stringify(f.state);
  await assert.rejects(reconcileWebinarRegistrationState({...request,
    persistSync: (async () => {writes++;}) as any}), /requires synchronous persistence/);
  assert.equal(writes, 0); assert.equal(JSON.stringify(f.state), before);
  await assert.rejects(reconcileWebinarRegistrationState({...request,
    persistSync: () => {throw new Error("disk refused");}}), /disk refused/);
  assert.equal(JSON.stringify(f.state), before);
});


test("proven pre-submit recovery needs changed configuration and persists a fresh no-repeat marker", async () => {
  const f = fixture();
  f.input.register = (async () => { f.calls.push("blocked"); return {status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}; }) as any;
  await runWebinarRegistrations(f.input);
  const first = JSON.parse(JSON.stringify(operation(f).registration));
  assert.equal(first.phase, "action_required"); assert.equal(first.preSubmitEvidence.disposition, "not-attempted");
  assert.match(first.preSubmitEvidence.configurationHash, /^[a-f0-9]{64}$/);
  f.state.operations = JSON.parse(JSON.stringify(f.state.operations)); // restart readback
  await runWebinarRegistrations(f.input); assert.equal(f.calls.length, 1);
  f.input.config = () => ({...config(), form: {...config().form, fields: {...config().form.fields, email: "#corrected-email"}}});
  f.input.register = async () => {
    const current = operation(f).registration;
    assert.equal(current.phase, "submitting"); assert.notEqual(current.attemptId, first.attemptId);
    assert.equal(current.preSubmitEvidence, undefined); f.calls.push("submitted");
    return {status: "submitted", reason: "awaiting_confirmation"};
  };
  await runWebinarRegistrations(f.input); await runWebinarRegistrations(f.input);
  assert.equal(f.calls.length, 2); assert.equal(operation(f).registration.phase, "awaiting-confirmation");
});

test("pre-submit recovery rechecks source and policy; uncertain and legacy results never repeat", async () => {
  for (const mode of ["legacy", "uncertain", "submitting", "source-changed", "pending", "denied", "unresolved", "persist-failed"]) {
    const f = fixture();
    f.input.register = (async () => { f.calls.push("blocked"); return {status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}; }) as any;
    await runWebinarRegistrations(f.input);
    f.input.config = () => ({...config(), profileDir: resolve("corrected-profile")});
    if (mode === "legacy") delete operation(f).registration.preSubmitEvidence;
    if (mode === "uncertain" || mode === "submitting") { operation(f).registration.phase = mode; delete operation(f).registration.preSubmitEvidence; }
    if (mode === "source-changed") f.input.candidates = [{...source, threadId: "different"}];
    if (mode === "pending") f.input.candidates = [{...source, status: "pending"}];
    if (mode === "denied") f.input.config = () => { throw Object.assign(new Error("private"), {code: "denied"}); };
    if (mode === "unresolved") Object.values(f.input.acquisition.state.occurrences)[0]!.unresolved = "missing" as any;
    if (mode === "persist-failed") {
      f.input.update = async () => { throw new Error("disk refused"); };
      await assert.rejects(runWebinarRegistrations(f.input), /disk refused/);
    } else await runWebinarRegistrations(f.input);
    assert.equal(f.calls.length, 1, mode);
  }
});

test("persisted action_required cannot promote from fresh confirmation or resubmit after restart", async () => {
  const f = fixture();
  f.input.register = (async () => { f.calls.push("blocked"); return {status: "action_required", reason: "field_mismatch", submissionDisposition: "not-attempted"}; }) as any;
  await runWebinarRegistrations(f.input);
  f.state.operations = JSON.parse(JSON.stringify(f.state.operations));
  const mail = {...source, id: "confirmation", messageId: "new-confirmation", registrationOnly: false,
    registrationUrl: undefined, meetingUrl: "https://meet.google.com/abc-defg-hij", receivedAt: NOW};
  assert.equal(confirmWebinarRegistration(operation(f).registration, "fixture", [source, mail], NOW), undefined);
  await runWebinarRegistrations({...f.input, acquisition: undefined, candidates: [source, mail]});
  await runWebinarRegistrations(f.input);
  assert.equal(operation(f).registration.phase, "action_required"); assert.equal(operation(f).registration.meetingUrl, undefined);
  assert.equal(f.calls.length, 1);
  const prepared = prepareWebinarSourceState({...f.state, tenantId: "fixture", version: 1},
    {version: 1, tenantId: "fixture", scope: "available-connected-source-state", complete: true,
      mode: "baseline", checkedAt: NOW, syncToken: "provider-token", sourceEvents: [], meetings: []}, [source, mail], NOW);
  assert.notEqual(prepared.candidates.find(row => row.id === source.id)?.registrationOnly, false);
  assert.equal(prepared.candidates.some(row => row.id === mail.id), false);
});
