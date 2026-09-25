// scripts/watch/lib/digest.test.mjs — U2. Pure markdown builder, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "./digest.mjs";

test("buildDigest: empty findings render '_none_' under every section, never a blank/missing heading", () => {
  const md = buildDigest({
    runAt: "2026-09-25T08:00:00.000Z",
    mode: "dry-run",
    driveNew: [],
    driveIngested: [],
    driveFailed: [],
    upcoming: [],
    pastRecordingPending: [],
  });
  assert.match(md, /## New Drive recordings found \(0\)\n\n_none_/);
  assert.match(md, /## Upcoming sessions, next 14 days \(0\)\n\n_none_/);
  assert.match(md, /## Past-recording mails not yet ingested \(0\)\n\n_none_/);
});

test("buildDigest: real September findings before U1 (4 new, 0 ingested)", () => {
  const md = buildDigest({
    runAt: "2026-09-25T08:00:00.000Z",
    mode: "dry-run",
    driveNew: [
      { id: "1nyGCB", name: "video1968958572.mp4" },
      { id: "11sQTx", name: "16th Sep: Dear Psychology, What Can't You Do?" },
    ],
    driveIngested: [],
    driveFailed: [],
    upcoming: [
      { date: "2026-09-27", agenda: "Ashoka Educator Dialogues", source: "gmail", registrationOnly: true },
      { date: "2026-09-28", agenda: "Scholarships 101: Show Me the Money", source: "toc-calendar", membersZoom: true },
      { date: "2026-09-30", agenda: "Advocacy strategies for Neurodivergent...", source: "toc-calendar", membersZoom: true },
    ],
    pastRecordingPending: [{ subject: "CBSE Career Guidance webinar", senderEmail: "someone@cbse.example", recordingUrl: "https://drive.google.com/file/d/xyz/view" }],
  });
  assert.match(md, /## New Drive recordings found \(2\)/);
  assert.match(md, /video1968958572\.mp4/);
  assert.match(md, /Ashoka Educator Dialogues.*registration-only/);
  assert.match(md, /Scholarships 101.*TOC members-only Zoom/);
  assert.match(md, /CBSE Career Guidance webinar.*drive\.google\.com/);
});

test("buildDigest: ingested/failed rows carry their sessionId / reason", () => {
  const md = buildDigest({
    runAt: "2026-09-25T20:00:00.000Z",
    mode: "ingest",
    driveNew: [],
    driveIngested: [{ id: "1abc", name: "Some Session.mp4", sessionId: "2026-09-25-some-session" }],
    driveFailed: [{ id: "1def", name: "Broken.mp4", reason: "ffmpeg exited 1" }],
    upcoming: [],
    pastRecordingPending: [],
  });
  assert.match(md, /Some Session\.mp4.*session `2026-09-25-some-session`/);
  assert.match(md, /Broken\.mp4.*FAILED: ffmpeg exited 1/);
});
