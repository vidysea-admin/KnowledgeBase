/**
 * scripts/qa/join-rules-single-writer.test.ts — T-037 unit `t037next-single-writer`.
 * Contract t037-join-rules-api-host criterion 9 ("Single writer: no other code writes the rule files") and the T-037 switch-over
 * exit condition: the scheduler tick (enforceJoinRules) is a READER of `<stateDir>/join-rules/<tenant>.json`; the only mutators
 * are the store's locked helpers, reached in production only through scripts/webinar/join-rules-host.ts. Fakes/temp dirs only.
 * Run from the repo root: node --test --import tsx scripts/qa/join-rules-single-writer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadTrustedSenderConfig, selectAutoRecordItems, type AutoRecordCandidateInput } from "../../packages/meeting-bot/src/calendar/auto-join.js";
import { enforceJoinRules } from "../../packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.js";
import { joinRulesFilePath, saveJoinRules } from "../../packages/meeting-bot/src/calendar/join-rules/join-rules-store.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const STORE = "packages/meeting-bot/src/calendar/join-rules/join-rules-store.ts";
const MUTATORS = ["saveJoinRules", "saveJoinRulesIf", "recordTenantApproval", "recordTenantOptOut", "recordTenantUnOptOut"];
/** Production files allowed to NAME a store mutator (code, comments stripped). The store defines them; the host binds them. */
const MAY_MUTATE = new Set([STORE, "scripts/webinar/join-rules-host.ts"]);
/** The scheduler/enforcement path: must stay read-only. */
const READ_ONLY_PATH = ["packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts", "packages/meeting-bot/src/calendar/schedule-tick.ts",
  "packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts"];
const WRITE_API = /\b(writeFileSync|writeFile|appendFileSync|appendFile|renameSync|rename|copyFileSync|copyFile|unlinkSync|unlink|rmSync|rm|openSync|createWriteStream|truncateSync|ftruncateSync)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "generated"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.|\.d\.ts$|\.spec\./.test(e.name)) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const PROD = ["apps", "packages", "scripts"].flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({ file: rel(p), code: stripComments(readFileSync(p, "utf8")) }));

test("static: only the store and the host name a join-rules mutator in code", () => {
  assert.ok(PROD.length > 200, "scan found the production tree");
  assert.ok(PROD.some((f) => f.file === STORE), "store is in the scan");
  const offenders = PROD.filter((f) => !MAY_MUTATE.has(f.file) && MUTATORS.some((m) => new RegExp(`\\b${m}\\b`).test(f.code))).map((f) => f.file);
  assert.deepEqual(offenders, []);
  assert.ok(PROD.find((f) => f.file === "scripts/webinar/join-rules-host.ts")!.code.includes("recordTenantOptOut"), "the host really binds the mutators (scan is not vacuous)");
});

test("static: the scheduler/enforcement path imports only the read side of the store and has no write API", () => {
  for (const f of READ_ONLY_PATH) {
    const hit = PROD.find((p) => p.file === f);
    assert.ok(hit, `${f} exists`);
    assert.doesNotMatch(hit.code, WRITE_API, `${f} must not call a filesystem write API`);
    assert.doesNotMatch(hit.code, /join-rules-store-lock|acquireLock/, `${f} must not take the writer lock`);
    for (const m of MUTATORS) assert.doesNotMatch(hit.code, new RegExp(`\\b${m}\\b`), `${f} must not name ${m}`);
  }
  const enforce = PROD.find((p) => p.file === READ_ONLY_PATH[0])!.code;
  assert.match(enforce, /import \{ loadJoinRules, JoinRulesStoreError, type StoredJoinRules \} from "\.\/join-rules-store\.js"/);
});

