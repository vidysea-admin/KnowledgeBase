import test from "node:test";
import assert from "node:assert/strict";
import { resolveOnairLink, extractRedirectUrl, canonicalOnairEvent } from "./onair-link-resolver.js";
import type { PinnedResponse } from "../registration-link-resolver.js";

const LINK = "https://go.cloudplatformonline.com/dc/FAKE-token_0123456789";
const PUBLIC = [{ address: "93.184.216.34", family: 4 }];
const body = (s: string) => new TextEncoder().encode(s);
const page = (url: string) => body(`<html><script>var redirecturl = '${url}';window.location=redirecturl;</script></html>`);
const resp = (over: Partial<PinnedResponse> = {}): PinnedResponse => ({ status: 302, locations: [], peerAddress: "93.184.216.34", body: body(""), ...over });
const make = (responses: PinnedResponse[], dnsRows = PUBLIC) => {
  const calls: string[] = [];
  return { calls, opts: {
    dns: async () => dnsRows,
    get: async (u: URL) => { calls.push(u.href); return responses.shift() ?? resp({ status: 500 }); },
  } };
};

test("resolves the JS redirect, strips mkt_tok and every other query param", async () => {
  const m = make([resp({ body: page("https://cloudonair.withgoogle.com/events/Gemini-Day?mkt_tok=FAKE&utm_source=x#frag") })]);
  const r = await resolveOnairLink(LINK, m.opts);
  assert.deepEqual(r, { status: "resolved", slug: "gemini-day", url: "https://cloudonair.withgoogle.com/events/gemini-day" });
  assert.deepEqual(m.calls, [LINK]);
});

test("decodes JS escapes in the redirect url", async () => {
  const m = make([resp({ body: page("https:\\/\\/cloudonair.withgoogle.com\\/events\\/ai-live\\x3fmkt_tok=FAKE") })]);
  assert.equal((await resolveOnairLink(LINK, m.opts) as { url: string }).url, "https://cloudonair.withgoogle.com/events/ai-live");
});

test("host pin: look-alike and foreign hosts are refused", async () => {
  for (const bad of ["https://cloudonair.withgoogle.com.evil.example/events/x", "https://evil.example/events/x",
    "https://cloudonair.withgoogle.com@evil.example/events/x", "https://sub.cloudonair.withgoogle.com/events/x",
    "http://cloudonair.withgoogle.com/events/x", "https://cloudonair.withgoogle.com:8443/events/x"]) {
    const r = await resolveOnairLink(LINK, make([resp({ body: page(bad) })]).opts);
    assert.equal(r.status, "refused", bad);
  }
});

test("path pin: only /events/<slug> is accepted", async () => {
  for (const bad of ["https://cloudonair.withgoogle.com/", "https://cloudonair.withgoogle.com/events/", "https://cloudonair.withgoogle.com/events/a/b",
    "https://cloudonair.withgoogle.com/login?next=/events/a", "https://cloudonair.withgoogle.com/events/..%2Fx", "https://cloudonair.withgoogle.com/x/events/a"]) {
    assert.equal((await resolveOnairLink(LINK, make([resp({ body: page(bad) })]).opts)).status, "refused", bad);
  }
});

test("only Marketo links (or direct OnAir links) are accepted as input; nothing is fetched otherwise", async () => {
  for (const bad of ["https://evil.example/dc/abc", "http://go.cloudplatformonline.com/dc/abc", "https://go.cloudplatformonline.com/other/abc",
    "https://go.cloudplatformonline.com:444/dc/abc", "https://u:p@go.cloudplatformonline.com/dc/abc", "https://127.0.0.1/dc/abc", "", "not a url"]) {
    const m = make([resp()]);
    assert.equal((await resolveOnairLink(bad, m.opts)).status, "refused", bad);
    assert.deepEqual(m.calls, [], bad);
  }
});

test("a direct OnAir link is canonicalised without any network call", async () => {
  const m = make([]);
  assert.deepEqual(await resolveOnairLink("https://cloudonair.withgoogle.com/events/abc-1/?mkt_tok=FAKE", m.opts),
    { status: "resolved", slug: "abc-1", url: "https://cloudonair.withgoogle.com/events/abc-1" });
  assert.deepEqual(m.calls, []);
});

test("private, loopback, link-local and mixed DNS answers are refused before any GET", async () => {
  for (const rows of [[{ address: "127.0.0.1", family: 4 }], [{ address: "10.0.0.5", family: 4 }], [{ address: "169.254.169.254", family: 4 }],
    [{ address: "::1", family: 6 }], [...PUBLIC, { address: "192.168.1.1", family: 4 }], []]) {
    const m = make([resp({ body: page("https://cloudonair.withgoogle.com/events/x") })], rows);
    assert.deepEqual(await resolveOnairLink(LINK, m.opts), { status: "refused", reason: "address" });
    assert.deepEqual(m.calls, []);
  }
});

test("follows a Location redirect to another Marketo url, then reads the body; loops and foreign Locations refused", async () => {
  const hop = "https://go.cloudplatformonline.com/dc/FAKE-second";
  const ok = make([resp({ locations: [hop] }), resp({ body: page("https://cloudonair.withgoogle.com/events/two-hop") })]);
  assert.equal((await resolveOnairLink(LINK, ok.opts) as { slug: string }).slug, "two-hop");
  assert.deepEqual(ok.calls, [LINK, hop]);
  assert.equal((await resolveOnairLink(LINK, make([resp({ locations: [LINK] }), resp({ locations: [LINK] })]).opts)).status, "refused");
  assert.equal((await resolveOnairLink(LINK, make([resp({ locations: ["https://evil.example/x"] })]).opts)).status, "refused");
  assert.equal((await resolveOnairLink(LINK, make([resp({ locations: ["https://cloudonair.withgoogle.com/events/by-header"] })]).opts)).status, "resolved");
});

test("redirect depth is capped", async () => {
  const chain = [1, 2, 3, 4, 5].map(i => resp({ locations: [`https://go.cloudplatformonline.com/dc/FAKE-${i}`] }));
  const m = make(chain);
  assert.equal((await resolveOnairLink(LINK, m.opts)).status, "refused");
  assert.ok(m.calls.length <= 4);
});

test("byte cap, deadline and transport errors are refused", async () => {
  assert.equal((await resolveOnairLink(LINK, make([resp({ body: new Uint8Array(300 * 1024) })]).opts)).status, "refused");
  let t = 0;
  const slow = { dns: async () => PUBLIC, now: () => (t += 8000), get: async () => resp({ body: page("https://cloudonair.withgoogle.com/events/x") }) };
  assert.equal((await resolveOnairLink(LINK, slow)).status, "refused");
  assert.equal((await resolveOnairLink(LINK, { dns: async () => PUBLIC, get: async () => { throw new Error("boom"); } })).status, "refused");
  assert.equal((await resolveOnairLink(LINK, make([resp({ status: 200, body: body("<html>no js</html>") })]).opts)).status, "refused");
});

test("helpers: extractRedirectUrl and canonicalOnairEvent", () => {
  assert.equal(extractRedirectUrl(body('redirecturl = "https://a.example/x"')), "https://a.example/x");
  assert.equal(extractRedirectUrl(body("nothing")), undefined);
  assert.equal(canonicalOnairEvent("https://cloudonair.withgoogle.com/events/A_b-9")?.slug, "a_b-9");
});
