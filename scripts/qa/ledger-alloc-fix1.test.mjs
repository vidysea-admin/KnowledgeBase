// Fix cycle 1 tests: reading vs allocating grammar, numbering with qualified/merged ids, lock deadline and errors.
// Everything runs against TEMP copies; the real qa/ is only READ.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCK_NAME, LedgerError, READ_ID_RE, acquireLock, appendRow, nextId, readUnion } from "./ledger-alloc.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, "ledger-alloc-cli.mjs");
const REAL_ROOT = resolve(HERE, "..", "..");
const REAL_QA = join(REAL_ROOT, "qa");
const mk = (id, feature = "f") => JSON.stringify({ id, severity: "low", feature, title: "t", evidence: "e", status: "open" });
const goodRow = () => ({ severity: "medium", feature: "x", title: "t", evidence: "e" });
function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "ledger-alloc1-"));
  mkdirSync(join(root, "qa"));
  for (const [n, lines] of Object.entries(files)) writeFileSync(join(root, "qa", n), lines.map((l) => l + "\n").join(""));
  return root;
}
const done = (root) => rmSync(root, { recursive: true, force: true });

test("reader: EVERY id in the real union (read-only) is accepted, with zero findings, wherever it lives", () => {
  const u = readUnion(REAL_ROOT);
  assert.ok(u.rows.length > 400, "real ledger loaded");
  assert.deepEqual(u.rows.filter((r) => !READ_ID_RE.test(r.id)).map((r) => r.id), []);
  assert.deepEqual(u.findings, []);
  const main = u.rows.filter((r) => r.file === "issues.jsonl").map((r) => r.id);
  for (const id of ["ISS-C-CLAIMS-TARGETING-001", "ISS-C-TOPICREFS-ARG-001", "ISS-360-OBSFLAKE", "ISS-360-HEARTBEAT"]) assert.ok(main.includes(id), id);
});

test("reader: refusals still refuse (grammar, duplicate, non-string id, bad json, BOM, partial last line)", () => {
  for (const bad of ["iss-1", "ISS-a", "ISS-", "ISS--1", "ISS-1-", "ISS-1--2", "ISS- 1", "1", "ISS_1", "XISS-1", " ISS-1", "ISS-1 ", "ISS-é", ""]) {
    const root = fixture({ "issues.jsonl": [mk("ISS-1"), JSON.stringify({ id: bad, feature: "f" })] });
    try {
      assert.ok(readUnion(root).findings.length >= 1, JSON.stringify(bad));
      assert.throws(() => nextId(root), LedgerError, JSON.stringify(bad));
    } finally { done(root); }
  }
  const root = fixture({ "issues.jsonl": [mk("ISS-360-OBSFLAKE"), mk("ISS-360-OBSFLAKE")] });
  try { assert.ok(readUnion(root).findings.some((f) => f.kind === "duplicate")); assert.throws(() => nextId(root), LedgerError); } finally { done(root); }
  const root2 = fixture({ "issues.jsonl": [mk("ISS-1"), JSON.stringify({ id: 7 }), JSON.stringify({ title: "x" }), "{oops"] });
  try { assert.deepEqual(readUnion(root2).findings.map((f) => f.kind).sort(), ["bad-json", "no-id", "no-id"]); } finally { done(root2); }
  const root3 = fixture({ "issues.jsonl": [mk("ISS-1")] });
  writeFileSync(join(root3, "qa", "issues.jsonl"), "﻿" + mk("ISS-1") + "\n");
  try { assert.ok(readUnion(root3).findings.length >= 1, "BOM refused"); } finally { done(root3); }
  const root4 = fixture({ "issues.jsonl": [mk("ISS-1")] });
  writeFileSync(join(root4, "qa", "issues.jsonl"), mk("ISS-1") + "\n" + mk("ISS-2").slice(0, 20));
  try { assert.ok(readUnion(root4).findings.some((f) => f.kind === "bad-json"), "partial last line refused"); } finally { done(root4); }
});

test("numbering: qualified ids neither push nor block the plain counter; allocated ids are always strict", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-358"), mk("ISS-359"), mk("ISS-360"), mk("ISS-360-OBSFLAKE"), mk("ISS-360-HEARTBEAT"), mk("ISS-999-X")] });
  try {
    assert.equal(nextId(root), "ISS-361");
    const r = appendRow(root, null, goodRow());
    assert.equal(r.id, "ISS-361"); assert.match(r.id, /^ISS-\d+$/);
    assert.equal(appendRow(root, "new-lane", goodRow()).id, "ISS-NEW-LANE-001");
  } finally { done(root); }
  const only = fixture({ "issues.jsonl": [mk("ISS-360-OBSFLAKE")] });
  try { assert.equal(nextId(only), "ISS-1"); } finally { done(only); }
});

