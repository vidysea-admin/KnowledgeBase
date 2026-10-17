import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, cpSync, linkSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateDirectory } from "../record-consent/private-directory.js";
import { requireNativeProviderAudio } from "../record-consent/native-provider-audio.js";
import { openNativeArchiveStore } from "./native-capture-archive.js";
import { createNativeArchiveRecoverer, type NativeArchiveRecoveryPhaseEvent } from "./native-archive-recovery.js";
import { sealArchiveFixture } from "./native-archive-restart.testsupport.js";
import { createNativeGuardPhaseTrace, resetNativeGuardPhaseTraceForTest } from "./testsupport/native-guard-phase.js";

const ffmpegPath = process.env.LKB_NATIVE_TEST_FFMPEG, ffprobePath = process.env.LKB_NATIVE_TEST_FFPROBE;
const configured = !!ffmpegPath && !!ffprobePath;
const decoder = () => ({ ffmpegPath: ffmpegPath!, ffprobePath: ffprobePath! });
function temporary() {
  const directory = mkdtempSync(path.join(tmpdir(), "native-recovery-"));
  const root = createPrivateDirectory(path.join(directory, "archive"));
  return { directory, root, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function withPhaseSink(run: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), "native-phase-guard-"));
  const keys = ["LKB_NATIVE_TEST_PRIVATE_DIR", "LKB_NATIVE_GUARD_PHASE_LOG"];
  const saved = keys.map(key => process.env[key]);
  resetNativeGuardPhaseTraceForTest();
  try {
    process.env.LKB_NATIVE_TEST_PRIVATE_DIR = root;
    process.env.LKB_NATIVE_GUARD_PHASE_LOG = path.join(root, "native-guard-phases.jsonl");
    run(root);
  } finally {
    resetNativeGuardPhaseTraceForTest();
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
    rmSync(root, { recursive: true, force: true });
  }
}
test("native guard phase helper absent environment has no sink effects", () => withPhaseSink(root => {
  delete process.env.LKB_NATIVE_TEST_PRIVATE_DIR;
  const mark = createNativeGuardPhaseTrace("tamper"); mark("root", "start");
  assert.equal(mark.status, "disabled"); assert.deepEqual(readdirSync(root), []);
  process.env.LKB_NATIVE_TEST_PRIVATE_DIR = root; delete process.env.LKB_NATIVE_GUARD_PHASE_LOG;
  const noTrace = createNativeGuardPhaseTrace("fair"); noTrace("root", "start");
  assert.equal(noTrace.status, "disabled"); assert.deepEqual(readdirSync(root), []);
}));
test("native guard phase helper refuses a mismatched sink before creation", () => withPhaseSink(root => {
  process.env.LKB_NATIVE_GUARD_PHASE_LOG = path.join(root, "..", "unapproved-phase-sink.jsonl");
  const mark = createNativeGuardPhaseTrace("fair"); mark("root", "start");
  assert.equal(mark.status, "refused"); assert.deepEqual(readdirSync(root), []);
}));
test("native guard phase helper refuses an existing sink without changing bytes", () => withPhaseSink(root => {
  const sink = path.join(root, "native-guard-phases.jsonl"); writeFileSync(sink, "existing", { mode: 0o600 });
  const mark = createNativeGuardPhaseTrace("tamper"); mark("root", "start");
  assert.equal(mark.status, "refused"); assert.equal(readFileSync(sink, "utf8"), "existing");
}));
test("native guard phase helper writes only fixed records and survives sink loss", () => withPhaseSink(root => {
  const sink = path.join(root, "native-guard-phases.jsonl"), first = createNativeGuardPhaseTrace("tamper");
  first("root", "start");
  const second = createNativeGuardPhaseTrace("fair"); second("root", "complete");
  const records = readFileSync(sink, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(records.length, 2);
  for (const row of records) {
    assert.deepEqual(Object.keys(row).sort(), ["elapsedMs", "stageId"]);
    assert.ok(Number.isSafeInteger(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs <= 75000);
  }
  assert.equal(records[0].stageId, "node1-root-start"); assert.equal(records[1].stageId, "node2-root-complete");
  rmSync(sink); assert.doesNotThrow(() => first("cleanup", "start")); assert.equal(first.status, "failed");
}));
test("native guard phase helper rejects unapproved stage event and ordinal without payload records", () => {
  for (const variant of ["stage", "event", "ordinal"]) withPhaseSink(root => {
    const sink = path.join(root, "native-guard-phases.jsonl"), mark = createNativeGuardPhaseTrace("tamper");
    mark("root", "start");
    if (variant === "stage") mark("unapproved-content" as never, "start");
    else if (variant === "event") mark("root", "unapproved-content" as never);
    else mark("binding", "start", 11);
    assert.equal(mark.status, "refused");
    const records = readFileSync(sink, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(records.length, 1); assert.equal(records[0].stageId, "node1-root-start");
  });
});

test("throwing recovery observer preserves genuine missing admission refusal and fixed failure fields", async () => {
  const fixture = temporary();
  try {
    const store = await openNativeArchiveStore({ root: fixture.root, maxArchiveBytes: 3000000, readCurrentBinding: async () => null });
    const events: Readonly<NativeArchiveRecoveryPhaseEvent>[] = [];
    const recoverer = createNativeArchiveRecoverer({ store, decoder: { ffmpegPath: "unused", ffprobePath: "unused" }, observe: event => {
      assert.ok(Object.isFrozen(event)); events.push(event); throw new Error("Observer failure must be ignored");
    } });
    const result = await recoverer.recoverCapture({ archiveId: randomUUID(), expected: { tenantId: "synthetic", sessionId: "synthetic",
      sourceId: "synthetic-src", captureGeneration: randomUUID(), receiptSha256: "a".repeat(64), sourceSha256: "b".repeat(64), sidecarSha256: "c".repeat(64) } });
    assert.deepEqual(result, { status: "unavailable", reason: "unadmitted" });
    assert.deepEqual(events, [{ stage: "admit", event: "start" }, { stage: "admit", event: "failed", errorName: "Error", errorCode: "ENOENT" }]);
  } finally { fixture.cleanup(); }
});

test("actual runRecord sealing child EXIT precedes fresh-process retained WAV/provider reproof", { skip: !configured || !process.env.LKB_NATIVE_TEST_BROWSER, timeout: 240000 }, () => {
  const fixture = temporary();
  try {
    const script = fileURLToPath(new URL("native-archive-restart.testsupport.ts", import.meta.url));
    const run = (args: string[]) => {
      const child = spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
        encoding: "utf8", timeout: 110000, windowsHide: true, maxBuffer: 1024 * 1024,
      });
      assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1)!);
    };
    // spawnSync has reaped the first child before the next process exists. No WeakMap survives.
    const sealed = run(["seal", path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!]);
    const reopened = run(["reopen", path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!,
      sealed.ids[0], "synthetic-owner", "synthetic-entry", "synthetic-entry-src"]);
    assert.notEqual(sealed.pid, process.pid); assert.notEqual(reopened.pid, process.pid); assert.notEqual(reopened.pid, sealed.pid);
    assert.equal(reopened.sha256, sealed.sha256); assert.equal(reopened.sampleCount, 19200);
    assert.equal(reopened.firstSourceSampleIndex, 3552); assert.equal(reopened.canonicalClock, null);
  } finally { fixture.cleanup(); }
});

