import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeSync } from "node:fs";
import path from "node:path";
import { browserProfileArgs, selectedBrowserProfile } from "../browser/browser-profile.js";
import { assertSafeCaptureId } from "../tab-receiver-guard.js";
import { prepareCaptureConsentControls } from "../record-consent/runtime.js";
import { createRecordConsent } from "../record-consent/context.js";
import { createCaptureSlotReadinessObserver } from "./capture-slot-readiness.js";

import type { CaptureWorkspace } from "./capture-workspace-types.js";
export type { CaptureWorkspace } from "./capture-workspace-types.js";
type WorkspaceOperation = "login" | "record" | "finalize";

function physicalDirectories(target: string): void {
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || canonical(realpathSync(current)) !== canonical(current))
        throw new Error("Capture workspace must use physical directories without redirects");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (path.dirname(current) === current) break;
  }
}

function claimOwnedLock(file: string, contents: string): () => void {
  physicalDirectories(path.dirname(file)); mkdirSync(path.dirname(file), {recursive:true}); physicalDirectories(path.dirname(file));
  const fd = openSync(file, "wx", 0o600), identity = fstatSync(fd), bytes = Buffer.from(contents);
  let written = 0;
  const release = () => {
    try {
      physicalDirectories(path.dirname(file));
      const current = lstatSync(file);
      if (!current.isSymbolicLink() && current.nlink === 1 && current.size === written && current.ino === identity.ino && current.dev === identity.dev &&
        readFileSync(file).equals(bytes.subarray(0, written))) rmSync(file);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  };
  try {
    while (written < bytes.length) {const count=writeSync(fd,bytes,written,bytes.length-written);if(count<=0)throw new Error("Capture lock write stalled");written+=count;}
    fsyncSync(fd);
  } catch (error) { closeSync(fd); release(); throw error; }
  closeSync(fd); return release;
}

/** Existing finalizer paths are session-keyed globally, so slot defaults need distinct identities. */
export function slotCaptureSessionId(base: string, workspace: CaptureWorkspace): string {
  if (!workspace.slot) return base;
  const suffix = createHash("sha256").update(JSON.stringify([workspace.tenantId, workspace.slot, randomUUID()])).digest("hex").slice(0,24);
  return `${base.slice(0,125)}-${suffix}`;
}

/** A global session reservation prevents different slots/tenants racing the shared downstream path. */
export function claimCaptureSession(recordRoot: string, tenantId: string, sessionId: string, recover = false,
  pidProbe: (pid:number)=>"live"|"dead"|"unknown" = pid=>{try{process.kill(pid,0);return "live";}catch(error){return (error as NodeJS.ErrnoException).code==="ESRCH"?"dead":"unknown";}}): () => void {
  assertSafeCaptureId("capture tenant", tenantId);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(sessionId) || sessionId.includes("..") || /\.$/.test(sessionId) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sessionId)) throw new Error("Unsafe capture session refused");
  const key=createHash("sha256").update(process.platform==="win32"?sessionId.toLowerCase():sessionId).digest("hex");
  const file=path.resolve(recordRoot,".capture-session-locks",`${key}.lock`), latch=file+".recovery";
  const present=(target:string)=>{try{lstatSync(target);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}};
  let releaseRecovery=()=>{}, complete=false;
  try {
    if (recover) {
      releaseRecovery=claimOwnedLock(latch,JSON.stringify({pid:process.pid,generation:randomUUID()}));
      if(present(file)) {
        const stat=lstatSync(file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024)throw new Error("Unsafe capture session reservation");
        const bytes=readFileSync(file,"utf8"),owner=JSON.parse(bytes);
        if(owner.version!==1||owner.tenantId!==tenantId||owner.sessionId!==sessionId||!Number.isInteger(owner.pid)||owner.pid<=0||
          !/^[a-f0-9-]{36}$/.test(owner.generation??"")||pidProbe(owner.pid)!=="dead")throw new Error("Capture session owner is live, unknown or foreign");
        const current=lstatSync(file);
        if(current.isSymbolicLink()||current.nlink!==1||current.ino!==stat.ino||current.dev!==stat.dev||readFileSync(file,"utf8")!==bytes)
          throw new Error("Capture session ownership changed during recovery");
        rmSync(file);
      }
    } else if(present(latch)) throw new Error("Capture session recovery is active");
    const release=claimOwnedLock(file,JSON.stringify({version:1,tenantId,sessionId,pid:process.pid,generation:randomUUID()}));
    if(!recover && present(latch)){release();throw new Error("Capture session recovery claimed during startup");}
    complete=true;return ()=>{try{release();}finally{releaseRecovery();}};
  }
  catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Capture session is already reserved; finish or recover its owning controller before reuse");throw error;}
  finally {if(recover && !complete)releaseRecovery();}
}

