import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as cp from "node:child_process";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { browserProfileArgs, selectedBrowserProfile } from "./browser-profile.js";
import { createTabBrowserDeps } from "../tab-browser.js";
import { createObsBrowserDeps } from "../obs-windows.js";

test("explicit existing profile boundary and CLI/environment precedence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-profile-"));
  try {
    for (const name of ["Default", "Profile 1"]) {
      mkdirSync(path.join(root, name)); writeFileSync(path.join(root, name, "Preferences"), "{}");
    }
    assert.deepEqual(browserProfileArgs(root), []);
    assert.deepEqual(browserProfileArgs(root, "Profile 1"), ["--profile-directory", "Profile 1"]);
    assert.equal(selectedBrowserProfile([], root, {LKB_BROWSER_PROFILE_DIRECTORY:"Profile 1"}), "Profile 1");
    assert.equal(selectedBrowserProfile(["--profile-directory","Default"], root, {LKB_BROWSER_PROFILE_DIRECTORY:"Profile 1"}), "Default");
    for (const value of ["", ".", "..", "../Default", "x/y", "x\\y", "C:\\x", "--flag", "a,b", "a\n", " a", "a ", "a.", "x..y", "missing"]) {
      assert.throws(() => browserProfileArgs(root, value));
    }
    assert.throws(() => selectedBrowserProfile(["--profile-directory"], root, {}));
    assert.throws(() => selectedBrowserProfile(["--profile-directory","--title"], root, {}));
    assert.throws(() => selectedBrowserProfile(["--profile-directory","Default","--profile-directory","Default"], root, {}));
    symlinkSync(path.join(root,"Profile 1"),path.join(root,"Redirect"),"junction");
    assert.throws(() => browserProfileArgs(root,"Redirect"));
    rmSync(path.join(root,"Profile 1","Preferences"));
    assert.throws(() => browserProfileArgs(root,"Profile 1"));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("actual login/tab/OBS spawn interfaces preserve parent and carry identical selector", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-profile-spawn-"));
  const parent=path.join(root,"parent"),records=path.join(root,"records");
  mkdirSync(path.join(parent,"Profile 1"),{recursive:true});
  writeFileSync(path.join(parent,"Profile 1","Preferences"),"{}");
  const saved = {...process.env};
  const actual = createRequire(import.meta.url)("node:child_process") as typeof cp;
  const calls: {exe:string,args:string[]}[]=[];
  let login=true;
  const spawnMock=mock.method(actual,"spawn",(exe:string,args:string[])=>{
    calls.push({exe,args});
    if (!login) throw new Error("intercepted before browser launch");
    const child=new EventEmitter(); queueMicrotask(()=>child.emit("exit",0)); return child;
  });
  const envMock=mock.method(process,"loadEnvFile",()=>undefined);
  syncBuiltinESMExports();
  try {
    process.env.LKB_BOT_PROFILE_DIR=parent; process.env.LKB_RECORD_DIR=records;
    process.env.LKB_PYTHON="fixture-python"; process.env.LKB_BROWSER_EXECUTABLE="cft";
    process.env.LKB_BROWSER_PROFILE_DIRECTORY="Profile 1";
    const {runLogin}=await import("../record-commands.js");
    await runLogin([]);
    const loginCall = calls[0];
    assert.ok(loginCall, "login must invoke the captured spawn interface");
    assert.ok(loginCall.args.includes("--no-click"));
    assert.equal(loginCall.args[1],"https://accounts.google.com");
    login=false;
    const cfg={python:"fixture-python",joinScript:path.resolve("packages/meeting-bot/py/sb_join.py"),
      profileDir:parent,profileDirectory:"Profile 1",recordDir:records,browserExecutable:"cft",autoClick:false};
    const tab=createTabBrowserDeps({...cfg,sessionId:"profile-test",tenantId:"fixture",log:()=>{}});
    await assert.rejects(tab.deps.launch("https://example.invalid",{tenantId:"fixture",consentNote:"fixture"}),/intercepted/);
    const obs=createObsBrowserDeps({...cfg,obsUrl:"ws://127.0.0.1:1",obsPassword:"fixture",obsExe:"never-used",log:()=>{}},
      {connectObs:async()=>{throw new Error("unexpected OBS call");},confirmBotWindow:async()=>false});
    await assert.rejects(obs.deps.launch("https://example.invalid",{tenantId:"fixture",consentNote:"fixture"}),/intercepted/);
    assert.equal(calls.length,3);
    for (const {exe,args} of calls) {
      assert.equal(exe,"fixture-python");
      assert.equal(args[args.indexOf("--profile")+1],parent);
      assert.equal(args[args.indexOf("--profile-directory")+1],"Profile 1");
      assert.equal(args.filter(x=>x==="--profile-directory").length,1);
      assert.equal(args[args.indexOf("--browser-executable")+1],"cft");
      assert.ok(args.includes("--no-click"));
      assert.ok(!args.some(x=>x.includes("fake-media")));
    }
    assert.ok(!readdirSync(parent).some(x=>x===".lkb-tab-capture.lock"));
    assert.ok(!readdirSync(records).some(x=>x.startsWith(".extension-")));
  } finally {
    spawnMock.mock.restore(); envMock.mock.restore(); syncBuiltinESMExports();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env,saved);
    rmSync(root,{recursive:true,force:true});
  }
});
