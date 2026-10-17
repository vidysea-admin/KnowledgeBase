import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, linkSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { requireAuth } from "../auth.js";
import { createRetentionStatusRouter } from "./router.js";
import { createRetentionStatusReader } from "./store.js";
import { projectSummary } from "./summary.js";

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const sample = (tenantId = "tenant-a") => ({ tenantId, version: 1, mode: "dry-run", dryRun: true,
  startedAt: "2026-10-14T11:00:00.000Z", finishedAt: "2026-10-14T11:01:00.000Z", exitCode: 0,
  ok: true, candidates: 2, deleted: 0, bytes: 0, vetoed: 1, failed: 0, clipsRetained: null,
  reportFile: "sensitive-report-path", lines: ["secret-title"], password: "secret-credential" });
const hashed = (tenant: string) => createHash("sha256").update(tenant).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-retention-status-"));
  const file = (tenant: string) => join(root, hashed(tenant), "retention", "last-run.json");
  const write = (tenant: string, value: unknown) => {
    mkdirSync(join(root, hashed(tenant), "retention"), { recursive: true });
    writeFileSync(file(tenant), JSON.stringify(value));
  };
  return { root, file, write, read: createRetentionStatusReader(root, () => NOW),
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("strict allowlist rejects malformed counts, identities, timestamps and inconsistent state", () => {
  const projected = projectSummary(sample(), "tenant-a", NOW)!;
  assert.ok(projected);
  assert.equal(Object.hasOwn(projected, "tenantId"), false);
  for (const secret of ["sensitive-report-path", "secret-title", "secret-credential"]) assert.ok(!JSON.stringify(projected).includes(secret));
  const attacks = [null, [], {}, { ...sample(), tenantId: "tenant-b" },
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3", undefined].map(candidates => ({ ...sample(), candidates })),
    { ...sample(), candidates: null }, { ...sample(), finishedAt: "not-time" },
    { ...sample(), finishedAt: "2026-02-30T12:00:00.000Z" },
    { ...sample(), finishedAt: "2026-10-15T12:00:00.000Z" },
    { ...sample(), startedAt: "2026-10-14T11:02:00.000Z" },
    { ...sample(), dryRun: false }, { ...sample(), deleted: 1 }, { ...sample(), bytes: 1 },
    { ...sample(), failed: 1 }, { ...sample(), clipsRetained: 2 }, { ...sample(), exitCode: 4 }];
  for (const attack of attacks) assert.equal(projectSummary(attack, "tenant-a", NOW), null, JSON.stringify(attack));
  assert.ok(projectSummary({ ...sample(), mode: "execute", dryRun: false, deleted: 1, bytes: 4, clipsRetained: 2 }, "tenant-a", NOW));
  assert.ok(projectSummary({ ...sample(), ok: false, exitCode: 3, candidates: null, deleted: null, bytes: null, vetoed: null, failed: null }, "tenant-a", NOW));
});

test("reader uses only authenticated tenant directory; absent, invalid and foreign state fail honestly", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "last-run.json"), JSON.stringify(sample()));
    assert.deepEqual(f.read("tenant-a"), { status: "never-run" });
    f.write("tenant-a", sample()); f.write("tenant-b", { ...sample("tenant-b"), candidates: 9 });
    assert.equal(f.read("tenant-a").status, "available");
    const foreign = f.read("tenant-b"); assert.ok(foreign.status === "available"); assert.equal(foreign.summary.candidates, 9);
    f.write("tenant-a", sample("tenant-b")); assert.deepEqual(f.read("tenant-a"), { status: "unavailable" });
    writeFileSync(f.file("tenant-a"), "{malformed-sensitive}"); assert.equal(f.read("tenant-a").status, "unavailable");
    writeFileSync(f.file("tenant-a"), JSON.stringify({ ...sample(), oversized: "x".repeat(16_384) }));
    assert.equal(f.read("tenant-a").status, "unavailable");
    for (const tenant of ["", " tenant-a", "tenant-a\n"]) assert.equal(f.read(tenant).status, "unavailable");
    for (const tenant of ["../tenant-b", "tenant-a/../tenant-b", "C:\\tenant-b"]) assert.equal(f.read(tenant).status, "never-run");
    assert.equal(createRetentionStatusReader("")("tenant-a").status, "unavailable");
    assert.equal(createRetentionStatusReader(join(f.root, "missing"))("tenant-a").status, "unavailable");
  } finally { f.cleanup(); }
});

test("reader refuses hardlinked files and tenant junctions without traversing foreign state", () => {
  const f = fixture();
  try {
    f.write("tenant-b", sample("tenant-b"));
    mkdirSync(join(f.root, hashed("tenant-a"), "retention"), { recursive: true });
    linkSync(f.file("tenant-b"), f.file("tenant-a"));
    assert.equal(f.read("tenant-a").status, "unavailable");
    assert.equal(f.read("tenant-b").status, "unavailable");
    symlinkSync(join(f.root, hashed("tenant-b")), join(f.root, hashed("tenant-c")), process.platform === "win32" ? "junction" : "dir");
    assert.equal(f.read("tenant-c").status, "unavailable");
  } finally { f.cleanup(); }
});

test("real auth+route+store: scopes, client overrides, no writes and sanitized unavailable", async () => {
  const f = fixture(); f.write("tenant-a", sample()); f.write("tenant-b", { ...sample("tenant-b"), candidates: 9 });
  const app = express();
  app.use(requireAuth({ verify: async key => key === "a" ? { tenantId: "tenant-a", scopes: ["sessions"] } :
    key === "b" ? { tenantId: "tenant-b", scopes: [] } :
    key === "c" ? { tenantId: "tenant-b", scopes: ["sessions"] } : null }));
  app.use(createRetentionStatusRouter({ readRetentionStatus: f.read }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/retention/status`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer revoked" } })).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer b" } })).status, 403);
    const response = await fetch(`${url}?tenant=tenant-b&path=../../last-run.json`, { headers: { authorization: "Bearer a" } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("X-LKB-Tenant"), "tenant-a");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.text(); assert.ok(!body.includes("secret") && !body.includes("reportFile"));
    const second = await fetch(`${url}?tenant=tenant-a`, { headers: { authorization: "Bearer c", "X-LKB-Tenant": "tenant-a" } });
    assert.equal(second.headers.get("X-LKB-Tenant"), "tenant-b");
    assert.equal(((await second.json()) as { summary: { candidates: number } }).summary.candidates, 9);
    assert.equal((await fetch(url, { method: "POST", headers: { authorization: "Bearer a" } })).status, 404);
    f.write("tenant-a", { secret: "do-not-leak" });
    const failed = await fetch(url, { headers: { authorization: "Bearer a" } });
    assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("do-not-leak"));
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); f.cleanup(); }
});
