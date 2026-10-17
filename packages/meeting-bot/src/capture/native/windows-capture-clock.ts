/** Owned Windows packet producer. Packet timing is observation, not qualification.
 * Only this module's actual child pipe can issue ClosedWindowsPacketCapture.
 * All public JSON/parser seams below remain incapable of issuing that capability. */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { NativeCaptureIdentity, WindowsUtcBracket, WindowsPacketClock, ClosedNativeSpool } from './native-media-types.js';
export type { WindowsUtcBracket, WindowsPacketClock } from './native-media-types.js';
import { verifyPrivateArtifact, verifyPrivateDirectory } from '../record-consent/private-acl.js';
import { sameNativeIdentity } from './native-clock-ledger.js';
import { readNativeSpoolLedger, verifyClosedNativeSpool } from './native-spool.js';
export interface WindowsPcmPacket {
  pcm:Buffer; sampleRate:number; clock:Readonly<WindowsPacketClock>;
  /** Preserve privately for independent replay of the frame-preserving conversion. */
  rawPcm:Buffer; sourceFormat:Readonly<Pick<WindowsPacketHello,'channels'|'format'>>;
}
export interface WindowsPacketHello {
  kind:'hello'; nonce:string; pid:number; creationFiletime:string; osBuild:number;
  qpcFrequency:string; sampleRate:number; channels:number; format:'s16le'|'f32le';
}
export interface WindowsOwnedBrowser {
  pid:number; creationFiletime:string; executableSha256:string;
}
declare const closed:unique symbol;
export interface ClosedWindowsPacketCapture { readonly [closed]:true }
export interface WindowsPacketProof {
  readonly identity:NativeCaptureIdentity; readonly browser:WindowsOwnedBrowser;
  readonly helperSha256:string; readonly hostFingerprint:string; readonly hello:WindowsPacketHello;
  readonly pcmSha256:string; readonly sampleCount:number; readonly clocks:readonly WindowsPacketClock[];
  readonly rawSha256:string; readonly rawByteCount:number;
  /** Unknown timestamp accuracy/lag/drift is deliberately not represented as zero. */
  readonly qualification:null;
}
const captures=new WeakMap<object,WindowsPacketProof>();
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
const integer=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const fail=():never=>{throw new Error('Windows packet capture unavailable');};
function decimal(v:unknown):bigint { if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v))return fail(); const n=BigInt(v);if(n>0xffffffffffffffffn)return fail();return n; }
function bracket(v:WindowsUtcBracket):void { if(!v||decimal(v.qpcAfter)<decimal(v.qpcBefore)||decimal(v.utcFiletime)<116444736000000000n)fail(); }
/** Unit conversion only; neither this function nor parsed JSON grants authority. */
export function windowsUtcInterval(v:WindowsUtcBracket,frequency:string):{earliestUs:bigint;latestUs:bigint} {
  bracket(v);const f=decimal(frequency);if(f===0n)return fail();
  const utc=(decimal(v.utcFiletime)-116444736000000000n)/10n;
  // Offset interval UTC-QPC, outward rounding by one microsecond.
  return {earliestUs:utc-(decimal(v.qpcAfter)*1000000n+f-1n)/f-1n,latestUs:utc-decimal(v.qpcBefore)*1000000n/f+1n};
}
/** Deterministic frame-preserving downmix/quantization; no resampling, trim or padding. */
export function windowsPacketPcm(raw:Buffer,hello:Pick<WindowsPacketHello,'channels'|'format'>,frames:number):Buffer {
  const {channels,format}=hello,size=format==='s16le'?2:format==='f32le'?4:0;
  if(!integer(channels,1)||channels>8||!integer(frames,1)||frames>2097152||!size||raw.length!==frames*channels*size||raw.length>4194304)return fail();
  const pcm=Buffer.alloc(frames*2);
  for(let frame=0;frame<frames;frame++) {
    let sum=0;
    for(let ch=0;ch<channels;ch++) {
      const offset=(frame*channels+ch)*size,value=format==='s16le'?raw.readInt16LE(offset):raw.readFloatLE(offset);
      if(!Number.isFinite(value))return fail();sum+=value;
    }
    const mixed=sum/channels,scaled=format==='s16le'?Math.round(mixed):Math.round(Math.max(-1,Math.min(1,mixed))*32768);
    pcm.writeInt16LE(Math.max(-32768,Math.min(32767,scaled)),frame*2);
  }
  return pcm;
}
/** Bounded framing seam, synthetic/test use only. Private production reader owns it. */
export class WindowsPacketFramer {
  private pending=Buffer.alloc(0);
  push(chunk:Buffer):{metadata:unknown;raw:Buffer}[] {
    if(chunk.length>4198408||this.pending.length+chunk.length>8396816)return fail();
    this.pending=Buffer.concat([this.pending,chunk]);const result:{metadata:unknown;raw:Buffer}[]=[];
    while(this.pending.length>=8) {
      const meta=this.pending.readUInt32LE(0),raw=this.pending.readUInt32LE(4);
      if(!meta||meta>4096||raw>4194304)return fail();
      const length=8+meta+raw;if(this.pending.length<length)break;
      let metadata:unknown;try{metadata=JSON.parse(this.pending.subarray(8,8+meta).toString('utf8'));}catch{return fail();}
      result.push({metadata,raw:Buffer.from(this.pending.subarray(8+meta,length))});this.pending=this.pending.subarray(length);
    }
    return result;
  }
  finish():void {if(this.pending.length)fail();}
}
export interface WindowsPacketCaptureOptions {
  identity:NativeCaptureIdentity; hostFingerprint:string; helperPath:string; helperSha256:string;
  /** Trusted composition callback must attest a dedicated browser it actually launched.
   * PID, creation time or executable hash accepted from HTTP/sidecar is NOT ownership.
   * Invoke again at completion to reject exited/replaced/reassigned browser roots. */
  readOwnedBrowser:()=>Promise<WindowsOwnedBrowser>;
  maxPcmBytes:number; maxRawBytes:number; maxPackets:number; deadlineMs:number;
  /** Awaited serially: spool must retain these exact PCM bytes and clock, no worklet mix. */
  retainPacket:(packet:WindowsPcmPacket)=>Promise<void>;
}
function physicalHelper(file:string,expected:string):void {
  if(!HASH.test(expected)||!path.isAbsolute(file)||realpathSync(file)!==file)return fail();
  for(let p=file;;p=path.dirname(p)) {const st=lstatSync(p);if(st.isSymbolicLink()||(p===file&&(!st.isFile()||st.nlink!==1||st.size>16777216)))return fail();if(path.dirname(p)===p)break;}
  if(sha(readFileSync(file))!==expected)return fail();
  verifyPrivateDirectory(path.dirname(file));verifyPrivateArtifact(file);
}
function ownership(v:WindowsOwnedBrowser):void {if(!v||!integer(v.pid,1)||v.pid>0xffffffff||decimal(v.creationFiletime)===0n||!HASH.test(v.executableSha256))fail();}
function helloValid(v:WindowsPacketHello,nonce:string,browser:WindowsOwnedBrowser):void {
  if(!v||v.kind!=='hello'||v.nonce!==nonce||v.pid!==browser.pid||v.creationFiletime!==browser.creationFiletime||!integer(v.osBuild,20348)||decimal(v.qpcFrequency)===0n||!integer(v.sampleRate,1)||v.sampleRate>192000||!integer(v.channels,1)||v.channels>8||!['s16le','f32le'].includes(v.format))fail();
}
export async function startWindowsPacketCapture(options:WindowsPacketCaptureOptions):Promise<{
  ready:Promise<Readonly<WindowsPacketHello>>; stop:()=>void; finished:Promise<ClosedWindowsPacketCapture>;
}> {
  const o={...options,identity:Object.freeze({...options.identity})};
  if(process.platform!=='win32'||o.identity.platform!=='meet'||!HASH.test(o.hostFingerprint)||
    o.identity.schema!=='native-tab-clock/1'||!HASH.test(o.identity.extensionAssetSha256)||
    !['tenantId','sessionId','captureGeneration','captureInstanceId','samplerInstanceId','browserBuild','clockInstanceId'].every(key=>{
      const value=o.identity[key as keyof NativeCaptureIdentity];return typeof value==='string'&&value.length>0&&value.length<=512;
    })||
    !integer(o.maxPcmBytes,2)||o.maxPcmBytes>0xffffffff-36||!integer(o.maxRawBytes,2)||o.maxRawBytes>0xffffffff||!integer(o.maxPackets,1)||o.maxPackets>100000||!integer(o.deadlineMs,1)||o.deadlineMs>14400000||typeof o.readOwnedBrowser!=='function'||typeof o.retainPacket!=='function')return fail();
  physicalHelper(o.helperPath,o.helperSha256);const browser=Object.freeze({...await o.readOwnedBrowser()});ownership(browser);
  const nonce=randomBytes(32),token=nonce.toString('hex');
  const child=spawn(o.helperPath,[String(browser.pid),browser.creationFiletime],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,
    cwd:path.dirname(o.helperPath),env:{SystemRoot:process.env.SystemRoot??'C:\\Windows'}});
  const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  // Consume failures immediately; caller still receives the rejecting finished promise.
  void exit.catch(()=>{});
  let readyResolve!:(v:Readonly<WindowsPacketHello>)=>void,readyReject!:(e:Error)=>void;
  const ready=new Promise<Readonly<WindowsPacketHello>>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});void ready.catch(()=>{});
  let stopping=false,expired=false,stderrBytes=0;
  const stop=()=>{if(!stopping){stopping=true;child.stdin.end();}};
  let timeoutReject!:(reason:Error)=>void;
  const deadline=new Promise<never>((_resolve,reject)=>{timeoutReject=reject;});void deadline.catch(()=>{});
  const expire=()=>{expired=true;child.kill();timeoutReject(new Error('Windows packet capture unavailable'));};
  const timer=setTimeout(expire,o.deadlineMs);
  const startup=setTimeout(expire,15000);
  child.stderr.on('data',(b:Buffer)=>{stderrBytes+=b.length;if(stderrBytes>4096)child.kill();});
  child.stdin.on('error',()=>{child.kill();});child.stdin.write(nonce);
  const finished=(async()=>{
    const framer=new WindowsPacketFramer(),hash=createHash('sha256'),rawHash=createHash('sha256'),clocks:WindowsPacketClock[]=[];
    let rawByteCount=0;
    let hello:WindowsPacketHello|undefined,ended=false,samples=0,priorDevice:bigint|undefined,priorQpc:bigint|undefined,priorBracket:WindowsUtcBracket|undefined;
    let offsetLow:bigint|undefined,offsetHigh:bigint|undefined;
    try {
      for await(const chunk of child.stdout)for(const frame of framer.push(Buffer.from(chunk))) {
        const v=frame.metadata as Record<string,unknown>;
        if(!v||v.nonce!==token||ended)fail();
        if(!hello) {helloValid(v as unknown as WindowsPacketHello,token,browser);if(frame.raw.length)fail();hello=Object.freeze({...v}) as unknown as WindowsPacketHello;clearTimeout(startup);readyResolve(hello);continue;}
        if(v.kind==='end') {if(!stopping||v.packets!==clocks.length||frame.raw.length)fail();ended=true;continue;}
        if(v.kind!=='packet'||v.sequence!==clocks.length||clocks.length>=o.maxPackets||!integer(v.frames,1)||(v.flags!==0&&v.flags!==2))fail();
        const device=decimal(v.devicePosition),qpc=decimal(v.qpc100ns),before=v.before as WindowsUtcBracket,after=v.after as WindowsUtcBracket;
        if(qpc===0n)fail();
        bracket(before);bracket(after);
        if(decimal(after.qpcBefore)<decimal(before.qpcAfter)||(priorBracket&&decimal(before.qpcBefore)<decimal(priorBracket.qpcAfter))||
          (priorDevice!==undefined&&device!==priorDevice)||(priorQpc!==undefined&&qpc<=priorQpc))fail();
        // QPC->UTC brackets may have unknown accuracy; contradictory observed epochs refuse.
        const a=windowsUtcInterval(before,hello.qpcFrequency),b=windowsUtcInterval(after,hello.qpcFrequency);
        if(a.earliestUs>b.latestUs||b.earliestUs>a.latestUs)fail();
        // Strict observed overlap only. This is a refusal check, not an accuracy claim.
        for(const interval of [a,b]) {
          offsetLow=offsetLow===undefined||interval.earliestUs>offsetLow?interval.earliestUs:offsetLow;
          offsetHigh=offsetHigh===undefined||interval.latestUs<offsetHigh?interval.latestUs:offsetHigh;
          if(offsetLow>offsetHigh)fail();
        }
        const pcm=windowsPacketPcm(frame.raw,hello,v.frames as number);
        if((samples+(v.frames as number))*2>o.maxPcmBytes||!Number.isSafeInteger(samples+(v.frames as number))||rawByteCount+frame.raw.length>o.maxRawBytes)fail();
        const clock:WindowsPacketClock=Object.freeze({method:'wasapi-packet-qpc/1',sequence:clocks.length,firstSampleIndex:samples,frameCount:v.frames as number,
          devicePosition:String(v.devicePosition),qpc100ns:String(v.qpc100ns),qpcFrequency:hello.qpcFrequency,before:Object.freeze({...before}),after:Object.freeze({...after}),flags:v.flags as number,rawSha256:sha(frame.raw),pcmSha256:sha(pcm)});
        // Hash before yielding mutable buffers; retaining consumer must hash its own physical bytes.
        hash.update(pcm);rawHash.update(frame.raw);rawByteCount+=frame.raw.length;
        await Promise.race([o.retainPacket({pcm,sampleRate:hello.sampleRate,clock,rawPcm:frame.raw,sourceFormat:Object.freeze({channels:hello.channels,format:hello.format})}),deadline]);clocks.push(clock);
        samples+=v.frames as number;priorDevice=device+BigInt(v.frames as number);priorQpc=qpc;priorBracket=after;
      }
      framer.finish();if(await exit!==0||expired||stderrBytes||!ended||!hello||!samples)fail();
      physicalHelper(o.helperPath,o.helperSha256);const current=await o.readOwnedBrowser();ownership(current);
      if(current.pid!==browser.pid||current.creationFiletime!==browser.creationFiletime||current.executableSha256!==browser.executableSha256)fail();
      const proof:WindowsPacketProof=Object.freeze({identity:o.identity,browser,helperSha256:o.helperSha256,hostFingerprint:o.hostFingerprint,hello,
        pcmSha256:hash.digest('hex'),rawSha256:rawHash.digest('hex'),rawByteCount,sampleCount:samples,clocks:Object.freeze(clocks),qualification:null});
      const cap=Object.freeze({}) as ClosedWindowsPacketCapture;captures.set(cap,proof);return cap;
    }catch{child.kill();readyReject(new Error('Windows packet capture unavailable'));throw new Error('Windows packet capture unavailable');}
    finally{clearTimeout(timer);clearTimeout(startup);}
  })();void finished.catch(()=>{});return {ready,stop,finished};
}
export function requireClosedWindowsPacketCapture(value:ClosedWindowsPacketCapture):WindowsPacketProof {
  const proof=value&&captures.get(value);if(!proof)return fail();return proof;
}
/** Join a genuine completed packet session to the exact physically closed receiver PCM.
 * JSON replay cannot recreate the packet session capability. This still grants no
 * measured timing accuracy or platform qualification and does not prove archived raw PCM. */
export async function assertWindowsPacketSpool(capture:ClosedWindowsPacketCapture,spool:ClosedNativeSpool):Promise<void> {
  const proof=requireClosedWindowsPacketCapture(capture);await verifyClosedNativeSpool(spool);
  if(!sameNativeIdentity(proof.identity,spool.identity)||spool.firstAudioSampleIndex!==0||
    spool.audio.sha256!==proof.pcmSha256||spool.audioSampleCount!==proof.sampleCount||
    spool.sampleRate!==proof.hello.sampleRate||spool.audio.byteLength!==proof.sampleCount*2)fail();
  const ledger=await readNativeSpoolLedger(spool);
  if(ledger.audio.length!==proof.clocks.length||ledger.audioClockPairs.length)fail();
  for(let i=0;i<ledger.audio.length;i++) {
    const row=ledger.audio[i]!,clock=proof.clocks[i]!;
    if(!isDeepStrictEqual(row.windowsPacket,clock)||row.startFrame!==clock.firstSampleIndex||
      row.frameCount!==clock.frameCount||row.sha256!==clock.pcmSha256||row.byteLength!==clock.frameCount*2)fail();
  }
  await verifyClosedNativeSpool(spool);
}
