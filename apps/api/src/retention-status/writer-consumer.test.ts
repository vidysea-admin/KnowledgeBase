import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { requireAuth } from "../auth.js";
import { createRetentionStatusReader } from "./store.js";
import { createRetentionStatusRouter } from "./router.js";
import { buildLastRun } from "../../../../packages/ingest/src/retention/retention-last-run.js";
import { writeTenantRetentionSummary } from "../../../../packages/ingest/src/retention/production/private-summary.js";
import { runRetentionPurgeJobCli } from "../../../../packages/ingest/src/retention/retention-purge-job-cli.js";
import { DAY, NOW, iso, writeSession, baseArgs } from "../../../../packages/ingest/src/retention/retention-report.fixtures.js";

test("actual builder→private writer→reader→authenticated API projection consumes matching tenant state", async () => {
  const root = mkdtempSync(join(tmpdir(), "t046-writer-consumer-")), now = Date.now();
  const time = new Date(now).toISOString();
  const built = buildLastRun({ mode: "dry-run", startedAt: time, finishedAt: time, exitCode: 0,
    summary: { candidates: 3, deleted: 0, bytes: 0, vetoed: 2, failed: 0 }, lines: ["sensitive raw report line"] }, "sensitive report path");
  const result = writeTenantRetentionSummary(root, "tenant-a", built);
  assert.ok(result.ok, JSON.stringify(result));
  const bytes = readFileSync(result.path);
  assert.equal(JSON.parse(bytes.toString("utf8")).tenantId, "tenant-a");
  const app = express();
  app.use(requireAuth({ verify: async key => key === "private" ? { tenantId: "tenant-a", scopes: ["sessions"] } : null }));
  app.use(createRetentionStatusRouter({ readRetentionStatus: createRetentionStatusReader(root, () => now) }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/retention/status?tenant=foreign`, { headers: { authorization: "Bearer private" } });
    assert.equal(response.status, 200);
    const body = await response.text(); assert.ok(!body.includes("sensitive") && !body.includes("reportFile"));
    const projection = JSON.parse(body) as { status: string; summary: { candidates: number; vetoed: number; deleted: number; dryRun: boolean } };
    assert.equal(projection.status, "available"); assert.equal(projection.summary.candidates, 3);
    assert.equal(projection.summary.vetoed, 2); assert.equal(projection.summary.deleted, 0); assert.equal(projection.summary.dryRun, true);
    assert.deepEqual(readFileSync(result.path), bytes, "API reader must not change actual writer output");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
test("actual dry-run CLI/job private producer is consumed by the real authenticated route without deleting fixture media", async () => {
  const root = mkdtempSync(join(tmpdir(), "t046-job-consumer-")), media = mkdtempSync(join(tmpdir(), "t046-job-media-")), out = mkdtempSync(join(tmpdir(), "t046-job-report-"));
  const dir = writeSession(root, media, { tenant: "tenant-a", name: "raw-old", processedAt: iso(100 * DAY - 3600_000), mediaMtimeMs: NOW - 100 * DAY, mediaBytes: 10 });
  const sourcePath = join(dir, "source.json"), source = JSON.parse(readFileSync(sourcePath, "utf8"));
  source.createdAt = new Date(NOW - 100 * DAY).toISOString(); writeFileSync(sourcePath, JSON.stringify(source));
  const errors: string[] = [];
  const code = runRetentionPurgeJobCli([...baseArgs(root, media, ["--as-of", new Date().toISOString()], "tenant-a"), "--report-file", join(out, "report.json")],
    { LKB_RETENTION_DATA_ROOT: root }, () => {}, line => errors.push(line));
  assert.equal(code, 0, errors.join("\n"));
  const app = express(); app.use(requireAuth({ verify: async key => key === "private" ? { tenantId: "tenant-a", scopes: ["sessions"] } : null }));
  app.use(createRetentionStatusRouter({ readRetentionStatus: createRetentionStatusReader(root) }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/retention/status`, { headers: { authorization: "Bearer private" } });
    assert.equal(response.status, 200);
    const body = await response.json() as { status: string; summary: { candidates: number; deleted: number; dryRun: boolean; clipsRetained: unknown } };
    assert.equal(body.status, "available"); assert.equal(body.summary.candidates, 1); assert.equal(body.summary.deleted, 0);
    assert.equal(body.summary.dryRun, true); assert.equal(body.summary.clipsRetained, null); assert.ok(existsSync(join(media, "m", "raw-old.webm")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const owned of [root, media, out]) rmSync(owned, { recursive: true, force: true });
  }
});
