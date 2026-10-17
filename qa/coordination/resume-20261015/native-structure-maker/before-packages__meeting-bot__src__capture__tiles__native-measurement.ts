/** Native clock authority. Independent server adapter verifies measured applicability;
 * unknown bounds or browser JSON cannot qualify a clock. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireNativeFinalizedMedia, type NativeFinalizedMedia } from '../native-media-finalize.js';
import { readNativeSpoolLedger } from '../native-spool.js';
import type { AudioClockPair, HostClockPair, NativeCaptureIdentity } from '../native-media-types.js';
import type { TileCommittedCapture, TileDecodedClockMeasurement, TileMeasurementArtifacts } from './registry.js';

export interface NativePlatformQualification {
  schema: 'native-platform-measurement/1'; evidenceKind: 'native'; identity: NativeCaptureIdentity;
  /** Issuer's independently retained measurement corpus, not a fit-residual digest. */
  measurementCorpusSha256: string; hostId: string; serverClockInstanceId: string;
  samplerZeroEpochSec: { earliest: number; latest: number };
  quantizationUs: number; audioOutputEstimationBoundUs: number;
  samplerObservationLagBoundUs: number; sourceObservationLagBoundUs: number;
  driftBoundPpm: number;
}
export interface NativeClockCalculation {
  mediaZeroEpochSec: { earliest: number; latest: number };
  driftBoundSec: number; highlightLagBoundSec: number; bracketWidthUs: number; clockFitResidualUs: number;
  hostOffsetEpochUs: {earliest:number;latest:number}; hostCoveragePerformanceUs: {earliest:number;latest:number};
}
const issued = new WeakSet<object>();
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const SHA = /^[a-f0-9]{64}$/;
const same = (a: unknown,b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** Pure numeric seam: the returned value is NOT a native qualification/capability. */
export function calculateNativeClock(input: {
  audioPairs: readonly AudioClockPair[]; hostPairs: readonly HostClockPair[];
  firstAudioSampleIndex: number; sampleCount: number; sampleRate: number;
  qualification: NativePlatformQualification;
}): NativeClockCalculation {
  const q=input.qualification;
  if (!q || q.schema!=='native-platform-measurement/1'||q.evidenceKind!=='native'||q.identity.platform!=='meet'||!SHA.test(q.measurementCorpusSha256)
    || ![q.quantizationUs,q.audioOutputEstimationBoundUs,q.samplerObservationLagBoundUs,q.sourceObservationLagBoundUs,q.driftBoundPpm].every(finite)
    || !q.samplerZeroEpochSec || !finite(q.samplerZeroEpochSec.earliest)||!finite(q.samplerZeroEpochSec.latest)||q.samplerZeroEpochSec.latest<q.samplerZeroEpochSec.earliest
    || ![input.firstAudioSampleIndex,input.sampleCount,input.sampleRate].every(Number.isSafeInteger)||input.firstAudioSampleIndex<0||input.sampleCount<=0||input.sampleRate<=0
    || input.audioPairs.length<2||input.audioPairs.length>100000||input.hostPairs.length<2||input.hostPairs.length>100000) throw new Error('Native qualification or clock coverage unavailable');
  const start=input.firstAudioSampleIndex/input.sampleRate, end=(input.firstAudioSampleIndex+input.sampleCount)/input.sampleRate;
  const duration=end-start, span=Math.max(duration,input.audioPairs.at(-1)!.contextTime-input.audioPairs[0]!.contextTime,(input.hostPairs.at(-1)!.browser.afterMonotonicUs-input.hostPairs[0]!.browser.beforeMonotonicUs)/1e6), drift=span*q.driftBoundPpm/1e6, allowance=q.quantizationUs+q.audioOutputEstimationBoundUs+drift*1e6;
  let audioLow=-Infinity,audioHigh=Infinity,hostLow=-Infinity,hostHigh=Infinity,bracket=0,residual=0;
  let priorContext=-1,priorPerformance=-1;
  for(const p of input.audioPairs){
    if(p.clockInstanceId!==q.identity.clockInstanceId||p.state!=='running'||p.sampleRate!==input.sampleRate||![p.contextTime,p.performanceTime,p.beforePerformanceUs,p.afterPerformanceUs].every(finite)
      ||p.afterPerformanceUs<p.beforePerformanceUs||p.contextTime<=priorContext||p.performanceTime<=priorPerformance)throw new Error('Invalid native audio clock');
    const offset=p.performanceTime*1000-p.contextTime*1e6;
    audioLow=Math.max(audioLow,offset-allowance);audioHigh=Math.min(audioHigh,offset+allowance);
    bracket=Math.max(bracket,p.afterPerformanceUs-p.beforePerformanceUs);priorContext=p.contextTime;priorPerformance=p.performanceTime;
  }
  if(input.audioPairs[0]!.contextTime>start||input.audioPairs.at(-1)!.contextTime<end)throw new Error('Native audio clock extrapolation refused');
  let prior=-1;
  for(const p of input.hostPairs){
    const b=p.browser,r=p.serverRequest,s=p.serverResponse;
    if(b.clockInstanceId!==q.identity.clockInstanceId||r.clockInstanceId!==q.serverClockInstanceId||s.clockInstanceId!==q.serverClockInstanceId
      ||[b,r,s].some(v=>![v.beforeMonotonicUs,v.afterMonotonicUs,v.epochUs].every(finite)||v.afterMonotonicUs<v.beforeMonotonicUs)
      ||r.afterMonotonicUs>s.beforeMonotonicUs||b.beforeMonotonicUs<=prior)throw new Error('Mixed or stepped native host clock');
    // Browser epoch and server round-trip epoch brackets must overlap. Arrival is not sample time.
    if(b.epochUs+q.quantizationUs<s.epochUs-(s.afterMonotonicUs-r.beforeMonotonicUs)-q.quantizationUs||b.epochUs-q.quantizationUs>r.epochUs+(s.afterMonotonicUs-r.beforeMonotonicUs)+q.quantizationUs)throw new Error('Native host epoch contradiction');
    hostLow=Math.max(hostLow,b.epochUs-b.afterMonotonicUs-q.quantizationUs-drift*1e6);
    hostHigh=Math.min(hostHigh,b.epochUs-b.beforeMonotonicUs+q.quantizationUs+drift*1e6);
    bracket=Math.max(bracket,b.afterMonotonicUs-b.beforeMonotonicUs,s.afterMonotonicUs-r.beforeMonotonicUs);prior=b.afterMonotonicUs;
  }
  if(audioLow>audioHigh||hostLow>hostHigh)throw new Error('Native clock intervals contradict measured bounds');
  const firstPerformance=start*1e6+audioLow,lastPerformance=end*1e6+audioHigh;
  if(input.hostPairs[0]!.browser.beforeMonotonicUs>firstPerformance||input.hostPairs.at(-1)!.browser.afterMonotonicUs<lastPerformance)throw new Error('Native host clock extrapolation refused');
  const center=(audioLow+audioHigh)/2;
  for(const p of input.audioPairs)residual=Math.max(residual,Math.abs(p.performanceTime*1000-p.contextTime*1e6-center));
  return {mediaZeroEpochSec:{earliest:(start*1e6+audioLow+hostLow)/1e6,latest:(start*1e6+audioHigh+hostHigh)/1e6},driftBoundSec:drift,
    highlightLagBoundSec:(q.samplerObservationLagBoundUs+q.sourceObservationLagBoundUs)/1e6,bracketWidthUs:bracket,clockFitResidualUs:residual,
    hostOffsetEpochUs:{earliest:hostLow,latest:hostHigh},hostCoveragePerformanceUs:{earliest:input.hostPairs[0]!.browser.beforeMonotonicUs,latest:input.hostPairs.at(-1)!.browser.afterMonotonicUs}};
}
export function isIssuedNativeMeasurement(value: unknown): value is TileDecodedClockMeasurement { return !!value && typeof value==='object' && issued.has(value); }
export type NativeLedgerFacts = Awaited<ReturnType<typeof readNativeSpoolLedger>>;
declare const qualifiedCaptureClock: unique symbol;
export interface QualifiedCaptureClock { readonly [qualifiedCaptureClock]: true }
export interface NativeCanonicalMeasurement {
  readonly identity: NativeCaptureIdentity; readonly audioPath: string; readonly audioSha256: string;
  readonly sampleRate: number; readonly sampleCount: number;
  readonly mediaZeroEpochUs: Readonly<{earliest:number;latest:number}>;
  readonly videoZeroEpochUs: Readonly<{earliest:number;latest:number}>;
  readonly driftBoundUs: number; readonly totalUncertaintyUs: number;
  readonly samplerZeroEpochSec: Readonly<{earliest:number;latest:number}>;
  readonly highlightLagBoundSec: number; readonly mappingSha256: string; readonly hostId: string;
}
const qualified = new WeakMap<object,{media:NativeFinalizedMedia;facts:Readonly<NativeCanonicalMeasurement>}>();
export interface NativeCaptureClockQualifierOptions {
  /** Trusted SERVER native-adapter closure. It must verify independently measured
   * platform applicability, never copy request/sidecar JSON or infer bounds from residual. */
  verifyPlatformQualification: (media:NativeFinalizedMedia, ledger:NativeLedgerFacts)=>Promise<NativePlatformQualification|null>;
}
export function createNativeCaptureClockQualifier(options:NativeCaptureClockQualifierOptions) {
  const verifier=options.verifyPlatformQualification;
  return async (media:NativeFinalizedMedia):Promise<QualifiedCaptureClock|null>=>{
    try {
      await requireNativeFinalizedMedia(media);
      const ledger=await readNativeSpoolLedger(media.spool), raw=await verifier(media,structuredClone(ledger));
      if(!raw)return null;
      const q=structuredClone(raw);
      if(!same(q.identity,media.spool.identity)||!q.hostId||!q.serverClockInstanceId)return null;
      const c=calculateNativeClock({firstAudioSampleIndex:media.canonicalAudio.firstSourceSampleIndex,sampleCount:media.canonicalAudio.sampleCount,sampleRate:media.canonicalAudio.sampleRate,qualification:q,audioPairs:ledger.audioClockPairs,hostPairs:ledger.hostClockPairs});
      if(ledger.video.some(v=>v.copyBeforeUs<c.hostCoveragePerformanceUs.earliest||v.copyAfterUs>c.hostCoveragePerformanceUs.latest))return null;
      // Immutable private capability is bound to the finalizer object, not structural JSON.
      const facts:Readonly<NativeCanonicalMeasurement>=Object.freeze({identity:media.spool.identity,audioPath:media.canonicalAudio.path,audioSha256:media.canonicalAudio.sha256,
        sampleRate:media.canonicalAudio.sampleRate,sampleCount:media.canonicalAudio.sampleCount,
        mediaZeroEpochUs:Object.freeze({earliest:c.mediaZeroEpochSec.earliest*1e6,latest:c.mediaZeroEpochSec.latest*1e6}),
        videoZeroEpochUs:Object.freeze({earliest:media.spool.firstVideoTimestampUs+c.hostOffsetEpochUs.earliest-q.sourceObservationLagBoundUs,latest:media.spool.firstVideoTimestampUs+c.hostOffsetEpochUs.latest+q.sourceObservationLagBoundUs}),driftBoundUs:c.driftBoundSec*1e6,
        totalUncertaintyUs:(c.mediaZeroEpochSec.latest-c.mediaZeroEpochSec.earliest+2*c.driftBoundSec+c.highlightLagBoundSec)*1e6,
        samplerZeroEpochSec:Object.freeze({...q.samplerZeroEpochSec}),highlightLagBoundSec:c.highlightLagBoundSec,hostId:q.hostId,
        mappingSha256:sha(JSON.stringify({ledger,qualification:q,videoMap:media.videoTransform.intervalMap,audio:media.canonicalAudio}))});
      const cap=Object.freeze({}) as QualifiedCaptureClock;qualified.set(cap,{media,facts});return cap;
    }catch{return null;}
  };
}
export async function requireNativeCanonicalMeasurement(cap:QualifiedCaptureClock,media:NativeFinalizedMedia):Promise<Readonly<NativeCanonicalMeasurement>> {
  const value=cap&&qualified.get(cap);
  if(!value||value.media!==media)throw new Error('Qualified native capture clock required');
  await requireNativeFinalizedMedia(media);return value.facts;
}
/** Root's provider adapter must obtain this from its opaque mask/transform readback.
 * Selected and silence-masked WAV retain every canonical sample; no arbitrary trim. */
export interface NativeProviderClockMap {
  readonly media:NativeFinalizedMedia; readonly canonicalClock:QualifiedCaptureClock;
  readonly audioPath:string; readonly audioSha256:string;
  readonly sampleRate:number; readonly sampleCount:number;
  readonly uncertaintyUs:number;
  readonly intervalMap:readonly {sourceStartSample:number;sourceEndSample:number;destinationStartSample:number;destinationEndSample:number}[];
}
/** Canonical private readback receipt bytes. The receipt describes verified capabilities;
 * reading/copying these bytes cannot recreate either preindex or postindex authority. */
export async function nativeMeasurementReceiptBytes(provider:NativeProviderClockMap):Promise<Buffer> {
  const c=await requireNativeCanonicalMeasurement(provider.canonicalClock,provider.media);
  return Buffer.from(JSON.stringify({schema:'native-canonical-measurement/1',identity:c.identity,canonicalAudioSha256:c.audioSha256,providerAudioSha256:provider.audioSha256,
    publicVideoSha256:provider.media.video.media.file.sha256,sampleRate:provider.sampleRate,sampleCount:provider.sampleCount,
    mappingSha256:c.mappingSha256,intervalMap:provider.intervalMap,uncertaintyUs:provider.uncertaintyUs,mediaZeroEpochUs:c.mediaZeroEpochUs,
    samplerZeroEpochSec:c.samplerZeroEpochSec,driftBoundUs:c.driftBoundUs,highlightLagBoundSec:c.highlightLagBoundSec}));
}
export interface NativeMeasurementAuthorityOptions {
  /** Both callbacks are private server adapters; HTTP/sidecar data cannot supply functions. */
  readProviderMap: (artifacts:TileMeasurementArtifacts)=>Promise<NativeProviderClockMap|null>;
  readCurrentCommitted: (tenant:string,session:string)=>Promise<TileCommittedCapture|null>;
}
/** Post-index authority is deliberately separate from pre-index privacy qualification. */
export function createNativeMeasurementAuthority(options:NativeMeasurementAuthorityOptions) {
  return async (a:TileMeasurementArtifacts):Promise<TileDecodedClockMeasurement|null>=>{
    try {
      const b=a.binding;if(b.evidenceKind!=='native')return null;
      const current=await options.readCurrentCommitted(b.tenantId,b.sessionId);
      if(!current||!same(current,b))return null;
      const provider=await options.readProviderMap(a);if(!provider)return null;
      const c=await requireNativeCanonicalMeasurement(provider.canonicalClock,provider.media), id=c.identity;
      if(id.tenantId!==b.tenantId||id.sessionId!==b.sessionId||id.captureGeneration!==b.captureGeneration||id.samplerInstanceId!==b.samplerInstance||id.platform!==b.platform||c.hostId!==b.hostId
        ||provider.audioSha256!==b.audioSha256||provider.audioPath!==a.physical.audio||provider.media.video.media.file.sha256!==b.publicVideoSha256||provider.media.video.media.file.path!==a.physical.publicVideo
        ||provider.sampleRate!==c.sampleRate||provider.sampleCount!==c.sampleCount||!finite(provider.uncertaintyUs)||!provider.intervalMap.length)return null;
      let cursor=0;
      for(const m of provider.intervalMap){
        if(![m.sourceStartSample,m.sourceEndSample,m.destinationStartSample,m.destinationEndSample].every(Number.isSafeInteger)||m.sourceStartSample!==cursor||m.destinationStartSample!==cursor||m.sourceEndSample!==m.destinationEndSample||m.sourceEndSample<=cursor)return null;
        cursor=m.sourceEndSample;
      }
      if(cursor!==c.sampleCount)return null;
      const duration=c.sampleCount/c.sampleRate;
      const clockBytes=readFileSync(a.physical.clock),expectedClock=await nativeMeasurementReceiptBytes(provider);
      if(b.durationSec!==duration||!clockBytes.equals(expectedClock)||sha(clockBytes)!==b.clockSha256||!same(await options.readCurrentCommitted(b.tenantId,b.sessionId),current))return null;
      const result:TileDecodedClockMeasurement=Object.freeze({evidenceKind:'native',method:'decoded-first-sample',captureGeneration:b.captureGeneration,hostId:b.hostId,samplerInstance:b.samplerInstance,
        audioSha256:b.audioSha256,publicVideoSha256:b.publicVideoSha256,sourceSha256:b.sourceSha256,sidecarSha256:b.sidecarSha256,receiptSha256:b.receiptSha256,
        mediaZeroEpochSec:Object.freeze({earliest:(c.mediaZeroEpochUs.earliest-provider.uncertaintyUs)/1e6,latest:(c.mediaZeroEpochUs.latest+provider.uncertaintyUs)/1e6}),samplerZeroEpochSec:c.samplerZeroEpochSec,driftBoundSec:c.driftBoundUs/1e6,highlightLagBoundSec:c.highlightLagBoundSec,
        originalDurationSec:duration,trimStartSec:0,durationSec:duration,monotonicMappingSha256:sha(JSON.stringify({canonical:c.mappingSha256,providerMap:provider.intervalMap})),measurementSha256:b.clockSha256});
      issued.add(result);return result;
    }catch{return null;}
  };
}
