import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLastRun } from "../retention-last-run.js";
import { writeRetentionAtomic, writeTenantRetentionSummary } from "./private-summary.js";
import { gatherState } from "../retention-report-state.js";
const tenant = "toc", digest = createHash("sha256").update(tenant).digest("hex");
const summary = () => buildLastRun({ mode: "dry-run", startedAt: "2026-10-14T11:00:00.000Z", finishedAt: "2026-10-14T11:01:00.000Z",
  exitCode: 0, summary: { candidates: 2, deleted: 0, bytes: 0, vetoed: 0, failed: 0 }, lines: [] }, "private/report.json");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "t046-summary-")), dir = join(root, digest, "retention"), file = join(dir, "last-run.json");
  return { root, dir, file, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("real compact builder publishes exact private tenant metadata with no extras and no leftovers", () => {
  const f = fixture();
  try {
    const input = Object.assign(summary(), { password: "not-published", lines: ["secret transcript"] });
    assert.deepEqual(writeTenantRetentionSummary(f.root, tenant, input), { ok: true, path: f.file });
    const actual = JSON.parse(readFileSync(f.file, "utf8")); assert.equal(actual.tenantId, tenant);
    assert.equal(actual.candidates, 2); assert.equal(actual.dryRun, true); assert.equal(actual.deleted, 0);
    assert.ok(!JSON.stringify(actual).includes("not-published") && !JSON.stringify(actual).includes("secret transcript"));
    assert.deepEqual(readdirSync(f.dir), ["last-run.json"]);
    assert.equal(writeTenantRetentionSummary(f.root, "other-tenant", summary()).ok, true);
    assert.equal(JSON.parse(readFileSync(f.file, "utf8")).tenantId, tenant);
  } finally { f.cleanup(); }
});
test("symlink/junction ancestors and hardlinked targets are refused without overwriting sentinels", () => {
  for (const attack of ["junction", "hardlink", "target-link"] as const) {
    const f = fixture();
    try {
      const foreign = join(f.root, "foreign"); mkdirSync(foreign); writeFileSync(join(foreign, "sentinel"), "keep");
      if (attack === "junction") symlinkSync(foreign, join(f.root, digest), process.platform === "win32" ? "junction" : "dir");
      else {
        mkdirSync(f.dir, { recursive: true });
        if (attack === "hardlink") linkSync(join(foreign, "sentinel"), f.file);
        else symlinkSync(foreign, f.file, process.platform === "win32" ? "junction" : "dir");
      }
      assert.equal(writeTenantRetentionSummary(f.root, tenant, summary()).ok, false, attack);
      assert.equal(readFileSync(join(foreign, "sentinel"), "utf8"), "keep");
      assert.ok(!existsSync(join(foreign, "retention", "last-run.json")));
    } finally { f.cleanup(); }
  }
});
test("existing lock stays owned and malformed/coherence failures do not publish", () => {
  const f = fixture();
  try {
    mkdirSync(f.dir, { recursive: true }); writeFileSync(`${f.file}.lock`, "other-writer");
    assert.deepEqual(writeTenantRetentionSummary(f.root, tenant, summary()), { ok: false, reason: "summary-writer-busy" });
    assert.equal(readFileSync(`${f.file}.lock`, "utf8"), "other-writer"); assert.ok(!existsSync(f.file));
    for (const input of [{ ...summary(), candidates: -1 }, { ...summary(), ok: false }, { ...summary(), deleted: 1 }, { ...summary(), finishedAt: "junk" }]) {
      assert.equal(writeTenantRetentionSummary(f.root, tenant, input).ok, false);
    }
    assert.equal(writeTenantRetentionSummary(f.root, "bad\ntenant", summary()).ok, false);
  } finally { f.cleanup(); }
});
test("guard/CAS failures keep the previous file and clean exclusively owned temporary/lock entries", () => {
  const f = fixture();
  try {
    mkdirSync(f.dir, { recursive: true }); writeFileSync(f.file, "original-audit"); let calls = 0;
    assert.throws(() => writeRetentionAtomic(f.file, "candidate", () => { if (++calls === 2) throw new Error("changed input"); }));
    assert.equal(readFileSync(f.file, "utf8"), "original-audit"); assert.deepEqual(readdirSync(f.dir), ["last-run.json"]);
    assert.throws(() => writeRetentionAtomic(f.file, "candidate", () => { if (++calls === 3) writeFileSync(f.file, "newer-owner-write"); }));
    assert.equal(readFileSync(f.file, "utf8"), "newer-owner-write"); assert.deepEqual(readdirSync(f.dir), ["last-run.json"]);
  } finally { f.cleanup(); }
});
test("replaced temporary inode is never published or removed as the writer's own file", () => {
  const f = fixture();
  try {
    mkdirSync(f.dir, { recursive: true }); writeFileSync(f.file, "original-audit"); let calls = 0, hostile = "";
    assert.throws(() => writeRetentionAtomic(f.file, "candidate", () => {
      if (++calls !== 2) return;
      hostile = join(f.dir, readdirSync(f.dir).find(name => name.endsWith(".tmp"))!);
      renameSync(hostile, join(f.dir, "owned-temporary-backup")); writeFileSync(hostile, "hostile-body");
    }));
    assert.equal(readFileSync(f.file, "utf8"), "original-audit"); assert.equal(readFileSync(hostile, "utf8"), "hostile-body");
    assert.ok(!existsSync(`${f.file}.lock`));
  } finally { f.cleanup(); }
});
test("safe tenant-bound operational folder is ignored, while malformed/foreign/genuine session folders remain counted", () => {
  const f = fixture();
  const gather = () => gatherState({ tenant, dataRoot: f.root, mediaRoot: f.root, minAgeDays: 7, clipPaddingSeconds: 15, operationsState: "unused" });
  try {
    assert.ok(writeTenantRetentionSummary(f.root, tenant, summary()).ok);
    let state = gather(); assert.ok(state.ok); assert.equal(state.value.infos.length, 0);
    writeFileSync(f.file, JSON.stringify({ ...summary(), tenantId: "foreign" }));
    state = gather(); assert.ok(state.ok); assert.equal(state.value.infos.length, 1); assert.ok(state.value.infos[0]?.unreadable);
    writeFileSync(f.file, "malformed"); state = gather(); assert.ok(state.ok); assert.equal(state.value.infos.length, 1);
    writeFileSync(f.file, JSON.stringify({ ...summary(), tenantId: tenant }));
    writeFileSync(join(f.dir, "source.json"), JSON.stringify({ _id: "retention-source", tenantId: tenant, kind: "recording" }));
    writeFileSync(join(f.dir, "session.json"), JSON.stringify({ _id: "retention", tenantId: tenant, sourceId: "retention-source", status: { transcribe: "done", index: "done" } }));
    state = gather(); assert.ok(state.ok); assert.equal(state.value.infos.length, 1); assert.equal(state.value.infos[0]?.mediaId, "retention-source");
  } finally { f.cleanup(); }
});
