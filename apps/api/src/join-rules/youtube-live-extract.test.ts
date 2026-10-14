/** T-036 YouTube Live watch-link discovery. Synthetic event text only; no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveYoutubeLive as y, youtubeVideoId } from "./youtube-live-extract.js";
import { resolveEventMeetingLink } from "./calendar-link-extract.js";

const ON = { enabled: true };
const ID = "abcDEF12345";
const CANON = `https://www.youtube.com/watch?v=${ID}`;
const d = (description: unknown) => y({ description }, ON);

test("flag off (default, undefined, truthy non-true) returns {} for every input", () => {
  const ev = { description: `Watch https://www.youtube.com/live/${ID}` };
  assert.deepEqual(y(ev), {});
  assert.deepEqual(y(ev, {}), {});
  assert.deepEqual(y(ev, { enabled: undefined }), {});
  assert.deepEqual(y(ev, { enabled: 1 as unknown as boolean }), {});
});

test("shapes: live, watch, youtu.be, m. host, trailing slash, tracking params dropped, id case preserved", () => {
  for (const u of [`https://www.youtube.com/live/${ID}`, `https://youtube.com/live/${ID}/`, `https://m.youtube.com/watch?v=${ID}&feature=share`,
    `https://youtu.be/${ID}?si=trk&t=30`, `https://www.youtube.com/live/${ID}?feature=share`]) {
    assert.deepEqual(d(`Join ${u} now`), { watch: { url: CANON, videoId: ID, source: "description" } }, u);
  }
  assert.equal(youtubeVideoId("https://youtu.be/ABCdef12345"), "ABCdef12345");
});

test("location wins over description; same video twice dedupes; two videos are ambiguous", () => {
  assert.equal(y({ location: `https://youtu.be/${ID}`, description: "https://youtu.be/ZZZZZZZZZZZ" }, ON).watch?.source, "location");
  assert.equal(d(`https://youtu.be/${ID} and https://www.youtube.com/live/${ID}`).watch?.videoId, ID);
  assert.deepEqual(d(`https://youtu.be/${ID} https://youtu.be/ZZZZZZZZZZZ`), { issue: "ambiguous" });
});

test("anchors in HTML descriptions are read; google.com/url wrapper is not unwrapped", () => {
  assert.equal(d(`<p><a href="https://www.youtube.com/live/${ID}">Watch</a></p>`).watch?.videoId, ID);
  assert.deepEqual(d(`https://www.google.com/url?q=https://youtu.be/${ID}`), {});
});

test("hostile / non-matching links are refused", () => {
  const bad = [
    `http://youtu.be/${ID}`, `https://youtu.be.evil.com/${ID}`, `https://evil.com/youtube.com/live/${ID}`,
    `https://user@youtu.be/${ID}`, `https://youtu.be:8443/${ID}`, `https://www.youtube.com.evil.io/live/${ID}`,
    `https://www.youtube.com/watch?v=${ID}&v=ZZZZZZZZZZZ`, "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL1234567890A", "https://www.youtube.com/@channel/live",
    `https://www.youtube.com/watch?v=${ID}&redirect=https://evil.com`, `https://www.youtube.com/watch?v=${ID}&next=x`,
    `https://youtu.be/${ID}extra`, `https://www.youtube.com/live/${ID}/more`, `https:/youtu.be/${ID}`,
    `https://youtu.be/${ID}\\x`, `https://www.youtube-nocookie.com/embed/${ID}`, "https://youtu.be/",
  ];
  for (const u of bad) assert.equal(youtubeVideoId(u), undefined, u);
  assert.deepEqual(d(bad.filter(u => !u.includes("\\")).join(" ")), {}); // a backslash ends a bare URL (shared extractor rule), so its prefix is judged instead
});

test("non-string and oversized input never throw", () => {
  for (const v of [undefined, null, 5, {}, [], ""]) assert.deepEqual(y({ description: v, location: v }, ON), {});
  assert.deepEqual(d("x".repeat(500_000)), {});
  assert.deepEqual(d("https://youtu.be/".repeat(10_000)), {});
});

test("a YouTube link never becomes a joinable meeting url (join resolver unchanged)", () => {
  assert.deepEqual(resolveEventMeetingLink({ description: `https://www.youtube.com/live/${ID}` }), {});
  assert.deepEqual(resolveEventMeetingLink({ description: `https://www.youtube.com/live/${ID} https://meet.google.com/abc-defg-hij` }),
    { url: "https://meet.google.com/abc-defg-hij", source: "description" });
});
