/**
 * packages/meeting-bot/src/capture/record-commands.test.ts — T-033 / ISS-300 / contract C4 + C5 +
 * C9. Drives `finalizeRecordingWith` (the test seam that keeps `finalizeRecording`'s own param
 * list untouched — see its doc comment in record-commands.ts, added for T-030 compatibility) and
 * `runFinalize`'s injected OBS client, never a real ffmpeg/OBS/transcription subprocess.
 *
 * Proves: the SILENCE_MAX_DB boundary is strict (-50 is not silent, -50.1 is), a silent capture
 * still registers source.json with audioLevel.silent:true and never transcribes (C4); the
 * `--stop-obs` recovery path fails with a clear rejected error (not an unhandled rejection) and
 * never writes/overwrites source.json when OBS is unreachable (C5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { finalizeRecordingWith, isSilentCapture, runFinalize, shouldAutoClick, todayAt } from "./record-commands.js";
import type { ObsClientLike } from "./obs-windows.js";

// Same derivation record-commands.ts uses for its own REPO_ROOT (this file lives in the same
// directory) — used ONLY to assert absence, never to write; see the test below.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// --- isSilentCapture boundary (pure function) -----------------------------------------------

test("isSilentCapture: -50 dB (the boundary) is NOT silent, -50.1 dB IS", () => {
  assert.equal(isSilentCapture(-50), false, "AT the boundary must not be silent");
  assert.equal(isSilentCapture(-50.1), true, "strictly below the boundary must be silent");
  assert.equal(isSilentCapture(-49.9), false, "above the boundary must not be silent");
});

// --- shouldAutoClick: U0 zoom autoClick selection (pure) ----------------------------------------

test("shouldAutoClick: zoom and zoho get autoClick, everything else does not", () => {
  assert.equal(shouldAutoClick("zoho"), true, "T-024b baseline — must not regress");
  assert.equal(shouldAutoClick("zoom"), true, "U0 — the new capability this unit adds");
  assert.equal(shouldAutoClick("webex"), false);
  assert.equal(shouldAutoClick("cloudonair"), false);
  assert.equal(shouldAutoClick("meet"), false);
  assert.equal(shouldAutoClick("teams"), false);
  assert.equal(shouldAutoClick("unknown"), false);
});

// --- todayAt: ISS-319 fix (u5-auto-record-scheduler, fix cycle 2) ----------------------------
// Exported (was private) so this pure function can be unit-tested without spinning up a real
// runRecord/OBS/browser session. `runRecord`'s own callers still pass a bare "HH:MM" (unchanged
// behavior); schedule-tick.ts's job files now pass a full ISO datetime instead, specifically so
// a session crossing midnight doesn't resolve to a stop time ~24h in the past.

test("todayAt: a bare HH:MM still resolves to today at that local time (unchanged baseline)", () => {
  const before = new Date();
  const d = todayAt("21:00");
  assert.equal(d.getHours(), 21);
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getFullYear(), before.getFullYear());
  assert.equal(d.getMonth(), before.getMonth());
  assert.equal(d.getDate(), before.getDate());
});

test("todayAt: a full ISO datetime is parsed directly, not reinterpreted as today (ISS-319)", () => {
  const iso = "2026-09-29T00:45:00.000Z";
  const d = todayAt(iso);
  assert.equal(d.getTime(), new Date(iso).getTime());
});

test("todayAt: ISS-319's own reproduction — a session crossing midnight must not resolve -Until " +
  "to a time before the session's own start", () => {
  const start = todayAt("23:30"); // legacy bare-HH:mm start, still today
  // The OLD behavior for a midnight-crossing end (bare "00:45") also resolved to TODAY, landing
  // ~23h before `start`. The fix: schedule-tick.ts now passes the full ISO end datetime instead
  // of a bare HH:mm, so the same real end instant parses to the correct absolute time.
  const realEndIso = new Date(start.getTime() + 75 * 60 * 1000).toISOString(); // start + 1h15m
  const end = todayAt(realEndIso);
  assert.ok(end.getTime() > start.getTime(), "end must be after start, even across midnight");
});

test("todayAt: an unparseable non-HH:MM, non-ISO string still throws a clear error", () => {
  assert.throws(() => todayAt("not-a-time"), /bad time/);
});

// --- finalizeRecordingWith: silence gate + source.json registration ---------------------------

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lkb-finalize-"));
  writeFileSync(join(root, "fake-video.mkv"), "fake-video-bytes");
  mkdirSync(join(root, "raw", "webinars"), { recursive: true }); // finalizeRecordingWith assumes this already exists (real RECORD_DIR is created by obs-windows.ts launch())
  return root;
}

/** Writes fake audio bytes to whatever path finalizeRecordingWith itself computed and passed in,
 * so the seam is exercised exactly as `defaultExtractAudio` would use it, just without ffmpeg. */
