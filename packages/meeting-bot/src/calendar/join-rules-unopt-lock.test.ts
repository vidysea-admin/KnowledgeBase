/** packages/meeting-bot/src/calendar/join-rules-unopt-lock.test.ts — unit `iss-unopt-001-cross-process-lost-update`. Temp dirs only; REAL node processes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  loadJoinRules, saveJoinRules, recordTenantApproval, recordTenantOptOut, recordTenantUnOptOut, joinRulesFilePath, JoinRulesStoreError,
} from "./join-rules-store.js";
import { evaluateJoinRules } from "./join-rules.js";
import { removeOptOutEntries } from "./join-rules-optout.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_URL = pathToFileURL(path.join(HERE, "join-rules-store.ts")).href;
const LEDGER = path.join(HERE, "..", "..", "..", "..", "qa", "issues.unopt.jsonl");
const withDir = async (fn: (dir: string) => void | Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "join-rules-unopt-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const RULES = { version: 1 as const, ownDomains: [], rules: [{ id: "r-allow", effect: "allow" as const, match: { domain: "x.com" } }] };
const seed = (dir: string, optedOutEventIds: string[]) => saveJoinRules(dir, "acme", { ruleSet: RULES, state: { approvedSenders: ["s@x.com"], approvedDomains: [], optedOutEventIds } });
const locked = (e: unknown) => e instanceof JoinRulesStoreError && e.code === "locked";
const files = (dir: string) => readdirSync(path.join(dir, "join-rules")).sort();
const ev = (id: string) => ({ id, organizer: "s@x.com", meetingUrl: "https://meet.google.com/abc-defg-hij" });
const decide = (dir: string, id: string) => { const l = loadJoinRules(dir, "acme"); return evaluateJoinRules(ev(id), l.ruleSet, l.state).action; };

// D-015: ISS-UNOPT-001 as recorded in qa/issues.unopt.jsonl: "a second writer process could lose an approval/opt-out made between the load and the save."
test("ISS-UNOPT-001 replay: an approval / an opt-out made between the un-opt's load and its write is never lost (4 recorded checks)", async () => withDir(async dir => {
  const row = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-UNOPT-001");
  assert.match(row.evidence, /could lose an approval\/opt-out made between the load and the save/, "the recorded reproduction text is still in the ledger row");
  let ok = 0;
  // Control: the OLD adapter shape (load outside the lock, save under it) with the other writer landing in the window DOES lose the change.
  seed(dir, ["cal1"]);
  const cur = loadJoinRules(dir, "acme"); recordTenantApproval(dir, "acme", { kind: "sender", value: "late@x.com" });
  saveJoinRules(dir, "acme", { ruleSet: cur.ruleSet, state: removeOptOutEntries(cur.state, "cal1").state });
  assert.ok(!loadJoinRules(dir, "acme").state.approvedSenders.includes("late@x.com"), "control: the old shape loses the approval");
  // 1+2 and 3+4: approval and opt-out attempted INSIDE the new un-opt's critical section (afterRead runs between its load and its write).
  for (const [kind, attempt] of [
    ["approval", () => recordTenantApproval(dir, "acme", { kind: "sender", value: "late@x.com" }, { lockWaitMs: 50 })],
    ["opt-out", () => recordTenantOptOut(dir, "acme", "late-ev", { lockWaitMs: 50 })],
  ] as const) {
    seed(dir, ["cal1"]);
    let refused = false;
    recordTenantUnOptOut(dir, "acme", "cal1", { afterRead: () => { try { attempt(); } catch (e) { refused = locked(e); } } });
    const s = loadJoinRules(dir, "acme").state;
    const unchanged = kind === "approval" ? !s.approvedSenders.includes("late@x.com") : !s.optedOutEventIds.includes("late-ev");
    if (refused && unchanged && !s.optedOutEventIds.includes("cal1")) ok++;          // concurrent writer got typed `locked`, wrote nothing
    attempt();                                                                       // the retry after the un-opt commits is applied, un-opt kept
    const t = loadJoinRules(dir, "acme").state;
    if ((kind === "approval" ? t.approvedSenders.includes("late@x.com") : t.optedOutEventIds.includes("late-ev")) && !t.optedOutEventIds.includes("cal1")) ok++;
  }
  console.log(`ISS-UNOPT-001: ${ok}/4`); assert.equal(ok, 4);
  assert.deepEqual(files(dir), ["acme.json"]);
}));

test("busy: a live foreign lock -> typed `locked`, nothing written, the opt-out still vetoes the meeting (fails toward NOT joining)", async () => withDir(async dir => {
  seed(dir, ["cal1"]); const f = joinRulesFilePath(dir, "acme"), before = readFileSync(f);
  writeFileSync(f.replace(/\.json$/, ".lock"), JSON.stringify({ token: "someone-else", pid: process.pid, at: new Date().toISOString() }));
  assert.throws(() => recordTenantUnOptOut(dir, "acme", "cal1", { lockWaitMs: 60 }), locked);
  assert.ok(readFileSync(f).equals(before), "store bytes unchanged");
  assert.notEqual(decide(dir, "cal1"), "join", "still opted out");
  assert.deepEqual(files(dir), ["acme.json", "acme.lock"], "no temp file, and the foreign lock is not removed");
}));

test("no-op un-opt writes nothing; a failed rename keeps the opt-out; a corrupt store blocks the write and stays byte-identical", async () => withDir(async dir => {
  seed(dir, ["cal1"]); const f = joinRulesFilePath(dir, "acme");
  const boom = (() => { throw new Error("no rename expected"); }) as never;
  const r = recordTenantUnOptOut(dir, "acme", "nobody", { rename: boom });
  assert.equal(r.removedEventId, false); assert.deepEqual(r.removedMeetings, []);
  const failing = (() => { const e: NodeJS.ErrnoException = new Error("disk"); e.code = "EIO"; throw e; }) as never;
  assert.throws(() => recordTenantUnOptOut(dir, "acme", "cal1", { rename: failing }), (e: unknown) => e instanceof JoinRulesStoreError && e.code === "write-failed");
  assert.notEqual(decide(dir, "cal1"), "join");
  writeFileSync(f, "{not json"); const bad = readFileSync(f);
  assert.throws(() => recordTenantUnOptOut(dir, "acme", "cal1"), (e: unknown) => e instanceof JoinRulesStoreError && e.code === "corrupt");
  assert.ok(readFileSync(f).equals(bad));
  assert.deepEqual(files(dir), ["acme.json"], "no lock or temp file left");
}));

// Worker: n rounds of (approve, opt out, and on even rounds un-opt that same opt-out). lockWaitMs 60 s; any error is reported.
const WORKER = `
const [storeUrl, dir, id, n, startAt] = process.argv.slice(1);
const s = await import(storeUrl);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (Date.now() < Number(startAt)) sleep(1);
const opts = { lockWaitMs: 60000, afterRead: () => sleep(Math.random() * 6) };
const errors = [];
for (let j = 0; j < Number(n); j++) {
  try {
    s.recordTenantApproval(dir, "acme", { kind: "sender", value: id + "n" + j + "@x.com" }, opts);
    s.recordTenantOptOut(dir, "acme", id + "-ev-" + j, opts);
    if (j % 2 === 0) { const r = s.recordTenantUnOptOut(dir, "acme", id + "-ev-" + j, opts); if (!r.removedEventId) errors.push("unopt removed nothing " + j); }
  } catch (e) { errors.push((e.code || "?") + ":" + e.message); }
}
console.log(JSON.stringify({ errors }));`;
const runWorker = (dir: string, id: string, n: number, startAt: number) => new Promise<{ errors: string[]; exit: number | null }>(resolve => {
  const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, STORE_URL, dir, id, String(n), String(startAt)], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
  p.on("close", exit => { try { resolve({ ...JSON.parse(out.trim().split("\n").pop()!), exit }); } catch { resolve({ errors: [`worker died: ${err.slice(0, 300)}`], exit }); } });
});

test("3 real processes x 6 rounds of approve / opt-out / un-opt on one tenant: every acknowledged change is present, none resurrected or lost", async () => withDir(async dir => {
  seed(dir, []); mkdirSync(path.join(dir, "join-rules"), { recursive: true });
  const startAt = Date.now() + 2500, W = 3, N = 6;
  const res = await Promise.all(Array.from({ length: W }, (_, i) => runWorker(dir, `w${i}`, N, startAt)));
  assert.deepEqual(res.flatMap(r => r.errors), []); assert.ok(res.every(r => r.exit === 0));
  const s = loadJoinRules(dir, "acme").state;
  for (let i = 0; i < W; i++) for (let j = 0; j < N; j++) {
    assert.ok(s.approvedSenders.includes(`w${i}n${j}@x.com`), `approval w${i}n${j} lost`);
    assert.equal(s.optedOutEventIds.includes(`w${i}-ev-${j}`), j % 2 === 1, `opt-out w${i}-ev-${j}: ${j % 2 === 1 ? "lost" : "resurrected / un-opt lost"}`);
  }
  assert.equal(s.approvedSenders.length, 1 + W * N); assert.equal(s.optedOutEventIds.length, W * (N / 2));
  assert.deepEqual(files(dir), ["acme.json"], "no lock or temp file left behind");
}));

test("a lock taken over mid-operation: the un-opt throws `locked` before the rename and writes nothing", async () => withDir(async dir => {
  seed(dir, ["cal1"]); const f = joinRulesFilePath(dir, "acme"), before = readFileSync(f), lock = f.replace(/\.json$/, ".lock");
  assert.throws(() => recordTenantUnOptOut(dir, "acme", "cal1", { afterRead: () => writeFileSync(lock, JSON.stringify({ token: "thief", pid: process.pid, at: new Date().toISOString() })) }), locked);
  assert.ok(readFileSync(f).equals(before), "store bytes unchanged");
  assert.notEqual(decide(dir, "cal1"), "join");
  rmSync(lock, { force: true }); assert.deepEqual(files(dir), ["acme.json"]);
}));
