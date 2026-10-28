import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNativeClock, createNativeCaptureClockQualifier, createNativeMeasurementAuthority, isIssuedNativeMeasurement, requireNativeCanonicalMeasurement, type NativePlatformQualification, type QualifiedCaptureClock } from './native-measurement.js';
import type { NativeFinalizedMedia } from '../native-media-finalize.js';
import type { AudioClockPair, HostClockPair } from '../native-media-types.js';
import type { TileMeasurementArtifacts } from './registry.js';

/** Synthetic numeric examples test arithmetic/refusal only; never native acceptance. */
function fixture() {
  const identity={schema:'native-tab-clock/1' as const,tenantId:'t',sessionId:'s',captureGeneration:'g',captureInstanceId:'c',samplerInstanceId:'sampler',platform:'meet',browserBuild:'fixture',extensionAssetSha256:'a'.repeat(64),clockInstanceId:'browser'};
  const qualification:NativePlatformQualification={schema:'native-platform-measurement/1',evidenceKind:'native',identity,measurementCorpusSha256:'b'.repeat(64),hostId:'host',serverClockInstanceId:'server',samplerZeroEpochSec:{earliest:1001,latest:1001.00002},quantizationUs:1,audioOutputEstimationBoundUs:5,samplerObservationLagBoundUs:100,sourceObservationLagBoundUs:200,driftBoundPpm:0};
  const audioPairs:AudioClockPair[]=[0,2].map(contextTime=>({clockInstanceId:'browser',beforePerformanceUs:(contextTime+1)*1e6,afterPerformanceUs:(contextTime+1)*1e6+10,contextTime,performanceTime:(contextTime+1)*1000,state:'running',sampleRate:48000}));
  const hostPairs:HostClockPair[]=[500000,4000000].map(m=>({browser:{clockInstanceId:'browser',beforeMonotonicUs:m,afterMonotonicUs:m,epochUs:1e9+m},serverRequest:{clockInstanceId:'server',beforeMonotonicUs:m-20,afterMonotonicUs:m-10,epochUs:1e9+m-10},serverResponse:{clockInstanceId:'server',beforeMonotonicUs:m+10,afterMonotonicUs:m+20,epochUs:1e9+m+10}}));
  return {qualification,audioPairs,hostPairs,firstAudioSampleIndex:0,sampleCount:48000,sampleRate:48000};
}
test('synthetic measured bounds bracket canonical selected sample zero without using fit residual',()=>{
  const f=fixture(),m=calculateNativeClock(f);
  assert.ok(m.mediaZeroEpochSec.earliest<1001);assert.ok(m.mediaZeroEpochSec.latest>1001);
  assert.equal(m.clockFitResidualUs,0);assert.equal(m.highlightLagBoundSec,0.0003);
  f.qualification.audioOutputEstimationBoundUs=500;
  const wider=calculateNativeClock(f);assert.ok(wider.mediaZeroEpochSec.earliest<m.mediaZeroEpochSec.earliest);
  assert.equal(wider.clockFitResidualUs,0);
  assert.equal(isIssuedNativeMeasurement(m),false);
});
test('unknown independent bounds, unsupported platform, suspended clocks and extrapolation refuse',()=>{
  for(const field of ['quantizationUs','audioOutputEstimationBoundUs','samplerObservationLagBoundUs','sourceObservationLagBoundUs','driftBoundPpm'] as const){
    const f=fixture();(f.qualification as unknown as Record<string,unknown>)[field]=null;assert.throws(()=>calculateNativeClock(f));
  }
  const foreign=fixture();foreign.qualification={...foreign.qualification,identity:{...foreign.qualification.identity,platform:'zoho'}};assert.throws(()=>calculateNativeClock(foreign));
  const suspended=fixture();suspended.audioPairs[0]={...suspended.audioPairs[0]!,state:'suspended'};assert.throws(()=>calculateNativeClock(suspended));
  const absent=fixture();absent.audioPairs.shift();assert.throws(()=>calculateNativeClock(absent));
  const extrapolation=fixture();extrapolation.sampleCount=48000*4;assert.throws(()=>calculateNativeClock(extrapolation));
});
test('clock contradictions, epoch steps, mixed clock instances and unit mistakes refuse',()=>{
  const cases=[(f:ReturnType<typeof fixture>)=>{f.audioPairs[1]={...f.audioPairs[1]!,performanceTime:f.audioPairs[1]!.performanceTime+1};},
    (f:ReturnType<typeof fixture>)=>{f.hostPairs[1]={...f.hostPairs[1]!,browser:{...f.hostPairs[1]!.browser,epochUs:f.hostPairs[1]!.browser.epochUs+1000000}};},
    (f:ReturnType<typeof fixture>)=>{f.hostPairs[1]={...f.hostPairs[1]!,serverRequest:{...f.hostPairs[1]!.serverRequest,clockInstanceId:'other'}};},
    (f:ReturnType<typeof fixture>)=>{f.audioPairs[1]={...f.audioPairs[1]!,performanceTime:f.audioPairs[1]!.performanceTime*1000};}];
  for(const change of cases){const f=fixture();change(f);assert.throws(()=>calculateNativeClock(f));}
});
test('JSON cannot forge preindex or postindex capability, and verifier is not reached for forged finalizer',async()=>{
  let called=0;
  const qualify=createNativeCaptureClockQualifier({verifyPlatformQualification:async()=>{called++;return fixture().qualification;}});
  const fake={} as NativeFinalizedMedia;
  assert.equal(await qualify(fake),null);assert.equal(called,0);
  await assert.rejects(requireNativeCanonicalMeasurement({} as QualifiedCaptureClock,fake));
  assert.equal(isIssuedNativeMeasurement({evidenceKind:'native',method:'decoded-first-sample'}),false);
});
test('postindex measurement refuses absent and stale committed identities before provider authority',async()=>{
  let read=0;
  const a={binding:{evidenceKind:'native',tenantId:'t',sessionId:'s'}} as TileMeasurementArtifacts;
  const measure=createNativeMeasurementAuthority({readProviderMap:async()=>{read++;throw new Error('must not call');},readCurrentCommitted:async()=>null});
  assert.equal(await measure(a),null);assert.equal(read,0);
  const stale=createNativeMeasurementAuthority({readProviderMap:async()=>{read++;return null;},readCurrentCommitted:async()=>({...a.binding,captureGeneration:'old'})});
  assert.equal(await stale(a),null);assert.equal(read,0);
});
