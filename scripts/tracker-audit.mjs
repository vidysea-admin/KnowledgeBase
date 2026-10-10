#!/usr/bin/env node
/**
 * scripts/tracker-audit.mjs — CLI entry point over scripts/lib/tracker-audit.mjs.
 *
 * Lives in the repo (not the global /checker skill) so the sweep can invoke it, anyone can run
 * it, and it is versioned with the trackers it audits.
 *
 * Usage: node scripts/tracker-audit.mjs [--json] [--gate g1]
 * Exit:  0 all selected gates pass · 1 one or more selected gates fail
 */
import { pathToFileURL } from "node:url";
import { audit, parseGateArg, filterByGate } from "./lib/tracker-audit.mjs";
import { listUnmergedWorktrees, formatReport } from "./qa/unmerged-worktrees.mjs";

/**
 * ISS-164: G4 GATES only on author-owned surfaces. A G4 finding in qa/verdicts/ or qa/contracts/
 * is checker-authored, so the committing maker cannot clear it in the same commit -- it is
 * reported as advisory (a sweep duty) and does not alter the exit code. qa/manifests/ is always
 * the committing maker's own file, so it keeps gating.
 */
export function splitAdvisory(findings) {
  const advisory = (f) => /^G4 /.test(f) && !/: qa\/manifests\//.test(f);
  return { gating: findings.filter((f) => !advisory(f)), advisory: findings.filter(advisory) };
}

function main(argv) {
  const gate = parseGateArg(argv);
  const all = audit();
  const { gating: findings, advisory } = splitAdvisory(filterByGate(all, gate));
  // Report only: unmerged worktree commits are the Approver's call, so they never alter the exit code.
  const unmerged = gate ? null : listUnmergedWorktrees(process.cwd());
  const scope = gate ? `gate ${gate}` : "G1 trackers agree · G2 no unverified fixes · G3 sweep not stale";
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ok: findings.length === 0, gate, findings, unmergedWorktrees: unmerged }, null, 2));
  } else if (findings.length === 0) {
    console.log(`tracker-audit: OK (${scope})`);
  } else {
    console.error(`tracker-audit${gate ? ` --gate ${gate}` : ""}: ${findings.length} finding(s)`);
    for (const f of findings) console.error(`  ${f}`);
  }
  if (advisory.length && !argv.includes("--json")) for (const f of advisory) console.log(`  advisory (not gating): ${f}`);
  if (!gate && !argv.includes("--json")) for (const line of formatReport(unmerged)) console.log(line);
  process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
