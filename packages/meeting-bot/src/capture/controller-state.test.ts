/**
 * packages/meeting-bot/src/capture/controller-state.test.ts — T-047. No real OBS/Chrome: only
 * filesystem round-trips against a throwaway temp dir and process.pid/an invalid pid for
 * isPidAlive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  finalizeControllerRecording,
  controllerMatchesIdentity,
  getProcessStartTime,
  isControllerAlive,
  isPidAlive,
  readControllerState,
  removeControllerState,
  stateFilePath,
  writeControllerState,
  type RecordState,
} from "./controller-state.js";

import {writeOwnedTabStatus} from "./tab-browser.js";
import {finalizeRecordingWith} from "./record-commands.js";
import {webinarCompletionState} from "../calendar/schedule-state.js";

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), "lkb-controller-state-"));
}

function sample(overrides: Partial<RecordState> = {}): RecordState {
  return {
    pid: 12345,
    sessionId: "2026-09-24-test-webinar",
    title: "Test Webinar",
    platform: "zoho",
    until: "2026-09-24T11:00:00.000Z",
    obsOutputDir: "C:\\raw\\webinars",
    startedAt: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

test("readControllerState returns undefined when no file was ever written", () => {
  const dir = tmpDir();
  try {
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write then read round-trips the same state", () => {
  const dir = tmpDir();
  try {
    const state = sample();
    writeControllerState(dir, state);
    assert.deepEqual(readControllerState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write then read round-trips controllerStartedAt (ISS-T-047-CONTROLLER-002's identity marker)", () => {
  const dir = tmpDir();
  try {
    const state = sample({ controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
    writeControllerState(dir, state);
    assert.deepEqual(readControllerState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readControllerState returns undefined for corrupt JSON rather than throwing", () => {
  const dir = tmpDir();
  try {
    writeFileSync(stateFilePath(dir), "{ not valid json");
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readControllerState returns undefined for a well-formed but shape-wrong JSON file", () => {
  const dir = tmpDir();
  try {
    writeFileSync(stateFilePath(dir), JSON.stringify({ hello: "world" }));
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removeControllerState deletes the file and read then returns undefined", () => {
  const dir = tmpDir();
  try {
    writeControllerState(dir, sample());
    removeControllerState(dir);
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removeControllerState on an already-clean dir is a safe no-op (idempotent)", () => {
  const dir = tmpDir();
  try {
    assert.doesNotThrow(() => removeControllerState(dir));
    assert.doesNotThrow(() => removeControllerState(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isPidAlive is true for this process's own pid", () => {
  assert.equal(isPidAlive(process.pid), true);
});

test("isPidAlive is false for a pid that cannot correspond to a live process", () => {
  // Avoid -1 (POSIX process-group broadcast semantics) or 0 (own process group) — pick a
  // concrete large pid instead, which is what a real dead-controller pid looks like.
  assert.equal(isPidAlive(999_999_999), false);
});

// --- ISS-T-047-CONTROLLER-002: identity beyond bare pid (pid-reuse defense) -----------------

test("getProcessStartTime returns platform identity for this process's own (real, live) pid", () => {
  const t = getProcessStartTime(process.pid);
  if (process.platform === "win32") {
    assert.equal(typeof t, "string");
    assert.ok(!Number.isNaN(new Date(t as string).getTime()), `expected a parseable timestamp, got ${t}`);
  } else if (process.platform === "linux") {
    assert.match(t ?? "", /^linux:[a-f0-9-]{36}:[1-9]\d*$/);
  } else assert.equal(t, undefined);
});

test("getProcessStartTime returns undefined (never throws) for a pid that cannot correspond to a live process", () => {
  assert.equal(getProcessStartTime(999_999_999), undefined);
});

test("controllerMatchesIdentity: no identity was ever recorded (older state file) → trusts pid-alive, back-compat", () => {
  assert.equal(controllerMatchesIdentity(undefined, "2026-09-24T10:00:00.000000+05:30"), true);
});

test("controllerMatchesIdentity: recorded identity but the live probe couldn't determine the actual one → " +
  "doesn't newly distrust a pid-alive process (a probe failure must never manufacture a false mismatch)", () => {
  assert.equal(controllerMatchesIdentity("2026-09-24T10:00:00.000000+05:30", undefined), true);
});

test("controllerMatchesIdentity: matching start time → same process, alive", () => {
  const t = "2026-09-24T10:00:00.000000+05:30";
  assert.equal(controllerMatchesIdentity(t, t), true);
});

test("ISS-T-047-CONTROLLER-002: controllerMatchesIdentity — mismatched start time (the OS recycled the pid " +
  "onto an unrelated process after the original controller died) → NOT the same controller", () => {
  assert.equal(
    controllerMatchesIdentity("2026-09-24T10:00:00.000000+05:30", "2026-09-24T16:45:00.000000+05:30"),
    false,
  );
});

test("isControllerAlive — pid alive, no controllerStartedAt recorded (older/undefined) → alive (back-compat, " +
  "and short-circuits before ever probing getProcessStartTime — see controller-state.ts)", () => {
  const state = sample({ pid: process.pid, controllerStartedAt: undefined });
  assert.equal(isControllerAlive(state), true);
});

test("isControllerAlive — pid not alive at all → dead regardless of identity", () => {
  const state = sample({ pid: 999_999_999, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  assert.equal(isControllerAlive(state), false);
});

test("ISS-T-047-CONTROLLER-002: isControllerAlive — pid-reuse case via INJECTED probes: pid reports alive " +
  "(the OS recycled it onto an unrelated process) but the recorded identity does not match the actual " +
  "one → reports dead, not alive", () => {
  const state = sample({ pid: 4242, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  const alive = isControllerAlive(state, {
    pidAlive: () => true,
    processStartTime: () => "2026-09-24T16:45:00.000000+05:30", // different process now holds this pid
  });
  assert.equal(alive, false);
});

test("isControllerAlive — pid alive, identity matches (injected probes) → alive, the same controller", () => {
  const state = sample({ pid: 4242, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  const alive = isControllerAlive(state, {
    pidAlive: () => true,
    processStartTime: () => "2026-09-24T10:00:00.000000+05:30",
  });
  assert.equal(alive, true);
});

test("Linux process identity validates bounded proc fields without invoking Windows", () => {
  const boot = "6bce4b13-280c-4b41-b3ea-452a4f0c6299";
  const stat = (ticks = "123456", name = "node (worker)", pid = 4242) => `${pid} (${name}) S ${Array(18).fill("0").join(" ")} ${ticks} 0 0\n`;
  const files = new Map<string, string | undefined>([["/proc/4242/stat", stat()], ["/proc/sys/kernel/random/boot_id", boot + "\n"]]);
  let windowsCalls = 0;
  const probes = {
    platform: "linux" as const,
    readProc: (file: string, maxBytes: number) => {
      assert.equal(maxBytes, file.endsWith("/stat") ? 8192 : 128);
      return files.get(file);
    },
    windowsStartTime: () => { windowsCalls++; throw new Error("must not call Windows"); },
  };
  const identity = `linux:${boot}:123456`;
  assert.equal(getProcessStartTime(4242, probes), identity);
  for (const name of ["node ) odd (name", "a ((b))", "name with spaces"]) {
    files.set("/proc/4242/stat", stat("123456", name));
    assert.equal(getProcessStartTime(4242, probes), identity);
  }
  const badStats = [undefined, "", "4242 node S 0", stat("123456", "node", 4243), stat().replace(") S", ") ?"),
    stat().split(" ").slice(0, 10).join(" "), ...["0", "-1", "1.5", "01", "18446744073709551616", "123x"].map(value => stat(value)),
    stat().replace(" S 0", " S NaN"), "x".repeat(8193), "�".repeat(4097)];
  for (const value of badStats) {
    files.set("/proc/4242/stat", value);
    assert.equal(getProcessStartTime(4242, probes), undefined, `stat ${String(value).slice(0, 60)}`);
  }
  files.set("/proc/4242/stat", stat());
  for (const value of [undefined, "", "bad-uuid", boot + " junk", "x".repeat(129)]) {
    files.set("/proc/sys/kernel/random/boot_id", value);
    assert.equal(getProcessStartTime(4242, probes), undefined);
  }
  files.set("/proc/sys/kernel/random/boot_id", boot.toUpperCase());
  assert.equal(getProcessStartTime(4242, probes), identity);
  files.set("/proc/4242/stat", stat("18446744073709551615"));
  assert.equal(getProcessStartTime(4242, probes), `linux:${boot}:18446744073709551615`);
  assert.equal(getProcessStartTime(4242, {...probes, readProc: () => { throw new Error("EACCES"); }}), undefined);
  assert.equal(getProcessStartTime(4242, {...probes, platform: "darwin"}), undefined);
  for (const pid of [0, -1, NaN, Infinity, 1.5, 2147483648]) assert.equal(getProcessStartTime(pid, probes), undefined);
  assert.equal(windowsCalls, 0);
  files.set("/proc/4242/stat", stat());
  const expected = getProcessStartTime(4242, probes);
  const state = sample({pid: 4242, controllerStartedAt: expected});
  const live = () => isControllerAlive(state, {pidAlive: () => true, processStartTime: pid => getProcessStartTime(pid, probes)});
  assert.equal(live(), true);
  assert.equal(controllerMatchesIdentity(expected, expected), true);
  files.set("/proc/4242/stat", stat("123457"));
  assert.equal(controllerMatchesIdentity(expected, getProcessStartTime(4242, probes)), false);
  assert.equal(live(), false);
  files.set("/proc/4242/stat", stat());
  files.set("/proc/sys/kernel/random/boot_id", "7bce4b13-280c-4b41-b3ea-452a4f0c6299");
  assert.equal(controllerMatchesIdentity(expected, getProcessStartTime(4242, probes)), false);
  assert.equal(live(), false);
  assert.equal(controllerMatchesIdentity(expected, undefined), true);
});

test("Windows process identity retains its timestamp and never reads proc", () => {
  const timestamp = "2026-09-30T10:00:00.0000000+05:30";
  let calls = 0;
  const probes = {platform: "win32" as const, readProc: () => { throw new Error("must not read proc"); },
    windowsStartTime: (pid: number) => { calls++; assert.equal(pid, 4242); return ` ${timestamp}\n`; }};
  assert.equal(getProcessStartTime(4242, probes), timestamp);
  for (const pid of [0, -1, NaN, Infinity, 1.5, 2147483648]) assert.equal(getProcessStartTime(pid, probes), undefined);
  assert.equal(getProcessStartTime(4242, {...probes, platform: "darwin"}), undefined);
  assert.equal(calls, 1);
  assert.equal(getProcessStartTime(4242, {...probes, windowsStartTime: () => { throw new Error("probe unavailable"); }}), undefined);
});

test("first-source normalize/probe/extract failures retain stopped and interrupted control evidence", async () => {
  for (const state of ["stopped", "recording"]) for (const failure of ["normalize", "probe", "extract"]) {
    const root=tmpDir(), recordDir=path.join(root,"raw/webinars"), profileDir=path.join(root,"profile");
    mkdirSync(recordDir,{recursive:true}); mkdirSync(profileDir);
    const handle="tab-123456-aabbccdd", video=path.join(recordDir,handle+".webm"), sessionId="first-source-control";
    const source=path.join(root,"data/toc-migrated",sessionId,"source.json"), statusPath=video+".status.json";
    const started="2026-10-01T09:00:00.000Z", until="2026-10-01T09:01:00.000Z";
    const gap={start:Date.parse(started)/1000+30,end:Date.parse(until)/1000,reason:"capture-control-controller-disconnected",recovered:false};
    const identity={output:video,pid:99999999,handle,sessionId,tenantId:"lane",profileDir,recordDir,controllerStartedAt:started};
    writeFileSync(video,"original-media");
    writeOwnedTabStatus(statusPath,identity,{state,captureStartedAt:started,controlGaps:[gap]});
    if(state==="recording") {
      writeControllerState(recordDir,sample({pid:identity.pid,sessionId,obsOutputDir:recordDir,controllerStartedAt:started,until}));
      writeFileSync(path.join(profileDir,".lkb-tab-capture.lock"),String(identity.pid));
      mkdirSync(path.join(recordDir,".extension-"+handle));
    }
    let failing=true, processed=0;
    const recover=()=>finalizeControllerRecording(video,{repoRoot:root,recordDir,profileDir,sessionId,tenantId:"lane",python:"unused",joinScript:"unused"},{
      normalize:media=>{if(failing&&failure==="normalize")throw new Error("first normalize failure");return media;},
      pidProbe:()=>"dead",cleanup:()=>{},mediaDuration:()=>20,processArtifacts:()=>{processed++;},
      finalize:(media,gaps)=>finalizeRecordingWith({repoRoot:root,tenantId:"lane",
        probeMedia:()=>{if(failing&&failure==="probe")throw new Error("first probe failure");return 20;},
        extractAudio:(_input,output)=>{if(failing&&failure==="extract")throw new Error("first extract failure");writeFileSync(output,"audio");},
        measureVolume:()=>({maxDb:-20,meanDb:-30})},media,sessionId,"Fixture","meet",false,gaps),
    });
    try {
      await assert.rejects(recover(),new RegExp("first "+failure+" failure"));
      assert.equal(existsSync(source),false); assert.equal(processed,0);
      assert.equal(readFileSync(video,"utf8"),"original-media");
      assert.deepEqual(JSON.parse(readFileSync(statusPath,"utf8")).controlGaps,[gap]);
      failing=false; await recover();
      const evidence=JSON.parse(readFileSync(source,"utf8"));
      assert.equal(evidence.gaps.filter((item:any)=>item.reason===gap.reason).length,1);
      const completion=webinarCompletionState(source,"lane",sessionId,{},new Date().toISOString());
      assert.equal(completion.status,"action_required"); assert.equal(completion.reason,"controller-disconnected");
      await recover(); assert.deepEqual(JSON.parse(readFileSync(source,"utf8")).gaps,evidence.gaps);
      assert.equal(readFileSync(video,"utf8"),"original-media");
    } finally {rmSync(root,{recursive:true,force:true});}
  }
});
