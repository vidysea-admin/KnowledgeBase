// scripts/watch/lib/main-tree.mjs — root resolution for run-watch.mjs (machine-migration-hardcoded-paths).
// Pure, no I/O. The repo root is derived from the caller's own location, never a hard-coded drive path;
// LKB_MAIN_TREE_ROOT, when set, wins.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root: LKB_MAIN_TREE_ROOT if set, else two levels above `scriptUrl`'s directory (scripts/watch -> root). */
export function resolveWatchRoot(scriptUrl, env = process.env) {
  return env.LKB_MAIN_TREE_ROOT
    ? resolve(env.LKB_MAIN_TREE_ROOT)
    : resolve(dirname(fileURLToPath(scriptUrl)), "..", "..");
}

/** Candidate locations for a repo-relative path: this tree, then the configured main tree (only when
 * LKB_MAIN_TREE_ROOT is set — unset, the second location IS this tree, so no extra candidate and no
 * guessed absolute fallback). */
export function mainTreeCandidates(root, rel, env = process.env) {
  const out = [join(root, rel)];
  if (env.LKB_MAIN_TREE_ROOT) out.push(join(resolve(env.LKB_MAIN_TREE_ROOT), rel));
  return out;
}
