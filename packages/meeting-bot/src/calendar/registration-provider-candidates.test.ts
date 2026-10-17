import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRATION_LINK_RESOLUTION_ENABLED, resolveRegistrationLink, privateEvidenceHash, publicRegistrationAddress,
  registrationResolutionScopeHash, type LinkResolutionInput, type ResolverOptions, type ResolvedRegistrationLink } from "./registration-link-resolver.js";
import { ZOOM_PROVIDER_CORRELATION_ENABLED, bindZoomRegistrationAttempt, inspectZoomRegistrationConfirmation,
  zoomAttemptBindingHash, zoomConfirmationHostScopeHash, type ZoomProofInput, type ZoomProofOptions } from "./zoom-registration-proof.js";

const h = privateEvidenceHash, bytes = (text: string) => Buffer.from(text);
const link: LinkResolutionInput = {tenantId: "fixture", sourceId: "source", messageId: "original", sourceHash: h("source-mail"),
  policyHash: h("fixture-policy"), link: "https://b64wc.r.a.d.sendibm1.com/tracked/FIXTURE", anchor: "Register Now",
  initialHost: "b64wc.r.a.d.sendibm1.com", allowedHosts: ["b64wc.r.a.d.sendibm1.com", "zoom.us"], finalZoomHosts: ["zoom.us"]};
const finalUrl = "https://zoom.us/webinar/register/WN_FIXTURE";
function resolver(overrides: Partial<ResolverOptions> = {}): ResolverOptions {
  return {enabled: true, authorize: input => ({...input, linkHash: h(input.link), scopeHash: registrationResolutionScopeHash(input), decisionId: "synthetic-fixture-only"}),
    dns: async () => [{address: "1.1.1.1", family: 4}], get: async url => url.hostname === link.initialHost
      ? {status: 302, locations: [finalUrl], peerAddress: "1.1.1.1", body: bytes("")}
      : {status: 200, locations: [], peerAddress: "1.1.1.1", body: bytes("fixture-native-event")}, ...overrides};
}
async function resolved(): Promise<ResolvedRegistrationLink> {
  const result = await resolveRegistrationLink(link, resolver()); assert.equal(result.status, "candidate");
  return (result as {status: "candidate"; proof: ResolvedRegistrationLink}).proof;
}