test("genuine read-only closed spool seals without changing source mode or bytes", { skip: !configured, timeout: 240000 }, async () => {
  const fixture = temporary();
  try {
    const f = await sealArchiveFixture(path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!, 0);
    const spool = f.sealInput.media.spool;
    const sources = [spool.video.path, spool.audio.path, spool.ledger.path, path.join(path.dirname(spool.video.path), "complete.json")];
    const before = sources.map(file => ({ mode: statSync(file).mode, bytes: readFileSync(file) }));
    assert.ok(before.every(file => (file.mode & 0o200) === 0), "Real spool close must retain its read-only source invariant");
    const archiveId = await f.store.seal(f.sealInput);
    for (const [i, source] of sources.entries()) {
      assert.equal(statSync(source).mode, before[i]!.mode);
      assert.deepEqual(readFileSync(source), before[i]!.bytes);
      const retained = path.join(fixture.root, archiveId, path.basename(source));
      assert.deepEqual(readFileSync(retained), before[i]!.bytes);
    }
    const events: Readonly<NativeArchiveRecoveryPhaseEvent>[] = [];
    const recovered = await createNativeArchiveRecoverer({ store: f.store, decoder: decoder(), observe: event => {
      assert.ok(Object.isFrozen(event)); events.push(event); throw new Error("Observer failure must not interrupt genuine reproof");
    } }).recoverCapture({ archiveId, expected: f.binding });
    assert.equal(recovered.status, "ready");
    assert.deepEqual(events, ["admit", "receipt", "media", "provider", "final-admission"].flatMap(stage => [
      { stage, event: "start" }, { stage, event: "complete" },
    ]));
    if (recovered.status === "ready") assert.equal((await requireNativeProviderAudio(recovered.providerAudio)).audioSha256, f.sha256);
  } finally { fixture.cleanup(); }
});

