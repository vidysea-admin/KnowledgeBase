/**
 * scripts/lib/lint-codex-hooks.test.mjs — negative tests for lint-codex-hooks.mjs
 * (D-050-CODEX / ISS-355 / ISS-268 parity-lint fallback).
 *
 * Kept as its own file, not folded into scripts/lint.test.mjs: that file's non-blank line count
 * sits close enough to the 300-LOC budget (lint-loc.mjs's testPatterns match `.test.ts`/`test_*.py`
 * only, not `.test.mjs`, so scripts/lint.test.mjs is held to the strict 300 cap, not testMax 400)
 * that adding these four tests there pushed it over and became a violation this unit would have
 * introduced. Wired into "test:lint" alongside the repo's other scripts/lib/*.test.mjs files
 * (mutate.test.mjs, tracker-audit.test.mjs, ...), which are exercised the same way.
 * Run: node --test scripts/lib/lint-codex-hooks.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));
const CHECKER = join(LIB, "lint-codex-hooks.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-codex-hooks-"));
  const cfg = {
    codexHooks: { mirrorDir: ".codex/hooks", sourceDir: ".claude/hooks", files: ["fake-hook.ps1"] },
  };
  writeFileSync(join(root, "structure.config.json"), JSON.stringify(cfg));
  return root;
}

function put(root, rel, content = "") {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function run(root) {
  const r = spawnSync(process.execPath, [CHECKER, "--root", root], { encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

test("lint-codex-hooks: passes when the mirror file matches its .claude/hooks original", () => {
  const root = fixture();
  try {
    put(root, ".claude/hooks/fake-hook.ps1", "Write-Output 'a'\n");
    put(root, ".codex/hooks/fake-hook.ps1", "Write-Output 'a'\n");
    const r = run(root);
    assert.equal(r.status, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-codex-hooks: CRLF-vs-LF alone is NOT a violation", () => {
  const root = fixture();
  try {
    put(root, ".claude/hooks/fake-hook.ps1", "Write-Output 'a'\r\nWrite-Output 'b'\r\n");
    put(root, ".codex/hooks/fake-hook.ps1", "Write-Output 'a'\nWrite-Output 'b'\n");
    const r = run(root);
    assert.equal(r.status, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-codex-hooks: fails when mirror content actually diverges", () => {
  const root = fixture();
  try {
    put(root, ".claude/hooks/fake-hook.ps1", "Write-Output 'FIXED'\n");
    put(root, ".codex/hooks/fake-hook.ps1", "Write-Output 'STALE'\n");
    const r = run(root);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /\.codex\/hooks\/fake-hook\.ps1 diverges from \.claude\/hooks\/fake-hook\.ps1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-codex-hooks: fails when a mirror file is missing entirely", () => {
  const root = fixture();
  try {
    put(root, ".claude/hooks/fake-hook.ps1", "Write-Output 'a'\n");
    // .codex/hooks/fake-hook.ps1 deliberately not created
    const r = run(root);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /\.codex\/hooks\/fake-hook\.ps1 is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-codex-hooks: fails when the .claude source itself does not exist", () => {
  const root = fixture();
  try {
    put(root, ".codex/hooks/fake-hook.ps1", "Write-Output 'a'\n");
    // .claude/hooks/fake-hook.ps1 deliberately not created
    const r = run(root);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /\.claude\/hooks\/fake-hook\.ps1 does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-codex-hooks: passes on the REAL repo tree (proves the fix landed, not just the test)", () => {
  const repoRoot = join(LIB, "..", "..");
  const r = run(repoRoot);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /6 pair\(s\) compared/);
});
