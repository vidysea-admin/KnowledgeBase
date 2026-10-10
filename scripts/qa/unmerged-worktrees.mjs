/**
 * scripts/qa/unmerged-worktrees.mjs -- read-only report of commits that sit on registered git
 * worktrees but are not on the base branch (qa/QUEUE.md `sweep-reports-unmerged-worktrees`).
 *
 * Every gate, count and sweep reads master, so commits that exist only on a worktree branch are
 * invisible to all of them (qa/gates/unmerged-worktree-inventory.md measured 23 across 5). This
 * module only makes the number visible on every audit run. It never merges, rebases, deletes or
 * writes anything: it runs `git worktree list` and `git rev-list --count` and nothing else.
 *
 * It is a REPORT, not a gate: a worktree being ahead is a decision for the Approver, not something
 * the current commit can clear, so it must never change the audit exit code.
 */
import { execFileSync } from "node:child_process";

const defaultRun = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Parses `git worktree list --porcelain` into [{ path, branch|null, head, bare }]. */
export function parseWorktrees(porcelain) {
  return porcelain
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const wt = { path: "", branch: null, head: "", bare: false };
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("worktree ")) wt.path = line.slice(9);
        else if (line.startsWith("HEAD ")) wt.head = line.slice(5);
        else if (line.startsWith("branch ")) wt.branch = line.slice(7).replace(/^refs\/heads\//, "");
        else if (line === "bare") wt.bare = true;
      }
      return wt;
    })
    .filter((wt) => wt.path && !wt.bare);
}

/**
 * Returns { base, worktrees: [{ path, branch, ahead, main }], error? }. `base` is the first of
 * master, origin/master that resolves; if none does, `base` is null and nothing is counted (said
 * plainly in the report, never silently zero).
 */
export function listUnmergedWorktrees(root, run = defaultRun) {
  let porcelain;
  try {
    porcelain = run(["worktree", "list", "--porcelain"], root);
  } catch (err) {
    return { base: null, worktrees: [], error: `git worktree list failed: ${String(err?.message ?? err).split("\n")[0]}` };
  }
  let base = null;
  for (const ref of ["master", "origin/master"]) {
    try {
      run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], root);
      base = ref;
      break;
    } catch {
      // try the next candidate
    }
  }
  const all = parseWorktrees(porcelain);
  if (!base) return { base: null, worktrees: [], error: "no master or origin/master ref to compare against" };
  const worktrees = all.map((wt, i) => {
    const tip = wt.branch ?? wt.head;
    let ahead = null;
    try {
      ahead = Number.parseInt(run(["rev-list", "--count", `${base}..${tip}`], root).trim(), 10);
    } catch {
      ahead = null;
    }
    return { path: wt.path, branch: wt.branch ?? `(detached ${wt.head.slice(0, 7)})`, ahead, main: i === 0 };
  });
  return { base, worktrees };
}

/** Human-readable lines. Always at least one line, so the number appears on every run. */
export function formatReport(result) {
  if (result.error) return [`unmerged-worktrees: UNAVAILABLE (${result.error})`];
  const behind = result.worktrees.filter((w) => w.ahead !== 0);
  const total = behind.reduce((n, w) => n + (w.ahead ?? 0), 0);
  const lines = [
    `unmerged-worktrees: ${total} commit(s) across ${behind.length} of ${result.worktrees.length} worktree(s) not on ${result.base} (report only, not a gate)`,
  ];
  for (const w of [...behind].sort((a, b) => (b.ahead ?? -1) - (a.ahead ?? -1))) {
    const n = w.ahead === null ? "count failed" : `${w.ahead} ahead`;
    lines.push(`  ${w.branch}: ${n}${w.main ? " [main checkout]" : ""} -- ${w.path}`);
  }
  return lines;
}
