/**
 * packages/ingest/src/sources/zoom-recording.test.ts — T-045 Zoom cloud-recording URL recognition. Pure, in-memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ZOOM_HOST,
  ZOOM_RECORDING_QUERY_ALLOW,
  canonicalZoomRecordingUrl,
  extractZoomRecordingId,
  parseZoomRecordingUrl,
  zoomRecordingAdapter,
  type ZoomRecordingRefusal,
} from "./zoom-recording.js";
import { extractYoutubeVideoId } from "./youtube.js";
import { parseOnairUrl } from "./onair.js";

const H = ZOOM_HOST;
const TOK = "aB3dE5gH7jK9_mN-pQ.sT";
const ACCEPT: Array<[string, "share" | "play", string]> = [
  [`https://${H}/rec/share/${TOK}`, "share", TOK],
  [`https://${H}/rec/share/${TOK}/`, "share", TOK],
  [`https://${H}/rec/play/${TOK}`, "play", TOK],
  [`https://us02web.${H}/rec/share/${TOK}`, "share", TOK],
  [`https://vidysea.${H}/rec/share/${TOK}?pwd=secret123`, "share", TOK],
  [`https://${H}/rec/share/${TOK}?pwd=secret&startTime=1700000000000#frag`, "share", TOK],
  [`HTTPS://ZOOM.US/rec/share/${TOK}`, "share", TOK],
  [`https://${H}/rec/share/${TOK}?utm_a=1&token=zz`, "share", TOK],
  [`https://${H}/rec/share/${"A".repeat(256)}`, "share", "A".repeat(256)],
  [`https://${H}/rec/share/12345678`, "share", "12345678"],
];

test("accepts supported forms: kind, id (case kept) and canonical URL, query/fragment/pwd dropped", () => {
  for (const [u, kind, id] of ACCEPT) {
    if (u.length > 400) continue;
    const r = parseZoomRecordingUrl(u);
    assert.equal(r.ok, true, u);
    if (r.ok) {
      assert.equal(r.kind, kind, u);
      assert.equal(r.recordingId, id, u);
      assert.equal(r.canonicalUrl, `https://${H}/rec/${kind}/${id}`, u);
      assert.equal(r.platform, "zoom-recording");
      assert.ok(!r.canonicalUrl.includes("pwd") && !r.canonicalUrl.includes("secret"));
    }
    assert.equal(extractZoomRecordingId(u), id);
    assert.equal(zoomRecordingAdapter.detect(u), true);
  }
});

const T = "tokentoken1";
const HOSTILE: Array<[unknown, ZoomRecordingRefusal]> = [
  [undefined, "not-a-string"],
  [null, "not-a-string"],
  [42, "not-a-string"],
  [{ url: `https://${H}/rec/share/${T}` }, "not-a-string"],
  [["https://x"], "not-a-string"],
  ["", "empty"],
  [`https://${H}/rec/share/${"a".repeat(5000)}`, "too-long"],
  [`https://${H}/rec/share/${"a".repeat(257)}`, "bad-recording-id"],
  [`https://${H}/rec/share/short`, "bad-recording-id"],
  [`http://${H}/rec/share/${T}`, "not-https"],
  [`ftp://${H}/rec/share/${T}`, "not-https"],
  [`javascript:alert(1)//${H}/rec/share/${T}`, "not-https"],
  [`file:///${H}/rec/share/${T}`, "not-https"],
  [`//${H}/rec/share/${T}`, "not-https"],
  [`${H}/rec/share/${T}`, "not-https"],
  [`https://${H}@evil.example/rec/share/${T}`, "credentials"],
  [`https://user:pw@${H}/rec/share/${T}`, "credentials"],
  [`https://user@${H}/rec/share/${T}`, "credentials"],
  [`https://${H}:443@evil.example/rec/share/${T}`, "credentials"],
  [`https://${H}:8443/rec/share/${T}`, "port"],
  [`https://${H}:443/rec/share/${T}`, "port"],
  [`https://${H}./rec/share/${T}`, "host-not-allowed"],
  [`https://${H}.evil.example/rec/share/${T}`, "host-not-allowed"],
  [`https://evil${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://evil-${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://a.b.${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://.${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://-a.${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://zoom.com/rec/share/${T}`, "host-not-allowed"],
  [`https://zoom.us.evil.example/rec/share/${T}`, "host-not-allowed"],
  [`https://notzoom.us/rec/share/${T}`, "host-not-allowed"],
  [`https://us/rec/share/${T}`, "host-not-allowed"],
  [`https://evil.example/?x=${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://evil.example/${H}/rec/share/${T}`, "host-not-allowed"],
  [`https://xn--zoom-8xa.us/rec/share/${T}`, "host-not-allowed"],
  [`https://zооm.us/rec/share/${T}`, "bad-characters"],
  [`https://${H}\\@evil.example/rec/share/${T}`, "bad-characters"],
  [`https:\\\\${H}\\rec\\share\\${T}`, "bad-characters"],
  [`https://${H}\\rec/share/${T}`, "bad-characters"],
  [`https://${H}/rec/share/${T}%2Fbar`, "bad-recording-id"],
  [`https://${H}/rec/share/%2e%2e%2e%2e%2e%2e%2e%2e`, "bad-recording-id"],
  [`https://${H}/rec/share/to%6ben1234`, "bad-recording-id"],
  [`https://${H}/rec/share/........`, "bad-recording-id"],
  [`https://${H}/rec/share/-tokentoken`, "bad-recording-id"],
  [`https://${H}/rec/share/tok_en!!!!`, "bad-recording-id"],
  [`https://${H}/rec/share/${T} `, "bad-characters"],
  [` https://${H}/rec/share/${T}`, "bad-characters"],
  [`https://${H}/rec/share/${T}\n`, "bad-characters"],
  [`https://${H}/rec/share/tok\ten12345`, "bad-characters"],
  [`https://${H}/rec/share/${T}\u0000`, "bad-characters"],
  [`https://${H}/rec/share/${T}\u007f`, "bad-characters"],
  [`https://${H}/rec/share/${T} `, "bad-characters"],
  [`https://${H}/rec/share/\ud800${T}`, "bad-characters"],
  [`https://${H}/rec/share/tokén12345`, "bad-characters"],
  [`https://${H}/`, "path-not-supported"],
  [`https://${H}/?x=1`, "path-not-supported"],
  [`https://${H}/j/12345678901`, "path-not-supported"],
  [`https://${H}/w/12345678901`, "path-not-supported"],
  [`https://${H}/rec`, "path-not-supported"],
  [`https://${H}/rec/`, "path-not-supported"],
  [`https://${H}/rec/share`, "path-not-supported"],
  [`https://${H}/rec/share/`, "path-not-supported"],
  [`https://${H}/rec/share//`, "path-not-supported"],
  [`https://${H}/rec/download/${T}`, "path-not-supported"],
  [`https://${H}/rec/share/${T}/extra`, "path-not-supported"],
  [`https://${H}//rec/share/${T}`, "path-not-supported"],
  [`https://${H}/Rec/share/${T}`, "path-not-supported"],
  [`https://${H}/rec/Share/${T}`, "path-not-supported"],
  [`https://${H}/rec/share/${T}/../x`, "path-not-supported"],
  [`https://`, "host-not-allowed"],
  [`https:`, "unparseable"],
];

test("refuses every hostile or unsupported input with the right reason", () => {
  assert.ok(HOSTILE.length >= 60, String(HOSTILE.length));
  for (const [u, reason] of HOSTILE) {
    const r = parseZoomRecordingUrl(u);
    assert.deepEqual(r, { ok: false, reason }, String(JSON.stringify(u)).slice(0, 80));
    assert.equal(extractZoomRecordingId(u), undefined);
    assert.equal(zoomRecordingAdapter.detect(u), false);
  }
});

test("never throws on hostile garbage", () => {
  const junk: unknown[] = [
    Symbol("x"), 10n, () => 1, new Date(), "\ud800", "\udfff".repeat(300), "\u0000".repeat(10),
    "https://" + "%".repeat(100), "https://[::1]/rec/share/" + T, "https://[/rec/share/a",
  ];
  for (const j of junk) assert.doesNotThrow(() => parseZoomRecordingUrl(j));
  assert.equal(parseZoomRecordingUrl("https://[::1]/rec/share/" + T).ok, false);
});

test("canonical URL is idempotent and refuses a bad kind or id", () => {
  for (const [u] of ACCEPT) {
    const a = parseZoomRecordingUrl(u);
    assert.ok(a.ok);
    if (!a.ok) continue;
    const b = parseZoomRecordingUrl(a.canonicalUrl);
    assert.ok(b.ok);
    if (b.ok) {
      assert.equal(b.recordingId, a.recordingId);
      assert.equal(b.kind, a.kind);
      assert.equal(b.canonicalUrl, a.canonicalUrl);
    }
  }
  for (const bad of ["", "-xxxxxxxx", "a/bbbbbbb", "a?bbbbbbb", "a bbbbbbb", "x", "x".repeat(257), 5 as unknown as string]) {
    assert.throws(() => canonicalZoomRecordingUrl("share", bad), /bad-recording-id/);
  }
  assert.throws(() => canonicalZoomRecordingUrl("download" as "share", TOK), /bad-recording-id/);
});

test("empty id is never accepted", () => {
  assert.equal(extractZoomRecordingId(`https://${H}/rec/share/`), undefined);
  assert.equal(extractZoomRecordingId(`https://${H}/rec/share//`), undefined);
  assert.equal(extractZoomRecordingId(`https://${H}/rec/share/?pwd=abcdefgh`), undefined);
});

test("a passcode/token query parameter never reaches the canonical URL or id; allow-list is empty", () => {
  assert.deepEqual(ZOOM_RECORDING_QUERY_ALLOW, []);
  const r = parseZoomRecordingUrl(`https://${H}/rec/share/${TOK}?pwd=hunter2hunter2&token=abc&passcode=1234`);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.canonicalUrl, `https://${H}/rec/share/${TOK}`);
    assert.ok(!r.recordingId.includes("hunter2") && !r.canonicalUrl.includes("?"));
  }
});

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("property (seeded): any accepted input has allow-listed host, https, no stray query, no userinfo", () => {
  const rand = rng(46);
  const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]!;
  const chars = "abcXYZ019-._~/?#&=@:%\\ ;+";
  const rs = (n: number) => Array.from({ length: n }, () => chars[Math.floor(rand() * chars.length)]).join("");
  let accepted = 0;
  for (let i = 0; i < 4000; i++) {
    const input =
      pick(["https", "http", "HTTPS"]) + "://" +
      pick([H, H.toUpperCase(), `x.${H}`, `us02web.${H}`, `x.y.${H}`, `${H}:1`, `u@${H}`, `evil${H}`]) +
      pick(["/rec/share/", "/rec/play/", "/rec/", "/x/"]) +
      pick(["aB3dE5gH7j", "aB3dE5gH7j", "tok", ""]) + rs(Math.floor(rand() * 8)) +
      pick(["", "?pwd=zz", "?token=zz&" + rs(4), "#f" + rs(3)]);
    const r = parseZoomRecordingUrl(input);
    if (!r.ok) continue;
    accepted++;
    const u = new URL(r.canonicalUrl);
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, ZOOM_HOST);
    assert.equal(u.username + u.password, "");
    assert.equal(u.port, "");
    for (const k of u.searchParams.keys()) assert.ok(ZOOM_RECORDING_QUERY_ALLOW.includes(k), k);
    assert.equal(u.search, "");
    assert.equal(u.hash, "");
  }
  assert.ok(accepted > 20, `only ${accepted} accepted`);
});

test("cross-adapter exclusivity: no accepted fixture is accepted by another adapter", () => {
  const YT = "dQw4w9WgXcQ";
  const youtubeOk = [
    `https://www.youtube.com/watch?v=${YT}`, `https://youtu.be/${YT}`, `https://www.youtube.com/live/${YT}`,
    `https://www.youtube.com/shorts/${YT}`, `https://m.youtube.com/watch?v=${YT}&t=3`,
  ];
  const onairOk = [
    "https://cloudonair.withgoogle.com/events/weeklies", "https://CLOUDONAIR.withgoogle.com/events/foo/#a",
    "https://cloudonair.withgoogle.com/events/a.b~c-1",
  ];
  const zoomOk = ACCEPT.map(([u]) => u).filter((u) => u.length <= 400);
  for (const u of youtubeOk) {
    assert.equal(extractYoutubeVideoId(u), YT, u);
    assert.equal(parseOnairUrl(u).ok, false, u);
    assert.equal(parseZoomRecordingUrl(u).ok, false, u);
  }
  for (const u of onairOk) {
    assert.equal(parseOnairUrl(u).ok, true, u);
    assert.equal(extractYoutubeVideoId(u), undefined, u);
    assert.equal(parseZoomRecordingUrl(u).ok, false, u);
  }
  for (const u of zoomOk) {
    assert.equal(parseZoomRecordingUrl(u).ok, true, u);
    assert.equal(extractYoutubeVideoId(u), undefined, u);
    assert.equal(parseOnairUrl(u).ok, false, u);
  }
});
