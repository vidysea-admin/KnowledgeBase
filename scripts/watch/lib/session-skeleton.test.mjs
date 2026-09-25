// scripts/watch/lib/session-skeleton.test.mjs — U2. Pure builder, no I/O. Asserts schema-shape
// requirements this file's own doc comment claims: session_pages needs non-empty evidence[],
// sessions needs status.transcribe/status.index, sources needs kind/captureMode/hash/consent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAutoSessionSkeleton, slugSessionId } from "./session-skeleton.mjs";

const TURNS = [
  { _id: "t1", speakerRef: "spk:0" },
  { _id: "t2", speakerRef: "spk:1" },
  { _id: "t3", speakerRef: "spk:0" }, // repeat — must not produce a duplicate evidence row
];

test("buildAutoSessionSkeleton: produces a schema-shaped set from turns alone (no meta.json)", () => {
  const { source, session, sessionPage, claims } = buildAutoSessionSkeleton({
    sessionId: "2026-09-27-test-session",
    tenantId: "toc",
    title: "Test Session",
    date: "2026-09-27",
    driveFileId: "1abcDEF",
    audioPath: "raw/TOC/TOC-Materials/Audio/test-session.m4a",
    turns: TURNS,
  });

  assert.equal(source.kind, "recording");
  assert.equal(source.captureMode, "provided");
  assert.ok(source.hash);
  assert.equal(source.consent.given, true);

  assert.equal(session.sourceId, source._id);
  assert.equal(session.status.transcribe, "done");
  assert.equal(session.status.index, "pending");
  assert.equal(session.org, "toc");

  assert.equal(sessionPage.sessionId, "2026-09-27-test-session");
  assert.ok(sessionPage.summary.length > 0);
  assert.equal(sessionPage.evidence.length, 2, "one evidence row per DISTINCT speakerRef, not per turn");
  assert.deepEqual(
    sessionPage.evidence.map((e) => e.turnId).sort(),
    ["t1", "t2"],
    "evidence takes the FIRST turn for each distinct speaker",
  );
  assert.deepEqual(claims, []);
});

test("buildAutoSessionSkeleton: summary is honestly labeled as a mechanical placeholder", () => {
  const { sessionPage } = buildAutoSessionSkeleton({
    sessionId: "2026-09-27-test", tenantId: "toc", title: "T", date: "2026-09-27",
    driveFileId: "x", audioPath: "p", turns: TURNS,
  });
  assert.match(sessionPage.summary, /MECHANICAL placeholder/);
});

test("buildAutoSessionSkeleton: throws rather than seeding an empty-evidence session_page when no turns carry a speakerRef", () => {
  assert.throws(() =>
    buildAutoSessionSkeleton({
      sessionId: "s", tenantId: "toc", title: "T", date: "2026-09-27",
      driveFileId: "x", audioPath: "p", turns: [{ _id: "t1", speakerRef: "" }],
    }),
  );
});

test("buildAutoSessionSkeleton: throws on an empty turns array rather than silently seeding nothing", () => {
  assert.throws(() =>
    buildAutoSessionSkeleton({
      sessionId: "s", tenantId: "toc", title: "T", date: "2026-09-27",
      driveFileId: "x", audioPath: "p", turns: [],
    }),
  );
});

test("slugSessionId: real title -> the same <date>-<slug> shape as existing data/toc-migrated dirs", () => {
  assert.equal(slugSessionId("2026-09-21", "UniAccess: Japan"), "2026-09-21-uniaccess-japan");
});

test("slugSessionId: strips punctuation and collapses separators", () => {
  assert.equal(slugSessionId("2026-09-28", "Scholarships 101: Show Me the Money!"), "2026-09-28-scholarships-101-show-me-the-money");
});
