/**
 * packages/ingest/src/sources/onair.test.ts — T-045 OnAir URL recognition. Pure, in-memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ONAIR_HOST,
  ONAIR_QUERY_ALLOW,
  canonicalOnairUrl,
  extractOnairEventId,
  onairAdapter,
  parseOnairUrl,
  type OnairRefusal,
} from "./onair.js";

const H = ONAIR_HOST;
const ACCEPT: Array<[string, string]> = [
  [`https://${H}/events/weeklies`, "weeklies"],
  [`https://${H}/events/weeklies-x`, "weeklies-x"],
  [`https://${H}/events/Weeklies/?utm_a=1`, "weeklies"],
  [`https://CLOUDONAIR.withgoogle.com/events/foo/#a`, "foo"],
  [`https://${H}/events/foo?tk=2&token=secret`, "foo"],
  [`HTTPS://${H}/events/foo`, "foo"],
  [`https://${H}/events/a.b~c-1`, "a.b~c-1"],
  [`https://${H}/events/foo_bar`, "foo_bar"],
];

test("accepts supported forms: id and canonical URL, query/fragment dropped", () => {
  for (const [u, id] of ACCEPT) {
    const r = parseOnairUrl(u);
    assert.equal(r.ok, true, u);
    if (r.ok) {
      assert.equal(r.eventId, id, u);
      assert.equal(r.canonicalUrl, `https://${H}/events/${id}`, u);
      assert.equal(r.platform, "cloudonair");
    }
    assert.equal(extractOnairEventId(u), id);
    assert.equal(onairAdapter.detect(u), true);
  }
});

const HOSTILE: Array<[unknown, OnairRefusal]> = [
  [undefined, "not-a-string"],
  [null, "not-a-string"],
  [42, "not-a-string"],
  [{ url: `https://${H}/events/a` }, "not-a-string"],
  [["https://x"], "not-a-string"],
  ["", "empty"],
  [`https://${H}/events/${"a".repeat(5000)}`, "too-long"],
  [`https://${H}/events/${"a".repeat(101)}`, "bad-event-id"],
  [`http://${H}/events/foo`, "not-https"],
  [`ftp://${H}/events/foo`, "not-https"],
  [`javascript:alert(1)//${H}/events/foo`, "not-https"],
  [`file:///${H}/events/foo`, "not-https"],
  [`//${H}/events/foo`, "not-https"],
  [`${H}/events/foo`, "not-https"],
  [`https://${H}@evil.example/events/foo`, "credentials"],
  [`https://user:pw@${H}/events/foo`, "credentials"],
  [`https://user@${H}/events/foo`, "credentials"],
  [`https://${H}:443@evil.example/events/foo`, "credentials"],
  [`https://${H}:8443/events/foo`, "port"],
  [`https://${H}:443/events/foo`, "port"],
  [`https://${H}./events/foo`, "host-not-allowed"],
  [`https://${H}.evil.example/events/foo`, "host-not-allowed"],
  [`https://evil${H}/events/foo`, "host-not-allowed"],
  [`https://evil.${H}/events/foo`, "host-not-allowed"],
  [`https://www.${H}/events/foo`, "host-not-allowed"],
  [`https://withgoogle.com/events/foo`, "host-not-allowed"],
  [`https://evil.example/?x=${H}/events/foo`, "host-not-allowed"],
  [`https://evil.example/${H}/events/foo`, "host-not-allowed"],
  [`https://xn--cloudonair-8xa.withgoogle.com/events/foo`, "host-not-allowed"],
  [`https://cloudonаir.withgoogle.com/events/foo`, "bad-characters"],
  [`https://${H}\\@evil.example/events/foo`, "bad-characters"],
  [`https:\\\\${H}\\events\\foo`, "bad-characters"],
  [`https://${H}\\events/foo`, "bad-characters"],
  [`https://${H}/events/foo%2Fbar`, "bad-event-id"],
  [`https://${H}/events/%2e%2e`, "bad-event-id"],
  [`https://${H}/events/fo%6f`, "bad-event-id"],
  [`https://${H}/events/..`, "bad-event-id"],
  [`https://${H}/events/.`, "bad-event-id"],
  [`https://${H}/events/-foo`, "bad-event-id"],
  [`https://${H}/events/foo bar`, "bad-characters"],
  [` https://${H}/events/foo`, "bad-characters"],
  [`https://${H}/events/foo `, "bad-characters"],
  [`https://${H}/events/foo\n`, "bad-characters"],
  [`https://${H}/events/fo\to`, "bad-characters"],
  [`https://${H}/events/foo\u0000`, "bad-characters"],
  [`https://${H}/events/foo\u007f`, "bad-characters"],
  [`https://${H}/events/foo `, "bad-characters"],
  [`https://${H}/events/\ud800`, "bad-characters"],
  [`https://${H}/events/foé`, "bad-characters"],
  [`https://${H}/`, "path-not-supported"],
  [`https://${H}/?x=1`, "path-not-supported"],
  [`https://${H}/landing`, "path-not-supported"],
  [`https://${H}/events`, "path-not-supported"],
  [`https://${H}/events/`, "path-not-supported"],
  [`https://${H}/events//`, "path-not-supported"],
  [`https://${H}/events/foo/bar`, "path-not-supported"],
  [`https://${H}//events/foo`, "path-not-supported"],
  [`https://${H}/Events/foo`, "path-not-supported"],
  [`https://${H}/events/foo/../bar`, "path-not-supported"],
  [`https://${H}/events/a/../../x`, "path-not-supported"],
  [`https://`, "host-not-allowed"],
  [`https:`, "unparseable"],
];

test("refuses every hostile or unsupported input with the right reason", () => {
  assert.ok(HOSTILE.length >= 40);
  for (const [u, reason] of HOSTILE) {
    const r = parseOnairUrl(u);
    assert.deepEqual(r, { ok: false, reason }, String(JSON.stringify(u)).slice(0, 80));
    assert.equal(extractOnairEventId(u), undefined);
    assert.equal(onairAdapter.detect(u), false);
  }
});

test("never throws on hostile garbage", () => {
  const junk: unknown[] = [
    Symbol("x"),
    10n,
    () => 1,
    new Date(),
    "\ud800",
    "\udfff".repeat(300),
    "\u0000".repeat(10),
    "https://" + "%".repeat(100),
    "https://[::1]/events/a",
    "https://[/events/a",
  ];
  for (const j of junk) assert.doesNotThrow(() => parseOnairUrl(j));
  assert.equal(parseOnairUrl("https://[::1]/events/a").ok, false);
});

test("canonical URL is idempotent and refuses a bad id", () => {
  for (const [u] of ACCEPT) {
    const a = parseOnairUrl(u);
    assert.ok(a.ok);
    if (!a.ok) continue;
    const b = parseOnairUrl(a.canonicalUrl);
    assert.ok(b.ok);
    if (b.ok) {
      assert.equal(b.eventId, a.eventId);
      assert.equal(b.canonicalUrl, a.canonicalUrl);
    }
  }
  for (const bad of ["", "-x", "A", "a/b", "a?b", "a b", "x".repeat(101), 5 as unknown as string]) {
    assert.throws(() => canonicalOnairUrl(bad), /bad-event-id/);
  }
});

test("empty id is never accepted", () => {
  assert.equal(extractOnairEventId(`https://${H}/events//`), undefined);
  assert.equal(extractOnairEventId(`https://${H}/events/`), undefined);
});

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("property (seeded): any accepted input has allow-listed host, https, no stray query, no userinfo", () => {
  const rand = rng(45);
  const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]!;
  const chars = "abcXYZ019-._~/?#&=@:%\\ ;+";
  const rs = (n: number) => Array.from({ length: n }, () => chars[Math.floor(rand() * chars.length)]).join("");
  let accepted = 0;
  for (let i = 0; i < 4000; i++) {
    const input =
      pick(["https", "http", "HTTPS"]) +
      "://" +
      pick([H, H.toUpperCase(), `x.${H}`, `${H}:1`, `u@${H}`]) +
      pick(["/events/", "/events", "/x/"]) +
      rs(Math.floor(rand() * 8)) +
      pick(["", "?utm_a=1", "?token=zz&" + rs(4), "#f" + rs(3)]);
    const r = parseOnairUrl(input);
    if (!r.ok) continue;
    accepted++;
    const u = new URL(r.canonicalUrl);
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, ONAIR_HOST);
    assert.equal(u.username + u.password, "");
    assert.equal(u.port, "");
    for (const k of u.searchParams.keys()) assert.ok(ONAIR_QUERY_ALLOW.includes(k), k);
    assert.equal(u.search, "");
    assert.equal(u.hash, "");
  }
  assert.ok(accepted > 20, `only ${accepted} accepted`);
});
