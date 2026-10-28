/** CPU lease only. Real short AV tools plus intentionally stale Matroska Duration.
 * Original live/hour/host acceptance is never inferred from this synthetic edge. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

const root=process.cwd(),value=name=>process.argv[process.argv.indexOf(name)+1];
const phase=value("--phase");assert.ok(["baseline","current"].includes(phase),"--phase baseline|current required");
const evidence=path.resolve(root,"qa/evidence/t035-lean-video-measured-encode"),prefix=evidence+path.sep;
for(let current=evidence;;current=path.dirname(current)){
  if(existsSync(current))assert.equal(lstatSync(current).isSymbolicLink(),false,"Evidence aliases refused");
  if(path.dirname(current)===current)break;
}
mkdirSync(evidence,{recursive:true});
const dir=mkdtempSync(path.join(evidence,`eof-${phase}-`));
const helper=path.resolve(root,phase==="baseline"?"qa/evidence/t035-lean-video-measured-encode/pre-eof-helper.ts":"packages/meeting-bot/src/lean-video-ffmpeg.ts");
const digest=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
const helperSha256=digest(helper),scriptSha256=digest(path.resolve(root,"scripts/qa/t035-lean-video-eof-probe.mjs"));
if(phase==="baseline")assert.equal(helperSha256,"ace429c916c8326dcbdc56c21585fd51ef6cf7637255fc4d1e259393894202c0");
const {normalizeLeanCapture,probeLeanMedia}=await import(pathToFileURL(helper).href);
const startedAt=new Date().toISOString(),deadline=Date.now()+240000,commands=[],logs=[];
const run=(command,args,timeout=120000)=>{
  const start=Date.now(),bounded=Math.min(timeout,deadline-start);assert.ok(bounded>0,"Probe deadline exceeded");
  const result=spawnSync(command,args,{encoding:"utf8",timeout:bounded,killSignal:"SIGKILL",maxBuffer:2*1024*1024,windowsHide:true});
  const proof=args.includes("framemd5")||args.some(arg=>arg.includes("volumedetect"));
  commands.push({command,args,status:result.status,elapsedMs:Date.now()-start,error:result.error?.message,...(proof?{stdout:result.stdout,stderr:result.stderr}:{})});
  return result;
};
const required=(command,args,timeout)=>{const result=run(command,args,timeout);assert.equal(result.status,0,`${command}: ${result.error?.message??result.stderr}`);return result;};
const artifact=file=>({path:path.relative(root,file).replaceAll(path.sep,"/"),sizeBytes:statSync(file).size,sha256:digest(file)});
const peak=(file,filter)=>{
  const output=required("ffmpeg",["-nostdin","-hide_banner","-loglevel","info","-filter_threads","1","-threads","1","-i",file,
    "-map","0:a:0","-vn","-af",`${filter},volumedetect`,"-f","null","-"],120000).stderr;
  const raw=/max_volume:\s*(-?(?:[\d.]+|inf)) dB/.exec(output)?.[1],result=raw==="-inf"?-Infinity:Number(raw);
  assert.ok(result===-Infinity||Number.isFinite(result),"Audio proof missing");return result;
};
let report,fixture;
try{
  const ffmpeg=required("ffmpeg",["-version"],10000).stdout.split(/\r?\n/)[0];
  fixture=path.join(dir,"stale-duration-source.mkv");
  let metadataFault;
  if(phase==="baseline"){
    required("ffmpeg",["-n","-nostdin","-hide_banner","-loglevel","error","-filter_threads","1","-filter_complex_threads","1","-threads","1",
      "-f","lavfi","-i","testsrc2=size=640x360:rate=30:duration=12","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=12.2",
      "-map","0:v:0","-map","1:a:0","-af","aeval=exprs='if(gt(lt(t,2)+gte(t,12.15),0),val(0),0)',aformat=channel_layouts=mono",
      "-c:v","libx264","-preset","ultrafast","-threads","1","-b:v","2000k","-c:a","aac","-ac","1","-b:a","96k",fixture],120000);
    const before=probeLeanMedia(fixture,run),bytes=readFileSync(fixture),head=bytes.subarray(0,4096);
    assert.ok(head.includes(Buffer.from([0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40])),"Expected Matroska millisecond scale missing");
    const offset=head.indexOf(Buffer.from([0x44,0x89,0x88]));assert.ok(offset>=0,"Duration float64 missing");
    const originalMilliseconds=bytes.readDoubleBE(offset+3);
    assert.ok(Math.abs(originalMilliseconds/1000-before.duration)<0.005,"Duration field does not match probed source");
    bytes.writeDoubleBE(12000,offset+3);writeFileSync(fixture,bytes);
    metadataFault={kind:"actual Matroska Duration field changed; AV packet bytes unchanged",offset,originalMilliseconds,declaredMilliseconds:12000,before};
  }else{
    assert.ok(process.argv.includes("--fixture"),"Current probe reuses prior synthetic --fixture");
    const selected=path.resolve(root,value("--fixture"));assert.ok(selected.startsWith(prefix),"Fixture must remain in this unit's evidence");
    assert.equal(lstatSync(selected).isSymbolicLink(),false);copyFileSync(selected,fixture);
    metadataFault={kind:"reused immutable synthetic stale-duration fixture",prior:artifact(selected)};
  }
  const original=artifact(fixture),sourceMedia=probeLeanMedia(fixture,run);assert.equal(sourceMedia.duration,12);
  const sourceTailPeakDb=peak(fixture,"atrim=start=12");assert.ok(sourceTailPeakDb>-60,"Actual source audio tail must be audible");
  const cases=[];
  for(const scenario of phase==="baseline"?["private-eof"]:["private-eof","closed-private-public-tail"]){
    const input=path.join(dir,`${scenario}.mkv`);copyFileSync(fixture,input);const initial=artifact(input);
    const privateWindows=[{start:9,end:scenario==="private-eof"?12:10}];
    const output=normalizeLeanCapture(input,{enabled:false,requirePrivacyMask:true,privateWindows,run,timeoutMs:120000,log:line=>logs.push(line)});
    assert.notEqual(output,input);assert.equal(digest(input),initial.sha256);assert.equal(digest(fixture),original.sha256);
    const media=probeLeanMedia(output,run),tailPeakDb=peak(output,"atrim=start=12"),publicPrefixPeakDb=peak(output,"atrim=start=0:end=2");
    assert.ok(media.duration>12&&media.duration<=12.25,"Actual complete output must retain the longer audio");
    assert.ok(publicPrefixPeakDb>-60,"Public prefix must remain audible");
    cases.push({scenario,privateWindows,input:initial,output:artifact(output),media,tailPeakDb,publicPrefixPeakDb,
      mbPerHour:statSync(output).size/1e6*3600/media.duration,privateTailSilent:tailPeakDb<=-80});
    if(phase==="current")assert.ok(scenario==="private-eof"?tailPeakDb<=-80:tailPeakDb>-60,
      scenario==="private-eof"?"Declared EOF private audio remains audible":"Legitimate closed-window public tail was erased");
  }
  assert.equal(digest(helper),helperSha256);assert.equal(digest(path.resolve(root,"scripts/qa/t035-lean-video-eof-probe.mjs")),scriptSha256);
  const exposed=phase==="baseline"&&cases[0].tailPeakDb>-80;
  report={status:phase==="current"?"passed":exposed?"reproduced-private-tail-leak":"no-reproduction",phase,startedAt,completedAt:new Date().toISOString(),
    helper: {path:path.relative(root,helper),sha256:helperSha256},scriptSha256,ffmpeg,metadataFault,original,sourceMedia,sourceTailPeakDb,cases,commands,logs,
    scope:"Synthetic AV with real audio longer than video and intentionally stale real Matroska Duration; no live/hour/host/provider proof"};
  if(exposed)process.exitCode=1;
}catch(error){report={status:"failed",phase,startedAt,completedAt:new Date().toISOString(),error:String(error),helperSha256,scriptSha256,fixture,commands,logs};process.exitCode=1;}
writeFileSync(path.join(dir,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,phase,evidence:path.relative(root,dir)}));