test("both candidates default inactive, with zero DNS/HTTP and no approval callback", async () => {
  assert.equal(REGISTRATION_LINK_RESOLUTION_ENABLED, false); assert.equal(ZOOM_PROVIDER_CORRELATION_ENABLED, false);
  let calls = 0;
  const result = await resolveRegistrationLink(link, {authorize: () => {calls++; return undefined;}, dns: async () => {calls++; return [];}});
  assert.equal(result.status, "inactive"); assert.equal(calls, 0);
  assert.equal(inspectZoomRegistrationConfirmation({} as any).status, "inactive");
});
test("approved fixture resolves only exact HTTPS chain and hashes private source/response bytes", async () => {
  const result = await resolved(); assert.equal(result.finalUrl, finalUrl);
  assert.equal(result.bodyHash, h(result.body)); assert.equal(result.originalLinkHash, h(link.link));
  assert.deepEqual(result.chain.map(row => row.host), [link.initialHost, "zoom.us"]);
});
test("authorization hashes and tenant/source binding are checked before network", async () => {
  let dns = 0;
  for (const change of [{tenantId: "foreign"}, {sourceId: "other"}, {sourceHash: h("changed")}, {linkHash: h("other-link")}, {policyHash: h("other")}, {scopeHash: h("other-scope")}]) {
    const options = resolver({authorize: input => ({...input, linkHash: h(input.link), scopeHash: registrationResolutionScopeHash(input), decisionId: "synthetic-fixture-only", ...change}),
      dns: async () => {dns++; return []}});
    assert.equal((await resolveRegistrationLink(link, options)).status, "refused");
  }
  assert.equal(dns, 0);
});
test("all DNS answers and connected peer are checked, including rebinding and translation/private ranges", async () => {
  const attacks = ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.1.1", "192.0.2.1",
    "198.18.0.1", "203.0.113.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "64:ff9b::a00:1", "2002:7f00::1", "2001:db8::1",
    "3fff::1", "3fff:0000:0000:0000:0000:0000:0000:0001", "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff"];
  for (const address of attacks) assert.equal(publicRegistrationAddress(address), false, address);
  assert.equal(publicRegistrationAddress("2606:4700:4700::1111"), true);
  assert.equal(publicRegistrationAddress("3fff:1000::1"), true, "outside documentation /20; actual DNS/TLS scope remains mandatory");
  let get = 0;
  assert.equal((await resolveRegistrationLink(link, resolver({dns: async () => [{address: "1.1.1.1", family: 4}, {address: "127.0.0.1", family: 4}],
    get: async () => {get++; throw new Error("must not call")}}))).status, "refused");
  assert.equal(get, 0);
  assert.equal((await resolveRegistrationLink(link, resolver({get: async () => ({status: 200, locations: [], peerAddress: "127.0.0.1", body: bytes("")})}))).status, "refused");
});
test("foreign/credential/port/fragment redirect, multiple Location and loops refuse", async () => {
  for (const locations of [["https://evil.example/register"], ["http://zoom.us/webinar/register/WN_FIXTURE"],
    ["https://user:pass@zoom.us/webinar/register/WN_FIXTURE"], ["https://zoom.us:8443/webinar/register/WN_FIXTURE"],
    [finalUrl + "#fragment"], [link.link], [finalUrl, finalUrl], ["https://zoom.us/\nwebinar/register/WN_FIXTURE"], ["https:\\zoom.us/webinar/register/WN_FIXTURE"]]) {
    const result = await resolveRegistrationLink(link, resolver({get: async () => ({status: 302, locations, peerAddress: "1.1.1.1", body: bytes("")})}));
    assert.equal(result.status, "refused", JSON.stringify(locations));
  }
});
test("hop/total-body/deadline caps refuse without following unlimited redirects", async () => {
  let requests = 0;
  const hops = await resolveRegistrationLink(link, resolver({get: async () => ({status: 302, locations: ["https://zoom.us/hop/" + requests++], peerAddress: "1.1.1.1", body: bytes("")})}));
  assert.equal(hops.status, "refused"); assert.equal(requests, 6);
  assert.equal((await resolveRegistrationLink(link, resolver({get: async () => ({status: 200, locations: [], peerAddress: "1.1.1.1", body: new Uint8Array(1024 * 1024 + 1)})}))).status, "refused");
  let clock = 0;
  assert.equal((await resolveRegistrationLink(link, resolver({now: () => clock,
    dns: async () => {clock = 15001; return [{address: "1.1.1.1", family: 4}]}}))).status, "refused");
});
async function proofFixture() {
  const resolution = await resolved(), startTime = "2026-10-14T13:00:00.000Z", endTime = "2026-10-14T14:00:00.000Z";
  const attempt = bindZoomRegistrationAttempt({tenantId: "fixture", sourceId: "source", sourceMessageId: "original", sourceThreadId: "original-thread",
    sourceHash: link.sourceHash, policyHash: link.policyHash, policyRevision: 1, recipient: "operator@example.test", startTime, endTime,
    attemptId: "fixture-attempt", attemptedAt: "2026-10-14T12:00:00.000Z", phase: "awaiting-confirmation"}, resolution,
    {providerEventId: "12345678901", startTime, endTime, registrationUrlHash: resolution.finalUrlHash, registrationBodyHash: resolution.bodyHash,
      metadataHash: h("independently verified fixture event"), method: "zoom-native-registration-and-calendar"})!;
  assert.ok(attempt);
  const html = '<a type="button" href="https://zoom.us/w/12345678901?tk=FIXTURE">&nbsp; Join Webinar &nbsp;</a>';
  const input: ZoomProofInput = {tenantId: "fixture", mailbox: attempt.recipient, checkedAt: "2026-10-14T12:01:00.000Z", complete: true,
    attempts: [attempt], consumedMessageIds: [], baselineMessageIds: ["original"],
    sourceState: {sourceId: attempt.sourceId, sourceHash: attempt.sourceHash, policyHash: attempt.policyHash, policyRevision: 1,
      approved: true, rejected: false, cancelled: false, unresolved: false, optedOut: false, denied: false},
    messages: [{messageId: "fresh-confirmation", threadId: "different-provider-thread", internalDate: String(Date.parse("2026-10-14T12:00:30.000Z")), html,
      headers: [{name: "From", value: "Office <no-reply@zoom.us>"}, {name: "Delivered-To", value: attempt.recipient},
        {name: "Authentication-Results", value: 'mx.google.com; spf=pass smtp.mailfrom="bounce@bounce-sg.zoom.us"; dmarc=pass header.from=zoom.us'}]}]};
  const options: ZoomProofOptions = {enabled: true, authorize: a => ({tenantId: a.tenantId, sourceId: a.sourceId, bindingHash: a.bindingHash,
    policyHash: a.policyHash, policyRevision: a.policyRevision, hostScopeHash: zoomConfirmationHostScopeHash(["zoom.us"]), decisionId: "synthetic-fixture-only"}),
    readNativeEvent: mail => ({providerEventId: attempt.providerEventId, startTime, endTime, recipient: attempt.recipient,
      contentHash: h(mail.html), metadataHash: h("verified fixture confirmation calendar"), method: "zoom-native-confirmation-and-calendar"})};
  return {input, options, resolution};
}
test("different provider thread becomes candidate only with verified hashes/event/recipient/native field", async () => {
  const f = await proofFixture(), result = inspectZoomRegistrationConfirmation(f.input, f.options);
  assert.equal(result.status, "candidate");
  if (result.status === "candidate") {assert.equal(result.proof.sourceThreadId, "original-thread"); assert.equal(result.proof.confirmationThreadId, "different-provider-thread");}
});
test("tampered binding, missing provider metadata and source/policy/tenant/recipient changes refuse", async () => {
  for (const change of [{bindingHash: h("forged")}, {providerEventId: "99999999999"}, {tenantId: "foreign"}, {policyRevision: 2},
    {recipient: "other@example.test"}, {phase: "uncertain"}]) {
    const f = await proofFixture(); Object.assign(f.input.attempts[0]!, change);
    assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "refused", JSON.stringify(change));
  }
  const f = await proofFixture(); f.options.readNativeEvent = () => undefined;
  assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "refused");
});
test("old/future/replayed/wrong recipient/ambiguous confirmations refuse", async () => {
  for (const scenario of ["old", "future", "expired", "baseline", "consumed", "recipient", "second-mail", "second-attempt", "incomplete"]) {
    const f = await proofFixture(), mail = f.input.messages[0]!;
    if (scenario === "old") mail.internalDate = String(Date.parse(f.input.attempts[0]!.attemptedAt) - 1);
    if (scenario === "future") mail.internalDate = String(Date.parse(f.input.checkedAt) + 1);
    if (scenario === "expired") {
      const a = f.input.attempts[0]!;
      a.startTime = "2026-10-16T13:00:00.000Z"; a.endTime = "2026-10-16T14:00:00.000Z"; a.bindingHash = zoomAttemptBindingHash(a);
      mail.internalDate = String(Date.parse(a.attemptedAt) + 86400001); f.input.checkedAt = "2026-10-15T12:01:00.000Z";
      f.options.readNativeEvent = message => ({providerEventId: a.providerEventId, startTime: a.startTime, endTime: a.endTime,
        recipient: a.recipient, contentHash: h(message.html), metadataHash: h("fixture-native"), method: "zoom-native-confirmation-and-calendar"});
    }
    if (scenario === "baseline") f.input.baselineMessageIds.push(mail.messageId);
    if (scenario === "consumed") f.input.consumedMessageIds.push(mail.messageId);
    if (scenario === "recipient") mail.headers[1]!.value = "foreign@example.test";
    if (scenario === "second-mail") f.input.messages.push({...mail, messageId: "another"});
    if (scenario === "second-attempt") {const a = {...f.input.attempts[0]!, attemptId: "another"}; a.bindingHash = zoomAttemptBindingHash(a); f.input.attempts.push(a);}
    if (scenario === "incomplete") f.input.complete = false;
    assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "refused", scenario);
  }
});
test("receiver auth/DMARC downgrade, description-only joins and conflicting provider IDs refuse", async () => {
  for (const scenario of ["dmarc-fail", "duplicate-receiver", "foreign-sender", "description", "foreign-id", "foreign-host", "comment", "unterminated-comment", "data-type", "data-href", "aria-href", "duplicate-type", "join-control", "scope-change"]) {
    const f = await proofFixture(), mail = f.input.messages[0]!;
    if (scenario === "dmarc-fail") mail.headers[2]!.value = mail.headers[2]!.value.replace("dmarc=pass", "dmarc=fail");
    if (scenario === "duplicate-receiver") mail.headers.push({...mail.headers[2]!});
    if (scenario === "foreign-sender") mail.headers[0]!.value = "no-reply@evil.example";
    if (scenario === "description") mail.html = mail.html.replace('type="button"', "");
    if (scenario === "foreign-id") mail.html += '<a href="https://zoom.us/w/99999999999">Description</a>';
    if (scenario === "foreign-host") mail.html = mail.html.replace("zoom.us/w", "evil.example/w");
    if (scenario === "comment") mail.html = "<!--" + mail.html + "-->";
    if (scenario === "unterminated-comment") mail.html = "<!--" + mail.html;
    if (scenario === "data-type") mail.html = mail.html.replace("type=", "data-type=");
    if (scenario === "data-href") mail.html = mail.html.replace("href=", "data-href=");
    if (scenario === "aria-href") mail.html = mail.html.replace("href=", "aria-href=");
    if (scenario === "duplicate-type") mail.html = mail.html.replace('type="button"', 'type="button" type="submit"');
    if (scenario === "join-control") mail.html = mail.html.replace("zoom.us/w", "zoom.us/\nw");
    if (scenario === "scope-change") f.options.allowedZoomHosts = ["zoom.us", "us02web.zoom.us"];
    assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "refused", scenario);
  }
});
test("current deny/optout/cancellation/rejection/unresolved/unapproved source always veto", async () => {
  for (const key of ["denied", "optedOut", "cancelled", "rejected", "unresolved", "approved"] as const) {
    const f = await proofFixture(); f.input.sourceState[key] = key !== "approved";
    assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "refused", key);
  }
});
