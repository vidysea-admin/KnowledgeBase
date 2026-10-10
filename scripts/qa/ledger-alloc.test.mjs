// Tests for ledger-alloc.mjs against TEMP ledgers only; the real qa/ is never written.
// Criteria ids refer to qa/contracts/ledger-id-allocation.md.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCK_NAME, LedgerError, acquireLock, appendRow, citationCheck, nextId, readUnion, validateLane,
} from "./ledger-alloc.mjs";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "ledger-alloc-cli.mjs");
const mk = (id, feature = "f") => JSON.stringify({ id, severity: "low", feature, title: "t", evidence: "e", status: "open" });
const goodRow = (feature = "alloc-unit") => ({ severity: "medium", feature, title: "t", evidence: "e" });

function fixture(files = {}, eol = "\r\n") {
  const root = mkdtempSync(join(tmpdir(), "ledger-alloc-"));
  mkdirSync(join(root, "qa"));
  for (const [name, lines] of Object.entries(files)) writeFileSync(join(root, "qa", name), lines.map((l) => l + eol).join(""));
  return root;
}
const done = (root) => rmSync(root, { recursive: true, force: true });
const read = (root, name) => readFileSync(join(root, "qa", name), "utf8");
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8", timeout: 30000 });

test("C1 next ids: main = max+1, lane starts at 001 and is upper-cased, lane counts only its own prefix", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-9"), mk("ISS-12"), mk("ISS-10")], "issues.u2.jsonl": [mk("ISS-U2-007")] });
  try {
    assert.equal(nextId(root), "ISS-13");
    assert.equal(nextId(root, "alloc"), "ISS-ALLOC-001");
    assert.equal(nextId(root, "u2"), "ISS-U2-008");
  } finally { done(root); }
});

test("C1 allocation and append are one operation: appendRow returns the id it wrote, as the last line", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    const r = appendRow(root, null, goodRow());
    assert.equal(r.id, "ISS-2");
    const lines = read(root, "issues.jsonl").split("\r\n");
    assert.equal(JSON.parse(lines[1]).id, "ISS-2");
    assert.equal(r.line, 2);
    assert.equal(lines[2], "", "file keeps ending in its own EOL");
  } finally { done(root); }
});

test("existing rows are byte-identical after an append (C4/I1: no edit, no renumber)", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1"), mk("ISS-2")], "issues.u1.jsonl": [mk("ISS-U1-1")] });
  try {
    const before = [read(root, "issues.jsonl"), read(root, "issues.u1.jsonl")];
    appendRow(root, null, goodRow());
    appendRow(root, "u1", goodRow());
    assert.ok(read(root, "issues.jsonl").startsWith(before[0]));
    assert.ok(read(root, "issues.u1.jsonl").startsWith(before[1]));
    assert.equal(read(root, "issues.u1.jsonl").slice(before[1].length).split("\r\n").length, 2, "exactly one new line");
  } finally { done(root); }
});

test("EOL: LF stays LF, CRLF stays CRLF, file lacking a final newline does not join lines, new shard borrows main EOL", () => {
  const lf = fixture({ "issues.jsonl": [mk("ISS-1")] }, "\n");
  const noNl = fixture({ "issues.a.jsonl": [mk("ISS-A-001")] });
  const crlf = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    appendRow(lf, null, goodRow());
    assert.ok(!read(lf, "issues.jsonl").includes("\r"));
    writeFileSync(join(noNl, "qa", "issues.a.jsonl"), mk("ISS-A-001"));
    const r = appendRow(noNl, "a", goodRow());
    const lines = read(noNl, "issues.a.jsonl").split("\n").filter(Boolean);
    assert.equal(lines.length, 2); assert.equal(JSON.parse(lines[1]).id, r.id); assert.equal(r.line, 2);
    appendRow(crlf, "fresh", goodRow());
    assert.ok(read(crlf, "issues.fresh.jsonl").endsWith("\r\n"));
  } finally { done(lf); done(noNl); done(crlf); }
});

test("C1 union: a plain id living in a shard still counts for the main counter (never reused)", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-5")], "issues.x.jsonl": [mk("ISS-6")] });
  try { assert.equal(nextId(root), "ISS-7"); } finally { done(root); }
});

test("refusals: bad JSON, missing id, duplicate (both locations named), wrong form each refuse and change nothing", () => {
  const cases = {
    "bad-json": { "issues.jsonl": [mk("ISS-1"), "{not json"] },
    "no-id": { "issues.jsonl": [mk("ISS-1"), JSON.stringify({ title: "x" })] },
    "duplicate": { "issues.jsonl": [mk("ISS-1"), mk("ISS-2")], "issues.q.jsonl": [mk("ISS-Q-1"), mk("ISS-Q-1")] },
    "wrong-form": { "issues.jsonl": [mk("ISS-1"), mk("iss-3")] },
  };
  for (const [kind, files] of Object.entries(cases)) {
    const root = fixture(files);
    try {
      const snap = readdirSync(join(root, "qa")).map((f) => read(root, f));
      assert.throws(() => appendRow(root, "z", goodRow()), (e) => e instanceof LedgerError && e.findings.some((f) => f.kind === kind), kind);
      assert.throws(() => nextId(root), LedgerError, kind);
      const r = cli(root, "next-id");
      assert.equal(r.status, 1, kind); assert.match(r.stderr, /refusing/);
      assert.equal(cli(root, "verify").status, 1, kind);
      assert.deepEqual(readdirSync(join(root, "qa")).map((f) => read(root, f)), snap, `${kind}: nothing written`);
      assert.ok(!existsSync(join(root, "qa", LOCK_NAME)), `${kind}: lock released`);
    } finally { done(root); }
  }
});

