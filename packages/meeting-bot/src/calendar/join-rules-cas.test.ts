/** packages/meeting-bot/src/calendar/join-rules-cas.test.ts — unit `iss-unoptlock-002-join-rules-compare-and-set`. Temp dirs only; REAL node processes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  loadJoinRules, saveJoinRules, saveJoinRulesIf, loadJoinRulesWithValidator, joinRulesValidator, recordTenantOptOut, recordTenantApproval,
  joinRulesFilePath, JoinRulesStoreError, JOIN_RULES_ABSENT,
} from "./join-rules-store.js";
import { evaluateJoinRules, type JoinRuleSet } from "./join-rules.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_URL = pathToFileURL(path.join(HERE, "join-rules-store.ts")).href;
const LEDGER = path.join(HERE, "..", "..", "..", "..", "qa", "issues.unoptlock.jsonl");
const withDir = async (fn: (dir: string) => void | Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "join-rules-cas-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const RULES: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "x.com" } }] };
const RULES2: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "y.com" } }] };
const RULES3: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "z.com" } }] };
const emptyState = { approvedSenders: [] as string[], approvedDomains: [] as string[], optedOutEventIds: [] as string[] };
const seed = (dir: string, ruleSet = RULES, optedOutEventIds: string[] = [], tenant = "acme") =>
  saveJoinRules(dir, tenant, { ruleSet, state: { approvedSenders: ["s@x.com"], approvedDomains: [], optedOutEventIds } });
const code = (c: string) => (e: unknown) => e instanceof JoinRulesStoreError && e.code === c;
const files = (dir: string) => readdirSync(path.join(dir, "join-rules")).sort();
const ev = (id: string) => ({ id, organizer: "s@x.com", meetingUrl: "https://meet.google.com/abc-defg-hij" });
const decide = (dir: string, id: string) => { const l = loadJoinRules(dir, "acme"); return evaluateJoinRules(ev(id), l.ruleSet, l.state).action; };
const lockOf = (dir: string) => joinRulesFilePath(dir, "acme").replace(/\.json$/, ".lock");

// Worker: argv = STORE_URL dir mode a b startAt. Prints one JSON line.
const WORKER = `
const [url, dir, mode, a, b, startAt] = process.argv.slice(1);
const s = await import(url);
const out = {};
try {
  if (mode === "optout") { s.recordTenantOptOut(dir, "acme", a); out.ok = true; }
  else if (mode === "cas") {
    while (Date.now() < Number(startAt)) {}
    const r = s.saveJoinRulesIf(dir, "acme", a, JSON.parse(b)); out.ok = true; out.validator = r.validator;
  }
} catch (e) { out.ok = false; out.code = e.code; out.currentValidator = e.currentValidator; out.msg = String(e.message); }
console.log(JSON.stringify(out));
`;
function worker(dir: string, mode: string, a: string, b = "", startAt = 0): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, STORE_URL, dir, mode, a, b, String(startAt)], { stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = ""; p.stdout.on("data", d => o += d); p.stderr.on("data", d => e += d);
    p.on("close", c => { try { resolve(JSON.parse(o.trim().split("\n").pop()!)); } catch { reject(new Error(`worker exit ${c}: ${o} ${e}`)); } });
  });
}

test("ISS-UNOPTLOCK-002 replay (recorded reproduction, real second process): legacy save erases the opt-out; saveJoinRulesIf keeps it", async () => withDir(async dir => {
  const row = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-UNOPTLOCK-002");
  assert.match(row.evidence, /seed rules allow x\.com, state empty/); assert.match(row.evidence, /recordTenantOptOut\(cal1\)/);
  let ok = 0;
  // seed rules allow x.com, state empty
  saveJoinRules(dir, "acme", { ruleSet: RULES, state: { ...emptyState } });
  // control = the recorded sequence with the legacy call: existing = load; second process opts cal1 out; save(ruleSet, existing.state)
  let existing = loadJoinRulesWithValidator(dir, "acme");
  assert.equal((await worker(dir, "optout", "cal1")).ok, true);
  assert.deepEqual(loadJoinRules(dir, "acme").state.optedOutEventIds, ["cal1"]);
  saveJoinRules(dir, "acme", { ruleSet: RULES, state: existing.state });
  if (loadJoinRules(dir, "acme").state.optedOutEventIds.length === 0 && decide(dir, "cal1") === "join") ok++; // control reproduces the bug
  // the same sequence with the compare-and-set
  saveJoinRules(dir, "acme", { ruleSet: RULES, state: { ...emptyState } });
  existing = loadJoinRulesWithValidator(dir, "acme");
  assert.equal((await worker(dir, "optout", "cal1")).ok, true);
  const r = saveJoinRulesIf(dir, "acme", existing.validator, RULES2);   // the opt-out must NOT invalidate the validator
  if (JSON.stringify(loadJoinRules(dir, "acme").state.optedOutEventIds) === JSON.stringify(["cal1"])) ok++;
  if (decide(dir, "cal1") !== "join") ok++;
  if (JSON.stringify(loadJoinRules(dir, "acme").ruleSet) === JSON.stringify(RULES2) && r.state.optedOutEventIds[0] === "cal1") ok++;
  console.log(`ISS-UNOPTLOCK-002: ${ok}/4`); assert.equal(ok, 4);
  assert.deepEqual(files(dir), ["acme.json"]);
}));

test("two concurrent saveJoinRulesIf with the same validator from real processes: exactly one wins, the loser gets precondition-failed with the winner's validator", async () => {
  for (const start of ["seeded", "absent"]) await withDir(async dir => {
    let expected = JOIN_RULES_ABSENT;
    if (start === "seeded") { seed(dir); expected = loadJoinRulesWithValidator(dir, "acme").validator; }
    const at = Date.now() + 1500;
    const [a, b] = await Promise.all([worker(dir, "cas", expected, JSON.stringify(RULES2), at), worker(dir, "cas", expected, JSON.stringify(RULES3), at)]);
    const wins = [a, b].filter(r => r.ok), losses = [a, b].filter(r => !r.ok);
    assert.equal(wins.length, 1, JSON.stringify([a, b])); assert.equal(losses.length, 1);
    assert.equal(losses[0].code, "precondition-failed");
    assert.equal(losses[0].currentValidator, wins[0].validator);
    assert.equal(loadJoinRulesWithValidator(dir, "acme").validator, wins[0].validator);
    assert.deepEqual(files(dir), ["acme.json"], "no lock or temp debris");
  });
});

test("stale validator -> precondition-failed carrying the current validator, nothing written", () => withDir(dir => {
  seed(dir, RULES, ["cal1"]); const f = joinRulesFilePath(dir, "acme");
  const stale = loadJoinRulesWithValidator(dir, "acme").validator;
  saveJoinRulesIf(dir, "acme", stale, RULES2);
  const before = readFileSync(f), cur = loadJoinRulesWithValidator(dir, "acme").validator;
  assert.throws(() => saveJoinRulesIf(dir, "acme", stale, RULES3), (e: unknown) => code("precondition-failed")(e) && (e as JoinRulesStoreError).currentValidator === cur);
  assert.throws(() => saveJoinRulesIf(dir, "acme", "deadbeef", RULES3), code("precondition-failed"));
  assert.throws(() => saveJoinRulesIf(dir, "acme", JOIN_RULES_ABSENT, RULES3), code("precondition-failed"));
  assert.ok(readFileSync(f).equals(before)); assert.deepEqual(files(dir), ["acme.json"]);
  assert.notEqual(decide(dir, "cal1"), "join");
}));

test("absent: first creation succeeds only when nothing is stored; state starts empty", () => withDir(dir => {
  assert.equal(loadJoinRulesWithValidator(dir, "acme").validator, JOIN_RULES_ABSENT);
  const r = saveJoinRulesIf(dir, "acme", JOIN_RULES_ABSENT, RULES);
  assert.equal(r.validator, joinRulesValidator(RULES)); assert.deepEqual(loadJoinRules(dir, "acme").state, emptyState);
  assert.throws(() => saveJoinRulesIf(dir, "acme", JOIN_RULES_ABSENT, RULES2), code("precondition-failed"));
  assert.equal(loadJoinRulesWithValidator(dir, "acme").validator, joinRulesValidator(RULES));
  assert.throws(() => saveJoinRulesIf(dir, "acme", "", RULES2), code("invalid"));
}));

test("an opt-out / approval between an editor's load and save does not invalidate its validator and is preserved (stale caller copy never written)", () => withDir(dir => {
  seed(dir); const ed = loadJoinRulesWithValidator(dir, "acme");
  recordTenantOptOut(dir, "acme", "cal1"); recordTenantApproval(dir, "acme", { kind: "domain", value: "late.org" });
  assert.equal(loadJoinRulesWithValidator(dir, "acme").validator, ed.validator, "validator ignores state");
  saveJoinRulesIf(dir, "acme", ed.validator, RULES2);
  const s = loadJoinRules(dir, "acme").state;
  assert.deepEqual(s.optedOutEventIds, ["cal1"]); assert.deepEqual(s.approvedDomains, ["late.org"]); assert.deepEqual(s.approvedSenders, ["s@x.com"]);
  const ed2 = loadJoinRulesWithValidator(dir, "acme");
  assert.throws(() => saveJoinRulesIf(dir, "acme", ed2.validator, RULES3, { afterRead: () => { throw new Error("stop"); } }), /stop/);
  assert.deepEqual(loadJoinRules(dir, "acme").ruleSet, RULES2);
  assert.deepEqual(files(dir), ["acme.json"], "an error inside the critical section leaves no lock or temp file");
}));

test("canonicalisation: key order and formatting do not change the validator; content and rule order do", () => withDir(dir => {
  const a: JoinRuleSet = { version: 1, ownDomains: ["a.com"], rules: [{ id: "r1", effect: "allow", match: { domain: "x.com" } }, { id: "r2", effect: "deny", match: { domain: "y.com" } }] };
  const reordered = JSON.parse('{"rules":[{"match":{"domain":"x.com"},"effect":"allow","id":"r1"},{"match":{"domain":"y.com"},"id":"r2","effect":"deny"}],"ownDomains":["a.com"],"version":1}');
  assert.equal(joinRulesValidator(a), joinRulesValidator(reordered));
  assert.match(joinRulesValidator(a), /^[0-9a-f]{64}$/);
  assert.notEqual(joinRulesValidator(a), joinRulesValidator({ ...a, rules: [...a.rules].reverse() }));
  assert.notEqual(joinRulesValidator(a), joinRulesValidator({ ...a, ownDomains: ["b.com"] }));
  // a hand-reformatted stored file (different key order / whitespace on disk) yields the same validator
  seed(dir, a); const before = loadJoinRulesWithValidator(dir, "acme").validator; const f = joinRulesFilePath(dir, "acme");
  const o = JSON.parse(readFileSync(f, "utf8")); writeFileSync(f, JSON.stringify({ state: o.state, ruleSet: reordered, tenantId: o.tenantId, version: 1 }));
  assert.equal(loadJoinRulesWithValidator(dir, "acme").validator, before);
  assert.throws(() => joinRulesValidator({ version: 2 } as never), code("invalid"));
}));

test("tenant isolation: tenant A's validator is useless for tenant B", () => withDir(dir => {
  seed(dir, RULES, [], "acme"); seed(dir, RULES, ["cal9"], "beta");
  const a = loadJoinRulesWithValidator(dir, "acme").validator;
  saveJoinRulesIf(dir, "acme", a, RULES2);
  assert.throws(() => saveJoinRulesIf(dir, "beta", loadJoinRulesWithValidator(dir, "acme").validator, RULES3), code("precondition-failed"));
  assert.throws(() => saveJoinRulesIf(dir, "gamma", a, RULES3), code("precondition-failed"), "a stored tenant's validator does not create another tenant");
  assert.deepEqual(loadJoinRules(dir, "beta").ruleSet, RULES); assert.deepEqual(loadJoinRules(dir, "beta").state.optedOutEventIds, ["cal9"]);
  assert.throws(() => saveJoinRulesIf(dir, "../x", a, RULES), code("bad-tenant"));
}));

test("fail direction: held lock -> locked; failed rename; lock lost mid-write; corrupt file -> nothing written, opt-out stays", () => withDir(dir => {
  seed(dir, RULES, ["cal1"]); const f = joinRulesFilePath(dir, "acme"), v = loadJoinRulesWithValidator(dir, "acme").validator, before = readFileSync(f);
  writeFileSync(lockOf(dir), JSON.stringify({ token: "other", pid: process.pid, at: new Date().toISOString() }));
  assert.throws(() => saveJoinRulesIf(dir, "acme", v, RULES2, { lockWaitMs: 60 }), code("locked"));
  rmSync(lockOf(dir));
  const failing = (() => { const e: NodeJS.ErrnoException = new Error("disk"); e.code = "EIO"; throw e; }) as never;
  assert.throws(() => saveJoinRulesIf(dir, "acme", v, RULES2, { rename: failing }), code("write-failed"));
  assert.ok(readFileSync(f).equals(before)); assert.notEqual(decide(dir, "cal1"), "join");
  // lock replaced by another holder between the load and the pre-rename ownership check
  assert.throws(() => saveJoinRulesIf(dir, "acme", v, RULES2, {
    rename: (() => { throw new Error("must not rename"); }) as never,
    afterRead: () => writeFileSync(lockOf(dir), JSON.stringify({ token: "thief", pid: process.pid, at: new Date().toISOString() })),
  }), code("locked"));
  assert.ok(readFileSync(f).equals(before));
  rmSync(lockOf(dir), { force: true });
  writeFileSync(f, "{not json"); const bad = readFileSync(f);
  assert.throws(() => saveJoinRulesIf(dir, "acme", v, RULES2), code("corrupt"));
  assert.throws(() => saveJoinRulesIf(dir, "acme", JOIN_RULES_ABSENT, RULES2), code("corrupt"), "a corrupt file is never treated as absent");
  assert.ok(readFileSync(f).equals(bad)); assert.deepEqual(files(dir), ["acme.json"]);
}));
