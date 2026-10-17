import test from "node:test";
import assert from "node:assert/strict";
import { linkSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTileCaptureRegistry } from "./registry.js";
import { writeRecordConsent } from "../record-consent/receipt-store.js";
import { makeTileRegistryFixture } from "../../../../../qa/evidence/t042-trusted-registry/fixture.js";

test("off means no authority or filesystem I/O; absent real measurement stays unavailable", async () => {
  const f = makeTileRegistryFixture();
  try {
    let called = 0;
    const registry = createTileCaptureRegistry({ workspaceRoot: f.root, recordDir: f.recordDir,
      readCommitted: async () => { called++; throw new Error("private details"); } });
    assert.deepEqual(await registry.resolve(f.tenant, f.session), { status: "disabled" });
    assert.deepEqual(await registry.resolve(f.tenant, f.session, { enabled: true }), { status: "unavailable", reason: "authority-unavailable" });
    assert.equal(called, 0);
  } finally { f.cleanup(); }
});

test("production refuses synthetic facts; explicit fixture resolution binds actual private files", async () => {
  const f = makeTileRegistryFixture();
  try {
    assert.deepEqual(await createTileCaptureRegistry(f.options).resolve(f.tenant, f.session, { enabled: true }), { status: "unavailable", reason: "invalid-binding" });
    const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.evidenceKind, "synthetic");
    assert.equal(result.context.captureStartedAtEpoch - result.context.recordingStartedAtEpoch, 20);
    assert.ok(result.context.captureId.includes(f.binding.indexBinding.generation));
    await result.assertCurrent();
    const capture = await result.readCapture(f.tenant, f.session, result.context);
    assert.equal(capture.recordingSha256, f.binding.audioSha256);
    assert.ok(!JSON.stringify(result).includes(f.root));
  } finally { f.cleanup(); }
});

test("foreign owner, uncommitted generation and changed capture/source binding refuse", async () => {
  const f = makeTileRegistryFixture();
  try {
    assert.equal((await f.registry().resolve("tenant-B", f.session, { enabled: true })).status, "unavailable");
    assert.equal((await f.registry().resolve(f.tenant, "foreign-session", { enabled: true })).status, "unavailable");
    f.setCommitted(false);
    assert.deepEqual(await f.registry().resolve(f.tenant, f.session, { enabled: true }), { status: "unavailable", reason: "uncommitted" });
    f.setCommitted(true); f.binding.captureGeneration = "33333333-3333-4333-8333-333333333333";
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});

test("wall epoch, copied media proof, different sampler and missing clock cannot certify measurement", async () => {
  for (const change of [{ method: "wall-time" }, { hostId: "different-host" }, { samplerInstance: "different-sampler" }, { audioSha256: "f".repeat(64) }]) {
    const f = makeTileRegistryFixture();
    try {
      f.clock(change as Parameters<typeof f.clock>[0]);
      assert.deepEqual(await f.registry().resolve(f.tenant, f.session, { enabled: true }), { status: "unavailable", reason: "clock-unavailable" });
    } finally { f.cleanup(); }
  }
  const f = makeTileRegistryFixture();
  try { f.setMeasured(false); assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable"); }
  finally { f.cleanup(); }
});

test("uncertainty and drift are bounded; upper clock offset consumes the existing lag allowance", async () => {
  const f = makeTileRegistryFixture();
  try {
    f.clock({ mediaZeroEpochSec: { earliest: 1000, latest: 1000.05 }, samplerZeroEpochSec: { earliest: 1020, latest: 1020.05 }, driftBoundSec: 0.02, highlightLagBoundSec: 1 });
    const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.ok(Math.abs(result.context.captureStartedAtEpoch - 1020.07) < 1e-9);
    f.clock({ highlightLagBoundSec: 6 });
    assert.deepEqual(await f.registry().resolve(f.tenant, f.session, { enabled: true }), { status: "unavailable", reason: "clock-out-of-budget" });
    f.clock({ driftBoundSec: 1, highlightLagBoundSec: 0 });
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});

test("contiguous trim maps privacy to the same retained media timeline; private names are released", async () => {
  const f = makeTileRegistryFixture([{ tStart: 70, tEnd: 90 }], 10);
  try {
    const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    const capture = await result.readCapture(f.tenant, f.session, result.context);
    assert.ok(!capture.jsonl.includes("Private Voice"));
    const rows = capture.jsonl.trim().split("\n").slice(1).map(l => JSON.parse(l) as { tSec: number; displayName: string | null });
    const protectedTime = rows.filter(r => r.tSec + 20 >= 49 && r.tSec + 20 <= 91);
    assert.ok(protectedTime.length > 0 && protectedTime.every(r => r.displayName === null));
    f.clock({ trimStartSec: 999 });
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});

test("all-private observations yield releases only; malformed/duplicate metadata refuses", async () => {
  const f = makeTileRegistryFixture([{ tStart: 0, tEnd: 340 }]);
  try {
    const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.ok(!(await result.readCapture(f.tenant, f.session, result.context)).jsonl.includes("Private Voice"));
    const original = readFileSync(path.join(f.root, f.binding.sidecarPath), "utf8");
    f.sidecar(original + original.split("\n")[0] + "\n");
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});

test("exact changed bytes, same-name replacement and hardlinked artifacts refuse", async () => {
  for (const mode of ["changed", "replaced", "hardlink"] as const) {
    const f = makeTileRegistryFixture();
    try {
      const file = path.join(f.root, f.binding.audioPath);
      if (mode === "changed") writeFileSync(file, "ALTERED_SYNTHETIC");
      if (mode === "replaced") { renameSync(file, file + ".before"); writeFileSync(file, "REPLACED_SYNTHETIC"); }
      if (mode === "hardlink") linkSync(file, file + ".hardlink");
      assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
    } finally { f.cleanup(); }
  }
});

test("escaping path and changed-during-measurement files cannot reach a ready result", async () => {
  const f = makeTileRegistryFixture();
  try {
    f.binding.audioPath = "../outside.bin";
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
    f.binding.audioPath = "artifacts/audio.bin";
    const measure = f.options.measureDecodedClock!;
    f.options.measureDecodedClock = async a => { const facts = await measure(a); writeFileSync(a.physical.source, "changed after read"); return facts; };
    assert.equal((await f.registry().resolve(f.tenant, f.session, { enabled: true })).status, "unavailable");
  } finally { f.cleanup(); }
});

test("revocation, measurement withdrawal and privacy revision invalidate already resolved capabilities", async () => {
  for (const change of ["commit", "clock", "privacy"] as const) {
    const f = makeTileRegistryFixture();
    try {
      const result = await f.registry().resolve(f.tenant, f.session, { enabled: true });
      assert.equal(result.status, "ready"); if (result.status !== "ready") continue;
      if (change === "commit") f.setCommitted(false);
      if (change === "clock") f.setMeasured(false);
      if (change === "privacy") writeRecordConsent(f.recordDir, { ...f.receipt, privateWindows: [{ tStart: 0, tEnd: 30 }] });
      await assert.rejects(result.assertCurrent());
      await assert.rejects(result.readCapture(f.tenant, f.session, result.context));
      await assert.rejects(result.readCapture("tenant-B", f.session, result.context));
    } finally { f.cleanup(); }
  }
});