test("static: no production file other than the store, its lock modules and the host both addresses the join-rules directory and writes", () => {
  const allowed = (f: string) => f === STORE || /^packages\/meeting-bot\/src\/calendar\/join-rules\/join-rules-store-lock[\w-]*\.ts$/.test(f) || f === "scripts/webinar/join-rules-host.ts";
  const offenders = PROD.filter((f) => !allowed(f.file) && /["'`]join-rules["'`]/.test(f.code) && WRITE_API.test(f.code)).map((f) => f.file);
  assert.deepEqual(offenders, []);
});

// ---------- behavioural: the tick never changes the join-rules directory ----------
const A = "ten-a";
const ZOOM = "https://zoom.us/j/123456789?pwd=a";
const cand = (id: string): AutoRecordCandidateInput => ({ id, title: `Webinar: ${id}`, senderEmail: "o@x.com", senderDomain: "x.com", senderAuthenticated: true,
  status: "approved", meetingUrl: ZOOM, startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", kind: "upcoming" });
const selection = () => selectAutoRecordItems({ calendarEvents: [], candidates: [cand("g1"), { ...cand("g2"), meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: "2026-10-10T12:00:00Z", endTime: "2026-10-10T13:00:00Z" }], now: "2026-10-10T09:56:00Z", leadMinutes: 240,
  trustedSenders: loadTrustedSenderConfig(), alreadyScheduled: new Set<string>(), everyWebinar: true });

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const go = (d: string) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) go(p); else out[path.relative(root, p)] = createHash("sha1").update(readFileSync(p)).digest("hex") + ":" + statSync(p).mtimeMs; } };
  go(root); return out;
}
const withRoot = async (fn: (root: string) => Promise<void>) => {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-single-writer-"));
  try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
};
const cfg = (root: string, mode: "fail-closed" | "fail-open", logs: string[]) => ({ mode, tenantId: A, stateDir: root, keyTenantId: A, log: (m: string) => { logs.push(m); },
  io: { wait: async () => {} } });

for (const mode of ["fail-closed", "fail-open"] as const) {
  test(`behaviour (${mode}): enforcing over a valid file, a corrupt file and an absent file writes nothing and creates nothing`, async () => {
    await withRoot(async (root) => {
      // absent: the join-rules directory must not even be created by a read
      await enforceJoinRules(selection(), cfg(root, mode, []));
      assert.ok(!existsSync(path.join(root, "join-rules")), "a read of an absent file creates no directory");
      // valid file with an opt-out: the opted-out item is removed and the bytes/mtime are untouched
      saveJoinRules(root, A, { ruleSet: { version: 1, ownDomains: [], rules: [{ id: "r1", effect: "allow", match: { domain: "x.com" } }] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: ["g1"] } });
      let before = snapshot(root);
      const out = await enforceJoinRules(selection(), cfg(root, mode, []));
      assert.deepEqual(out.toSchedule.map((i) => i.sourceId), ["g2"], "the opt-out was applied (the test reads real rules)");
      assert.deepEqual(snapshot(root), before, "valid file: directory byte- and mtime-identical, no lock/tmp file");
      // corrupt file: never repaired, never replaced, never locked
      writeFileSync(joinRulesFilePath(root, A), "{ not json");
      before = snapshot(root);
      await enforceJoinRules(selection(), cfg(root, mode, []));
      assert.deepEqual(snapshot(root), before, "corrupt file: left exactly as found");
    });
  });
}

// ---------- behavioural, multi-process: concurrent writers + a reading tick ----------
const STORE_URL = pathToFileURL(path.join(ROOT, STORE)).href;
const WORKER = `const [, url, dir, tenant, id, n] = process.argv; const s = await import(url);
for (let j = 0; j < Number(n); j++) s.recordTenantOptOut(dir, tenant, id + "-ev-" + j, { lockWaitMs: 20000 });`;
const runWorker = (dir: string, id: string, n: number) => new Promise<{ code: number | null; err: string }>((resolve) => {
  const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, STORE_URL, dir, A, id, String(n)], { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => { err += d; }); p.on("exit", (code) => resolve({ code, err }));
});

test("multi-process: 2 locked writers + a reading tick: every opt-out kept, the tick never sees a partial file, the tick leaves no lock", async () => {
  await withRoot(async (root) => {
    mkdirSync(root, { recursive: true });
    const N = 15;
    const writers = [runWorker(root, "w1", N), runWorker(root, "w2", N)];
    let done = false; void Promise.all(writers).then(() => { done = true; });
    const logs: string[] = []; let ticks = 0;
    while (!done) { await enforceJoinRules(selection(), cfg(root, "fail-closed", logs)); ticks++; await new Promise((r) => setTimeout(r, 5)); }
    const results = await Promise.all(writers);
    assert.deepEqual(results.map((r) => r.code), [0, 0], results.map((r) => r.err).join("|"));
    assert.deepEqual(logs.filter((l) => /corrupt|invalid|too-large/.test(l)), [], "the reader never saw a partial/corrupt file (ticks: " + ticks + ")");
    const stored = JSON.parse(readFileSync(joinRulesFilePath(root, A), "utf8"));
    assert.equal(stored.state.optedOutEventIds.length, 2 * N, "no lost update between the two writers");
    assert.deepEqual(readdirSync(path.join(root, "join-rules")).filter((f) => f !== `${A}.json`), [], "no lock/tmp file left behind");
  });
});
