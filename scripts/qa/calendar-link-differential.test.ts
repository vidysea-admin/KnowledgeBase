/**
 * T-036 fix cycle 1 (ISS-T036CAL-002, -004): DIFFERENTIAL test between the API-side recogniser copy
 * (calendar-link-extract.ts `recognise`) and the canonical recognisers (packages/meeting-bot send-now.ts `planSendNow` +
 * `meetingIdentity`, platform.ts `detectPlatform`). Lives in scripts/qa (outside the dep-cruiser roots) because it must import both apps/api and packages/meeting-bot, an edge no layer may hold.
 *
 * Property 1 (safety): the copy NEVER returns a join link the canonical planner refuses.
 * Property 2 (identity): where both accept, the meeting identity and the normalised URL are identical.
 * Property 3 (recall, bounded): a URL the canonical planner accepts and the copy does not join must be explained by one
 *   of the copy's deliberate extra refusals (registration page, Zoom host-start / zak, `..` segment). Anything else is drift.
 * The corpus is committed here (explicit tables x deterministic cartesian products) plus a seeded generator.
 * Moving the recognisers into packages/core (one implementation) is the proper fix and remains a follow-up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recognise, resolveEventMeetingLink } from "../../apps/api/src/join-rules/calendar-link-extract.js";
import { planSendNow } from "../../packages/meeting-bot/src/send-now.js";

const NOW = "2026-10-11T12:00:00Z";
const canon = (u: string) => { const p = planSendNow(u, NOW); return p.ok ? { key: p.request.meetingKey, url: p.request.meetingUrl } : undefined; };

const GOOD_HOSTS = ["zoom.us", "us02web.zoom.us", "zoom.com", "a.b.zoom.com", "meet.google.com", "x.meet.google.com", "teams.microsoft.com", "gov.teams.microsoft.com",
  "teams.live.com", "webex.com", "acme.webex.com", "webinar.zoho.in", "webinar.zoho.com", "meeting.zoho.eu", "meeting.zoho.com.au", "webinar.zoho.jp", "cloudonair.withgoogle.com",
  "ZOOM.US", "Us02Web.Zoom.Us", "MEET.GOOGLE.COM"];
const BAD_HOSTS = ["evilzoom.us", "zoom.us.evil.tld", "notzoom.com", "zoom.co", "zoomgov.com", "us02web.zoomgov.com", "zoom.us.", "xmeet.google.com", "meet.google.com.evil.tld",
  "meet.google.org", "evilteams.microsoft.com", "teams.microsoft.com.evil.tld", "teams.microsoft.org", "evilteams.live.com", "evilwebex.com", "webex.com.evil.tld", "webex.co",
  "xwebinar.zoho.in", "webinar.zoho.org", "webinar.zoho.in.evil.tld", "meeting.zoho.co.uk", "evilcloudonair.withgoogle.com", "cloudonair.withgoogle.com.evil.tld",
  "withgoogle.com", "google.com", "www.google.com", "evil.tld", "localhost", "127.0.0.1", "[::1]", "zооm.us", "zoom．us", "zoom.us%2eevil.tld", "zoom.us@evil.tld", "evil.tld@zoom.us"];
const PATHS = ["/j/12345678901", "/j/1234", "/j/12345678901/", "//j//12345678901", "/w/12345678901", "/s/12345678901", "/wc/join/12345678901", "/wc/12345678901/join", "/my/room.name",
  "/webinar/register/WN_abc", "/meet/12345678901", "/meet/abc-defg-hij", "/abc-defg-hij", "/ABC-DEFG-HIJ", "/abc-defg-hi", "/lookup/abc_def", "/l/meetup-join/19%3ameeting_x%40thread.v2/0",
  "/l/meetup-join/19:meeting_x@thread.v2", "/join/room1", "/meet/room1", "/meeting/info/abc123", "/meeting/download/abc123", "/events/weeklies", "/events/weeklies/x",
  "/join", "/meeting/join", "/meeting/register", "/j/12345678901/../x", "/foo/../j/12345678901", "/%6a/12345678901", "/j%2f12345678901", "/j/%31234567890", "/j/12345678901%2f..",
  "/%252e%252e/j/12345678901", "/j/12345678901%00", "/./j/12345678901", "/", ""];
const QUERIES = ["", "?pwd=abc", "?pwd=", "?zak=TOKEN", "?key=99", "?sessionId=12", "?sessionid=12&x=1", "?mtid=m1", "?mk=k1&pwd=p", "?uname=a%20b", "?context=%7B%7D",
  "?redirect=https://evil.com", "?url=//evil.com", "?next=%2f%2fevil.com", "?x=https%3A%2F%2Fevil.com", "?x=%2568ttps%253A%252F%252Fevil.com", "?x=%5C%5Cevil.com",
  "?x=javascript:alert(1)", "?x=data:text/html,a", "?return_to=a", "?callback=a", "?Continue=a", "?goto=a", "?target=a", "?dest=a", "?destination=a", "?return=a", "?redirect_uri=a",
  "?x=a:b", "?x=%3Aa", "?register=1", "#frag", "#zak=T", "?a=1&a=2"];
const SCHEMES = ["https://", "http://", "HTTPS://", "https:/", "https:\\\\", "//", "ftp://", "javascript://", "https://user@", "https://user:pw@", "https://zoom.us%40", " https://", "https://​"];
const ENCODED_HOST_REDIRECT = ["https://zoom.us/j/12345678901?redirect=https://evil.com", "https://zoom.us/j/12345678901?url=//evil.com", "https://zoom.us/j/12345678901?next=%2f%2fevil.com",
  "https://zoom.us/j/12345678901?x=https%3A%2F%2Fevil.com", "https://zoom.us/j/12345678901?x=%2568ttps%253A%252F%252Fevil.com", "https:/zoom.us/j/12345678901"];

function mulberry32(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildCorpus(): string[] {
  const out: string[] = [...ENCODED_HOST_REDIRECT];
  for (const h of [...GOOD_HOSTS, ...BAD_HOSTS]) for (const p of PATHS) out.push(`https://${h}${p}`);                                   // hosts x paths
  for (const h of GOOD_HOSTS.slice(0, 8)) for (const p of PATHS.slice(0, 26).filter((_, i) => i % 2 === 0)) for (const q of QUERIES) out.push(`https://${h}${p}${q}`);               // accepted hosts x paths x queries
  for (const s of SCHEMES) for (const h of GOOD_HOSTS.slice(0, 8)) out.push(`${s}${h}/j/12345678901?pwd=abc`, `${s}${h}/abc-defg-hij`);   // schemes
  for (const h of GOOD_HOSTS) for (const port of [":443", ":8443", ":80", ":"]) out.push(`https://${h}${port}/j/12345678901`);              // ports
  const rnd = mulberry32(20261011), pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const hostile = [...BAD_HOSTS, ...GOOD_HOSTS];
  for (let i = 0; i < 1500; i++) {                                                                                                         // seeded generator
    let u = `${pick(["https://", "https://", "https://", "http://", "HTTPS://"])}${pick(hostile)}${pick(PATHS)}${pick(QUERIES)}`;
    if (rnd() < 0.3) u = u.replace(/[a-z]/i, c => `%${c.charCodeAt(0).toString(16)}`);
    if (rnd() < 0.2) u += pick(["&pwd=zz", "&zak=1", "&redirect=%2F%2Fx", "&u=https%3A%2F%2Fx", "&k=%252F%252Fx"]);
    if (rnd() < 0.1) u = u.replace("://", pick(["://u@", ":/", ":///", ":\\\\"]));
    out.push(u);
  }
  return out;
}

const EXPLAINED = (u: string) => /regist/i.test(decodeURIComponent((() => { try { return new URL(u).pathname + new URL(u).search; } catch { return ""; } })())) ||
  /\/s\//i.test(u) || /zak\s*=/i.test(u) || /\.\./.test(u) || /^\s/.test(u) || /%2e/i.test(u) || /%25/.test(u);

test("differential: copy never joins what canonical refuses; identities agree; unexplained recall loss is drift (>= 600 URLs)", () => {
  const corpus = [...new Set(buildCorpus())];
  assert.ok(corpus.length >= 600, `corpus ${corpus.length}`);
  let both = 0, canonOnly = 0, copyOnly = 0, neither = 0, bad: string[] = [];
  for (const u of corpus) {
    const c = canon(u), r = recognise(u), join = r?.kind === "join" ? r : undefined;
    if (join && !c) { copyOnly++; bad.push(`copy-only ${u}`); }
    else if (join && c) { both++; if (join.id !== c.key || join.url !== c.url) bad.push(`identity ${u}: ${join.id}/${c.key} ${join.url}/${c.url}`); }
    else if (!join && c) { canonOnly++; if (!EXPLAINED(u)) bad.push(`unexplained recall loss ${u}`); }
    else neither++;
  }
  console.log(`ISS-T036CAL-004 differential: ${corpus.length} URLs; both accept ${both} (identity equal), canonical-only ${canonOnly} (all explained), copy-only ${copyOnly}, neither ${neither}`);
  assert.deepEqual(bad.slice(0, 15), []);
  assert.ok(both >= 150 && neither >= 600 && canonOnly > 0, `vacuous corpus: both=${both} neither=${neither} canonOnly=${canonOnly}`);
});

test("differential through the full resolver: whatever resolveEventMeetingLink returns from free text is canonical-accepted with the same identity", () => {
  const rnd = mulberry32(7), corpus = [...new Set(buildCorpus())].filter(() => rnd() < 0.4);
  let returned = 0; const bad: string[] = [];
  for (const u of corpus) {
    for (const wrapped of [u, `<a href="${u.replace(/&/g, "&amp;")}">go</a>`, `see (${u}).`, `https://www.google.com/url?q=${encodeURIComponent(u)}&sa=D`]) {
      for (const field of ["description", "location"] as const) {
        const out = resolveEventMeetingLink({ [field]: wrapped });
        if (!out.url) continue;
        returned++;
        const c = canon(out.url), r = recognise(out.url);
        if (!c || r?.kind !== "join" || c.key !== r.id || /zak/i.test(out.url)) bad.push(`${field}: ${wrapped} -> ${out.url}`);
      }
    }
  }
  console.log(`through the resolver: ${returned} returned links, all canonical-accepted`);
  assert.deepEqual(bad.slice(0, 10), []);
  assert.ok(returned > 200, `vacuous: ${returned}`);
});

test("the two former survivors are pinned by name: an extra host and an endsWith host check are refused here", () => {
  for (const u of ["https://zoomgov.com/j/12345678901", "https://us02web.zoomgov.com/j/12345678901", "https://evilwebex.com/meet/room1", "https://evilwebex.com/meeting/info/abc123",
    "https://evilzoom.us/j/12345678901", "https://notwebex.com/join/room1", "https://evilteams.microsoft.com/meet/123456789", "https://xmeet.google.com/abc-defg-hij"]) {
    assert.equal(canon(u), undefined, `canonical refuses ${u}`);
    assert.equal(recognise(u), undefined, `copy must refuse ${u}`);
  }
});
