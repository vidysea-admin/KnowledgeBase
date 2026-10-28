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
import { createNativeArchiveRecoverer } from "./native-archive-recovery.js";
import { sealArchiveFixture } from "./native-archive-restart.testsupport.js";

const ffmpegPath = process.env.LKB_NATIVE_TEST_FFMPEG, ffprobePath = process.env.LKB_NATIVE_TEST_FFPROBE;
const configured = !!ffmpegPath && !!ffprobePath;
const decoder = () => ({ ffmpegPath: ffmpegPath!, ffprobePath: ffprobePath! });
function temporary() {
  const directory = mkdtempSync(path.join(tmpdir(), "native-recovery-"));
  const root = createPrivateDirectory(path.join(directory, "archive"));
  return { directory, root, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

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
    const recovered = await createNativeArchiveRecoverer({ store: f.store, decoder: decoder() }).recoverCapture({ archiveId, expected: f.binding });
    assert.equal(recovered.status, "ready");
    if (recovered.status === "ready") assert.equal((await requireNativeProviderAudio(recovered.providerAudio)).audioSha256, f.sha256);
  } finally { fixture.cleanup(); }
});

test("retained artifact tampering, copied orphan, owner/current changes and revoked proof refuse", { skip: !configured, timeout: 240000 }, async () => {
  const fixture = temporary();
  try {
    const sealed = await sealArchiveFixture(path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!);
    const archiveId = sealed.ids[0]!, archive = path.join(fixture.root, archiveId);
    let current: typeof sealed.binding | null = sealed.binding;
    const store = await openNativeArchiveStore({ root: fixture.root, maxArchiveBytes: 3000000, readCurrentBinding: async () => current });
    const recoverer = createNativeArchiveRecoverer({ store, decoder: decoder() });
    const recovered = await recoverer.recoverCapture({ archiveId, expected: sealed.binding });
    assert.equal(recovered.status, "ready");
    if (recovered.status !== "ready") throw new Error("Required public positive missing");
    assert.equal((await requireNativeProviderAudio(recovered.providerAudio)).sampleCount, 19200);
    for (const key of ["tenantId", "sessionId", "sourceId", "captureGeneration", "receiptSha256", "sourceSha256", "sidecarSha256"] as const) {
      const changed = { ...sealed.binding, [key]: `${sealed.binding[key]}changed` };
      await assert.rejects(store.admit(archiveId, changed));
      current = changed;
      await assert.rejects(requireNativeProviderAudio(recovered.providerAudio));
      assert.deepEqual(await store.findByOwner(sealed.binding), []);
      current = sealed.binding;
    }
    current = null;
    await assert.rejects(requireNativeProviderAudio(recovered.providerAudio));
    current = sealed.binding;
    for (const name of ["source.vp8.ivf", "source.s16le", "producer-observations.jsonl", "complete.json", "selected-provider.wav",
      "provider.wav", "playback.webm", "source.json", "sampler.json", "consent.json", "manifest.json"]) {
      const file = path.join(archive, name), original = readFileSync(file);
      try {
        writeFileSync(file, Buffer.concat([original, Buffer.from("tamper")]));
        assert.equal((await recoverer.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable", name);
        await assert.rejects(requireNativeProviderAudio(recovered.providerAudio), { name: "Error" }, name);
      } finally { writeFileSync(file, original); }
    }
    const provider = path.join(archive, "provider.wav"), original = readFileSync(provider);
    const alias = path.join(fixture.directory, "provider-alias.wav");
    try {
      linkSync(provider, alias);
      await assert.rejects(store.admit(archiveId, sealed.binding), /bounds/);
    } finally { rmSync(alias, { force: true }); }
    try {
      writeFileSync(provider, original.subarray(0, original.length - 1));
      assert.equal((await recoverer.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable");
    } finally { writeFileSync(provider, original); }
    const orphan = randomUUID(); cpSync(archive, path.join(fixture.root, orphan), { recursive: true });
    await assert.rejects(store.admit(orphan, sealed.binding), /manifest changed|not privately admitted/);
    assert.equal((await store.findByOwner(sealed.binding)).length, 1);
    const extra = path.join(archive, "unlisted.json");
    try { writeFileSync(extra, "{}"); await assert.rejects(store.admit(archiveId, sealed.binding), /Uninventoried/); }
    finally { rmSync(extra); }
    const replacedDecoder = createNativeArchiveRecoverer({ store, decoder: { ...decoder(), ffmpegPath: path.join(fixture.directory, "missing-decoder") } });
    assert.equal((await replacedDecoder.recoverCapture({ archiveId, expected: sealed.binding })).status, "unavailable");
    await assert.rejects(requireNativeProviderAudio(JSON.parse(JSON.stringify(recovered.providerAudio))), /capability required/);
  } finally { fixture.cleanup(); }
});

test("fair bounded pages, quota-before-allocation and interrupted journal refuse", { skip: !configured, timeout: 240000 }, async () => {
  const fixture = temporary();
  try {
    const sealed = await sealArchiveFixture(path.join(fixture.directory, "capture"), fixture.root, ffmpegPath!, ffprobePath!, 4);
    const first = await sealed.store.pendingPage({ limit: 2 });
    assert.equal(first.entries.length, 2); assert.ok(first.cursor); assert.equal(first.pending, 4);
    const reopened = await openNativeArchiveStore({ root: fixture.root, maxArchiveBytes: 3000000, readCurrentBinding: async () => sealed.binding });
    const second = await reopened.pendingPage({ limit: 2, cursor: first.cursor });
    assert.equal(second.cursor, undefined);
    assert.deepEqual([...first.entries, ...second.entries].map(row => row.archiveId), sealed.ids);
    await assert.rejects(reopened.pendingPage({ limit: 2, cursor: randomUUID() }), /Unknown/);
    const before = readdirSync(fixture.root).sort();
    await assert.rejects(sealed.store.seal({ ...sealed.sealInput, remainingReservationBytes: 1 }), /reservation/);
    assert.deepEqual(readdirSync(fixture.root).sort(), before);
    const journal = path.join(fixture.root, "admissions.jsonl"), original = readFileSync(journal);
    try {
      writeFileSync(journal, original.subarray(0, original.length - 1));
      await assert.rejects(reopened.pendingPage({ limit: 1 }), /Incomplete/);
      await assert.rejects(reopened.admit(sealed.ids[0]!, sealed.binding), /Incomplete/);
    } finally { writeFileSync(journal, original); }
    assert.equal((await reopened.pendingPage({ limit: 1 })).entries[0]!.archiveId, sealed.ids[0]);
  } finally { fixture.cleanup(); }
});
