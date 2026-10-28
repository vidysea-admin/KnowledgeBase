import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveWatchRoot, mainTreeCandidates } from "./main-tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const runWatchUrl = pathToFileURL(join(repoRoot, "scripts", "watch", "run-watch.mjs")).href;

test("env unset: root is the checkout the script lives in", () => {
  assert.equal(resolveWatchRoot(runWatchUrl, {}), repoRoot);
});
test("env set: LKB_MAIN_TREE_ROOT wins", () => {
  const other = mkdtempSync(join(tmpdir(), "lkb-root-"));
  assert.equal(resolveWatchRoot(runWatchUrl, { LKB_MAIN_TREE_ROOT: other }), resolve(other));
});
test("candidates: env unset yields only this tree, no hard-coded fallback", () => {
  const rel = join("raw", "x.json");
  const c = mainTreeCandidates(repoRoot, rel, {});
  assert.deepEqual(c, [join(repoRoot, rel)]);
  assert.ok(!c.some((p) => /^[A-Za-z]:[\/]KnowledgeBase/i.test(p) && !p.startsWith(repoRoot)));
});
test("candidates: env set adds the configured main tree second", () => {
  const other = mkdtempSync(join(tmpdir(), "lkb-root-"));
  const rel = join("raw", "x.json");
  assert.deepEqual(mainTreeCandidates(repoRoot, rel, { LKB_MAIN_TREE_ROOT: other }), [join(repoRoot, rel), join(resolve(other), rel)]);
});
