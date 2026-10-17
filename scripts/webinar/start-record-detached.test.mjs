/**
 * scripts/webinar/start-record-detached.test.mjs — ISS-323 regression suite (D-015: the cases below
 * are the ledger row's OWN recorded reproductions, not a corpus authored here).
 *
 * ISS-323 recorded three failures from the live Ashoka 2026-09-27 run:
 *   (a) `Start-Process -FilePath pnpm` resolved the pnpm *sh* shim → "%1 is not a valid Win32
 *       application", yielding an empty pid;
 *   (b) it still printed "started detached record: pid " and exited 0, so nothing upstream retried;
 *   (c) a .cmd shim re-parsed argv through cmd.exe, splitting the unquoted `&` in the Zoom join URL
 *       ("uuid is not recognized", cli usage error).
 * The row's fix_direction also asks for a "regression test with a URL containing & and spaces".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The launcher under test is a Windows PowerShell script (Start-Process semantics, `powershell` binary): it cannot run on Linux/macOS.
const WIN_ONLY = { skip: process.platform !== "win32" ? "start-record-detached.ps1 is Windows PowerShell; Windows-only launcher" : false };

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "start-record-detached.ps1");
const FIXTURE = join(HERE, "argv-dump-fixture.mjs");
const REPO_ROOT = resolve(HERE, "..", "..");
const LOG_DIR = join(REPO_ROOT, "raw", "webinars");

// The live URL from the ISS-323/324 evidence: two `&`-joined query params. `&` is what cmd.exe split.
const ZOOM_URL = "https://zoom.us/w/95194691654?tk=Lt5khBfbeLT61z_jaofbd-xbhWcftaqR3RLQM9MwJ-o.DQkAAAAWKgu4Rg&uuid=WN_VcZ9eEeERoyN_ZUPkej3Aw";
const TITLE = "Ashoka Educator Dialogues 2026-09-27"; // spaces, per the row's fix_direction

function logsBefore() {
  return existsSync(LOG_DIR) ? new Set(readdirSync(LOG_DIR)) : new Set();
}

// The fixture child keeps its log open for ~8s on Windows, so rmSync can hit EPERM/EBUSY. Bounded
// retry (up to ~20s) in the test cleanup only; rmSync's own maxRetries does not cover this case.
function rmWithRetry(p) {
  for (let i = 0; ; i++) {
    try { rmSync(p, { force: true }); return; } catch (e) {
      if (i >= 40 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

function cleanupNewLogs(before) {
  if (!existsSync(LOG_DIR)) return;
  for (const f of readdirSync(LOG_DIR)) {
    if (before.has(f) || !/^record-\d{4}-\d{2}-\d{2}_/.test(f)) continue;
    const p = join(LOG_DIR, f);
    if (statSync(p).isFile()) rmWithRetry(p);
  }
}

function runLauncher({ env = {}, extraArgs = [], livenessSeconds = 1, title = TITLE } = {}) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT,
    "-Url", ZOOM_URL, "-Until", "23:59", "-Title", title,
    "-CliEntry", FIXTURE, "-LivenessSeconds", String(livenessSeconds), ...extraArgs];
  try {
    const stdout = execFileSync("powershell", args, {
      encoding: "utf8", env: { ...process.env, ...env }, timeout: 120_000,
    });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("scheduled -Job cannot bypass checked identity with direct overrides or a replacement CLI", WIN_ONLY, () => {
  for (const override of [["-Url", ZOOM_URL], ["-Until", "23:59"], ["-SessionId", "replacement"],
    ["-ExtraArgs", "--tenant foreign"], ["-CliEntry", FIXTURE]]) {
    const dir = mkdtempSync(join(tmpdir(), "lkb-job-refusal-")), dump = join(dir, "argv.json");
    try {
      let status = 0;
      try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT,
        "-Job", "unavailable-safe-key", ...override], {encoding:"utf8", env:{...process.env,LKB_ARGV_DUMP:dump},timeout:30000}); }
      catch (error) { status = error.status ?? -1; assert.match(`${error.stdout ?? ""}${error.stderr ?? ""}`.replace(/\s+/g, " "), /scheduled dispatch refuses replacement recording arguments/); }
      assert.notEqual(status, 0); assert.equal(existsSync(dump), false);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test("ISS-ALERTTENANT-001: actual PowerShell -Job path refuses untagged/foreign saved jobs through current checked module", {...WIN_ONLY,timeout:120000}, () => {
  const cache = join(REPO_ROOT,".cache"); mkdirSync(cache,{recursive:true});
  const helper = pathToFileURL(join(REPO_ROOT,"packages/meeting-bot/src/calendar/scheduled-dispatch.ts")).href;
  for(const tenantId of [undefined,"foreign-tenant"]){
    const root = mkdtempSync(join(cache,"t037-dispatch-"));
    try {
      const scripts = join(root,"scripts/webinar"), cliDir=join(root,"packages/meeting-bot/src"),stateDir=join(root,"raw/webinars");
      mkdirSync(scripts,{recursive:true});mkdirSync(cliDir,{recursive:true});mkdirSync(join(stateDir,"scheduled"),{recursive:true});
      writeFileSync(join(root,"package.json"),'{"type":"module"}');
      writeFileSync(join(scripts,"start-record-detached.ps1"),readFileSync(SCRIPT));
      const marker=join(root,"capture-called.json"),sessionId="session-one";
      const key=`${sessionId}-${createHash("sha256").update(sessionId).digest("hex").slice(0,10)}`;
      const policy={source:"calendar",sourceId:"event-one",sessionKey:sessionId,sender:"organizer@example.com",
        meetingUrl:"https://meeting.zoho.com/join?key=123",startTime:"2026-10-15T12:00:00Z",endTime:"2026-10-15T13:00:00Z"};
      const file=join(stateDir,"scheduled",`${key}.json`);
      writeFileSync(file,JSON.stringify({tenantId,url:policy.meetingUrl,until:policy.endTime,title:"Webinar",sessionId,dispatchPolicyV1:policy}));
      const before=readFileSync(file);
      writeFileSync(join(cliDir,"cli.ts"),`import {runScheduledDispatch} from ${JSON.stringify(helper)};\nimport {writeFileSync} from 'node:fs';\nawait runScheduledDispatch(process.argv.slice(3), {stateDir:${JSON.stringify(stateDir)},tenantId:'dispatch-tenant',mode:'fail-closed',loadKeyTenant:async()=> 'dispatch-tenant',now:()=> '2026-10-15T12:00:00Z',log:()=>{},record:async args=>{writeFileSync(${JSON.stringify(marker)},JSON.stringify(args));},io:{load:()=>({ruleSet:{version:1,ownDomains:[],rules:[]},state:{approvedSenders:[],approvedDomains:[],optedOutEventIds:[]}})}});\n`);
      let status=0;
      try {execFileSync("powershell",["-NoProfile","-ExecutionPolicy","Bypass","-File",join(scripts,"start-record-detached.ps1"),"-Job",key,"-LivenessSeconds","30"],{encoding:"utf8",timeout:45000});}
      catch(error){status=error.status??-1;}
      const logs=readdirSync(stateDir).filter(name=>name.endsWith(".err.log")).map(name=>readFileSync(join(stateDir,name),"utf8")).join("\n");
      assert.notEqual(status,0);assert.match(logs,/Scheduled dispatch refused: authorization unavailable/);
      assert.equal(existsSync(marker),false);assert.deepEqual(readFileSync(file),before);
    } finally {assert.ok(resolve(root).startsWith(resolve(cache)+"\\"));rmSync(root,{recursive:true,force:true});}
  }
});

test("ISS-323(c): the Zoom join URL's `&` and a title with spaces reach the recorder argv intact", WIN_ONLY, () => {
  const before = logsBefore();
  const dir = mkdtempSync(join(tmpdir(), "lkb-argv-"));
  const dump = join(dir, "argv.json");
  try {
    const { status, stdout } = runLauncher({ env: { LKB_ARGV_DUMP: dump } });
    assert.equal(status, 0, `launcher should succeed; got:\n${stdout}`);
    assert.ok(existsSync(dump), `recorder was never launched (no argv dump). Output:\n${stdout}`);
    const argv = JSON.parse(readFileSync(dump, "utf8"));

    assert.deepEqual(argv.slice(0, 2), ["record", ZOOM_URL],
      "the URL must arrive as ONE argument with both query params — cmd.exe used to split it at `&`");
    assert.ok(argv.includes("&uuid=WN_VcZ9eEeERoyN_ZUPkej3Aw") === false,
      "`&uuid=...` must not appear as its own argument (that was the 'uuid is not recognized' failure)");
    assert.equal(argv[argv.indexOf("--title") + 1], TITLE,
      "a title containing spaces must arrive as a single argument");
    assert.equal(argv[argv.indexOf("--until") + 1], "23:59");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanupNewLogs(before);
  }
});

test("ISS-323(a,b): a recorder that dies immediately makes the launcher exit non-zero and never claim success", WIN_ONLY, () => {
  const before = logsBefore();
  try {
    // 6s window: `node --import tsx` needs ~2s to start before it can exit, so a 1s window would
    // find the child "still alive" and wrongly pass the launch.
    const { status, stdout } = runLauncher({ env: { LKB_FIXTURE_EXIT: "1" }, livenessSeconds: 6 });
    assert.notEqual(status, 0,
      "the pre-fix script exited 0 on a launch that never happened, so nothing upstream retried");
    assert.doesNotMatch(stdout, /started detached record: pid\s*$/m,
      "must never print a success line with an empty pid");
    assert.match(stdout, /launch FAILED/, "the failure must be stated, not silent");
  } finally {
    cleanupNewLogs(before);
  }
});

test("ISS-323: the happy path still reports a real pid and exits 0", WIN_ONLY, () => {
  const before = logsBefore();
  const dir = mkdtempSync(join(tmpdir(), "lkb-argv-ok-"));
  try {
    const { status, stdout } = runLauncher({ env: { LKB_ARGV_DUMP: join(dir, "a.json") } });
    assert.equal(status, 0, `expected success; got:\n${stdout}`);
    assert.match(stdout, /started detached record: pid \d+/, "a live launch must report a real pid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanupNewLogs(before);
  }
});

// Found by the fresh-context senior review of c8cbbf4, reproduced standalone before this test
// existed: the first quoting pass wrapped each argument and escaped only `"`, so an argument ending
// in a backslash emitted `...\"` — the backslash escaped our own closing quote, the argument stayed
// open, and every argument after it was swallowed into it. The review's repro lost `--until 12:30`
// entirely. Same silent-argv-corruption class as ISS-323 itself, and reachable: the title is
// partly email/candidate-sourced free text (see the ISS-317 note in
// packages/meeting-bot/src/calendar/task-scheduler.ts), so a pasted path fragment ending in `\`
// is ordinary input. Not in the ISS-323 ledger row, so it is an ADDITION to that corpus, never a
// substitution for it (D-015).
test("review finding: a title ending in a backslash (and one holding a quote) must not swallow the arguments after it", WIN_ONLY, () => {
  const before = logsBefore();
  const dir = mkdtempSync(join(tmpdir(), "lkb-argv-bs-"));
  const dump = join(dir, "argv.json");
  const nasty = 'Ashoka \"Educator\" Dialogues C:\\share\\';
  try {
    const { status, stdout } = runLauncher({ env: { LKB_ARGV_DUMP: dump }, title: nasty });
    assert.equal(status, 0, `launcher should succeed; got:\n${stdout}`);
    assert.ok(existsSync(dump), `recorder was never launched (no argv dump). Output:\n${stdout}`);
    const argv = JSON.parse(readFileSync(dump, "utf8"));

    assert.equal(argv[argv.indexOf("--title") + 1], nasty,
      "the trailing backslash and the embedded quotes must survive as ONE argument");
    assert.equal(argv[argv.indexOf("--until") + 1], "23:59",
      "`--until` and its value must still be their own argv entries — they used to be absorbed");
    assert.deepEqual(argv.slice(0, 2), ["record", ZOOM_URL],
      "the URL must still arrive intact alongside the hostile title");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanupNewLogs(before);
  }
});
