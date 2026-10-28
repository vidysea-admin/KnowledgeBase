import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, symlinkSync, linkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitSessionPreservingAudit, markSessionProcessedFromProof, setSessionIndexStatus, type ProcessedProofBinding } from "./retention-processed-proof.js";
import { gatherState } from "../retention-report-state.js";
const NOW = Date.parse("2026-10-14T11:00:00.000Z");
const binding: ProcessedProofBinding = { tenantId: "toc", sessionId: "session-a", sourceId: "source-a", workDb: "lkb_staging", generation: "current-gen", inputArtifact: "knowledge-turns.json" };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "t046-proof-"));
  const dir = join(root, createHash("sha256").update(binding.tenantId).digest("hex"), binding.sessionId);
  mkdirSync(dir, { recursive: true });
  const file = (name: string) => join(dir, name);
  const write = (name: string, value: unknown) => writeFileSync(file(name), JSON.stringify(value));
  write("source.json", { _id: binding.sourceId, tenantId: binding.tenantId, kind: "recording", testData: true, title: "private source" });
  write("session.json", { _id: binding.sessionId, sourceId: binding.sourceId, tenantId: binding.tenantId,
    status: { transcribe: "done", index: "done" }, audit: { original: "preserve" } });
  write("knowledge-turns.json", [{ text: "private turn" }, { text: "genuine screen row" }]);
  const proof = { version: 3, ...binding, sourceHash: hash(readFileSync(file("source.json"))),
    inputHash: hash(readFileSync(file("knowledge-turns.json"))), status: "done", strict: true, turnCount: 2,
    semanticSupport: "passed", summary: "done", claims: "done", chunks: "done", tree: "done" };
  write("index-proof.json", proof);
  return { root, dir, file, write, proof, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("current committed proof stamps once, preserves audit, and never resets a prior valid processing clock", () => {
  const f = fixture();
  try {
    const before = JSON.parse(readFileSync(f.file("session.json"), "utf8")) as Record<string, unknown>;
    assert.deepEqual(markSessionProcessedFromProof(f.dir, binding, NOW), { ok: true, changed: true, processedAt: new Date(NOW).toISOString() });
    const after = JSON.parse(readFileSync(f.file("session.json"), "utf8")) as Record<string, unknown>;
    const { processedAt, ...rest } = after; assert.deepEqual(rest, before); assert.equal(processedAt, new Date(NOW).toISOString());
    const gathered = gatherState({ tenant: binding.tenantId, dataRoot: f.root, mediaRoot: f.root,
      minAgeDays: 7, clipPaddingSeconds: 15, operationsState: "unused-metadata-fixture" });
    assert.ok(gathered.ok); assert.equal(gathered.value.infos[0]?.processedAt, processedAt);
    assert.equal(gathered.value.infos[0]?.indexed, true); assert.equal(gathered.value.infos[0]?.transcribed, true);
    const bytes = readFileSync(f.file("session.json"));
    assert.deepEqual(markSessionProcessedFromProof(f.dir, binding, NOW + 1000), { ok: true, changed: false, processedAt });
    assert.deepEqual(readFileSync(f.file("session.json")), bytes); assert.ok(!existsSync(f.file("session.json.lock")));
  } finally { f.cleanup(); }
});
test("stale, foreign, prior generation, incomplete and wrong-lane proofs never stamp", () => {
  const attacks = [{ version: 2 }, { tenantId: "foreign" }, { sessionId: "foreign" }, { sourceId: "foreign" },
    { sourceHash: "0".repeat(64) }, { inputHash: "0".repeat(64) }, { workDb: "lkb_other" },
    { generation: "previous-gen" }, { inputArtifact: "turns.json" }, { strict: false }, { tree: "pending" }, { semanticSupport: "failed" }, { turnCount: 1 }];
  for (const attack of attacks) {
    const f = fixture();
    try {
      f.write("index-proof.json", { ...f.proof, ...attack }); const before = readFileSync(f.file("session.json"));
      assert.equal(markSessionProcessedFromProof(f.dir, binding, NOW).ok, false, JSON.stringify(attack));
      assert.deepEqual(readFileSync(f.file("session.json")), before);
    } finally { f.cleanup(); }
  }
});
test("changed source/input bytes, disk status, sourceId and future stamp fail closed", () => {
  for (const attack of ["source", "turns", "status", "sourceId", "future"] as const) {
    const f = fixture();
    try {
      if (attack === "source") f.write("source.json", { _id: binding.sourceId, tenantId: "foreign" });
      if (attack === "turns") f.write("knowledge-turns.json", [{ text: "replaced" }]);
      const row = JSON.parse(readFileSync(f.file("session.json"), "utf8")) as Record<string, unknown>;
      if (attack === "status") row.status = { transcribe: "done", index: "failed" };
      if (attack === "sourceId") row.sourceId = "other-source";
      if (attack === "future") row.processedAt = new Date(NOW + 1000).toISOString();
      f.write("session.json", row); const before = readFileSync(f.file("session.json"));
      assert.equal(markSessionProcessedFromProof(f.dir, binding, NOW).ok, false, attack);
      assert.deepEqual(readFileSync(f.file("session.json")), before);
    } finally { f.cleanup(); }
  }
});
test("missing proof, existing lock and redirected/hardlinked state are refused without altering audit", () => {
  for (const attack of ["missing", "locked", "hardlink", "junction"] as const) {
    const f = fixture();
    try {
      const before = readFileSync(f.file("session.json")); let dir = f.dir;
      if (attack === "missing") unlinkSync(f.file("index-proof.json"));
      if (attack === "locked") writeFileSync(f.file("session.json.lock"), "other-writer");
      if (attack === "hardlink") linkSync(f.file("session.json"), f.file("audit-link.json"));
      if (attack === "junction") { dir = `${f.dir}-link`; symlinkSync(f.dir, dir, process.platform === "win32" ? "junction" : "dir"); }
      try { assert.equal(markSessionProcessedFromProof(dir, binding, NOW).ok, false, attack); }
      finally { if (attack === "junction") rmSync(dir, { recursive: true, force: true }); }
      assert.deepEqual(readFileSync(f.file("session.json")), before);
      if (attack === "locked") assert.equal(readFileSync(f.file("session.json.lock"), "utf8"), "other-writer");
    } finally { f.cleanup(); }
  }
});
test("invalid clocks/bindings and test-data lane mismatch refuse before writes", () => {
  const f = fixture();
  try {
    for (const now of [NaN, Infinity, -1, 1e100]) assert.equal(markSessionProcessedFromProof(f.dir, binding, now).ok, false);
    const expected = { ...binding, workDb: "lkb_elsewhere" }; f.write("index-proof.json", { ...f.proof, workDb: expected.workDb });
    assert.equal(markSessionProcessedFromProof(f.dir, expected, NOW).ok, false);
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(f.file("session.json"), "utf8")), "processedAt"), false);
  } finally { f.cleanup(); }
});
test("genuine speech-only input is explicitly bound without creating a combined transcript", () => {
  const f = fixture();
  try {
    renameSync(f.file("knowledge-turns.json"), f.file("turns.json"));
    const expected = { ...binding, inputArtifact: "turns.json" as const };
    f.write("index-proof.json", { ...f.proof, inputArtifact: expected.inputArtifact });
    assert.equal(markSessionProcessedFromProof(f.dir, expected, NOW).ok, true);
    assert.ok(!existsSync(f.file("knowledge-turns.json")));
  } finally { f.cleanup(); }
});
test("real status and re-emission writers preserve prior processing/audit and refuse foreign identities", () => {
  const f = fixture();
  try {
    const original = JSON.parse(readFileSync(f.file("session.json"), "utf8")); original.processedAt = new Date(NOW - 1000).toISOString();
    f.write("session.json", original);
    const incoming = { ...original, title: "new derived default", audit: { original: "would overwrite" }, processedAt: new Date(NOW).toISOString() };
    assert.deepEqual(emitSessionPreservingAudit(f.dir, incoming), { ok: true });
    let current = JSON.parse(readFileSync(f.file("session.json"), "utf8"));
    assert.deepEqual(current.audit, original.audit); assert.equal(current.processedAt, original.processedAt);
    for (const index of ["processing", "failed", "done"] as const) {
      assert.deepEqual(setSessionIndexStatus(f.dir, binding, index), { ok: true });
      current = JSON.parse(readFileSync(f.file("session.json"), "utf8"));
      assert.equal(current.status.index, index); assert.deepEqual(current.audit, original.audit); assert.equal(current.processedAt, original.processedAt);
    }
    const bytes = readFileSync(f.file("session.json"));
    assert.equal(setSessionIndexStatus(f.dir, { ...binding, tenantId: "foreign" }, "done").ok, false);
    assert.equal(emitSessionPreservingAudit(f.dir, { ...incoming, sourceId: "foreign" }).ok, false);
    assert.deepEqual(readFileSync(f.file("session.json")), bytes);
  } finally { f.cleanup(); }
});

