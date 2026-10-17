/**
 * scripts/lib/id-divergence.mjs — re-derive the concurrent-loop id divergence from git, not by hand.
 *
 * ISS-132. `qa/gates/ledger-id-divergence.md` recorded a hand-written mapping of "the id my lane
 * cited" → "the id that finding actually carries on master". It was wrong in two of its four rows,
 * and the sweep that flagged it was wrong in both of its corrections. Two independent hand-readings
 * of the same ledger disagreed with each other AND with the ledger.
 *
 * The defect is not the four wrong characters. It is that the record was hand-maintained, so its
 * only proof was that someone had read carefully — and D-015 makes a fix measurable only if the id
 * it cites resolves to the right row. A historical record that silently rots is worse than none,
 * because it still looks authoritative.
 *
 * So: derive it. A row was DISPLACED when the id a commit allocated is, on master, carried by a
 * different id whose title matches. Titles are compared with the `[RENUMBERED …]` provenance
 * suffix stripped, because that suffix is exactly what a renumbering appends.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The provenance note a renumbering appends is not part of the finding. */
export function canonicalTitle(title) {
  return String(title).split(" [RENUMBERED")[0].trim();
}

function parseRows(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r?.id && !rows.has(r.id)) rows.set(r.id, r);
    } catch {
      /* a malformed line is the tracker audit's finding, not this one's */
    }
  }
  return rows;
}

/** The ledger UNION under D-019: the canonical file plus every `qa/issues.<lane>.jsonl` shard. */
export function unionRows(root) {
  const dir = join(root, "qa");
  const files = readdirSync(dir).filter((f) => f === "issues.jsonl" || /^issues\..+\.jsonl$/.test(f)).sort();
  const rows = new Map();
  for (const f of files) {
    for (const [id, r] of parseRows(readFileSync(join(dir, f), "utf8"))) {
      if (!rows.has(id)) rows.set(id, { ...r, ledger: f });
    }
  }
  return rows;
}

function rowsAt(root, ref, exec) {
  try {
    return parseRows(exec("git", ["-C", root, "show", `${ref}:qa/issues.jsonl`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return new Map(); // the path did not exist at that ref
  }
}

/**
 * Every id a commit allocated that is carried on master by a DIFFERENT id with the same finding.
 * `commits` are the checker commits to examine, newest-first is fine — order does not matter.
 */
export function deriveDivergence(root, commits, { exec = execFileSync, union } = {}) {
  const master = union ?? unionRows(root);
  const byTitle = new Map();
  for (const [id, r] of master) {
    const key = canonicalTitle(r.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), id]);
  }
  const out = [];
  for (const sha of commits) {
    const cur = rowsAt(root, sha, exec);
    const par = rowsAt(root, `${sha}^`, exec);
    for (const [id, r] of cur) {
      if (par.has(id)) continue; // not allocated by this commit
      const carriedBy = byTitle.get(canonicalTitle(r.title)) ?? [];
      if (carriedBy.length === 0) out.push({ filed: id, sha, carriedBy, state: "absent", title: canonicalTitle(r.title) });
      else if (!(carriedBy.length === 1 && carriedBy[0] === id)) {
        out.push({ filed: id, sha, carriedBy, state: carriedBy.length > 1 ? "duplicated" : "displaced", title: canonicalTitle(r.title) });
      }
    }
  }
  return out;
}

/** Checker commits whose subject matches `pattern` — the lane whose ids are being traced. */
export function checkerCommits(root, pattern, { exec = execFileSync } = {}) {
  const out = exec("git", ["-C", root, "log", "--all", "--format=%H %s", `--grep=${pattern}`], { encoding: "utf8" });
  return out.split(/\r?\n/).filter((l) => l.includes("checker:")).map((l) => l.split(" ")[0]).filter(Boolean);
}

/**
 * ISS-146. Divergence across EVERY lane, not just the one whose pattern a caller remembered to pass.
 * `checkerCommits` accepts any pattern but its only call site passed 'speaker', so divergence in any
 * other lane (b-golden-set, c-unrun-writers, ...) surfaced nowhere. An empty `--grep` matches every
 * checker commit, so this is the lane-agnostic form; a caller reports any non-empty result.
 */
export function deriveAllDivergence(root, { exec = execFileSync, union } = {}) {
  return deriveDivergence(root, checkerCommits(root, "", { exec }), { exec, union });
}

/**
 * ISS-145. Parse the "### The mapping, complete" table out of `qa/gates/ledger-id-divergence.md`
 * into the same `{filed, carriedBy, state}` shape `deriveDivergence` emits, so the hand-pasted gate
 * copy can be compared against the derivation instead of trusted. Returns `[]` when the table is
 * missing (which a comparing test then reports as a mismatch, never a silent pass).
 */
export function parseGateMapping(text) {
  const start = text.indexOf("### The mapping, complete");
  if (start < 0) return [];
  const out = [];
  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    if (/^#{1,3} /.test(line)) break; // next section
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const filed = /^ISS-\d+$/.exec(cells[1])?.[0];
    if (!filed) continue; // header and separator rows
    out.push({
      filed,
      carriedBy: cells[2].match(/ISS-\d+/g) ?? [],
      state: cells[3].replace(/\*/g, "").trim(),
    });
  }
  return out;
}
