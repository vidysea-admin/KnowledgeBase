/**
 * scripts/webinar/join-rules-host.test.ts — T-037 `t037-join-rules-api-host`. The REAL createServer (auth,
 * rate limit, router) with `createJoinRulesDeps` over a temp state dir; other deps are fakes.
 * Run: node --test --import tsx scripts/webinar/join-rules-host.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import { joinRulesFilePath, loadJoinRules } from "../../packages/meeting-bot/src/calendar/join-rules-store.js";
import { applyJoinRules } from "../../packages/meeting-bot/src/calendar/join-rules-select.js";
import { acquireHostLock, BOOT_JITTER_MS, createJoinRulesDeps, currentBootTimeMs, HOST_PID_FILE, prepareStateDir, resolveStateDir } from "./join-rules-host.js";

const KEYS: Record<string, { tenantId: string; scopes: string[] }> = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
  "noscope-key": { tenantId: "tenant-a", scopes: ["calendar"] },
};
const RULES = { version: 1, ownDomains: ["own.example"], rules: [{ id: "r1", effect: "allow", match: { domain: "Trusted.Example" } }] };
const P = "/calendar/join-rules";
type Call = (method: string, p: string, key: string, body?: unknown) => Promise<{ status: number; json: any }>;

async function serve(dir: string) {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: createJoinRulesDeps({ stateDir: dir }) }));
  const call: Call = async (method, p, key, body) => {
    const res = await fetch(`${server.baseUrl}${p}`, {
      method, headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => undefined) };
  };
  return { call, close: server.close };
}
async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jr-host-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("GET is no longer 503; PUT/GET round trip; approvals and opt-outs persist and survive a restart", () => withDir(async dir => {
  let s = await serve(dir);
  try {
    const first = await s.call("GET", P, "a-key");
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    const put = await s.call("PUT", P, "a-key", RULES);
    assert.equal(put.status, 200);
    assert.equal(put.json.ruleSet.rules[0].match.domain, "trusted.example");
    assert.equal((await s.call("POST", `${P}/approvals`, "a-key", { kind: "sender", value: "Ann@X.example" })).status, 200);
    assert.equal((await s.call("POST", `${P}/opt-outs`, "a-key", { eventId: "ev1" })).status, 200);
  } finally { await s.close(); }
  const onDisk = JSON.parse(readFileSync(joinRulesFilePath(dir, "tenant-a"), "utf8"));
  assert.equal(onDisk.tenantId, "tenant-a");
  assert.deepEqual(onDisk.state, { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: ["ev1"] });
  s = await serve(dir); // new server + new binder instance = restart
  try {
    const again = await s.call("GET", P, "a-key");
    assert.equal(again.json.ruleSet.rules[0].match.domain, "trusted.example");
    assert.deepEqual(again.json.state, onDisk.state);
  } finally { await s.close(); }
}));

test("two tenants are isolated on disk; without the join-rules scope writes are 403 (reads stay calendar-scoped) and nothing is written", () => withDir(async dir => {
  const s = await serve(dir);
  try {
    assert.equal((await s.call("PUT", P, "a-key", RULES)).status, 200);
    assert.equal((await s.call("POST", `${P}/approvals`, "b-key", { kind: "domain", value: "b-only.example" })).status, 200);
    assert.deepEqual((await s.call("GET", P, "b-key")).json.ruleSet.rules, []);
    assert.deepEqual((await s.call("GET", P, "a-key")).json.state.approvedDomains, []);
    const before = readFileSync(joinRulesFilePath(dir, "tenant-a"));
    for (const [m, p, b] of [["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${P}/opt-outs`, { eventId: "e" }]] as const)
      assert.equal((await s.call(m, p, "noscope-key", b)).status, 403, `${m} ${p}`);
    assert.equal((await s.call("GET", P, "noscope-key")).status, 200);
    assert.equal((await s.call("GET", P, "no-such-key")).status, 401);
    assert.ok(readFileSync(joinRulesFilePath(dir, "tenant-a")).equals(before));
  } finally { await s.close(); }
}));

test("a corrupt stored file answers 500 (store error passes through) and the bytes are unchanged", () => withDir(async dir => {
  const s = await serve(dir);
  try {
    const file = joinRulesFilePath(dir, "tenant-a");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{ this is not json");
    const before = readFileSync(file);
    for (const [m, p, b] of [["GET", P, undefined], ["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${P}/opt-outs`, { eventId: "e" }]] as const)
      assert.equal((await s.call(m, p, "a-key", b)).status, 500, `${m} ${p}`);
    assert.ok(readFileSync(file).equals(before));
    assert.deepEqual(readdirSync(path.dirname(file)).filter(f => f.endsWith(".tmp")), []);
  } finally { await s.close(); }
}));

test("state directory: resolves like the scheduler, is created, and refusals are clear", () => withDir(async dir => {
  const resolved = resolveStateDir();
  assert.ok(path.isAbsolute(resolved));
  assert.equal(path.relative(path.resolve(import.meta.dirname, "..", ".."), resolved), path.join("raw", "webinars"));
  assert.throws(() => resolveStateDir("not-a-file-url"), /cannot resolve the repository root/);
  const made = path.join(dir, "a", "b");
  assert.equal(prepareStateDir(made), made);
  assert.ok(existsSync(made));
  assert.throws(() => prepareStateDir("relative/dir"), /absolute/);
  assert.throws(() => prepareStateDir(""), /absolute/);
  const blocker = path.join(dir, "file");
  writeFileSync(blocker, "x");
  assert.throws(() => prepareStateDir(path.join(blocker, "sub")), /cannot be created or is not writable/);
  // writability check specifically (a mutation removing the access check must die): mkdir ok, access denied
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  assert.throws(() => prepareStateDir(path.join(dir, "ro"), { mkdir: () => {}, access: () => { throw denied; } }), /not writable \(EACCES\)/);
  assert.throws(() => prepareStateDir(path.join(dir, "ro2"), { mkdir: () => { throw denied; }, access: () => {} }), /cannot be created/);
}));

// ---------- single-host lock (ISS-T037HOST-001) ----------
const HOST_URL = pathToFileURL(path.join(import.meta.dirname, "join-rules-host.ts")).href;
const TOKEN = (c: string) => c.repeat(32);
const rec = (o: Partial<{ pid: number; token: string; startedAt: number; boot: number }> = {}) =>
  JSON.stringify({ pid: process.pid, token: TOKEN("a"), startedAt: Date.now(), boot: currentBootTimeMs(), ...o }) + "\n";
const lockFile = (dir: string) => path.join(dir, HOST_PID_FILE);
const logs = () => { const l: string[] = []; return { l, log: (m: string) => void l.push(m) }; };
function deadPid(): number {
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(r.stdout);
}
/** Child: waits until GO_AT, tries the lock, prints WON / HELD:<msg>, keeps the lock until stdin ends. */
function childScript(dir: string): string {
  const f = path.join(dir, "child.mjs");
  writeFileSync(f, `import { acquireHostLock } from ${JSON.stringify(HOST_URL)};
const [,, stateDir, goAt] = process.argv;
while (Date.now() < Number(goAt)) {}
let rel;
try { rel = acquireHostLock(stateDir); console.log("WON"); }
catch (e) { console.log("HELD:" + e.message); }
process.stdin.on("data", () => {}); process.stdin.on("end", () => { rel && rel(); process.exit(0); }); process.stdin.resume();
`);
  return f;
}
function runChild(script: string, stateDir: string, goAt = 0) {
  const proc = spawn(process.execPath, ["--import", "tsx", script, stateDir, String(goAt)], { stdio: ["pipe", "pipe", "inherit"], cwd: path.resolve(import.meta.dirname, "..", "..") });
  let onLine: (s: string) => void = () => {};
  const first = new Promise<string>(r => { onLine = r; });
  let buf = "";
  proc.stdout!.on("data", d => { buf += d; const m = /^(WON|HELD:[^\r\n]*)/m.exec(buf); if (m) onLine(m[1]!); });
  const closed = new Promise<void>(r => proc.on("close", () => r()));
  return { proc, first, closed, finish: async () => { proc.stdin!.end(); await closed; } };
}

