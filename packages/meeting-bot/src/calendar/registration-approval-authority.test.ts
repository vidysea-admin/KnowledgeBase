/** D-180 ruling 1: the resolver and the Zoom proof accept a link/attempt ONLY with a matching, unexpired, unrevoked,
 * same-tenant human approval record. Transport is the existing injected DNS/get doubles; no network, no Mongo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRATION_LINK_RESOLUTION_ENABLED, privateEvidenceHash as h, registrationResolutionScopeHash, resolveRegistrationLink,
  resolveRegistrationLinkWithConstantForTest, type LinkResolutionInput, type ResolvedRegistrationLink, type ResolverOptions } from "./registration-link-resolver.js";
import { ZOOM_PROVIDER_CORRELATION_ENABLED, bindZoomRegistrationAttempt, inspectZoomRegistrationConfirmationWithConstantForTest,
  zoomConfirmationHostScopeHash, type ZoomProofInput } from "./zoom-registration-proof.js";
import { approvalResolverAuthorize, prepareApprovalProofAuthorize, type RegistrationApprovalLookup, type RegistrationApprovalMatch,
  type RegistrationApprovalRecord } from "./registration-approval-authority.js";

const bytes = (text: string) => Buffer.from(text), NOW = Date.parse("2026-10-17T10:00:00.000Z"), clock = () => NOW;
const link: LinkResolutionInput = {tenantId: "tenant-A", sourceId: "source", messageId: "original", sourceHash: h("source-mail"),
  policyHash: h("registration-policy-r2"), link: "https://b64wc.r.a.d.sendibm1.com/tracked/FIXTURE", anchor: "Register Now",
  initialHost: "b64wc.r.a.d.sendibm1.com", allowedHosts: ["b64wc.r.a.d.sendibm1.com", "zoom.us"], finalZoomHosts: ["zoom.us"]};
const finalUrl = "https://zoom.us/webinar/register/WN_FIXTURE";
const transport: Pick<ResolverOptions, "dns" | "get"> = {dns: async () => [{address: "1.1.1.1", family: 4}], get: async url => url.hostname === link.initialHost
  ? {status: 302, locations: [finalUrl], peerAddress: "1.1.1.1", body: bytes("")}
  : {status: 200, locations: [], peerAddress: "1.1.1.1", body: bytes("fixture-native-event")}};

/** Mirrors the API store's query semantics: tenant predicate, every hash, unrevoked, expiresAt > now. */
function memoryLookup(records: RegistrationApprovalRecord[]): RegistrationApprovalLookup & {calls: string[]} {
  const calls: string[] = [];
  return {calls, async findMatching(tenantId: string, match: RegistrationApprovalMatch, now: Date) {
    calls.push(tenantId);
    const {kind, ...hashes} = match; void kind;
    return records.find(r => r.tenantId === tenantId && !r.revokedAt && r.expiresAt > now.toISOString() &&
      Object.entries(hashes).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v)) ?? null;
  }};
}
const record = (over: Partial<RegistrationApprovalRecord> = {}): RegistrationApprovalRecord => ({tenantId: "tenant-A",
  decisionId: "0b6f1c52-8a43-4f5e-9d2a-3c1e7b9a0f11", linkHash: h(link.link), scopeHash: registrationResolutionScopeHash(link),
  policyHash: link.policyHash, approvedBy: "reviewer:alice", approvedAt: "2026-10-16T10:00:00.000Z", expiresAt: "2026-11-15T10:00:00.000Z", ...over});
const resolve = (lookup: RegistrationApprovalLookup, input = link) =>
  resolveRegistrationLinkWithConstantForTest(input, {enabled: true, authorize: approvalResolverAuthorize(lookup, clock), ...transport}, true);