test("retained artifact tampering, copied orphan, owner/current changes and revoked proof refuse", { skip: !configured, timeout: 240000 }, async () => {
  const phase = createNativeGuardPhaseTrace("tamper");
  phase("root", "start");
  const fixture = temporary();
  phase("root", "complete");
  try {
    phase("fixture-seal", "start");
    const sealed = await sealArchiveFixture(path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!);
    phase("fixture-seal", "complete");
    const archiveId = sealed.ids[0]!, archive = path.join(fixture.root, archiveId);
    let current: typeof sealed.binding | null = sealed.binding;
    const store = await openNativeArchiveStore({ root: fixture.root, maxArchiveBytes: 3000000, readCurrentBinding: async () => current });
    const recoverer = createNativeArchiveRecoverer({ store, decoder: decoder() });
    phase("recovery", "start");
    const recovered = await recoverer.recoverCapture({ archiveId, expected: sealed.binding });
    assert.equal(recovered.status, "ready");
    if (recovered.status !== "ready") throw new Error("Required public positive missing");
    phase("recovery", "complete");
    phase("provider", "start");
    assert.equal((await requireNativeProviderAudio(recovered.providerAudio)).sampleCount, 19200);
    phase("provider", "complete");
    phase("binding", "start");
    let bindingOrdinal = 0;
    for (const key of ["tenantId", "sessionId", "sourceId", "captureGeneration", "receiptSha256", "sourceSha256", "sidecarSha256"] as const) {
      phase("binding", "start", bindingOrdinal);
      const changed = { ...sealed.binding, [key]: `${sealed.binding[key]}changed` };
      await assert.rejects(store.admit(archiveId, changed));
      current = changed;
      await assert.rejects(requireNativeProviderAudio(recovered.providerAudio));
      assert.deepEqual(await store.findByOwner(sealed.binding), []);
      current = sealed.binding;
      phase("binding", "complete", bindingOrdinal++);
    }
    phase("binding", "complete");
    phase("revocation", "start");
    current = null;
    await assert.rejects(requireNativeProviderAudio(recovered.providerAudio));
    current = sealed.binding;
    phase("revocation", "complete");
    phase("artifact", "start");
    let artifactOrdinal = 0;
    for (const name of ["source.vp8.ivf", "source.s16le", "producer-observations.jsonl", "complete.json", "selected-provider.wav",
      "provider.wav", "playback.webm", "source.json", "sampler.json", "consent.json", "manifest.json"]) {
      phase("artifact", "start", artifactOrdinal);
      const file = path.join(archive, name), original = readFileSync(file);
      try {
        writeFileSync(file, Buffer.concat([original, Buffer.from("tamper")]));
        assert.equal((await recoverer.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable", name);
        await assert.rejects(requireNativeProviderAudio(recovered.providerAudio), { name: "Error" }, name);
      } finally { writeFileSync(file, original); }
      phase("artifact", "complete", artifactOrdinal++);
    }
    phase("artifact", "complete");
    const provider = path.join(archive, "provider.wav"), original = readFileSync(provider);
    const alias = path.join(fixture.directory, "provider-alias.wav");
    phase("alias", "start");
    try {
      linkSync(provider, alias);
      await assert.rejects(store.admit(archiveId, sealed.binding), /bounds/);
    } finally { rmSync(alias, { force: true }); }
    phase("alias", "complete");
    phase("eof", "start");
    try {
      writeFileSync(provider, original.subarray(0, original.length - 1));
      assert.equal((await recoverer.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable");
    } finally { writeFileSync(provider, original); }
    phase("eof", "complete");
    phase("copied", "start");
    const orphan = randomUUID(); cpSync(archive, path.join(fixture.root, orphan), { recursive: true });
    phase("copied", "complete");
    phase("orphan", "start");
    await assert.rejects(store.admit(orphan, sealed.binding), /manifest changed|not privately admitted/);
    assert.equal((await store.findByOwner(sealed.binding)).length, 1);
    const extra = path.join(archive, "unlisted.json");
    try { writeFileSync(extra, "{}"); await assert.rejects(store.admit(archiveId, sealed.binding), /Uninventoried/); }
    finally { rmSync(extra); }
    phase("orphan", "complete");
    phase("decoder", "start");
    const replacedDecoder = createNativeArchiveRecoverer({ store, decoder: { ...decoder(), ffmpegPath: path.join(fixture.directory, "missing-decoder") } });
    assert.equal((await replacedDecoder.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable");
    phase("decoder", "complete");
    phase("provider", "start");
    await assert.rejects(requireNativeProviderAudio(JSON.parse(JSON.stringify(recovered.providerAudio))), /capability required/);
    phase("provider", "complete");
  } finally { phase("cleanup", "start"); fixture.cleanup(); phase("cleanup", "complete"); }
});

test("fair bounded pages, quota-before-allocation and interrupted journal refuse", { skip: !configured, timeout: 240000 }, async () => {
  const phase = createNativeGuardPhaseTrace("fair");
  phase("root", "start");
  const fixture = temporary();
  phase("root", "complete");
  try {
    phase("fixture-seal", "start");
    const sealed = await sealArchiveFixture(path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!, 4);
    phase("fixture-seal", "complete");
    phase("pages", "start");
    const first = await sealed.store.pendingPage({ limit: 2 });
    assert.equal(first.entries.length, 2); assert.ok(first.cursor); assert.equal(first.pending, 4);
    const reopened = await openNativeArchiveStore({ root: fixture.root, maxArchiveBytes: 3000000, readCurrentBinding: async () => sealed.binding });
    const second = await reopened.pendingPage({ limit: 2, cursor: first.cursor });
    assert.equal(second.cursor, undefined);
    assert.deepEqual([...first.entries, ...second.entries].map(row => row.archiveId), sealed.ids);
    await assert.rejects(reopened.pendingPage({ limit: 2, cursor: randomUUID() }), /Unknown/);
    phase("pages", "complete");
    phase("quota", "start");
    const before = readdirSync(fixture.root).sort();
    await assert.rejects(sealed.store.seal({ ...sealed.sealInput, remainingReservationBytes: 1 }), /reservation/);
    assert.deepEqual(readdirSync(fixture.root).sort(), before);
    phase("quota", "complete");
    phase("journal", "start");
    const journal = path.join(fixture.root, "admissions.jsonl"), original = readFileSync(journal);
    try {
      writeFileSync(journal, original.subarray(0, original.length - 1));
      await assert.rejects(reopened.pendingPage({ limit: 1 }), /Incomplete/);
      await assert.rejects(reopened.admit(sealed.ids[0]!, sealed.binding), /Incomplete/);
    } finally { writeFileSync(journal, original); }
    assert.equal((await reopened.pendingPage({ limit: 1 })).entries[0]!.archiveId, sealed.ids[0]);
    phase("journal", "complete");
  } finally { phase("cleanup", "start"); fixture.cleanup(); phase("cleanup", "complete"); }
});
