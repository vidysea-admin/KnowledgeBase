import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {finalizeRecordingWith} from './record-finalize.ts';
import {createRecordConsent} from './record-consent/context.ts';
import {writeRecordConsent} from './record-consent/receipt-store.ts';
import {createTelegramNotifier} from './notify/telegram-alerts.ts';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const corpus=path.join(repo,'qa/evidence/t035-lean-video-measured-encode/eof-baseline-zeYvkn/stale-duration-source.mkv');
const expected='d07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function command(program,args){
  const result=spawnSync(program,args,{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,windowsHide:true});
  assert.equal(result.status,0,result.error?.message??result.stderr);return result;
}

test('private raw clock unavailable refuses before encoder/extraction even when a remux exists',async()=>{
  assert.equal(hash(corpus),expected);
  const root=mkdtempSync(path.join(tmpdir(),'capture-eof-unknown-')),recordDir=path.join(root,'raw','webinars');mkdirSync(recordDir,{recursive:true});
  const input=path.join(recordDir,'original.webm'),selected=path.join(recordDir,'original.playable.webm');copyFileSync(corpus,input);copyFileSync(corpus,selected);
  const owner={tenantId:'fixture',sessionId:'unknown-clock',meetingUrl:'https://example.invalid/fixture'};
  const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:'fixture',LKB_CAPTURE_APPROVED_BY:'fixture',LKB_CAPTURE_APPROVAL_REF:'fixture'},new Date(1000));
  receipt.mediaStartedAt=1000;receipt.privateWindows=[{tStart:9,tEnd:12}];writeRecordConsent(recordDir,receipt);
  const probes=[];let extracted=false;
  try{
    await assert.rejects(finalizeRecordingWith({repoRoot:root,recordDir,tenantId:owner.tenantId,lean:true,originalVideo:input,
      probeMedia:file=>{probes.push(file);return NaN;},extractAudio:()=>{extracted=true;}},selected,owner.sessionId,'Fixture','fixture',false,[],
      createTelegramNotifier({token:'',chatId:'',log:()=>{}})),/Original private capture timeline unavailable/);
    assert.deepEqual(probes,[input]);assert.equal(extracted,false);
    assert.equal(existsSync(path.join(root,'data','toc-migrated',owner.sessionId,'source.json')),false);
    assert.equal(hash(input),expected);
  }finally{rmSync(root,{recursive:true,force:true});}
});
function peak(file,filter){
  const result=command('ffmpeg',['-nostdin','-hide_banner','-i',file,'-map','0:a:0','-vn','-af',`${filter},volumedetect`,'-f','null','-']);
  const match=/max_volume:\s*(-?(?:[\d.]+|inf)) dB/.exec(result.stderr);assert.ok(match);
  return match[1]==='-inf'?-Infinity:Number(match[1]);
}
for(const [scenario,end,remux] of [['private-eof',12,false],['closed-private-public-tail',10,false],['raw-remux-private-eof',12,true],['raw-remux-closed-public-tail',10,true]]){
  test(`actual finalizer preserves exact original12s clock: ${scenario}`,{timeout:120000},async()=>{
    assert.equal(hash(corpus),expected,'Must replay exact recorded corpus, never regenerate a weaker fixture');
    const root=mkdtempSync(path.join(tmpdir(),'capture-eof-consumer-')),recordDir=path.join(root,'raw','webinars');
    mkdirSync(recordDir,{recursive:true});const input=path.join(recordDir,remux?'original.webm':'original.mkv');copyFileSync(corpus,input);
    const selected=remux?path.join(recordDir,'original.playable.webm'):input;
    if(remux){
      // Exact old H264/AAC Matroska corpus retained; change only container timing,
      // not codecs, so use explicit Matroska under the established remux filename.
      command('ffmpeg',['-n','-nostdin','-hide_banner','-loglevel','error','-i',input,'-c','copy','-f','matroska',selected]);
      const remuxMedia=JSON.parse(command('ffprobe',['-v','error','-show_format','-of','json',selected]).stdout);
      assert.ok(Number(remuxMedia.format.duration)>12,'Remux must actually expose the longer EOF, not merely use another filename');
    }
    const owner={tenantId:'fixture',sessionId:'capture-eof',meetingUrl:'https://example.invalid/fixture'};
    const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:'fixture',LKB_CAPTURE_APPROVED_BY:'fixture',LKB_CAPTURE_APPROVAL_REF:'fixture'},new Date(1000));
    receipt.mediaStartedAt=1000;receipt.privateWindows=[{tStart:9,tEnd:end}];writeRecordConsent(recordDir,receipt);
    const notifier=createTelegramNotifier({token:'',chatId:'',log:()=>{},send:async()=>assert.fail('No external sends permitted')});
    try{
      const output=await finalizeRecordingWith({repoRoot:root,recordDir,tenantId:owner.tenantId,lean:true,originalVideo:input},selected,owner.sessionId,'Fixture','fixture',false,[],notifier);
      assert.notEqual(output,input);assert.equal(hash(input),expected);assert.equal(hash(corpus),expected);
      const media=JSON.parse(command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output]).stdout);
      assert.ok(Number(media.format.duration)>12&&Number(media.format.duration)<=12.25,'Complete longer audio must remain, no truncation');
      const tail=peak(output,'atrim=start=12');assert.ok(end===12?tail<=-80:tail>-60,`Decoded EOF tail ${tail}`);
      assert.ok(peak(output,'atrim=start=0:end=2')>-60,'Public prefix must remain audible');
      const source=JSON.parse(readFileSync(path.join(root,'data','toc-migrated',owner.sessionId,'source.json'),'utf8'));
      assert.equal(path.resolve(root,source.captureConsent.originalAudioPath),input,'Provenance must retain actual prelean original');
      assert.equal(source.captureConsent.publicVideoSha256,hash(output));
      assert.equal(source.captureConsent.originalVideoSha256,expected);
      assert.equal(source.captureConsent.generation,receipt.generation);
      const validation=JSON.parse(readFileSync(path.join(root,'data','toc-migrated',owner.sessionId,'validation.json'),'utf8'));
      assert.equal(validation.durationSec,12,'Consent/source clock must come from original, not padded derivative');
      assert.equal(validation.transcriptValidated,false);
      console.log(JSON.stringify({scenario,sourceSha256:expected,sourceDuration:12,outputDuration:Number(media.format.duration),tailPeakDb:tail,originalUnchanged:true}));
    }finally{rmSync(root,{recursive:true,force:true});}
  });
}