test("activation constants are true; with the constant forced false (seam) the entry stays inactive even with a valid approval", async () => {
  assert.equal(REGISTRATION_LINK_RESOLUTION_ENABLED, true); assert.equal(ZOOM_PROVIDER_CORRELATION_ENABLED, true);
  const lookup = memoryLookup([record()]);
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, {enabled: true, authorize: approvalResolverAuthorize(lookup, clock), ...transport}, false)).status, "inactive");
  assert.deepEqual(lookup.calls, []);
});
test("resolver: a valid same-tenant approval is accepted and its decision id is carried into the proof", async () => {
  const result = await resolve(memoryLookup([record()]));
  assert.equal(result.status, "candidate");
  if (result.status === "candidate") { assert.equal(result.proof.decisionId, record().decisionId); assert.equal(result.proof.finalUrl, finalUrl); }
});
test("resolver: no record, expired, revoked and cross-tenant approvals are refused", async () => {
  const cases: [string, RegistrationApprovalRecord[]][] = [["none", []],
    ["expired", [record({approvedAt: "2026-09-18T10:00:00.000Z", expiresAt: "2026-10-17T09:59:59.999Z"})]],
    ["revoked", [record({revokedAt: "2026-10-17T09:00:00.000Z"})]], ["cross-tenant", [record({tenantId: "tenant-B"})]]];
  for (const [name, records] of cases) assert.deepEqual(await resolve(memoryLookup(records)), {status: "refused", reason: "approval-binding"}, name);
});
test("resolver: a mismatch on each hash is refused", async () => {
  for (const over of [{linkHash: h("other-link")}, {scopeHash: h("other-scope")}, {policyHash: h("other-policy")}])
    assert.equal((await resolve(memoryLookup([record(over)]))).status, "refused", JSON.stringify(over));
  // Same record, but the caller's current policy, scope or link differs from what the human approved.
  for (const input of [{...link, policyHash: h("policy-r3")}, {...link, finalZoomHosts: ["us02web.zoom.us"], allowedHosts: [...link.allowedHosts, "us02web.zoom.us"]},
    {...link, link: link.link + "2"}, {...link, link: "https://B64WC.r.a.d.sendibm1.com/tracked/FIXTURE"}])
    assert.equal((await resolve(memoryLookup([record()]), input)).status, "refused", JSON.stringify(input));
});
test("resolver: an untrustworthy lookup row is re-checked (tenant, revoked, expiry, 30-day bound, hashes)", async () => {
  const lying = (row: RegistrationApprovalRecord): RegistrationApprovalLookup => ({findMatching: async () => row});
  for (const over of [{tenantId: "tenant-B"}, {revokedAt: "2026-10-17T00:00:00.000Z"}, {expiresAt: "2026-10-17T09:00:00.000Z"},
    {approvedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z"}, {approvedAt: "2026-10-18T00:00:00.000Z"},
    {linkHash: h("x")}, {scopeHash: h("x")}, {policyHash: h("x")}, {approvedBy: ""}, {decisionId: "bad id"}])
    assert.equal((await resolve(lying(record(over)))).status, "refused", JSON.stringify(over));
  assert.equal((await resolve({findMatching: async () => { throw new Error("db down"); }})).status, "refused");
});

async function proofFixture(approvals: (base: {bindingHash: string; policyHash: string; hostScopeHash: string}) => RegistrationApprovalRecord[]) {
  const first = await resolve(memoryLookup([record()]));
  assert.equal(first.status, "candidate");
  const resolution = (first as {proof: ResolvedRegistrationLink}).proof, startTime = "2026-10-18T13:00:00.000Z", endTime = "2026-10-18T14:00:00.000Z";
  const attempt = bindZoomRegistrationAttempt({tenantId: "tenant-A", sourceId: "source", sourceMessageId: "original", sourceThreadId: "original-thread",
    sourceHash: link.sourceHash, policyHash: link.policyHash, policyRevision: 2, recipient: "operator@example.test", startTime, endTime,
    attemptId: "attempt-1", attemptedAt: "2026-10-17T09:00:00.000Z", phase: "awaiting-confirmation"}, resolution,
    {providerEventId: "12345678901", startTime, endTime, registrationUrlHash: resolution.finalUrlHash, registrationBodyHash: resolution.bodyHash,
      metadataHash: h("verified event"), method: "zoom-native-registration-and-calendar"})!;
  assert.ok(attempt);
  const html = '<a type="button" href="https://zoom.us/w/12345678901?tk=FIXTURE">Join Webinar</a>';
  const input: ZoomProofInput = {tenantId: "tenant-A", mailbox: attempt.recipient, checkedAt: "2026-10-17T09:30:00.000Z", complete: true,
    attempts: [attempt], consumedMessageIds: [], baselineMessageIds: ["original"],
    sourceState: {sourceId: "source", sourceHash: attempt.sourceHash, policyHash: attempt.policyHash, policyRevision: 2,
      approved: true, rejected: false, cancelled: false, unresolved: false, optedOut: false, denied: false},
    messages: [{messageId: "confirmation", threadId: "provider-thread", internalDate: String(Date.parse("2026-10-17T09:10:00.000Z")), html,
      headers: [{name: "From", value: "Zoom <no-reply@zoom.us>"}, {name: "Delivered-To", value: attempt.recipient},
        {name: "Authentication-Results", value: 'mx.google.com; spf=pass smtp.mailfrom="bounce@bounce-sg.zoom.us"; dmarc=pass header.from=zoom.us'}]}]};
  const base = {bindingHash: attempt.bindingHash, policyHash: attempt.policyHash, hostScopeHash: zoomConfirmationHostScopeHash(["zoom.us"])};
  const authorize = await prepareApprovalProofAuthorize(memoryLookup(approvals(base)), "tenant-A", input.attempts, ["zoom.us"], clock);
  const readNativeEvent = (mail: {html: string}) => ({providerEventId: attempt.providerEventId, startTime, endTime, recipient: attempt.recipient,
    contentHash: h(mail.html), metadataHash: h("verified confirmation"), method: "zoom-native-confirmation-and-calendar" as const});
  return inspectZoomRegistrationConfirmationWithConstantForTest(input, {enabled: true, authorize, readNativeEvent}, true);
}
const zoomRecord = (base: {bindingHash: string; policyHash: string; hostScopeHash: string}, over: Partial<RegistrationApprovalRecord> = {}) =>
  record({decisionId: "01JABCDEFGHJKMNPQRSTVWXYZ0", policyRevision: 2, ...base, ...over});

test("proof: a valid Zoom approval is accepted with its decision id", async () => {
  const result = await proofFixture(base => [zoomRecord(base)]);
  assert.equal(result.status, "candidate");
  if (result.status === "candidate") assert.equal(result.proof.decisionId, "01JABCDEFGHJKMNPQRSTVWXYZ0");
});
test("proof: no record, expired, revoked, cross-tenant and each hash mismatch are refused", async () => {
  const cases: [string, (b: {bindingHash: string; policyHash: string; hostScopeHash: string}) => RegistrationApprovalRecord[]][] = [
    ["none", () => []], ["link-only approval", () => [record()]],
    ["expired", b => [zoomRecord(b, {approvedAt: "2026-09-18T10:00:00.000Z", expiresAt: "2026-10-17T09:59:59.999Z"})]],
    ["revoked", b => [zoomRecord(b, {revokedAt: "2026-10-17T09:00:00.000Z"})]], ["cross-tenant", b => [zoomRecord(b, {tenantId: "tenant-B"})]],
    ["bindingHash", b => [zoomRecord(b, {bindingHash: h("x")})]], ["policyHash", b => [zoomRecord(b, {policyHash: h("x")})]],
    ["policyRevision", b => [zoomRecord(b, {policyRevision: 3})]], ["hostScopeHash", b => [zoomRecord(b, {hostScopeHash: h("x")})]]];
  for (const [name, approvals] of cases) {
    const result = await proofFixture(approvals);
    assert.equal(result.status, "refused", name); assert.equal((result as {reason: string}).reason, "no-bound-confirmation", name);
  }
});
test("resolver: only the canonical link form matches; a record keyed by a raw non-canonical link is never honoured", async () => {
  for (const raw of ["https://B64WC.R.A.D.SENDIBM1.COM/tracked/FIXTURE", "https://b64wc.r.a.d.sendibm1.com:443/tracked/FIXTURE",
    "https://b64wc.r.a.d.sendibm1.com/x/../tracked/FIXTURE", link.link + " "]) {
    const rawInput = {...link, link: raw};
    const forRaw = memoryLookup([record({linkHash: h(raw), scopeHash: registrationResolutionScopeHash(rawInput)})]);
    assert.notEqual((await resolve(forRaw, rawInput)).status, "candidate", `raw ${JSON.stringify(raw)} refused even with a raw-hash record`);
    assert.notEqual((await resolve(memoryLookup([record()]), rawInput)).status, "candidate", `canonical record does not authorise ${JSON.stringify(raw)}`);
  }
  assert.equal((await resolve(memoryLookup([record()]))).status, "candidate");
});