test("ISS-T037HOST-001 replay: a pid file left by a process that no longer exists is taken over and the reason is logged", () => withDir(async dir => {
  const dead = deadPid();
  const old = new Date(Date.now() - 120_000);
  // the ledger's recorded repro "999999\n" (legacy bare pid, unparseable now -> abandoned by age), plus a bare dead pid and a full record of a dead pid
  const cases: Array<[string, boolean]> = [["999999\n", true], [`${dead}\n`, true], [rec({ pid: dead }), false]];
  let ok = 0;
  for (const [content, aged] of cases) {
    const f = lockFile(dir);
    writeFileSync(f, content);
    if (aged) utimesSync(f, old, old);
    const { l, log } = logs();
    const release = acquireHostLock(dir, process.pid, { log });
    assert.equal(l.length, 1);
    assert.match(l[0]!, /took over stale lock .*(pid is not running|abandoned partial write)/);
    assert.equal(JSON.parse(readFileSync(f, "utf8")).pid, process.pid);
    release();
    assert.ok(!existsSync(f));
    ok++;
  }
  console.log(`ISS-T037HOST-001: ${ok}/${cases.length}`);
  assert.equal(ok, cases.length);
}));

test("lock content, wx path, refusal names file and holder pid, release deletes only our own lock", () => withDir(async dir => {
  const f = lockFile(dir);
  const release = acquireHostLock(dir, 4242, { kill: () => {} });
  const r = JSON.parse(readFileSync(f, "utf8"));
  assert.deepEqual(Object.keys(r).sort(), ["boot", "pid", "startedAt", "token"]);
  assert.equal(r.pid, 4242);
  assert.match(r.token, /^[0-9a-f]{32}$/);
  assert.throws(() => acquireHostLock(dir, 1, { kill: () => {} }), (e: Error) => e.message.includes(f) && e.message.includes("pid 4242") && /held by another host/.test(e.message));
  assert.equal(JSON.parse(readFileSync(f, "utf8")).token, r.token, "owner's file untouched by the refused attempt");
  const foreign = rec({ pid: 77, token: TOKEN("b") });
  writeFileSync(f, foreign); // another host's lock: our release must not delete it
  release(); release();
  assert.equal(readFileSync(f, "utf8"), foreign);
  rmSync(f);
  acquireHostLock(dir, 7)();
  assert.ok(!existsSync(f));
}));

