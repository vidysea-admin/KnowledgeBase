import { test } from "node:test";
import { createServer } from "node:https";
import { TEST_TLS_CERT, TEST_TLS_KEY } from "./registration-tls-test-fixture.js";
import assert from "node:assert/strict";
import { REGISTRATION_LINK_RESOLUTION_ENABLED, resolveRegistrationLink, resolveRegistrationLinkWithConstantForTest, pinnedRegistrationGet, privateEvidenceHash, publicRegistrationAddress,
  registrationResolutionScopeHash, type LinkResolutionInput, type ResolverOptions, type ResolvedRegistrationLink } from "./registration-link-resolver.js";
import { ZOOM_PROVIDER_CORRELATION_ENABLED, bindZoomRegistrationAttempt, inspectZoomRegistrationConfirmation, inspectZoomRegistrationConfirmationWithConstantForTest,
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
  const result = await resolveRegistrationLinkWithConstantForTest(link, resolver(), true); assert.equal(result.status, "candidate");
  return (result as {status: "candidate"; proof: ResolvedRegistrationLink}).proof;
}

test("both candidates default inactive, with zero DNS/HTTP and no approval callback", async () => {
  assert.equal(REGISTRATION_LINK_RESOLUTION_ENABLED, false); assert.equal(ZOOM_PROVIDER_CORRELATION_ENABLED, false);
  let calls = 0;
  const result = await resolveRegistrationLink(link, {authorize: () => {calls++; return undefined;}, dns: async () => {calls++; return [];}});
  assert.equal(result.status, "inactive"); assert.equal(calls, 0);
  // F4: a caller cannot activate while the shipped constants are false, even with enabled:true and full injection.
  const forced = await resolveRegistrationLink(link, resolver());
  assert.equal(forced.status, "inactive"); assert.equal(calls, 0);
  // ...and the constant alone never activates without an explicit enabled === true.
  for (const enabled of [undefined, false, "true" as any, 1 as any])
    assert.equal((await resolveRegistrationLinkWithConstantForTest(link, resolver({enabled}), true)).status, "inactive", String(enabled));
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
    assert.equal((await resolveRegistrationLinkWithConstantForTest(link, options, true)).status, "refused");
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
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, resolver({dns: async () => [{address: "1.1.1.1", family: 4}, {address: "127.0.0.1", family: 4}],
    get: async () => {get++; throw new Error("must not call")}}), true)).status, "refused");
  assert.equal(get, 0);
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async () => ({status: 200, locations: [], peerAddress: "127.0.0.1", body: bytes("")})}), true)).status, "refused");
});
/** Redirects ONLY from the initial URL; any later request is recorded (and answered 200) so a bad hop is visible, not hidden by loop detection. */
function hopRecorder(location: string[], dnsMap: Record<string, {address: string; family: number}[]> = {}) {
  const requests: string[] = [], lookups: string[] = [];
  return {requests, lookups, options: resolver({
    dns: async host => {lookups.push(host); return dnsMap[host] ?? [{address: "1.1.1.1", family: 4}];},
    get: async url => {
      requests.push(url.href);
      return url.href === link.link ? {status: 302, locations: location, peerAddress: "1.1.1.1", body: bytes("")}
        : {status: 200, locations: [], peerAddress: "1.1.1.1", body: bytes("must-not-be-reached")};
    }})};
}
test("every bad redirect target is refused by per-hop validation with ZERO requests to the bad hop", async () => {
  const bad: Record<string, string[]> = {
    "unlisted host": ["https://evil.example/webinar/register/WN_FIXTURE"],
    "unlisted zoom subdomain": ["https://evil.zoom.us/webinar/register/WN_FIXTURE"],
    "http scheme": ["http://zoom.us/webinar/register/WN_FIXTURE"],
    "userinfo": ["https://user:pass@zoom.us/webinar/register/WN_FIXTURE"],
    "port": ["https://zoom.us:8443/webinar/register/WN_FIXTURE"],
    "fragment": [finalUrl + "#fragment"],
    "ip literal": ["https://1.1.1.1/webinar/register/WN_FIXTURE"],
    "ipv6 literal": ["https://[2606:4700:4700::1111]/webinar/register/WN_FIXTURE"],
    "multiple Location": [finalUrl, finalUrl],
    "no Location": [],
    "newline": ["https://zoom.us/\nwebinar/register/WN_FIXTURE"],
    "backslash": ["https:\\zoom.us/webinar/register/WN_FIXTURE"],
    "loop to start": [link.link],
    "javascript scheme": ["javascript:alert(1)"],
    "protocol-relative evil host": ["//evil.example/webinar/register/WN_FIXTURE"],
  };
  for (const [name, locations] of Object.entries(bad)) {
    const rec = hopRecorder(locations);
    const result = await resolveRegistrationLinkWithConstantForTest(link, rec.options, true);
    assert.equal(result.status, "refused", name);
    assert.deepEqual(rec.requests, [link.link], `${name}: no request may reach the bad hop`);
    assert.deepEqual(rec.lookups, [link.initialHost], `${name}: no DNS lookup for the bad hop`);
  }
  // positive control: the same harness with a valid target does follow it (so the assertions above are not vacuous).
  const ok = hopRecorder([finalUrl]);
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, ok.options, true)).status, "candidate");
  assert.deepEqual(ok.requests, [link.link, finalUrl]);
});
test("an allowed final host with a non-registration path or non-200 status never becomes a candidate", async () => {
  for (const target of ["https://zoom.us/", "https://zoom.us/webinar/register/", "https://zoom.us/j/12345678901", "https://zoom.us/webinar/register/a/b"]) {
    const rec = hopRecorder([target]);
    assert.equal((await resolveRegistrationLinkWithConstantForTest(link, rec.options, true)).status, "refused", target);
  }
  const notOk = resolver({get: async url => url.href === link.link ? {status: 302, locations: [finalUrl], peerAddress: "1.1.1.1", body: bytes("")}
    : {status: 404, locations: [], peerAddress: "1.1.1.1", body: bytes("")}});
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, notOk, true)).status, "refused");
});
test("a redirect target resolving to private/mixed addresses is refused before any connection to that hop", async () => {
  const privates = ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"];
  for (const address of privates) {
    const family = address.includes(":") ? 6 : 4;
    for (const answers of [[{address, family}], [{address: "1.1.1.1", family: 4}, {address, family}]]) {
      const rec = hopRecorder([finalUrl], {"zoom.us": answers});
      const result = await resolveRegistrationLinkWithConstantForTest(link, rec.options, true);
      assert.equal(result.status, "refused", address);
      assert.deepEqual(rec.requests, [link.link], `${address}: no connection to the redirect target`);
      assert.deepEqual(rec.lookups, [link.initialHost, "zoom.us"], address);
    }
  }
  // family that lies about the address also refuses
  const rec = hopRecorder([finalUrl], {"zoom.us": [{address: "1.1.1.1", family: 6}]});
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, rec.options, true)).status, "refused");
  assert.deepEqual(rec.requests, [link.link]);
});
test("hop/total-body/deadline caps refuse without following unlimited redirects", async () => {
  let requests = 0;
  const hops = await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async () => ({status: 302, locations: ["https://zoom.us/hop/" + requests++], peerAddress: "1.1.1.1", body: bytes("")})}), true);
  assert.equal(hops.status, "refused"); assert.equal(requests, 6);
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async () => ({status: 200, locations: [], peerAddress: "1.1.1.1", body: new Uint8Array(1024 * 1024 + 1)})}), true)).status, "refused");
  // each hop is handed the REMAINING budget: at most 15 s total and 1 MiB minus bytes already consumed
  const budgets: {ms: number; bytes: number}[] = [];
  await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async (url, _p, ms, remainingBytes) => {
    budgets.push({ms, bytes: remainingBytes});
    return url.href === link.link ? {status: 302, locations: [finalUrl], peerAddress: "1.1.1.1", body: new Uint8Array(1000)}
      : {status: 200, locations: [], peerAddress: "1.1.1.1", body: bytes("x")};
  }}), true);
  assert.deepEqual(budgets.map(b => b.bytes), [1024 * 1024, 1024 * 1024 - 1000]);
  assert.ok(budgets.every(b => b.ms > 0 && b.ms <= 15000));
  let clock = 0;
  assert.equal((await resolveRegistrationLinkWithConstantForTest(link, resolver({now: () => clock,
    dns: async () => {clock = 15001; return [{address: "1.1.1.1", family: 4}]}}), true)).status, "refused");
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
  const f = await proofFixture(), result = inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true);
  assert.equal(result.status, "candidate");
  if (result.status === "candidate") {assert.equal(result.proof.sourceThreadId, "original-thread"); assert.equal(result.proof.confirmationThreadId, "different-provider-thread");}
});
test("tampered binding, missing provider metadata and source/policy/tenant/recipient changes refuse", async () => {
  for (const change of [{bindingHash: h("forged")}, {providerEventId: "99999999999"}, {tenantId: "foreign"}, {policyRevision: 2},
    {recipient: "other@example.test"}, {phase: "uncertain"}]) {
    const f = await proofFixture(); Object.assign(f.input.attempts[0]!, change);
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused", JSON.stringify(change));
  }
  const f = await proofFixture(); f.options.readNativeEvent = () => undefined;
  assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused");
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
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused", scenario);
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
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused", scenario);
  }
});
test("current deny/optout/cancellation/rejection/unresolved/unapproved source always veto", async () => {
  for (const key of ["denied", "optedOut", "cancelled", "rejected", "unresolved", "approved"] as const) {
    const f = await proofFixture(); f.input.sourceState[key] = key !== "approved";
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused", key);
  }
});
test("F5: a conflicting join id on an unlisted *.zoom.us host fails closed", async () => {
  for (const extra of ['<a href="https://us02web.zoom.us/j/99999999999">x</a>', '<a href="https://us02web.zoom.us/w/99999999999">x</a>']) {
    const f = await proofFixture(); f.input.messages[0]!.html += extra;
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "refused", extra);
  }
  const same = await proofFixture(); same.input.messages[0]!.html += '<a href="https://us02web.zoom.us/j/12345678901">same id</a>';
  assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(same.input, same.options, true).status, "candidate");
});
test("F4: the proof module needs BOTH the constant and enabled === true", async () => {
  const f = await proofFixture();
  assert.equal(inspectZoomRegistrationConfirmation(f.input, f.options).status, "inactive", "constant false beats enabled:true");
  for (const enabled of [undefined, false, "true" as any, 1 as any])
    assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, {...f.options, enabled}, true).status, "inactive", String(enabled));
  assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, false).status, "inactive");
  assert.equal(inspectZoomRegistrationConfirmationWithConstantForTest(f.input, f.options, true).status, "candidate");
});

