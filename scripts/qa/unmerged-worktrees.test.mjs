import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseWorktrees, listUnmergedWorktrees, formatReport } from "./unmerged-worktrees.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

test("parseWorktrees reads path, branch and detached heads, skips bare", () => {
  const out = parseWorktrees(
    "worktree /a\nHEAD abc\nbranch refs/heads/master\n\nworktree /b\nHEAD def\ndetached\n\nworktree /c\nbare\n",
  );
  assert.deepEqual(out.map((w) => [w.path, w.branch]), [["/a", "master"], ["/b", null]]);
});

test("formatReport states the number even when everything is merged, and says UNAVAILABLE on error", () => {
  const ok = formatReport({ base: "master", worktrees: [{ path: "/a", branch: "master", ahead: 0, main: true }] });
  assert.match(ok[0], /0 commit\(s\) across 0 of 1 worktree/);
  assert.match(formatReport({ error: "boom" })[0], /UNAVAILABLE \(boom\)/);
});

test("real repo: counts commits ahead per worktree, orders largest first, changes nothing", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lkb-wt-")));
  const main = join(dir, "main");
  const wtA = join(dir, "wt-a");
  const wtB = join(dir, "wt-b");
  const wtC = join(dir, "wt-c");
  try {
    execFileSync("git", ["init", "-q", "-b", "master", main]);
    writeFileSync(join(main, "f"), "0");
    git(main, "add", "f");
    git(main, "commit", "-q", "-m", "base");
    git(main, "worktree", "add", "-q", "-b", "merged", wtC);
    git(main, "worktree", "add", "-q", "-b", "wave/a", wtA);
    git(main, "worktree", "add", "-q", "-b", "wave/b", wtB);
    for (const n of [1, 2, 3]) {
      writeFileSync(join(wtA, `a${n}`), String(n));
      git(wtA, "add", ".");
      git(wtA, "commit", "-q", "-m", `a${n}`);
    }
    writeFileSync(join(wtB, "b1"), "1");
    git(wtB, "add", ".");
    git(wtB, "commit", "-q", "-m", "b1");
    const before = git(main, "branch", "-a", "-v");

    const res = listUnmergedWorktrees(main);
    assert.equal(res.base, "master");
    const byBranch = Object.fromEntries(res.worktrees.map((w) => [w.branch, w.ahead]));
    assert.deepEqual(byBranch, { master: 0, merged: 0, "wave/a": 3, "wave/b": 1 });
    const lines = formatReport(res);
    assert.match(lines[0], /4 commit\(s\) across 2 of 4 worktree/);
    assert.match(lines[1], /^ {2}wave\/a: 3 ahead/);
    assert.match(lines[2], /^ {2}wave\/b: 1 ahead/);
    assert.equal(git(main, "branch", "-a", "-v"), before, "report must not move any ref");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no master ref: reports unavailable rather than a silent zero", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lkb-wt-")));
  try {
    execFileSync("git", ["init", "-q", "-b", "trunk", dir]);
    writeFileSync(join(dir, "f"), "0");
    git(dir, "add", "f");
    git(dir, "commit", "-q", "-m", "base");
    const res = listUnmergedWorktrees(dir);
    assert.equal(res.base, null);
    assert.match(formatReport(res)[0], /UNAVAILABLE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
