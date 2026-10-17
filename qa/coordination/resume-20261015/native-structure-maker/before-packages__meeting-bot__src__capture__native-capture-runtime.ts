/** Server-owned opt-in joins. Transport completion does not qualify a native clock. */
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { constants, copyFileSync, createReadStream, existsSync, fsyncSync, closeSync, openSync, linkSync, lstatSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tabCaptureAssetSha256, type TabBrowserConfig } from "./tab-browser.js";
import { finalizeNativeMedia, requireNativeFinalizedMedia, type NativeFinalizedMedia } from "./native-media-finalize.js";
import { readNativeSpoolLedger } from "./native-spool.js";
import type { AudioClockPair, ClosedNativeSpool, NativeCaptureIdentity } from "./native-media-types.js";
import { verifyPrivateDirectory } from "./record-consent/private-acl.js";
import { readRecordConsent } from "./record-consent/receipt-store.js";
import { createNativeCaptureClockQualifier, type NativeCaptureClockQualifierOptions, type QualifiedCaptureClock } from "./tiles/native-measurement.js";
import { prepareNativeProviderAudio, requireNativeProviderAudio, type NativeProviderAudio } from "./record-consent/native-provider-audio.js";
import { publishPrivateCaptureTurns } from "./record-consent/downstream.js";
import type { RecordConsentReceipt } from "./record-consent/context.js";
import { LEAN_TARGET_MB_PER_HOUR } from "@lkb/core/src/domain/lean-video.js";