test("decision table: other boot taken over even with a live pid; same boot + live pid refused; EPERM/unknown = alive; garbage fresh refused, old taken over", () => withDir(async dir => {
  const f = lockFile(dir);
  writeFileSync(f, rec({ boot: currentBootTimeMs() - 10 * 60_000 })); // pid IS alive (ours): boot mismatch decides
  let { l, log } = logs();
  acquireHostLock(dir, process.pid, { log })();
  assert.match(l[0]!, /reboot detected/);
  writeFileSync(f, rec({ boot: currentBootTimeMs() - BOOT_JITTER_MS + 30_000 })); // inside the jitter allowance, live pid
  assert.throws(() => acquireHostLock(dir, 1), /held by another host/);
  writeFileSync(f, rec({ pid: deadPid() })); // current boot, dead pid
  ({ l, log } = logs());
  acquireHostLock(dir, process.pid, { log })();
  assert.match(l[0]!, /pid is not running/);
  for (const code of ["EPERM", "EWHATEVER"]) {
    const content = rec({ pid: 31337 });
    writeFileSync(f, content);
    assert.throws(() => acquireHostLock(dir, 1, { kill: () => { throw Object.assign(new Error("x"), { code }); } }), /held by another host \(pid 31337/);
    assert.equal(readFileSync(f, "utf8"), content);
  }
  for (const g of ["", "\n", "{\"pid\":12", "garbage", JSON.stringify({ pid: -1, token: "x" })]) {
    writeFileSync(f, g);
    assert.throws(() => acquireHostLock(dir, 1, { kill: () => { throw new Error("must not be consulted"); } }), /held by another host/, JSON.stringify(g));
    assert.equal(readFileSync(f, "utf8"), g);
    const old = new Date(Date.now() - 61_000);
    utimesSync(f, old, old);
    ({ l, log } = logs());
    acquireHostLock(dir, process.pid, { log })();
    assert.match(l[0]!, /abandoned partial write; old pid unknown/, JSON.stringify(g));
  }
  assert.deepEqual(readdirSync(dir), [], "no temp or mutex files left behind");
}));

test("a lock held by a LIVE child process is refused and stays intact; a lock left by a killed child is taken over", () => withDir(async dir => {
  const script = childScript(dir);
  const live = runChild(script, dir);
  try {
    assert.equal(await live.first, "WON");
    const before = readFileSync(lockFile(dir), "utf8");
    assert.equal(JSON.parse(before).pid, live.proc.pid);
    assert.throws(() => acquireHostLock(dir), (e: Error) => e.message.includes(lockFile(dir)) && e.message.includes(`pid ${live.proc.pid}`));
    assert.equal(readFileSync(lockFile(dir), "utf8"), before);
  } finally { await live.finish(); }
  assert.ok(!existsSync(lockFile(dir)), "child released on clean shutdown");
  const doomed = runChild(script, dir);
  assert.equal(await doomed.first, "WON");
  doomed.proc.kill();
  await doomed.closed;
  assert.ok(existsSync(lockFile(dir)), "a kill leaves the lock behind");
  const { l, log } = logs();
  acquireHostLock(dir, process.pid, { log })();
  assert.match(l[0]!, /pid is not running/);
}));

test("two real starters race for one stale lock: exactly one wins every round", () => withDir(async dir => {
  const script = childScript(dir);
  const winners: number[] = [];
  for (let round = 0; round < 4; round++) {
    writeFileSync(lockFile(dir), rec({ pid: deadPid() }));
    const goAt = Date.now() + 5000;
    const kids = [runChild(script, dir, goAt), runChild(script, dir, goAt)];
    try {
      const res = await Promise.all(kids.map(k => k.first));
      const won = res.filter(r => r === "WON").length;
      winners.push(won);
      assert.equal(won, 1, `round ${round}: ${JSON.stringify(res)}`);
      assert.ok(res.some(r => /held by another host/.test(r)), JSON.stringify(res));
      assert.equal(JSON.parse(readFileSync(lockFile(dir), "utf8")).pid, kids[res.indexOf("WON")]!.proc.pid, "file belongs to the winner");
    } finally { await Promise.all(kids.map(k => k.finish())); }
    assert.ok(!existsSync(lockFile(dir)) && !existsSync(`${lockFile(dir)}.takeover`));
  }
  console.log(`race rounds: ${winners.length}, winners per round: ${winners.join(",")}`);
}));

// ISS-T037W1-001 / ISS-T037OPT-004: the recorded scenario through production-shaped wiring (real router + real host adapter + real store).
test("ISS-T037OPT-004 end to end: a hinted opt-out via the real router and adapter stores the meeting identity; a sibling alone is vetoed opted-out", () => withDir(async dir => {
  const item = (sourceId: string, over: Record<string, unknown> = {}) => ({ sessionKey: `cal:${sourceId}`, source: "calendar", sourceId, title: sourceId,
    startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", meetingUrl: "https://zoom.us/j/123456789", sender: "a@x.com", ...over });
  const g1 = () => item("g1", { source: "gmail", sessionKey: "gmail:g1", meetingUrl: "https://zoom.us/j/123456789?pwd=zz" }) as never;
  const apply = (tenant: string) => { const l = loadJoinRules(dir, tenant); return applyJoinRules({ toSchedule: [g1()], skipped: [] }, l.ruleSet, { state: l.state }); };
  const s = await serve(dir);
  let hinted = 0; const total = 5;
  try {
    // hinted: the meeting URL of calX is forwarded; only the sibling g1 is later selected
    assert.equal((await s.call("POST", `${P}/opt-outs`, "a-key", { eventId: "calX", meetingUrl: "https://us02web.zoom.us/j/123456789?pwd=a" })).status, 200);
    const stored = JSON.parse(readFileSync(joinRulesFilePath(dir, "tenant-a"), "utf8")).state;
    if (JSON.stringify(stored.optedOutMeetings) === '["url:zoom:123456789"]') hinted++;
    const out = apply("tenant-a");
    if (out.toSchedule.length === 0) hinted++;
    if (out.skipped[0]?.reason === "opted-out" && out.skipped[0].sourceId === "g1") hinted++;
    // sessionKey hint likewise
    assert.equal((await s.call("POST", `${P}/opt-outs`, "a-key", { eventId: "calY", sessionKey: "gmail:g1" })).status, 200);
    if (loadJoinRules(dir, "tenant-a").state.optedOutMeetings?.includes("key:gmail:g1")) hinted++;
    // other tenant is untouched
    if (apply("tenant-b").toSchedule.length === 1) hinted++;
    // recorded id-only state (no hint) still lets the sibling through: open by design
    assert.equal((await s.call("POST", `${P}/opt-outs`, "b-key", { eventId: "calX" })).status, 200);
    assert.ok(!("optedOutMeetings" in loadJoinRules(dir, "tenant-b").state));
    const idOnly = apply("tenant-b").toSchedule.length;
    console.log(`ISS-T037OPT-004: ${hinted}/${total}; ISS-T037W1-001: ${hinted}/${total} hinted, ${idOnly === 0 ? 1 : 0}/1 id-only (open by design)`);
    assert.equal(idOnly, 1, "id-only opt-out still does not veto the sibling (needs a client that sends hints)");
    assert.equal(hinted, total);
  } finally { await s.close(); }
}));