test("numbering: a lane whose earlier ids live in the MAIN file continues after them, never reissues", () => {
  const root = fixture({
    "issues.jsonl": [mk("ISS-1"), mk("ISS-C-CLAIMS-TARGETING-001"), mk("ISS-C-CLAIMS-TARGETING-002"), mk("ISS-C-CLAIMS-TARGETING-EXTRA")],
    "issues.c-claims-targeting.jsonl": [mk("ISS-C-CLAIMS-TARGETING-003")],
    "issues.c.jsonl": [mk("ISS-C-001")],
  });
  try {
    assert.equal(nextId(root, "c-claims-targeting"), "ISS-C-CLAIMS-TARGETING-004");
    assert.equal(nextId(root, "c"), "ISS-C-002", "lane C is a different namespace from C-CLAIMS-TARGETING");
    assert.equal(nextId(root), "ISS-2");
  } finally { done(root); }
  const mainOnly = fixture({ "issues.jsonl": [mk("ISS-C-TOPICREFS-ARG-001")] });
  try {
    assert.equal(nextId(mainOnly, "c-topicrefs-arg"), "ISS-C-TOPICREFS-ARG-002");
    assert.equal(appendRow(mainOnly, "c-topicrefs-arg", goodRow()).id, "ISS-C-TOPICREFS-ARG-002");
    assert.equal(readUnion(mainOnly).findings.length, 0);
  } finally { done(mainOnly); }
});

test("real ledger: an append on a temp COPY of every real ledger file works and stays clean; real files untouched", () => {
  const root = fixture();
  for (const f of readdirSync(REAL_QA).filter((n) => /^issues(\..+)?\.jsonl$/.test(n))) copyFileSync(join(REAL_QA, f), join(root, "qa", f));
  try {
    const before = readUnion(root);
    assert.deepEqual(before.findings, []);
    const r = appendRow(root, null, goodRow());
    assert.match(r.id, /^ISS-\d+$/);
    assert.equal(before.rows.some((x) => x.id === r.id), false);
    assert.deepEqual(readUnion(root).findings, []);
  } finally { done(root); }
});

test("lock: cannot-create (missing qa dir, ENOENT) fails IMMEDIATELY naming the code, never spins", () => {
  const root = mkdtempSync(join(tmpdir(), "ledger-alloc1-")); // no qa/ at all
  try {
    const t = Date.now();
    assert.throws(() => acquireLock(root, { waitMs: 5000 }), /cannot create ledger lock.*ENOENT.*not contention/s);
    assert.ok(Date.now() - t < 1000, "immediate, not after the wait");
  } finally { done(root); }
});

test("lock: ISS-ALLOC-004 reproduction (unwritable qa dir via icacls deny) -> exit 1 inside the bound, code named, no spin", { skip: process.platform !== "win32" }, () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  const row = join(root, "row.json"); writeFileSync(row, JSON.stringify(goodRow()));
  const qa = join(root, "qa"), user = process.env.USERNAME;
  const acl = spawnSync("icacls", [qa, "/deny", `${user}:(WD,AD)`], { encoding: "utf8" });
  try {
    assert.equal(acl.status, 0, acl.stdout + acl.stderr);
    const t = Date.now();
    const r = spawnSync(process.execPath, [CLI, "append", "--main", "--row", row, "--root", root], { encoding: "utf8", timeout: 20000 });
    console.log(`ISS-ALLOC-004 replay: exit=${r.status} in ${Date.now() - t}ms stderr=${r.stderr.trim().slice(0, 160)}`);
    assert.equal(r.status, 1); assert.ok(Date.now() - t < 8000);
    assert.match(r.stderr, /cannot create ledger lock.*(EPERM|EACCES)/s);
    assert.ok(!existsSync(join(qa, LOCK_NAME)));
  } finally { spawnSync("icacls", [qa, "/remove:d", user]); done(root); }
});

test("lock: held by someone else (EEXIST) -> bounded wait, message says so; LEDGER_LOCK_WAIT_MS sets the wait", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    acquireLock(root);
    const t = Date.now();
    assert.throws(() => acquireLock(root, { waitMs: 200 }), /still held by someone else after 200ms/);
    assert.ok(Date.now() - t < 2000);
    const code = `import { acquireLock } from ${JSON.stringify("file:///" + join(HERE, "ledger-alloc.mjs").replace(/\\/g, "/"))};try{acquireLock(${JSON.stringify(root)})}catch(e){console.log(e.message)}`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, LEDGER_LOCK_WAIT_MS: "300" }, encoding: "utf8", timeout: 20000 });
    assert.match(r.stdout, /after 300ms/);
  } finally { done(root); }
});

test("lock: staleness uses the timestamp INSIDE the lock, falls back to mtime when unparseable; stale is never stolen", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  const lock = join(root, "qa", LOCK_NAME);
  try {
    writeFileSync(lock, JSON.stringify({ pid: 1, at: "2026-01-01T00:00:00Z" })); // mtime is NOW, inner stamp is old
    assert.throws(() => acquireLock(root), /stale ledger lock/);
    writeFileSync(lock, JSON.stringify({ pid: 1, at: new Date().toISOString() }));
    assert.throws(() => acquireLock(root, { waitMs: 100 }), /still held by someone else/);
    writeFileSync(lock, "not json"); // falls back to mtime (fresh)
    assert.throws(() => acquireLock(root, { waitMs: 100 }), /still held by someone else/);
    assert.ok(existsSync(lock), "never stolen");
  } finally { done(root); }
});
