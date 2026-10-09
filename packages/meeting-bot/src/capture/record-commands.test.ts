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
import { createHash } from "node:crypto";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { captureTenant, finalizeRecordingWith, isSilentCapture, runFinalize, shouldAutoClick, todayAt, validateIndexProof } from "./record-commands.js";
import type { ObsClientLike } from "./obs-windows.js";
import {finalizeControllerRecording} from "./controller-state.js";
import {webinarCompletionState} from "../calendar/schedule-state.js";
import { createTabBrowserDeps } from "./tab-browser.js";

// Same derivation record-commands.ts uses for its own REPO_ROOT (this file lives in the same
// directory) — used ONLY to assert absence, never to write; see the test below.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// --- isSilentCapture boundary (pure function) -----------------------------------------------

test("isSilentCapture: -50 dB (the boundary) is NOT silent, -50.1 dB IS", () => {
  assert.equal(isSilentCapture(-50), false, "AT the boundary must not be silent");
  assert.equal(isSilentCapture(-50.1), true, "strictly below the boundary must be silent");
  assert.equal(isSilentCapture(-49.9), false, "above the boundary must not be silent");
});

// --- shouldAutoClick: bounded platform join selection -----------------------------------------

test("shouldAutoClick: meet, zoom and zoho get bounded join clicks", () => {
  assert.equal(shouldAutoClick("zoho"), true, "T-024b baseline — must not regress");
  assert.equal(shouldAutoClick("zoom"), true, "existing Zoom joins must not regress");
  assert.equal(shouldAutoClick("webex"), false);
  assert.equal(shouldAutoClick("cloudonair"), false);
  assert.equal(shouldAutoClick("meet"), true, "Meet must reach the existing Join now allowlist");
  assert.equal(shouldAutoClick("teams"), false);
  assert.equal(shouldAutoClick("unknown"), false);
});

