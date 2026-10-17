import test from "node:test";
import assert from "node:assert/strict";
import {createConfiguredPublicWebinarDiscovery} from "./public-webinar-config.js";

const owner = "tenant-a";
const source = {id: "college", url: "https://college.example/events"};
const serialize = (value: unknown) => JSON.stringify(value);

test("missing config is explicit; supplied empty/malformed config fails closed", () => {
  assert.deepEqual(createConfiguredPublicWebinarDiscovery(owner, undefined), {configured: false, reason: "not-configured"});
  for (const raw of ["", " ", "null", "{}", "[]", "[", "x".repeat(16_385), serialize([{...source, url: `https://college.example/${"a".repeat(2048)}`}])]) {
    assert.throws(() => createConfiguredPublicWebinarDiscovery(owner, raw), /^Error: Invalid public webinar source configuration$/);
  }
});

test("rejects malformed entries, unsafe URLs, aliases and resource overflow before access", () => {
  const invalid = [null, [], {}, {...source, extra: true}, {...source, id: "bad\nid"},
    {...source, id: "a".repeat(65)}, {...source, url: 42},
    ...["http://college.example/events", "https://name:secret@college.example/events", "https://college.example:8443/events",
      "https://college.example/events#secret", "https://college.example/events\n"].map(url => ({...source, url}))];
  let calls = 0;
  const deps = {lookup: async () => {calls++; return ["93.184.216.34"];}, request: async () => {throw new Error("must not fetch");}};
  for (const item of invalid) assert.throws(() => createConfiguredPublicWebinarDiscovery(owner, serialize([item]), deps));
  for (const sources of [[source, source], [source, {...source, id: "other", url: "https://COLLEGE.example:443/events"}],
    Array.from({length: 11}, (_, i) => ({id: `s${i}`, url: `https://college.example/${i}`}))]) {
    assert.throws(() => createConfiguredPublicWebinarDiscovery(owner, serialize(sources), deps));
  }
  for (const tenant of [undefined, "", "../foreign", "tenant\nforeign"]) {
    assert.throws(() => createConfiguredPublicWebinarDiscovery(tenant, serialize([source]), deps));
  }
  assert.equal(calls, 0);
});

test("immutable inventory cannot change factory inputs; wrong tenant refuses before provider", async () => {
  let calls = 0;
  const configured = createConfiguredPublicWebinarDiscovery(owner, serialize([source]), {
    lookup: async () => {calls++; return ["93.184.216.34"];},
    request: async () => ({status: 200, location: null, body: "<html>No structured events</html>"}),
  });
  assert.equal(configured.configured, true);
  if (!configured.configured) return assert.fail("not configured");
  assert.equal(Object.isFrozen(configured), true);
  assert.equal(Object.isFrozen(configured.sources), true);
  assert.equal(Object.isFrozen(configured.sources[0]), true);
  assert.throws(() => Object.assign(configured.sources[0]!, {url: "https://evil.example"}));
  await assert.rejects(configured.discover("tenant-b"), /owner mismatch/);
  assert.equal(calls, 0);
  const result = await configured.discover(owner);
  assert.equal(result.tenantId, owner);
  assert.equal(result.complete, false);
  assert.deepEqual(result.gaps, [{sourceId: source.id, reason: "no-structured-events"}]);
  assert.equal(calls, 1);
});

test("real factory output preserves review-only literal evidence and truthful complete coverage", async () => {
  const event = {"@type": "EducationEvent", name: "Career guidance webinar", startDate: "2099-10-15T10:00:00Z", url: "/register/session"};
  const configured = createConfiguredPublicWebinarDiscovery(owner, serialize([source]), {
    lookup: async () => ["93.184.216.34"],
    request: async () => ({status: 200, location: null, body: `<script type="application/ld+json">${serialize(event)}</script>`}),
  });
  if (!configured.configured) return assert.fail("not configured");
  const result = await configured.discover(owner);
  assert.equal(result.complete, true); assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]!.reviewRequired, true);
  assert.equal(result.candidates[0]!.personalJoinVerified, false);
  assert.equal(result.candidates[0]!.sourceUrl, source.url);
  assert.equal(result.candidates[0]!.registrationUrl, "https://college.example/register/session");
});
