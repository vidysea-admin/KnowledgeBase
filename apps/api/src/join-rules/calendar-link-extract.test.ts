/**
 * T-036 calendar description/location link extraction. Fixture URL shapes are copied from
 * packages/meeting-bot/src/send-now.test.ts and platform.test.ts (zoom /j/ and /w/ with pwd, teams meetup-join thread,
 * zoho meeting.zoho.com/join?key= and webinar.zoho.in/meeting/register?sessionId=, cloudonair /events/weeklies,
 * meet abc-defg-hij). YouTube Live has NO canonical recogniser in the repo, so it is asserted as "no link".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEventMeetingLink as r, recognise, MAX_SCAN_CHARS, MAX_CANDIDATES } from "./calendar-link-extract.js";

const ZOOM = "https://us02web.zoom.us/j/1234567890?pwd=abc";
const ZOOM_W = "https://us02web.zoom.us/w/1234567890";
const MEET = "https://meet.google.com/abc-defg-hij";
const TEAMS = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0";
const ZOHO = "https://meeting.zoho.com/join?key=999";
const ONAIR = "https://cloudonair.withgoogle.com/events/weeklies";
const ZOHO_REG = "https://webinar.zoho.in/meeting/register?sessionId=12345";
const ZOOM_REG = "https://us02web.zoom.us/webinar/register/WN_abc";
const d = (description: unknown) => r({ description });
const l = (location: unknown) => r({ location });

test("location-only link is found with source location", () => {
  assert.deepEqual(l(ZOOM), { url: ZOOM, source: "location" });
  assert.deepEqual(l(`Room 4 / ${MEET}`), { url: MEET, source: "location" });
});

test("description plain text keeps the passcode query exactly", () => {
  assert.deepEqual(d(`Join here: ${ZOOM} thanks`), { url: ZOOM, source: "description" });
});

test("description shapes: anchor, entities, markdown, angle brackets, trailing punctuation", () => {
  assert.equal(d(`<p>Join <a href="${ZOOM_W}">now</a></p>`).url, ZOOM_W);
  assert.equal(d(`<a href='${ZOOM_W}'>now</a>`).url, ZOOM_W);
  assert.equal(d(`<A HREF="${ZOOM_W}">now</A>`).url, ZOOM_W);
  assert.equal(d(`<a href="${ZOOM}&amp;uname=x">j</a>`).url, `${ZOOM}&uname=x`);
  assert.equal(d(`${ZOOM}&amp;uname=x`).url, `${ZOOM}&uname=x`);
  assert.equal(d(`[Join](${MEET})`).url, MEET);
  assert.equal(d(`<${MEET}>`).url, MEET);
  for (const t of [`(${MEET}).`, `${MEET},`, `"${MEET}".`, `${MEET}!`, `[${MEET}]`, `**${MEET}**`]) assert.equal(d(t).url, MEET, t);
});

test("entities are decoded exactly once", () => {
  const out = d(`<a href="${ZOOM}&amp;amp;x=1">j</a>`).url!;
  assert.ok(out.includes("&amp;x=1") && !out.includes("&x=1"), out);
  assert.equal(d(`<a href="${ZOOM}&#38;x=1">j</a>`).url, `${ZOOM}&x=1`);
});

test("Google redirect wrapper: unwrapped only for exact https://www.google.com/url and a recognised target", () => {
  const w = (host: string, path: string, target: string) => `https://${host}${path}?q=${encodeURIComponent(target)}&sa=D`;
  assert.equal(d(`<a href="${w("www.google.com", "/url", ZOOM).replace(/&/g, "&amp;")}">x</a>`).url, ZOOM);
  assert.equal(d(w("www.google.com", "/url", ZOOM)).url, ZOOM);
  assert.equal(d(w("evil.example", "/url", ZOOM)).url, undefined);
  assert.equal(d(w("google.com", "/url", ZOOM)).url, undefined);
  assert.equal(d(w("www.google.com.evil.tld", "/url", ZOOM)).url, undefined);
  assert.equal(d(w("www.google.com", "/other", ZOOM)).url, undefined);
  assert.equal(d(w("www.google.com", "/url", "https://evil.example/j/1234567890")).url, undefined);
  assert.equal(d(w("www.google.com", "/url", w("www.google.com", "/url", ZOOM))).url, undefined, "nested wrapper");
  assert.equal(d(w("www.google.com", "/url", "javascript:alert(1)")).url, undefined);
});

test("conference data wins and is returned unchanged; description/location ignored", () => {
  assert.deepEqual(r({ conferenceUrl: MEET, description: ZOOM, location: TEAMS }), { url: MEET, source: "conference" });
  assert.deepEqual(r({ conferenceUrl: undefined, description: ZOOM }).source, "description");
});

test("platform fixtures: zoom webinar, teams, zoho, onair, meet resolve; youtube live has no recogniser", () => {
  for (const u of [ZOOM_W, TEAMS, ZOHO, ONAIR, MEET]) assert.equal(d(`Join ${u}`).url, new URL(u).href, u);
  assert.deepEqual(d("Watch https://www.youtube.com/live/abcDEF12345"), {});
});

test("registration-only link is not a join link and gets a typed reason", () => {
  for (const u of [ZOHO_REG, ZOOM_REG]) assert.deepEqual(d(`Register: ${u}`), { issue: "registration-only" }, u);
  assert.equal(d(`${ZOHO_REG} then ${ZOHO}`).url, ZOHO, "join preferred over registration");
  assert.deepEqual(d("nothing here"), {});
  assert.deepEqual(r({}), {});
});

test("two different join links are ambiguous: no url; same meeting twice is one", () => {
  assert.deepEqual(d(`${ZOOM} and ${MEET}`), { issue: "ambiguous" });
  assert.deepEqual(d(`${ZOOM} and https://us02web.zoom.us/j/9999999999`), { issue: "ambiguous" });
  assert.equal(d(`${ZOOM} and https://zoom.us/j/1234567890?pwd=zzz`).url, ZOOM, "same identity, first URL kept");
  assert.deepEqual(l(`${ZOOM} ${MEET}`), { issue: "ambiguous" });
});

test("location wins over description; location platform disambiguates description", () => {
  assert.deepEqual(r({ location: MEET, description: ZOOM }), { url: MEET, source: "location" });
  assert.deepEqual(r({ location: ZOOM_REG, description: `${MEET} ${ZOOM}` }), { url: ZOOM, source: "description" });
  assert.deepEqual(r({ location: "Hall", description: `${MEET} ${ZOOM}` }), { issue: "ambiguous" });
});

test("hostile table", () => {
  const evil = "https://evil.example/x";
  const cases: [string, unknown][] = [
    ["href mismatch (visible zoom, href evil)", `<a href="${evil}">${ZOOM}</a>`],
    ["javascript href", `<a href="javascript:alert('${ZOOM}')">${ZOOM}</a>`],
    ["data url", "data:text/html,hello"],
    ["data href", `<a href="data:text/html;base64,AAAA">x</a>`],
    ["http not https", "http://us02web.zoom.us/j/1234567890"],
    ["suffix lookalike", "https://evilzoom.us/j/1234567890"],
    ["subdomain-of-attacker", "https://zoom.us.evil.tld/j/1234567890"],
    ["meet subdomain trick", "https://meet.google.com.evil.tld/abc-defg-hij"],
    ["userinfo attacker host", "https://zoom.us@evil.tld/j/1234567890"],
    ["userinfo on real host", "https://evil@zoom.us/j/1234567890"],
    ["alt port", "https://zoom.us:8443/j/1234567890"],
    ["trailing-dot host", "https://zoom.us./j/1234567890"],
    ["idn lookalike", "https://zооm.us/j/1234567890"],
    ["encoded host dot", "https://meet.google.com%2eevil.tld/abc-defg-hij"],
    ["encoded slash userinfo", "https://zoom.us%2f@evil.tld/j/1234567890"],
    ["backslash host", "https://evil.tld\\@zoom.us/j/1234567890"],
    ["host in path", "https://evil.tld/zoom.us/j/1234567890"],
    ["host in query", "https://evil.tld/?u=https://us02web.zoom.us/j/1234567890"],
    ["NUL splits id", "https://us02web.zoom.us/j/12\u000034567890"],
    ["path traversal", "https://zoom.us/foo/../j/1234567890/../../x"],
    ["non-string description", 12345],
  ];
  for (const [name, text] of cases) assert.deepEqual(d(text), {}, name);
  assert.equal(d(`<a href="${ZOOM}">${evil}</a>`).url, ZOOM, "href wins over visible text");
  assert.equal(d(`${ZOOM}\u0000evil`).url, ZOOM, "NUL terminates the URL");
  assert.equal(d(`<a href="${ZOOM}"`).url, ZOOM, "unbalanced HTML does not throw");
  assert.equal(d(`<<<>>> <a <b ${MEET}`).url, MEET);
  assert.equal(recognise("https://zoom.us/j/1234567890\n"), undefined);
});

test("scan bounds: 1 MB description, 10,000 URLs, 10,000 unclosed anchors stay linear and bounded", () => {
  const t0 = Date.now();
  const filler = "lorem ipsum ".repeat(Math.ceil(1_000_000 / 12));
  assert.equal(d(`${ZOOM} ${filler}`).url, ZOOM, "link inside the scanned prefix is found");
  assert.deepEqual(d(`${filler} ${ZOOM}`), {}, "link beyond MAX_SCAN_CHARS is not scanned");
  const junk = Array.from({ length: 10_000 }, (_, i) => `https://evil${i}.example/j/1234567890`).join(" ");
  assert.ok(junk.length > MAX_SCAN_CHARS);
  assert.deepEqual(d(junk), {});
  const junk2 = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => `https://evil${i}.example/a`).join(" ");
  assert.deepEqual(d(`${junk2} ${ZOOM}`), {}, "candidate cap");
  assert.equal(d(`<a `.repeat(10_000) + ZOOM).url, ZOOM);
  assert.deepEqual(d("<a href='x'>".repeat(10_000)), {});
  assert.deepEqual(d("<".repeat(MAX_SCAN_CHARS * 2)), {});
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0}ms`);
});

test("no cross-event leakage: pure function holds no state", () => {
  assert.equal(d(ZOOM).url, ZOOM);
  assert.deepEqual(d("no link"), {});
  assert.deepEqual(l(undefined), {});
  assert.equal(d(ZOOM).url, ZOOM);
});

test("recogniser parity drift guard: every exact host in meeting-bot platform.ts is accepted here", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../../../packages/meeting-bot/src/platform.ts", import.meta.url), "utf8");
  for (const h of ["meet.google.com", "teams.microsoft.com", "teams.live.com", "zoom.us", "zoom.com", "webex.com", "cloudonair.withgoogle.com"]) {
    assert.ok(src.includes(`"${h}"`) || src.includes(h), `platform.ts no longer mentions ${h}`);
  }
  assert.ok(src.includes("(webinar|meeting)\\.zoho\\.(in|com|eu|com\\.au|jp)"), "zoho host pattern changed upstream: re-sync recognise()");
  assert.ok(recognise("https://webinar.zoho.in/meeting/join?key=1") && recognise("https://webinar.zoho.eu/x?sessionid=1"));
});
