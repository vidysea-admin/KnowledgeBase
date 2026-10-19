import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalMeetingId, extractWhatsappLinks, normalizeUrl } from "./whatsapp-link-extractor.js";

const TS = "2026-10-19T04:00:00Z", G = "120363000000@g.us";
const one = (text: string) => extractWhatsappLinks({ text, ts: TS, groupId: G });

const CASES: Array<[string, string, string, boolean]> = [
  ["zoom /j", "Join https://us02web.zoom.us/j/84512345678?pwd=AbC123xyz&utm_source=wa now", "https://us02web.zoom.us/j/84512345678?pwd=AbC123xyz", false],
  ["zoom /w", "https://zoom.us/w/99887766554?tk=TOK_1&fbclid=zzz", "https://zoom.us/w/99887766554?tk=TOK_1", false],
  ["meet", "(https://meet.google.com/abc-defg-hij?authuser=0&utm_medium=x).", "https://meet.google.com/abc-defg-hij?authuser=0", false],
  ["teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_AAA%40thread.v2/0?context=%7b%7d&source=wa", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_AAA%40thread.v2/0?context=%7B%7D", false],
  ["webex", "https://acme.webex.com/meet/jdoe?ref=wa&MTID=m123", "https://acme.webex.com/meet/jdoe?MTID=m123", false],
  ["zoho webinar", "https://webinar.zoho.in/meeting/join?key=11223344&utm_campaign=c", "https://webinar.zoho.in/meeting/join?key=11223344", false],
  ["airmeet", "https://www.airmeet.com/e/abc-123/live?gclid=g1", "https://www.airmeet.com/e/abc-123/live", false],
  ["streamyard", "https://streamyard.com/watch/AbCdEf12?igshid=q", "https://streamyard.com/watch/AbCdEf12", false],
  ["youtube live", "https://www.youtube.com/live/Ab1Cd2Ef3Gh?si=trk&feature=share", "https://www.youtube.com/live/Ab1Cd2Ef3Gh", false],
  ["youtube watch", "https://www.youtube.com/watch?v=Ab1Cd2Ef3Gh&si=trk&t=5", "https://www.youtube.com/watch?v=Ab1Cd2Ef3Gh", false],
  ["zoom registration", "https://us06web.zoom.us/webinar/register/WN_abc123", "https://us06web.zoom.us/webinar/register/WN_abc123", true],
  ["google form", "https://docs.google.com/forms/d/e/1FAIpQLS/viewform?usp=sf_link", "https://docs.google.com/forms/d/e/1FAIpQLS/viewform?usp=sf_link", true],
  ["forms.gle", "https://forms.gle/AbCdEf", "https://forms.gle/AbCdEf", true],
];
for (const [name, text, url, reg] of CASES) {
  test(`extract: ${name}`, () => {
    const r = one(`namaste ${text} thanks`);
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.equal(r[0]!.url, url);
    assert.equal(r[0]!.needsRegistration, reg);
    assert.equal(r[0]!.ts, "2026-10-19T04:00:00.000Z");
  });
}

test("tracking params stripped, meeting ids and passwords kept", () => {
  const u = normalizeUrl("https://zoom.us/j/84512345678?pwd=SECRETPW&utm_source=a&utm_campaign=b&fbclid=c&gclid=d&mc_eid=e")!;
  assert.equal(u, "https://zoom.us/j/84512345678?pwd=SECRETPW");
});

test("non-meeting links and malformed input are ignored", () => {
  assert.deepEqual(one("see https://example.com/page and https://zoom.us/pricing and https://meet.google.com/landing"), []);
  assert.deepEqual(extractWhatsappLinks({ text: "https://zoom.us/j/84512345678", ts: "garbage", groupId: G }), []);
  assert.deepEqual(one("no links here"), []);
});

test("the same link twice in a message yields one candidate", () => {
  assert.equal(one("https://zoom.us/j/84512345678 and again https://zoom.us/j/84512345678?utm_source=x").length, 1);
});

test("output carries no message text and no sender (serialized assertion)", () => {
  const text = "Hi team SECRETWORD_XYZ please join https://zoom.us/j/84512345678?pwd=p1 tomorrow, call Priya on 9876543210";
  const input = { text, ts: TS, groupId: G, sender: "919876543210@s.whatsapp.net", pushName: "Priya Sharma" } as any;
  const out = JSON.stringify(extractWhatsappLinks(input));
  for (const leak of ["SECRETWORD_XYZ", "Hi team", "Priya", "9876543210", "whatsapp.net", G, "please join"]) assert.ok(!out.includes(leak), `leaked ${leak}`);
  const row = JSON.parse(out)[0];
  assert.deepEqual(Object.keys(row).sort(), ["groupIdHash", "messageIdHash", "needsRegistration", "ts", "url"]);
  assert.match(row.groupIdHash, /^[0-9a-f]{16}$/);
  assert.match(row.messageIdHash, /^[0-9a-f]{16}$/);
});

test("canonical meeting id: zoom id and meet code, nothing for others", () => {
  assert.equal(canonicalMeetingId("https://us02web.zoom.us/j/84512345678?pwd=x"), "zoom:84512345678");
  assert.equal(canonicalMeetingId("https://zoom.us/w/99887766554"), "zoom:99887766554");
  assert.equal(canonicalMeetingId("https://meet.google.com/abc-defg-hij"), "meet:abc-defg-hij");
  assert.equal(canonicalMeetingId("https://acme.webex.com/meet/jdoe"), undefined);
});
