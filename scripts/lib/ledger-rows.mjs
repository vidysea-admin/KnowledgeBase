/**
 * scripts/lib/ledger-rows.mjs -- the ledger UNION readers, split out of tracker-audit.mjs when that
 * file crossed its 300-LOC lint budget. tracker-audit.mjs re-exports both names, so every existing
 * `import { ledgerFiles, readLedgerRows } from "./tracker-audit.mjs"` keeps working unchanged.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every ledger file: canonical `qa/issues.jsonl` first, then each lane shard
 * `qa/issues.<lane>.jsonl` alphabetically.
 *
 * ISS-129. D-019 declared that every reader treats this union as the ledger, and then no reader
 * did -- both production readers opened the single file by name, so a lane shard whose id is CITED
 * BY D-020 was counted by nothing and surfaced by nothing. A shard nobody reads is worse than no
 * shard: it looks like tracking while counting zero.
 *
 * Root cause worth keeping where it will be re-read: D-019's own `Changes-authorized` named only
 * `.claude/CLAUDE.md`, so the mechanism the rule required was never scoped to a file it was
 * allowed to touch. A governance rule whose mechanism sits outside its own authorization is a rule
 * that cannot be implemented.
 */
export function ledgerFiles(root) {
  const dir = join(root, "qa");
  const canonical = join(dir, "issues.jsonl");
  let shards = [];
  try {
    shards = readdirSync(dir)
      .filter((f) => /^issues\..+\.jsonl$/.test(f))
      .sort()
      .map((f) => join(dir, f));
  } catch (err) {
    // Only "the directory is not there" is an expected outcome. A bare `catch {}` here previously
    // swallowed a ReferenceError from a MISSING IMPORT and returned zero shards, so the union
    // silently read nothing while every call site looked correct -- the same silent-failure class
    // this audit exists to catch.
    if (err?.code !== "ENOENT") throw err;
  }
  return [...(existsSync(canonical) ? [canonical] : []), ...shards];
}

/** Every row across the ledger union, plus a count of lines no consumer could parse. */
export function readLedgerRows(root) {
  const rows = [];
  let unparseable = 0;
  const firstLocations = new Map();
  for (const file of ledgerFiles(root)) {
    for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { unparseable++; continue; }
      if (typeof row?.id === "string") {
        const location = `${file}:${index + 1}`, first = firstLocations.get(row.id);
        if (first) throw new Error(`Duplicate ledger id ${row.id}: ${first} and ${location}`);
        firstLocations.set(row.id, location);
      }
      rows.push(row);
    }
  }
  return { rows, unparseable };
}