export interface NativeCaptureSettings {
  readonly maxTotalBytes: number; readonly maxSpoolBytes: number; readonly maxMuxBytes: number;
  readonly finalizationTimeoutMs:number;
  readonly ffmpegPath: string; readonly ffprobePath: string; readonly browserExecutable: string;
}
function positive(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Explicit finite native byte reservation required");
  return Number(value);
}
function localFile(value: string | undefined): string {
  if (!value || !path.isAbsolute(value) || /^[/\\]{2}/.test(value) || /[\x00-\x1f]/.test(value)) throw new Error("Explicit local native executable required");
  return path.resolve(value);
}
/** Only an explicit invocation flag enables this path. Environment supplies bounds, never authority. */
export function nativeCaptureSettings(rest: readonly string[], env: NodeJS.ProcessEnv, backend: "tab" | "obs"): NativeCaptureSettings | undefined {
  if (!rest.includes("--native-tab-clock")) return undefined;
  if (rest.filter(v => v === "--native-tab-clock").length !== 1 || backend !== "tab") throw new Error("Native capture requires one explicit tab opt-in");
  const maxTotalBytes=positive(env.LKB_NATIVE_MAX_TOTAL_BYTES), maxSpoolBytes=positive(env.LKB_NATIVE_MAX_SPOOL_BYTES), maxMuxBytes=positive(env.LKB_NATIVE_MAX_MUX_BYTES);
  const finalizationTimeoutMs=positive(env.LKB_NATIVE_FINALIZE_TIMEOUT_MS);
  if(finalizationTimeoutMs<1000||finalizationTimeoutMs>3600000)throw new Error("Bounded native finalization deadline required");
  if(maxTotalBytes>8*1024**3)throw new Error("Native total reservation exceeds supported bound");
  if (maxSpoolBytes + 2*maxMuxBytes + 65536 >= maxTotalBytes) throw new Error("Native total reservation lacks output headroom");
  return Object.freeze({maxTotalBytes,maxSpoolBytes,maxMuxBytes,finalizationTimeoutMs,ffmpegPath:localFile(env.LKB_NATIVE_FFMPEG),ffprobePath:localFile(env.LKB_NATIVE_FFPROBE),browserExecutable:localFile(env.LKB_BROWSER_EXECUTABLE)});
}
/** Playback offset is derived from a retained actual output-clock pair; it grants no host bound. */
export function nativePlaybackOffsetUs(spool: Pick<ClosedNativeSpool,"firstAudioSampleIndex"|"sampleRate"|"firstVideoTimestampUs">, pairs: readonly AudioClockPair[]): number {
  const pair=pairs.find(p => p.state === "running" && p.sampleRate === spool.sampleRate);
  if (!pair || !Number.isSafeInteger(spool.firstAudioSampleIndex) || spool.firstAudioSampleIndex<0 || !Number.isSafeInteger(spool.sampleRate) || spool.sampleRate<=0
    || ![pair.contextTime,pair.performanceTime,pair.beforePerformanceUs,pair.afterPerformanceUs,spool.firstVideoTimestampUs].every(Number.isFinite)
    || pair.contextTime<0 || pair.performanceTime<=0 || pair.afterPerformanceUs<pair.beforePerformanceUs) throw new Error("Actual native audio output-clock pair required");
  const offset=Math.round(pair.performanceTime*1000+(spool.firstAudioSampleIndex/spool.sampleRate-pair.contextTime)*1e6-spool.firstVideoTimestampUs);
  if (!Number.isSafeInteger(offset)||Math.abs(offset)>4*3600*1e6) throw new Error("Native playback clock offset unavailable");
  return offset;
}
function requireLocal(file: string, directory=false): void {
  const resolved=path.resolve(file);
  for(let current=resolved;;current=path.dirname(current)) {
    const st=lstatSync(current);
    if(st.isSymbolicLink()||realpathSync(current)!==current)throw new Error("Native runtime alias refused");
    if(current===resolved && (directory ? !st.isDirectory() : !st.isFile()||st.nlink!==1))throw new Error("Native runtime physical artifact required");
    if(path.dirname(current)===current)break;
  }
}
function treeBytes(directory:string):number {
  let total=0,count=0;const queue=[directory];
  for(const dir of queue)for(const entry of readdirSync(dir,{withFileTypes:true})) {
    if(++count>10000)throw new Error("Native artifact inventory exceeds bound");
    const file=path.join(dir,entry.name),st=lstatSync(file);
    if(st.isSymbolicLink())throw new Error("Native artifact link refused");
    if(st.isDirectory())queue.push(file);else if(st.isFile()&&st.nlink===1)total+=st.size;else throw new Error("Native artifact inventory invalid");
    if(!Number.isSafeInteger(total))throw new Error("Native byte total invalid");
  }
  return total;
}
function readBrowserBuild(executable:string):string {
  if(process.platform!=="win32")return execFileSync(executable,["--version"],{encoding:"utf8",timeout:5000,maxBuffer:16384,windowsHide:true}).trim();
  // Read the actual Windows binary resource; --version may launch a desktop window there.
  const powershell=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  const script="$v=(Get-Item -LiteralPath $env:LKB_NATIVE_BROWSER_VERSION_FILE -ErrorAction Stop).VersionInfo; Write-Output ($v.ProductName + ' ' + $v.ProductVersion)";
  return execFileSync(powershell,["-NoProfile","-NonInteractive","-Command",script],{env:{...process.env,LKB_NATIVE_BROWSER_VERSION_FILE:executable},encoding:"utf8",timeout:5000,maxBuffer:16384,windowsHide:true}).trim();
}
export interface NativeCaptureRuntime {
  readonly config: NonNullable<TabBrowserConfig["native"]>;
  readonly browserExecutable: string;
  take(output:string):Promise<{media:NativeFinalizedMedia;maxTotalBytes:number;canonicalClock?:QualifiedCaptureClock}>;
}
/** Post-provider projection uses authenticated canonical sample masks, never the old wall-origin offsets. */
export async function publishNativeCaptureTurns(file:string,audio:NativeProviderAudio,receipt:RecordConsentReceipt):Promise<void> {
  await requireNativeProviderAudio(audio);
  publishPrivateCaptureTurns(file,{...receipt,privateWindows:audio.maskIntervals.map(w=>({tStart:w.startSample/audio.sampleRate,tEnd:w.endSample/audio.sampleRate}))});
}
/** Reserve the actual encoder's finite -fs output cap before any private WAV allocation. */
export async function prepareNativeFinalizerAudio(input:{media?:NativeFinalizedMedia;maxTotalBytes?:number;canonicalClock?:QualifiedCaptureClock;
  recordDir:string;owner:{tenantId:string;sessionId:string};receipt:RecordConsentReceipt;video:string;probeMedia:(video:string)=>number}) {
  if(!input.media)return {nativeAudio:undefined,nativeVideoReserve:0};
  await requireNativeFinalizedMedia(input.media);
  let nativeVideoReserve=0;
  if(input.receipt.privateWindows.length){
    if(!input.canonicalClock)throw new Error("Qualified native privacy origin required");
    nativeVideoReserve=Math.ceil(input.probeMedia(input.video)*LEAN_TARGET_MB_PER_HOUR*1_000_000/3600);
    if(!Number.isSafeInteger(nativeVideoReserve)||nativeVideoReserve<=0)throw new Error("Native video mask reservation unavailable");
  }
  const nativeAudio=await prepareNativeProviderAudio({media:input.media,recordDir:input.recordDir,owner:input.owner,receipt:input.receipt,
    maxTotalBytes:(input.maxTotalBytes??0)-nativeVideoReserve,canonicalClock:input.canonicalClock});
  return {nativeAudio,nativeVideoReserve};
}
export function createNativeCaptureRuntime(input:{settings:NativeCaptureSettings;recordDir:string;tenantId:string;sessionId:string;platform:string;extensionDir:string;
  verifyPlatformQualification?:NativeCaptureClockQualifierOptions["verifyPlatformQualification"]}):NativeCaptureRuntime {
  const {settings}=input;requireLocal(input.recordDir,true);verifyPrivateDirectory(input.recordDir);
  for(const file of [settings.browserExecutable,settings.ffmpegPath,settings.ffprobePath])requireLocal(file);
  const receipt=readRecordConsent(input.recordDir,input);
  if(!receipt.generation)throw new Error("Native capture requires current consent generation");
  const browserBuild=readBrowserBuild(settings.browserExecutable);
  if(!/^(?:Google Chrome|Chromium|Microsoft Edge|chrome|msedge)\s+[0-9][^\r\n]{0,180}$/i.test(browserBuild))throw new Error("Actual supported Chromium build unavailable");
  const identity:NativeCaptureIdentity=Object.freeze({schema:"native-tab-clock/1",tenantId:input.tenantId,sessionId:input.sessionId,captureGeneration:receipt.generation,captureInstanceId:randomUUID(),samplerInstanceId:randomUUID(),platform:input.platform,browserBuild,extensionAssetSha256:tabCaptureAssetSha256(input.extensionDir),clockInstanceId:randomUUID()});
  let completed:{output:string;media:NativeFinalizedMedia;extraBytes:number;canonicalClock?:QualifiedCaptureClock}|undefined,closing=false,finalization:Promise<void>|undefined;
  const finish=async(spool:ClosedNativeSpool,output:string,control?:{signal:AbortSignal})=>{
    if(closing||completed)throw new Error("Native invocation already closed");closing=true;
    const deadline=Date.now()+settings.finalizationTimeoutMs;
    const check=()=>{if(control?.signal.aborted||Date.now()>deadline)throw new Error("Native finalization cancelled or expired");};check();
    if(JSON.stringify(spool.identity)!==JSON.stringify(identity))throw new Error("Native close owner mismatch");
    const directory=path.resolve(input.recordDir),resolved=path.resolve(output);
    if(path.dirname(resolved)!==directory||existsSync(resolved))throw new Error("Native publication destination unavailable");
    requireLocal(directory,true);
    const ledger=await readNativeSpoolLedger(spool);
    check();
    const media=await finalizeNativeMedia(spool,{ffmpegPath:settings.ffmpegPath,ffprobePath:settings.ffprobePath,maxTotalBytes:settings.maxTotalBytes-settings.maxMuxBytes-65536,maxMuxBytes:settings.maxMuxBytes,playbackAudioOffsetUs:nativePlaybackOffsetUs(spool,ledger.audioClockPairs)});
    await requireNativeFinalizedMedia(media);
    check();
    const canonicalClock=input.verifyPlatformQualification ? await createNativeCaptureClockQualifier({verifyPlatformQualification:input.verifyPlatformQualification})(media) : null;
    check();
    const temporary=path.join(directory,`.native-publish-${randomUUID()}`),proof=path.join(path.dirname(spool.video.path),"selected-provider.receipt.json");
    let tempOwned=false,proofOwned=false;
    try {
      const bytes=JSON.stringify({schema:identity.schema,identity,canonicalAudio:media.canonicalAudio,videoTransform:media.videoTransform,qualification:"unavailable"})+"\n";
      if(Buffer.byteLength(bytes)>65536)throw new Error("Native private receipt exceeds reservation");
      const proofFd=openSync(proof,"wx",0o600);proofOwned=true;
      try{writeFileSync(proofFd,bytes);fsyncSync(proofFd);}finally{closeSync(proofFd);}
      const raw=treeBytes(path.dirname(spool.video.path));
      if(raw+media.video.media.file.byteLength>settings.maxTotalBytes)throw new Error("Native publication exceeds total reservation");
      copyFileSync(media.video.media.file.path,temporary,constants.COPYFILE_EXCL);tempOwned=true;
      const fd=openSync(temporary,"r+");try{fsyncSync(fd);}finally{closeSync(fd);}
      await requireNativeFinalizedMedia(media);requireLocal(directory,true);
      check();
      // Atomic no-clobber publication: remove the private temporary link immediately.
      linkSync(temporary,resolved);unlinkSync(temporary);tempOwned=false;
      const known=[spool.video,spool.audio,spool.ledger,media.video.media.file,media.selectedAudio.media.file]
        .reduce((sum,file)=>sum+file.byteLength,0);
      completed={output:resolved,media,extraBytes:lstatSync(resolved).size+treeBytes(path.dirname(spool.video.path))-known,...(canonicalClock?{canonicalClock}:{})};
    }catch(error){if(tempOwned)unlinkSync(temporary);if(proofOwned)unlinkSync(proof);throw error;}
  };
  return {browserExecutable:settings.browserExecutable,config:{identity,maxBytes:settings.maxSpoolBytes,deferFinalization:true,finalizationTimeoutMs:settings.finalizationTimeoutMs,
    onClosed:async(spool,output,control)=>{
      if(finalization)throw new Error("Native invocation already closed");
      const controller=new AbortController(),relay=()=>controller.abort(),timer=setTimeout(relay,settings.finalizationTimeoutMs);
      if(control?.signal.aborted)relay();else control?.signal.addEventListener("abort",relay,{once:true});
      const signal=controller.signal;
      const aborted=new Promise<never>((_resolve,reject)=>{if(signal.aborted)reject(new Error("Native finalization cancelled"));else signal.addEventListener("abort",()=>reject(new Error("Native finalization cancelled or expired")),{once:true});});
      finalization=Promise.race([finish(spool,output,{signal}),aborted]).finally(()=>{clearTimeout(timer);control?.signal.removeEventListener("abort",relay);});await finalization;
    }},take:async(output)=>{
    if(!finalization)throw new Error("Complete native invocation output required");await finalization;
    if(!completed||completed.output!==path.resolve(output))throw new Error("Complete native invocation output required");
    await requireNativeFinalizedMedia(completed.media);requireLocal(completed.output);
    const hash=createHash("sha256");for await(const bytes of createReadStream(completed.output))hash.update(bytes);
    if(hash.digest("hex")!==completed.media.video.media.file.sha256)throw new Error("Native playback publication changed");
    if(treeBytes(path.dirname(completed.media.spool.video.path))+lstatSync(completed.output).size>settings.maxTotalBytes)throw new Error("Native total reservation exceeded");
    return {media:completed.media,maxTotalBytes:settings.maxTotalBytes-completed.extraBytes,...(completed.canonicalClock?{canonicalClock:completed.canonicalClock}:{})};
  }};
}
