#!/usr/bin/env node
/**
 * Thin CLI over ledger-alloc.mjs.
 *   next-id [--lane <name>]                 ADVISORY preview; the id is not reserved (use `append`)
 *   append --lane <name> --row <json file>  allocate + append one row atomically under the ledger lock
 *   append --main --row <json file>         same, for the main-tree qa/issues.jsonl
 *   verify                                  read-only: all refusals over the real union; exit 1 on findings
 *   cite-check                              read-only: C3 citation integrity; exit 1 on mismatches
 * Common: --root <dir> (default: this repo). Exit 0 ok, 1 refusal/findings, 2 usage.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LedgerError, appendRow, citationCheck, nextId, readUnion } from "./ledger-alloc.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parse(argv) {
  const [cmd, ...rest] = argv, opts = { cmd, lane: null, main: false, root: REPO, row: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i], val = () => { if (i + 1 >= rest.length) throw new LedgerError(`${a} needs a value`); return rest[++i]; };
    if (a === "--lane") opts.lane = val();
    else if (a === "--root") opts.root = resolve(val());
    else if (a === "--row") opts.row = val();
    else if (a === "--main") opts.main = true;
    else throw new LedgerError(`unknown argument ${a}`);
  }
  return opts;
}

function run(argv, out) {
  const o = parse(argv);
  if (o.main && o.lane !== null) throw new LedgerError("--main and --lane are mutually exclusive");
  switch (o.cmd) {
    case "next-id": out(nextId(o.root, o.lane)); return 0;
    case "append": {
      if (o.row === null) throw new LedgerError("append needs --row <json file>");
      if (o.lane === null && !o.main) throw new LedgerError("append needs --lane <name> or --main");
      let row;
      try { row = JSON.parse(readFileSync(o.row, "utf8")); } catch (e) { throw new LedgerError(`cannot read row file: ${e.message}`); }
      const r = appendRow(o.root, o.lane, row);
      out(`${r.id} ${r.file}:${r.line}`); return 0;
    }
    case "verify": {
      const { rows, findings } = readUnion(o.root);
      out(`rows=${rows.length} findings=${findings.length}`);
      for (const f of findings) out(`${f.kind}\t${f.loc}\t${f.detail}`);
      return findings.length ? 1 : 0;
    }
    case "cite-check": {
      const r = citationCheck(o.root);
      out(`units=${r.checked} cited=${r.cited} unattributed=${r.unattributed} mismatches=${r.mismatches.length} ledger-findings=${r.ledgerFindings.length}`);
      for (const m of r.mismatches) out(`${m.reason}\t${m.file}\t${m.id}\tfeature=${m.feature ?? "-"}`);
      return r.mismatches.length || r.ledgerFindings.length ? 1 : 0;
    }
    default: throw Object.assign(new LedgerError("usage: next-id [--lane n] | append (--lane n|--main) --row f | verify | cite-check  [--root dir]"), { usage: true });
  }
}

try {
  process.exitCode = run(process.argv.slice(2), (s) => console.log(s));
} catch (err) {
  if (!(err instanceof LedgerError)) throw err;
  console.error(`ledger-alloc: ${err.message}`);
  process.exitCode = err.usage ? 2 : 1;
}
