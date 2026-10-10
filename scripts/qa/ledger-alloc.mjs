/**
 * Ledger id allocator (contract qa/contracts/ledger-id-allocation.md, issue ISS-298).
 *
 * The defect: an id was chosen at READ time and written at APPEND time. This module makes the two
 * ONE operation (appendRow) under an exclusive lock, and refuses to run on a ledger it cannot trust.
 * It never edits, repairs or renumbers an existing row (C4, I1); it only appends one line.
 *
 * Reader decisions, stated so a checker can disagree with them:
 *  - A whitespace-only line is TOLERATED (the existing readers, tracker-audit readLedgerRows, skip
 *    them; qa/issues.104cc.jsonl has one). Any other unparseable line is a refusal.
 *  - TWO GRAMMARS (fix cycle 1). READING accepts READ_ID_RE in any file: `ISS-` then upper-case alphanumeric
 *    segments joined by single hyphens (plain ISS-12, lane ISS-U3-001, qualified ISS-360-OBSFLAKE, lane ids that
 *    were merged into the main file: D-019 forbids renumbering them, D-055 ruling 2 made the qualified ones).
 *    ALLOCATING stays strict: main = exactly `ISS-<digits>`, a lane = exactly `ISS-<LANE>-<digits>`.
 *  - The union (I2) is qa/issues.jsonl then every qa/issues.*.jsonl, sorted. Always all of it.
 */
import {
  readFileSync, readdirSync, appendFileSync, openSync, writeSync, closeSync, statSync, unlinkSync,
} from "node:fs";
import { join } from "node:path";

export const LOCK_NAME = ".issues-ledger.lock";
export const SEVERITIES = ["critical", "high", "medium", "low"];
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
/** Reading grammar, derived from the ids in the real union; checked against every one of them by the tests. */
export const READ_ID_RE = /^ISS-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const LANE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;

export class LedgerError extends Error {
  constructor(message, findings = []) { super(message); this.name = "LedgerError"; this.findings = findings; }
}

/** A lane name may only ever address qa/issues.<lane>.jsonl: no separators, dots, drive letters, devices. */
export function validateLane(lane) {
  if (typeof lane !== "string" || !LANE_RE.test(lane) || RESERVED.test(lane)) {
    throw new LedgerError(`invalid lane name ${JSON.stringify(lane)}: need 1-40 chars of [A-Za-z0-9-], starting alphanumeric, not a reserved device name`);
  }
  return lane;
}

const qaDir = (root) => join(root, "qa");
export const laneFile = (root, lane) => join(qaDir(root), `issues.${validateLane(lane)}.jsonl`);

/** Union file list, canonical first then sorted shards (matches tracker-audit ledgerFiles). */
export function unionFiles(root) {
  const dir = qaDir(root);
  let names;
  try { names = readdirSync(dir); } catch (err) { if (err?.code === "ENOENT") return []; throw err; }
  const shards = names.filter((f) => /^issues\..+\.jsonl$/.test(f) && f !== "issues.jsonl").sort();
  return [...(names.includes("issues.jsonl") ? ["issues.jsonl"] : []), ...shards].map((f) => ({
    name: f, path: join(dir, f), lane: f === "issues.jsonl" ? null : f.slice(7, -6),
  }));
}

