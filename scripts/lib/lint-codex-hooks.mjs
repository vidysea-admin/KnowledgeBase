#!/usr/bin/env node
/**
 * scripts/lib/lint-codex-hooks.mjs — parity check for the .codex/hooks mirror (ISS-355, ISS-268).
 *
 * D-050-CODEX authorized replacing the six `.codex/hooks/*.ps1` copies with links to their
 * `.claude/hooks/` originals "so divergence is impossible by construction rather than policed
 * by a lint someone must keep passing." The codex-hooks-links unit (2026-09-28) proved that
 * neither a Windows hard link nor a directory junction actually holds that guarantee in this
 * repo: both survive an in-place Edit-tool write and a `git checkout` of an existing file, but
 * git has no object type for either — every `git clone` and every `git worktree add` (this
 * repo's routine unit of concurrency, per D-019) materializes `.codex/hooks/*` as six ordinary,
 * independent files with no link at all. A link that must be silently re-established after
 * every worktree is exactly the "policed by a lint someone must keep passing" problem restated,
 * so this file IS the durable fix D-050-CODEX pre-authorized as the fallback, not a backstop
 * for a link that remains in place.
 *
 * Compares each configured file's content to its .claude/hooks original MODULO LINE ENDINGS —
 * CRLF-vs-LF alone (features-snapshot-session-end.ps1's actual state today) is not a defect.
 * Usage: node scripts/lib/lint-codex-hooks.mjs [--root <dir>]
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig, report, rootFromArgv } from "./walk.mjs";

const normalize = (text) => text.replace(/\r\n/g, "\n");

export function check(root, cfg = loadConfig(root)) {
  const c = cfg.codexHooks;
  const violations = [];
  let compared = 0;
  for (const name of c.files) {
    const mirrorPath = join(root, c.mirrorDir, name);
    const sourcePath = join(root, c.sourceDir, name);
    const mirrorRel = `${c.mirrorDir}/${name}`;
    const sourceRel = `${c.sourceDir}/${name}`;
    if (!existsSync(sourcePath)) {
      violations.push(`${sourceRel} does not exist (mirror source missing)`);
      continue;
    }
    if (!existsSync(mirrorPath)) {
      violations.push(`${mirrorRel} is missing (source ${sourceRel} exists)`);
      continue;
    }
    compared++;
    const mirrorText = normalize(readFileSync(mirrorPath, "utf8"));
    const sourceText = normalize(readFileSync(sourcePath, "utf8"));
    if (mirrorText !== sourceText) {
      violations.push(`${mirrorRel} diverges from ${sourceRel} (content differs, not just line endings)`);
    }
  }
  return { violations, compared };
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const { violations, compared } = check(rootFromArgv());
  report("lint-codex-hooks", violations, `${compared} pair(s) compared`);
}