test("C5 duplicate across main and shard names both rows with file:line; shard wrong-form refuses", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1"), mk("ISS-2")], "issues.k.jsonl": [mk("ISS-K-1"), mk("ISS-2")] });
  try {
    const u = readUnion(root);
    const dup = u.findings.find((f) => f.kind === "duplicate");
    assert.equal(dup.other, "issues.jsonl:2"); assert.equal(dup.loc, "issues.k.jsonl:2");
    const v = cli(root, "verify");
    assert.equal(v.status, 1); assert.match(v.stdout, /issues\.jsonl:2 and issues\.k\.jsonl:2/);
  } finally { done(root); }
});

test("blank line is tolerated (decision: matches readLedgerRows and the real issues.104cc.jsonl)", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1"), "", mk("ISS-2")] });
  try { assert.equal(nextId(root), "ISS-3"); assert.equal(cli(root, "verify").status, 0); } finally { done(root); }
});

test("lane validation: hostile names are rejected and no file outside qa/ is addressable", () => {
  const hostile = ["..", ".", "a/b", "a\\b", "C:x", "nul", "NUL", "con", "com1", "lpt9", "a.", "a.b", "a b", "", " ", "-a", "x".repeat(41), "a\0b", "../x", "ünï", null, undefined, 7];
  for (const name of hostile) assert.throws(() => validateLane(name), LedgerError, JSON.stringify(name));
  for (const name of ["alloc", "t057-b8-knowledge-explorer", "U2FIX", "a035913", "x".repeat(40)]) assert.equal(validateLane(name), name);
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    for (const name of ["..", "a/b", "nul"]) {
      assert.throws(() => appendRow(root, name, goodRow()), LedgerError);
      assert.equal(cli(root, "next-id", "--lane", name).status, 1);
    }
    assert.deepEqual(readdirSync(join(root, "qa")), ["issues.jsonl"]);
  } finally { done(root); }
});

test("row validation: missing fields, bad severity, caller-supplied id all refuse; nothing is written", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    const before = read(root, "issues.jsonl");
    for (const bad of [{}, { ...goodRow(), id: "ISS-99" }, { ...goodRow(), severity: "urgent" }, { ...goodRow(), title: "" }, { ...goodRow(), feature: 3 }, [], null]) {
      assert.throws(() => appendRow(root, null, bad), LedgerError);
    }
    assert.equal(read(root, "issues.jsonl"), before);
  } finally { done(root); }
});

test("C2 re-verification: a writer that takes the held id inside the window makes the append ABORT, never overwrite", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    const bypass = (id) => writeFileSync(join(root, "qa", "issues.jsonl"), read(root, "issues.jsonl") + mk(id, "intruder") + "\r\n");
    assert.throws(() => appendRow(root, null, goodRow(), { afterAllocate: bypass }), /taken between check and write/);
    const ids = read(root, "issues.jsonl").split("\r\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(ids.map((r) => r.id), ["ISS-1", "ISS-2"]);
    assert.equal(ids[1].feature, "intruder", "the intruder's row is untouched");
    assert.ok(!existsSync(join(root, "qa", LOCK_NAME)), "lock released on abort");
    assert.equal(appendRow(root, null, goodRow()).id, "ISS-3", "retry succeeds with a fresh id");
  } finally { done(root); }
});

test("concurrency: 6 real processes append 5 rows each (main + two lanes) -> all ids distinct, all lines intact", async () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")], "issues.l1.jsonl": [mk("ISS-L1-001")] });
  const rowFile = join(root, "row.json");
  writeFileSync(rowFile, JSON.stringify(goodRow("conc")));
  const plan = [[], [], [], ["--lane", "l1"], ["--lane", "l1"], ["--lane", "l2"]];
  try {
    const runs = plan.map((laneArgs) => new Promise((res, rej) => {
      const script = `import { appendRow } from ${JSON.stringify("file:///" + join(dirname(CLI), "ledger-alloc.mjs").replace(/\\/g, "/"))};
        const lane = ${JSON.stringify(laneArgs[1] ?? null)}; const ids = [];
        for (let i = 0; i < 5; i++) ids.push(appendRow(${JSON.stringify(root)}, lane, ${JSON.stringify(goodRow("conc"))}).id);
        console.log(JSON.stringify(ids));`;
      const p = spawn(process.execPath, ["--input-type=module", "-e", script]);
      let out = "", err = "";
      p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`child exit ${code}: ${err}`))));
    }));
    const ids = (await Promise.all(runs)).flat();
    assert.equal(ids.length, 30); assert.equal(new Set(ids).size, 30, "returned ids all distinct");
    const u = readUnion(root);
    assert.deepEqual(u.findings, [], "union still clean: no duplicate, no torn line");
    assert.equal(u.rows.length, 2 + 30);
    const main = ids.filter((i) => /^ISS-\d+$/.test(i)).map((i) => Number(i.slice(4))).sort((a, b) => a - b);
    assert.deepEqual(main, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], "no gaps, no repeats");
    assert.ok(!existsSync(join(root, "qa", LOCK_NAME)), "lock released");
    const viaCli = cli(root, "append", "--lane", "l2", "--row", rowFile);
    assert.equal(viaCli.status, 0); assert.match(viaCli.stdout, /^ISS-L2-006 /);
  } finally { done(root); }
});