// ---- real transport, local HTTPS only (127.0.0.1, throwaway self-signed cert injected as the only trust anchor) ----
interface Seen {method?: string; headers: Record<string, string | string[] | undefined>; host?: string}
async function withServer<T>(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  run: (port: number, seen: Seen[]) => Promise<T>): Promise<T> {
  const seen: Seen[] = [];
  const server = createServer({key: TEST_TLS_KEY, cert: TEST_TLS_CERT}, (req, res) => {
    seen.push({method: req.method, headers: {...req.headers}, host: req.headers.host}); handler(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try { return await run((server.address() as {port: number}).port, seen); }
  finally { server.closeAllConnections?.(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const pin = {address: "127.0.0.1", family: 4}, trust = {ca: TEST_TLS_CERT};
test("transport: GET only, DNS pinned (unresolvable name reaches the pinned address), no cookie/authorization, peer reported", async () => {
  await withServer((_req, res) => {res.setHeader("set-cookie", "a=b"); res.setHeader("location", "https://zoom.us/webinar/register/x"); res.statusCode = 302; res.end("hello");},
    async (port, seen) => {
      const response = await pinnedRegistrationGet(new URL(`https://pinned.test:${port}/path?q=1`), pin, 5000, 1024 * 1024, trust);
      assert.equal(response.status, 302); assert.equal(Buffer.from(response.body).toString(), "hello");
      assert.equal(response.peerAddress, "127.0.0.1"); assert.deepEqual(response.locations, ["https://zoom.us/webinar/register/x"]);
      assert.equal(seen.length, 1); assert.equal(seen[0]!.method, "GET");
      assert.equal(seen[0]!.host, `pinned.test:${port}`, "TLS/SNI host is the URL host while the socket goes to the pin");
      assert.deepEqual(Object.keys(seen[0]!.headers).sort(), ["accept", "accept-encoding", "connection", "host"]);
    });
});
test("transport: the pin wins over real DNS (localhost would resolve to the listener, the pinned 127.0.0.2 must be used)", async () => {
  await withServer((_req, res) => res.end("ok"), async (port, seen) => {
    await assert.rejects(pinnedRegistrationGet(new URL(`https://localhost:${port}/`), {address: "127.0.0.2", family: 4}, 3000, 1024 * 1024, trust));
    assert.equal(seen.length, 0);
  });
});
test("transport: certificate hostname mismatch and untrusted CA are rejected before any HTTP request", async () => {
  await withServer((_req, res) => res.end("ok"), async (port, seen) => {
    await assert.rejects(pinnedRegistrationGet(new URL(`https://nomatch.test:${port}/`), pin, 3000, 1024 * 1024, trust), /altname|certificate|hostname/i);
    await assert.rejects(pinnedRegistrationGet(new URL(`https://pinned.test:${port}/`), pin, 3000), /self.signed|certificate|unable to/i);
    assert.equal(seen.length, 0, "no HTTP request is made over an unverified TLS session");
  });
});
test("transport: 1 MiB body cap (including the remaining-bytes budget) and the deadline reject", async () => {
  await withServer((_req, res) => {res.statusCode = 200; res.end(Buffer.alloc(1024 * 1024 + 1));}, async port => {
    await assert.rejects(pinnedRegistrationGet(new URL(`https://pinned.test:${port}/`), pin, 5000, undefined, trust));
    await assert.rejects(pinnedRegistrationGet(new URL(`https://pinned.test:${port}/`), pin, 5000, 100, trust));
  });
  await withServer((_req, res) => {res.statusCode = 200; res.end(Buffer.alloc(1024 * 1024));}, async port => {
    assert.equal((await pinnedRegistrationGet(new URL(`https://pinned.test:${port}/`), pin, 5000, undefined, trust)).body.byteLength, 1024 * 1024, "exactly 1 MiB is allowed");
  });
  await withServer(() => {/* never answers */}, async port => {
    const started = Date.now();
    await assert.rejects(pinnedRegistrationGet(new URL(`https://pinned.test:${port}/`), pin, 300, 1024 * 1024, trust), /deadline/);
    assert.ok(Date.now() - started < 3000);
  });
});
test("the resolver hands each hop at most the 15 s budget", async () => {
  let observed = 0;
  await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async (_u, _p, ms) => {observed = ms; throw new Error("stop");}}), true);
  assert.ok(observed > 14000 && observed <= 15000, String(observed));
});
test("a peer address that differs from the pinned DNS answer is refused on every hop (even when the peer is public)", async () => {
  for (const mismatchOn of ["initial", "final"] as const) {
    const requests: string[] = [];
    const result = await resolveRegistrationLinkWithConstantForTest(link, resolver({get: async url => {
      requests.push(url.href);
      const first = url.href === link.link, peerAddress = (first ? mismatchOn === "initial" : mismatchOn === "final") ? "8.8.8.8" : "1.1.1.1";
      return first ? {status: 302, locations: [finalUrl], peerAddress, body: bytes("")} : {status: 200, locations: [], peerAddress, body: bytes("event")};
    }}), true);
    assert.equal(result.status, "refused", mismatchOn);
    assert.equal(requests.length, mismatchOn === "initial" ? 1 : 2, mismatchOn);
  }
});