export function prepareWorkspaceCaptureControls(args: string[], owner: {tenantId:string;sessionId:string;meetingUrl:string;until:number;startedAt:number;platform:string;evidenceKind:"browser"|"fixture"},
  workspace: CaptureWorkspace, sharedRecordRoot: string) {
  createRecordConsent(args,owner,process.env,new Date(owner.startedAt)); // Validate authority before even reserving a write.
  const releaseSession=claimCaptureSession(sharedRecordRoot,owner.tenantId,owner.sessionId);
  let initialized:ReturnType<typeof prepareCaptureConsentControls>|undefined;
  try {
    const prepared=prepareCaptureConsentControls(args,owner,workspace.recordDir);
    initialized=prepared;
    const readiness=createCaptureSlotReadinessObserver(workspace,{...owner,generation:prepared.receipt.generation});
    return {...prepared,readiness,failure:()=>prepared.privacy.failure()??readiness.failure(),
      dispose:()=>{try{prepared.privacy.dispose();}finally{try{prepared.captureControl.dispose();}finally{releaseSession();}}}};
  } catch(error){try{initialized?.privacy.dispose();}finally{try{initialized?.captureControl.dispose();}finally{releaseSession();}}throw error;}
}

/** Slots are independently prepared profiles, never copies of an authenticated profile. */
export function selectTabCaptureWorkspace(rest: string[], defaults: CaptureWorkspace,
  operation: WorkspaceOperation = "record", backend: "tab" | "obs" = "tab"): CaptureWorkspace {
  const indices = rest.flatMap((arg, index) => arg === "--capture-slot" ? [index] : []);
  if (indices.length > 1) throw new Error("duplicate --capture-slot");
  if (!indices.length) return { ...defaults };
  const slot = rest[indices[0]! + 1];
  if (typeof slot !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slot) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slot)) throw new Error("--capture-slot requires a safe lowercase identifier");
  if (backend !== "tab") throw new Error("--capture-slot supports tab capture only; OBS fallback is single-session");
  const tenantId = assertSafeCaptureId("capture tenant", defaults.tenantId);
  const tenantKey = createHash("sha256").update(tenantId).digest("hex");
  const profileDir = path.resolve(defaults.profileDir, ".capture-slots", tenantKey, slot);
  const recordDir = path.resolve(defaults.recordDir, ".capture-slots", tenantKey, slot);
  physicalDirectories(profileDir); physicalDirectories(recordDir);
  const canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const profileKey = canonical(profileDir), recordKey = canonical(recordDir);
  if (profileKey === recordKey || profileKey.startsWith(recordKey + path.sep) || recordKey.startsWith(profileKey + path.sep))
    throw new Error("Capture profile and recording workspaces must be separate");
  if (operation !== "finalize" && [path.join(profileDir, ".lkb-tab-capture.lock"),
    path.join(profileDir, ".lkb-recovery.lock"), path.join(recordDir, ".record-state.json")].some((file) => {
      try { lstatSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    })) throw new Error("Capture slot is occupied or needs owned recovery before reuse");
  return { profileDir, recordDir, tenantId, slot };
}

/** An explicit slot cannot finalize an arbitrary path outside its owned recording tree. */
export function assertCaptureWorkspaceVideo(workspace: CaptureWorkspace, video: string): void {
  if (!workspace.slot) return;
  const target = path.resolve(video), relative = path.relative(workspace.recordDir, target);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
    throw new Error("Capture video is outside the selected slot");
  physicalDirectories(path.dirname(target));
  const stat = lstatSync(target), canonical = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || canonical(realpathSync(target)) !== canonical(target))
    throw new Error("Capture video must be an owned physical file");
}

/** The same slot selector is used by login, recording and interrupted recovery. */
export async function loginInCaptureWorkspace(rest: string[], defaults: CaptureWorkspace, joinScript: string,
  env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const workspace = selectTabCaptureWorkspace(rest, defaults, "login");
  const profileDirectory = selectedBrowserProfile(rest, workspace.profileDir, env);
  mkdirSync(workspace.recordDir, { recursive: true });
  let release = () => {};
  if (workspace.slot) {
    mkdirSync(workspace.profileDir, { recursive: true });
    physicalDirectories(workspace.profileDir); physicalDirectories(workspace.recordDir);
    release = claimOwnedLock(path.join(workspace.profileDir, ".lkb-tab-capture.lock"), String(process.pid));
  }
  try {
    const url = rest[0] && !rest[0].startsWith("--") ? rest[0] : "https://accounts.google.com";
    console.log(`bot profile: ${workspace.profileDir}\nSign in inside the window, then close it.`);
    const args = [joinScript, url, "--profile", workspace.profileDir, "--title", "LKB-BOT login",
      "--stop-file", path.join(workspace.recordDir, ".stop-login"), "--no-click"];
    args.push(...browserProfileArgs(workspace.profileDir, profileDirectory));
    if (env.LKB_BROWSER_EXECUTABLE) args.push("--browser-executable", env.LKB_BROWSER_EXECUTABLE);
    const child = spawn(env.LKB_PYTHON ?? "python", args, { stdio: "inherit", windowsHide: true });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Capture login browser did not exit successfully")));
    });
  } finally { release(); }
}