test("lock: a pre-existing stale lock is REPORTED with its content and left in place, never stolen", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  const lock = join(root, "qa", LOCK_NAME);
  try {
    writeFileSync(lock, JSON.stringify({ pid: 424242, at: "2026-01-01T00:00:00Z" }));
    const old = new Date(Date.now() - 3600_000); utimesSync(lock, old, old);
    assert.throws(() => appendRow(root, null, goodRow()), /stale ledger lock.*424242.*NOT stealing/s);
    assert.ok(existsSync(lock), "still there");
    const r = cli(root, "append", "--main", "--row", join(root, "none.json"));
    assert.equal(r.status, 1);
    writeFileSync(join(root, "row.json"), JSON.stringify(goodRow()));
    const r2 = cli(root, "append", "--main", "--row", join(root, "row.json"));
    assert.equal(r2.status, 1); assert.match(r2.stderr, /stale ledger lock/);
    assert.equal(read(root, "issues.jsonl").split("\r\n").filter(Boolean).length, 1, "nothing appended");
  } finally { done(root); }
});

test("lock: a fresh lock held by someone else times out with a clear message and is not removed", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-1")] });
  try {
    const held = acquireLock(root);
    assert.throws(() => acquireLock(root, { waitMs: 150 }), /still held by someone else after 150ms/);
    assert.ok(existsSync(held));
  } finally { done(root); }
});

test("C3/I3 citation check reports a deliberately mis-cited fixture and passes the correct one", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-289", "speaker-resolution-llm"), mk("ISS-291", "webinar-bot-live")] });
  mkdirSync(join(root, "qa", "verdicts")); mkdirSync(join(root, "qa", "manifests"));
  writeFileSync(join(root, "qa", "verdicts", "speaker-resolution-llm.md"), "ISSUES-WRITTEN: none\n");
  writeFileSync(join(root, "qa", "verdicts", "webinar-bot-live.md"), "ISSUES-WRITTEN: ISS-289, ISS-291, ISS-999\n");
  writeFileSync(join(root, "qa", "manifests", "clean.md"), "ISSUES-WRITTEN: none\n");
  try {
    const r = citationCheck(root);
    assert.deepEqual(r.mismatches.map((m) => `${m.id}:${m.reason}`).sort(), ["ISS-289:belongs-to-other-unit", "ISS-999:unresolved"]);
    assert.equal(cli(root, "cite-check").status, 1);
    writeFileSync(join(root, "qa", "verdicts", "webinar-bot-live.md"), "ISSUES-WRITTEN: ISS-291\n");
    assert.equal(cli(root, "cite-check").status, 0, "the detector can also pass");
  } finally { done(root); }
});

test("D-015 ISS-298 recorded reproduction replay (ids 289/290/291/292 of 2026-09-24): ISS-298: 5/5", () => {
  const root = fixture({ "issues.jsonl": [mk("ISS-288", "x"), mk("ISS-289", "speaker-resolution-llm"), mk("ISS-290", "speaker-resolution-llm"), mk("ISS-291", "webinar-bot-live"), mk("ISS-292", "brain-knowledge-graph")] });
  mkdirSync(join(root, "qa", "verdicts"));
  for (const u of ["speaker-resolution-llm", "brain-knowledge-graph"]) writeFileSync(join(root, "qa", "verdicts", `${u}.md`), "ISSUES-WRITTEN: none\n");
  writeFileSync(join(root, "qa", "verdicts", "webinar-bot-live.md"), "ISSUES-WRITTEN: ISS-289, ISS-290, ISS-291, ISS-292\n");
  try {
    const flagged = new Set(citationCheck(root).mismatches.map((m) => m.id));
    const results = [flagged.has("ISS-289"), flagged.has("ISS-290"), !flagged.has("ISS-291"), flagged.has("ISS-292")];
    // the read/append window: two sessions both saw max=292; sequential-with-lock allocation hands out distinct ids
    results.push(new Set([appendRow(root, null, goodRow()).id, appendRow(root, null, goodRow()).id]).size === 2);
    const n = results.filter(Boolean).length;
    console.log(`ISS-298: ${n}/${results.length}`);
    assert.equal(n, 5);
  } finally { done(root); }
});