test("explicit vectorless generation stamps and is consumed by the retention gatherer without semantic proof", () => {
  const f = fixture();
  try {
    const expected: ProcessedProofBinding = { ...binding, retrievalMode: "vectorless" };
    f.write("index-proof.json", { ...f.proof, version: 4, retrievalMode: "vectorless", lexical: "done", provenance: "passed", semanticSupport: "not-required" });
    assert.deepEqual(markSessionProcessedFromProof(f.dir, expected, NOW), { ok: true, changed: true, processedAt: new Date(NOW).toISOString() });
    const gathered = gatherState({ tenant: binding.tenantId, dataRoot: f.root, mediaRoot: f.root,
      minAgeDays: 90, clipPaddingSeconds: 15, operationsState: "unused-vectorless-fixture" });
    assert.ok(gathered.ok);
    assert.equal(gathered.value.infos[0]?.processedAt, new Date(NOW).toISOString());
    assert.equal(gathered.value.infos[0]?.indexed, true);
    const bytes = readFileSync(f.file("session.json"));
    assert.equal(markSessionProcessedFromProof(f.dir, expected, NOW + 1000).ok, true);
    assert.deepEqual(readFileSync(f.file("session.json")), bytes);
  } finally { f.cleanup(); }
});

test("vectorless proof cannot downgrade missing readiness, hashes, generation or explicit mode binding", () => {
  const attacks = [{ version: 3 }, { retrievalMode: undefined }, { retrievalMode: "semantic" },
    { lexical: undefined }, { lexical: "pending" }, { provenance: undefined }, { provenance: "failed" },
    { semanticSupport: "passed" }, { semanticSupport: undefined }, { tree: "pending" }, { chunks: "pending" },
    { summary: "pending" }, { claims: "pending" }, { strict: false }, { turnCount: 1 },
    { generation: "old-generation" }, { sourceHash: "0".repeat(64) }, { inputHash: "0".repeat(64) }];
  for (const attack of attacks) {
    const f = fixture();
    try {
      f.write("index-proof.json", { ...f.proof, version: 4, retrievalMode: "vectorless", lexical: "done", provenance: "passed", semanticSupport: "not-required", ...attack });
      const before = readFileSync(f.file("session.json"));
      assert.equal(markSessionProcessedFromProof(f.dir, { ...binding, retrievalMode: "vectorless" }, NOW).ok, false, JSON.stringify(attack));
      assert.deepEqual(readFileSync(f.file("session.json")), before);
    } finally { f.cleanup(); }
  }
  const f = fixture();
  try {
    const before = readFileSync(f.file("session.json"));
    // A semantic v3 receipt cannot certify a new vectorless attempt.
    assert.equal(markSessionProcessedFromProof(f.dir, { ...binding, retrievalMode: "vectorless" }, NOW).ok, false);
    f.write("index-proof.json", { ...f.proof, version: 4, retrievalMode: "vectorless", lexical: "done", provenance: "passed", semanticSupport: "not-required" });
    assert.equal(markSessionProcessedFromProof(f.dir, binding, NOW).ok, false);
    assert.equal(markSessionProcessedFromProof(f.dir, { ...binding, retrievalMode: "semantic" }, NOW).ok, false);
    const accessor = Object.defineProperty({ ...binding }, "retrievalMode", { enumerable: true, get: () => { throw new Error("must not read accessor"); } });
    assert.equal(markSessionProcessedFromProof(f.dir, accessor, NOW).ok, false);
    assert.deepEqual(readFileSync(f.file("session.json")), before);
  } finally { f.cleanup(); }
});

test("legacy v3 cannot claim vectorless mode to bypass its semantic requirement", () => {
  const f = fixture();
  try {
    f.write("index-proof.json", { ...f.proof, retrievalMode: "vectorless", lexical: "done", provenance: "passed" });
    assert.equal(markSessionProcessedFromProof(f.dir, binding, NOW).ok, false);
    f.write("index-proof.json", { ...f.proof, retrievalMode: "semantic" });
    assert.equal(markSessionProcessedFromProof(f.dir, { ...binding, retrievalMode: "semantic" }, NOW).ok, true);
  } finally { f.cleanup(); }
});