const fakeExtractAudio = (_video: string, audioOut: string): void => writeFileSync(audioOut, "fake-audio-bytes");

test("finalizeRecordingWith: silent capture (-50.1 dB) throws, still writes source.json with audioLevel.silent:true, never transcribes", async () => {
  const root = fixtureRoot();
  let transcribeCalled = false;
  try {
    const video = join(root, "fake-video.mkv");
    await assert.rejects(
      () => finalizeRecordingWith(
        {
          repoRoot: root,
          extractAudio: fakeExtractAudio,
          measureVolume: () => ({ maxDb: -50.1, meanDb: -70 }),
          runTranscription: () => { transcribeCalled = true; },
        },
        video, "sess-silent", "Silent Session", "zoho", /* transcribe */ true,
      ),
      /recording is silent \(max -50\.1 dB\)/,
    );
    assert.equal(transcribeCalled, false, "a silent capture must never reach transcription");

    const sourceDoc = JSON.parse(readFileSync(join(root, "data", "toc-migrated", "sess-silent", "source.json"), "utf8"));
    assert.equal(sourceDoc.audioLevel.silent, true);
    assert.equal(sourceDoc.audioLevel.maxDb, -50.1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finalizeRecordingWith: -50 dB exactly (the boundary) does NOT throw, source.json has audioLevel.silent:false, transcription runs", async () => {
  const root = fixtureRoot();
  let transcribeCalledWith: string | undefined;
  try {
    const video = join(root, "fake-video.mkv");
    await finalizeRecordingWith(
      {
        repoRoot: root,
        extractAudio: fakeExtractAudio,
        measureVolume: () => ({ maxDb: -50, meanDb: -60 }),
        runTranscription: (sessionId) => { transcribeCalledWith = sessionId; },
      },
      video, "sess-boundary", "Boundary Session", "webex", /* transcribe */ true,
    );

    assert.equal(transcribeCalledWith, "sess-boundary", "exactly at the boundary must transcribe when asked");

    const sourceDoc = JSON.parse(readFileSync(join(root, "data", "toc-migrated", "sess-boundary", "source.json"), "utf8"));
    assert.equal(sourceDoc.audioLevel.silent, false);
    assert.equal(sourceDoc.audioLevel.maxDb, -50);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finalizeRecordingWith: not silent and transcribe:false never calls runTranscription", async () => {
  const root = fixtureRoot();
  let transcribeCalled = false;
  try {
    const video = join(root, "fake-video.mkv");
    await finalizeRecordingWith(
      {
        repoRoot: root,
        extractAudio: fakeExtractAudio,
        measureVolume: () => ({ maxDb: -10, meanDb: -20 }),
        runTranscription: () => { transcribeCalled = true; },
      },
      video, "sess-notranscribe", "No Transcribe Session", "cloudonair", /* transcribe */ false,
    );
    assert.equal(transcribeCalled, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- runFinalize --stop-obs: OBS unreachable (C5) ----------------------------------------------

test("runFinalize --stop-obs: OBS unreachable rejects with a clear error and never creates a source.json", async () => {
  const sessionId = `t033-stop-obs-unreachable-${Date.now()}`;
  const unreachableObs: ObsClientLike = {
    connect: async () => { throw new Error("OBS unreachable (simulated, T-033)"); },
    call: async () => { throw new Error("must not be called — connect() must fail first"); },
    disconnect: async () => { throw new Error("must not be called — connect() must fail first"); },
  };

  // C5: "a recovery run when OBS itself is unreachable must fail with a clear, actionable error
  // (not an unhandled rejection)". `assert.rejects` itself proves this is a properly rejected
  // promise a caller can await/catch, never a dangling/unhandled one.
  await assert.rejects(
    () => runFinalize(
      ["--session-id", sessionId, "--title", "Stop-OBS Unreachable", "--stop-obs"],
      { obs: unreachableObs },
    ),
    /OBS unreachable \(simulated, T-033\)/,
  );

  // finalizeRecordingWith/finalizeRecording is the only thing that ever creates this directory,
  // and it is the LAST statement in runFinalize — connect() rejecting must short-circuit long
  // before it, so a valid (or any) source.json for this session must never come to exist. This is
  // the same real REPO_ROOT record-commands.ts itself resolves to; asserted absence-only, so
  // nothing is ever written into the live tree by this test (capability-coverage rule).
  const dataDir = join(REPO_ROOT, "data", "toc-migrated", sessionId);
  assert.equal(existsSync(dataDir), false, "a rejected OBS connect must never reach source.json registration");
});