/** Read the whole union strictly. Never throws on bad content: returns findings for the caller to refuse on. */
export function readUnion(root) {
  const rows = [], findings = [], first = new Map();
  for (const file of unionFiles(root)) {
    const text = readFileSync(file.path, "utf8");
    text.split("\n").forEach((raw, i) => {
      const loc = `${file.name}:${i + 1}`, line = raw.replace(/\r$/, "");
      if (!line.trim()) return;
      let row;
      try { row = JSON.parse(line); } catch (e) { findings.push({ kind: "bad-json", loc, detail: e.message }); return; }
      if (row === null || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || !row.id.trim()) {
        findings.push({ kind: "no-id", loc, detail: "row has no non-empty string id" }); return;
      }
      if (!READ_ID_RE.test(row.id)) {
        findings.push({ kind: "wrong-form", loc, id: row.id, detail: `id ${JSON.stringify(row.id)} does not match ${READ_ID_RE}` });
      }
      if (first.has(row.id)) {
        findings.push({ kind: "duplicate", loc, id: row.id, other: first.get(row.id), detail: `id ${row.id} at ${first.get(row.id)} and ${loc}` });
      } else first.set(row.id, loc);
      rows.push({ id: row.id, feature: row.feature, file: file.name, loc, row });
    });
  }
  return { rows, findings };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function refuseIfUnclean({ findings }) {
  if (!findings.length) return;
  const shown = findings.slice(0, 10).map((f) => `  ${f.kind} ${f.loc}: ${f.detail}`).join("\n");
  throw new LedgerError(`ledger is not clean (${findings.length} finding(s)); refusing to allocate. Nothing was changed.\n${shown}`, findings);
}

const pad = (n) => String(n).padStart(3, "0");

/**
 * Next id for the lane (or the main tree) from an already-read, clean union. Also proves it is unused union-wide.
 * Only ids EXACTLY `ISS-<digits>` (main) or `ISS-<LANE>-<digits>` (lane) move the counter, wherever the row lives:
 * a lane's rows merged into the main file still count for that lane, and `ISS-360-OBSFLAKE` is not a plain 360.
 */
export function nextIdFrom(union, lane = null) {
  const re = lane === null ? /^ISS-(\d+)$/ : new RegExp(`^ISS-${escapeRe(validateLane(lane).toUpperCase())}-(\\d+)$`);
  let max = 0;
  for (const r of union.rows) {
    const m = re.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = lane === null ? `ISS-${max + 1}` : `ISS-${lane.toUpperCase()}-${pad(max + 1)}`;
  const taken = union.rows.find((r) => r.id === id);
  if (taken) throw new LedgerError(`candidate id ${id} is already used at ${taken.loc}; refusing`);
  return id;
}

/** ADVISORY preview only (C1: an id handed to a caller to write later does not satisfy allocation). */
export function nextId(root, lane = null) {
  if (lane !== null) validateLane(lane);
  const union = readUnion(root);
  refuseIfUnclean(union);
  return nextIdFrom(union, lane);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const DEFAULT_LOCK_WAIT_MS = 8000;
const lockWaitMs = () => { const n = Number(process.env.LEDGER_LOCK_WAIT_MS); return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOCK_WAIT_MS; };

/**
 * Exclusive lock via `wx`. Hard overall deadline `waitMs` (option, else env LEDGER_LOCK_WAIT_MS, else 8000).
 * EEXIST = held by someone else: retry until the deadline. EACCES/EPERM/EBUSY with the lock file present is the
 * same thing seen mid-delete on Windows, so it retries too; with NO lock file it means "cannot create it" and, like
 * ENOENT/EROFS/anything else, fails immediately with the code. A stale lock is REPORTED, never stolen; its age is
 * taken from the `at` timestamp inside it when that parses, else from the file's mtime.
 */
export function acquireLock(root, { waitMs = lockWaitMs(), staleMs = 30000 } = {}) {
  const path = join(qaDir(root), LOCK_NAME), start = Date.now();
  for (;;) {
    let code = null, openErr = null;
    try {
      const fd = openSync(path, "wx");
      try { writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); }
      finally { closeSync(fd); }
      return path;
    } catch (err) { openErr = err; code = err?.code ?? "UNKNOWN"; if (code !== "EEXIST" && !["EACCES", "EPERM", "EBUSY"].includes(code)) throw lockFail(path, err, code); }
    let mtime, held = "";
    try { mtime = statSync(path).mtimeMs; } catch (err) {
      if (code === "EEXIST" && Date.now() - start < waitMs) continue; // released between open and stat: retry, bounded
      if (code === "EEXIST") throw new LedgerError(`ledger lock ${path} still contended after ${waitMs}ms; retry later`);
      throw lockFail(path, openErr, code);
    }
    try { held = readFileSync(path, "utf8"); } catch { /* unreadable: report without content */ }
    let at = NaN; try { at = Date.parse(JSON.parse(held).at); } catch { /* fall back to mtime */ }
    const age = Date.now() - (Number.isFinite(at) ? at : mtime);
    if (age > staleMs) throw new LedgerError(`stale ledger lock ${path} (age ${Math.round(age / 1000)}s > ${staleMs / 1000}s, content ${held || "unreadable"}). NOT stealing it: confirm the holder is dead, delete the file by hand, then retry.`);
    if (Date.now() - start >= waitMs) throw new LedgerError(`ledger lock ${path} still held by someone else after ${waitMs}ms (age ${Math.round(age / 1000)}s, content ${held || "unreadable"}); retry later or raise LEDGER_LOCK_WAIT_MS`);
    sleep(10 + Math.floor(Math.random() * 25));
  }
}

function lockFail(path, err, code) {
  return new LedgerError(`cannot create ledger lock ${path}: ${code} (${err?.message ?? err}). This is not contention; fix the directory permissions or path. Nothing was changed.`);
}

export function releaseLock(path) { try { unlinkSync(path); } catch (err) { if (err?.code !== "ENOENT") throw err; } }

/** Required fields (the contract excludes row schema, so this is the shape existing rows already share). */
export function validateRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) throw new LedgerError("row must be a JSON object");
  if ("id" in row) throw new LedgerError("row must not carry an id: the allocator assigns it");
  for (const k of ["feature", "title", "evidence"]) {
    if (typeof row[k] !== "string" || !row[k].trim()) throw new LedgerError(`row field '${k}' must be a non-empty string`);
  }
  if (!SEVERITIES.includes(row.severity)) throw new LedgerError(`row field 'severity' must be one of ${SEVERITIES.join("/")}`);
}