test("shouldAutoClick forwards Meet join permission and preserves --no-click in the tab launcher", async () => {
  const dir = mkdtempSync(join(tmpdir(), "meet-join-argv-"));
  const script = join(dir, "inspect-argv.mjs");
  writeFileSync(script, 'console.log(JSON.stringify({event:"opened",argv:process.argv.slice(2)}));\n' +
    'console.log(JSON.stringify({event:"fatal",error:"fixture stopped before browser"}));\n');
  try {
    for (const [platform, autoClick] of [["meet", shouldAutoClick("meet")], ["webex", shouldAutoClick("webex")], ["meet", false]] as const) {
      const profile = join(dir, `profile-${platform}-${autoClick}`), record = join(dir, `record-${platform}-${autoClick}`);
      let received: string[] | undefined;
      const tab = createTabBrowserDeps({python: process.execPath, joinScript: script, profileDir: profile,
        recordDir: record, extensionDir: join(REPO_ROOT, "packages/meeting-bot/py/tab-capture"), autoClick,
        startupTimeoutMs: 3000, log: () => {}, onEvent: (_handle, event) => {
          if (event.event === "opened") received = (event as unknown as {argv: string[]}).argv;
        }});
      const url = platform === "meet" ? "https://meet.google.com/abc-defg-hij" : "https://example.webex.com/fixture";
      await assert.rejects(tab.deps.launch(url), /fixture stopped before browser/);
      assert.ok(received, "inspect the actual child argv, without launching Chrome");
      assert.equal(received[0], url);
      assert.equal(received.includes("--no-click"), !autoClick);
      assert.equal(received[received.indexOf("--profile") + 1], profile);
      assert.equal(existsSync(join(profile, ".lkb-tab-capture.lock")), false);
      assert.equal(existsSync(received[received.indexOf("--capture-extension") + 1]), false);
      const output = tab.outputPath(received[received.indexOf("--title") + 1].slice("LKB-BOT ".length));
      assert.ok(output && existsSync(output), "startup failure remains a registered capture attempt");
      assert.equal(JSON.parse(readFileSync(`${output}.status.json`, "utf8")).state, "failed");
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
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

test("recovery re-finalization preserves validated managed control-tail evidence and refuses tampering", async () => {
  const root=fixtureRoot(), sessionId="sess-control", video=join(root,"fake-video.mkv"), source=join(root,"data/toc-migrated",sessionId,"source.json");
  const overrides={repoRoot:root,tenantId:"lane",probeMedia:()=>60,extractAudio:fakeExtractAudio,measureVolume:()=>({maxDb:-20,meanDb:-30})};
  const gap={start:Date.parse("2026-10-01T09:00:00.000Z")/1000,end:Date.parse("2026-10-01T10:00:00.000Z")/1000,reason:"capture-control-controller-disconnected",recovered:false};
  const finalize=(media:string,gaps:any[])=>finalizeRecordingWith(overrides,media,sessionId,"Fixture","meet",false,gaps);
  const recover=()=>finalizeControllerRecording(video,{repoRoot:root,recordDir:join(root,"raw/webinars"),profileDir:join(root,"profile"),sessionId,tenantId:"lane",python:"unused",joinScript:"unused"},
    {normalize:media=>media,finalize,processArtifacts:()=>{}});
  try {
    await finalize(video,[gap]); assert.equal(webinarCompletionState(source,"lane",sessionId,{},new Date().toISOString()).reason,"controller-disconnected");
    await recover();
    const retained=JSON.parse(readFileSync(source,"utf8")); assert.equal(retained.gaps.length,1);
    assert.equal(webinarCompletionState(source,"lane",sessionId,{},new Date().toISOString()).status,"action_required");
    await finalize(video,[gap]); assert.equal(JSON.parse(readFileSync(source,"utf8")).gaps.length,1);
    for (const bad of [{...retained,tenantId:"foreign"},{...retained,_id:"foreign-src"},{...retained,gaps:[{...retained.gaps[0],recovered:true}]},
      {...retained,gaps:[{...retained.gaps[0],start:"invalid"}]},{...retained,gaps:[{...retained.gaps[0],reason:"capture-control-arbitrary"}]}]) {
      const bytes=JSON.stringify(bad); writeFileSync(source,bytes); await assert.rejects(recover()); assert.equal(readFileSync(source,"utf8"),bytes);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("finalizeRecordingWith: silent capture (-50.1 dB) throws, still writes source.json with audioLevel.silent:true, never transcribes", async () => {
  const root = fixtureRoot();
  let transcribeCalled = false;
  try {
    const video = join(root, "fake-video.mkv");
    await assert.rejects(
      () => finalizeRecordingWith(
        {
          repoRoot: root,
          probeMedia: () => 60,
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
        probeMedia: () => 60,
        extractAudio: fakeExtractAudio,
        measureVolume: () => ({ maxDb: -50, meanDb: -60 }),
        runTranscription: (sessionId) => {
          transcribeCalledWith = sessionId;
          writeFileSync(join(root, "data", "toc-migrated", sessionId, "turns.json"),
            JSON.stringify([{ tStart: 0, tEnd: 60, text: "Boundary speech" }]));
        },
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
        probeMedia: () => 60,
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

test("finalization refuses media failure before extraction/transcription and records failure", async () => {
  const root = fixtureRoot();
  try {
    for (const duration of [0, -1, NaN, Infinity]) {
      await assert.rejects(finalizeRecordingWith({ repoRoot: root, probeMedia: () => duration,
        extractAudio: () => { assert.fail("must not extract invalid media"); },
        runTranscription: () => { assert.fail("must not transcribe invalid media"); } },
      join(root, "fake-video.mkv"), "invalid", "Invalid", "zoho", true), /duration/);
    }
    await assert.rejects(finalizeRecordingWith({ repoRoot: root,
      probeMedia: () => { throw new Error("no readable video packets"); } },
    join(root, "fake-video.mkv"), "invalid", "Invalid", "zoho", true), /video packets/);
    assert.equal(JSON.parse(readFileSync(join(root, "data", "toc-migrated", "invalid", "validation.json"), "utf8")).status, "failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("production probe accepts playable audio/video and refuses audio-only media", {
  skip: spawnSync("ffmpeg", ["-version"]).status !== 0 || spawnSync("ffprobe", ["-version"]).status !== 0,
}, async () => {
  const root = fixtureRoot();
  try {
    const video = join(root, "playable.mkv");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=size=64x64:rate=2",
      "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", "-c:v", "mpeg4", "-c:a", "aac", video]);
    await finalizeRecordingWith({ repoRoot: root }, video, "playable", "Playable", "zoho", false);
    const report = JSON.parse(readFileSync(join(root, "data", "toc-migrated", "playable", "validation.json"), "utf8"));
    assert.equal(report.status, "passed");
    assert.ok(report.durationSec >= 1);
    const audioOnly = join(root, "audio-only.m4a");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440",
      "-t", "1", "-c:a", "aac", audioOnly]);
    await assert.rejects(finalizeRecordingWith({ repoRoot: root }, audioOnly, "audio-only", "Audio", "zoho", false), /video packets/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("failed re-finalization invalidates old passing report for extraction, volume and silence", async () => {
  const root = fixtureRoot();
  const video = join(root, "fake-video.mkv"), report = join(root, "data", "toc-migrated", "repeat", "validation.json");
  const good = { repoRoot: root, probeMedia: () => 60, extractAudio: fakeExtractAudio, measureVolume: () => ({ maxDb: -10, meanDb: -20 }) };
  try {
    for (const bad of [
      { extractAudio: () => { throw new Error("extraction failure"); } },
      { measureVolume: () => { throw new Error("volume failure"); } },
      { measureVolume: () => ({ maxDb: NaN, meanDb: -20 }) },
      { measureVolume: () => ({ maxDb: -91, meanDb: -91 }) },
    ]) {
      await finalizeRecordingWith(good, video, "repeat", "Repeat", "zoho", false);
      assert.equal(JSON.parse(readFileSync(report, "utf8")).status, "passed");
      await assert.rejects(finalizeRecordingWith({ ...good, ...bad }, video, "repeat", "Repeat", "zoho", false));
      assert.equal(JSON.parse(readFileSync(report, "utf8")).status, "failed");
    }
    await assert.rejects(finalizeRecordingWith(good, video, "../escape", "Invalid", "zoho", false), /sessionId/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("finalization rejects empty, malformed and out-of-media transcript times without success alert", async () => {
  const root = fixtureRoot();
  let notified = false;
  try {
    const invalid = [[], {}, [{ tStart: 0, tEnd: 61, text: "overrun" }],
      [{ tStart: -1, tEnd: 1, text: "negative" }], [{ tStart: 2, tEnd: 1, text: "inverted" }],
      [{ tStart: 1, tEnd: 1, text: "empty span" }], [{ tStart: "0", tEnd: 1, text: "string" }],
      [{ tStart: null, tEnd: 1, text: "nonfinite JSON" }], [{ tStart: 0, tEnd: 1, text: " " }]];
    for (const turns of invalid) {
      await assert.rejects(finalizeRecordingWith({ repoRoot: root, probeMedia: () => 60,
        extractAudio: fakeExtractAudio, measureVolume: () => ({ maxDb: -10, meanDb: -20 }),
        runTranscription: (id) => writeFileSync(join(root, "data", "toc-migrated", id, "turns.json"), JSON.stringify(turns)) },
      join(root, "fake-video.mkv"), "timings", "Timings", "zoho", true, [],
      { enabled: false, notifyFinished: () => { notified = true; } } as never), /transcript/);
    }
    assert.equal(notified, false);
    assert.equal(JSON.parse(readFileSync(join(root, "data", "toc-migrated", "timings", "validation.json"), "utf8")).stage, "transcript");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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

test("ledger002 index proof refuses weak, stale, foreign and degraded generations",()=>{
  const dir=mkdtempSync(join(tmpdir(),"strict-index-proof-"));
  try{
    const bytes=JSON.stringify([{text:"Source"}]);writeFileSync(join(dir,"knowledge-turns.json"),bytes);
    writeFileSync(join(dir,"source.json"),JSON.stringify({tenantId:"tenant"}));
    const proof={version:2,status:"done",strict:true,sessionId:"session",tenantId:"tenant",generation:"g1",inputHash:createHash("sha256").update(bytes).digest("hex"),summary:"done",claims:"done",chunks:"done",tree:"done",semanticSupport:"passed",turnCount:1};
    for(const patch of [{version:1},{summary:"degraded"},{claims:"degraded"},{chunks:"skipped"},{semanticSupport:"missing"},{inputHash:"stale"},{tenantId:"foreign"},{sessionId:"other"}]){
      writeFileSync(join(dir,"index-proof.json"),JSON.stringify({...proof,...patch}));assert.throws(()=>validateIndexProof(dir,"session"),/strict index proof/);
    }
    writeFileSync(join(dir,"index-proof.json"),JSON.stringify(proof));assert.equal(validateIndexProof(dir,"session").generation,"g1");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('capture tenant requires indexed owner and preserves non-index legacy', () => {
  assert.equal(captureTenant([], {}), 'vidysea');
  assert.throws(() => captureTenant(['--index'], {}), /explicit/);
  assert.equal(captureTenant(['--index'], { LKB_TENANT_ID: 'tenant-two' }), 'tenant-two');
  assert.equal(captureTenant(['--index', '--tenant', 'tenant-one'], {}), 'tenant-one');
  assert.throws(() => captureTenant(['--tenant', '../other'], {}), /invalid/);
});
test('finalizer binds source to configured tenant and refuses other-tenant overwrite', async () => {
  const root = fixtureRoot(), video = join(root, 'fake-video.mkv');
  try {
    const overrides = { repoRoot: root, tenantId: 'tenant-two', probeMedia: () => 10, extractAudio: fakeExtractAudio, measureVolume: () => ({ maxDb: -10, meanDb: -20 }) };
    await finalizeRecordingWith(overrides, video, 'tenant-recording', 'Tenant recording', 'unknown', false);
    const file = join(root, 'data/toc-migrated/tenant-recording/source.json'), before = readFileSync(file, 'utf8');
    assert.equal(JSON.parse(before).tenantId, 'tenant-two');
    await assert.rejects(finalizeRecordingWith({ ...overrides, tenantId: 'tenant-one' }, video, 'tenant-recording', 'Other', 'unknown', false), /different tenant/);
    assert.equal(readFileSync(file, 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