/**
 * Allocate AND append in one operation (C1). Under the lock: read the union, refuse if unclean, pick the id,
 * re-read the union (C2) and abort if the id got taken, then write exactly one line in a single append call.
 */
export function appendRow(root, lane, rowIn, { today = new Date().toISOString().slice(0, 10), lockOpts, afterAllocate } = {}) {
  validateRow(rowIn);
  if (lane !== null) validateLane(lane);
  const target = lane === null ? join(qaDir(root), "issues.jsonl") : laneFile(root, lane);
  const lock = acquireLock(root, lockOpts);
  try {
    const before = readUnion(root);
    refuseIfUnclean(before);
    const id = nextIdFrom(before, lane);
    afterAllocate?.(id); // test seam: lets a test play the competing writer inside the window C2 must close
    const again = readUnion(root);
    refuseIfUnclean(again);
    if (again.rows.some((r) => r.id === id)) throw new LedgerError(`id ${id} was taken between check and write; aborting, retry`);
    const row = { id, date: today, ...rowIn, status: rowIn.status ?? "open" };
    const eol = detectEol(target, root);
    let existing = "";
    try { existing = readFileSync(target, "utf8"); } catch (err) { if (err?.code !== "ENOENT") throw err; }
    const lead = existing && !existing.endsWith("\n") ? eol : "";
    appendFileSync(target, lead + JSON.stringify(row) + eol, { flag: "a" });
    const line = (existing ? existing.split("\n").length - (existing.endsWith("\n") ? 1 : 0) : 0) + 1;
    return { id, file: target, line };
  } finally { releaseLock(lock); }
}

/** Keep the file's own line ending; a new shard borrows the main ledger's. */
function detectEol(target, root) {
  for (const p of [target, join(qaDir(root), "issues.jsonl")]) {
    try { const t = readFileSync(p, "utf8"); if (t.includes("\n")) return t.includes("\r\n") ? "\r\n" : "\n"; } catch { /* try next */ }
  }
  return "\n";
}

/**
 * C3: ids on `ISSUES-WRITTEN:` lines of qa/verdicts/** and qa/manifests/** must resolve to a row of the citing unit.
 * A unit's filed rows carry the FEATURE it concerned, which is often not the unit's own slug, so "feature != slug" alone
 * is mostly noise (measured: 240 of 266 citations on the real tree). A citation is reported when it is unresolved, or when
 * the row's feature IS another known unit's slug (a verdict/manifest of that name exists): the webinar-bot-live defect shape.
 * Citations whose feature names no known unit are counted as `unattributed`, not flagged.
 */
export function citationCheck(root) {
  const union = readUnion(root), byId = new Map(union.rows.map((r) => [r.id, r]));
  const out = { checked: 0, cited: 0, unattributed: 0, mismatches: [] }, units = new Set();
  for (const d of ["verdicts", "manifests"]) for (const f of walkMd(join(qaDir(root), d))) units.add(f.name.replace(/.md$/, ""));
  for (const dirName of ["verdicts", "manifests"]) {
    for (const file of walkMd(join(qaDir(root), dirName))) {
      const unit = file.name.replace(/\.md$/, "");
      const text = readFileSync(file.path, "utf8");
      out.checked++;
      for (const line of text.split("\n").filter((l) => /^\s*(\*\*)?ISSUES-WRITTEN/i.test(l))) {
        for (const id of line.match(/\bISS-(?:[A-Z0-9]+-)*\d+\b/g) ?? []) {
          out.cited++;
          const row = byId.get(id);
          if (!row) out.mismatches.push({ file: `${dirName}/${file.name}`, id, unit, reason: "unresolved" });
          else if (row.feature === unit) continue;
          else if (units.has(row.feature)) out.mismatches.push({ file: `${dirName}/${file.name}`, id, unit, reason: "belongs-to-other-unit", feature: row.feature });
          else out.unattributed++;
        }
      }
    }
  }
  return { ...out, ledgerFindings: union.findings };
}

function walkMd(dir) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch (err) { if (err?.code === "ENOENT") return []; throw err; }
  return ents.flatMap((e) => e.isDirectory() ? walkMd(join(dir, e.name)) : e.name.endsWith(".md") ? [{ name: e.name, path: join(dir, e.name) }] : []);
}
