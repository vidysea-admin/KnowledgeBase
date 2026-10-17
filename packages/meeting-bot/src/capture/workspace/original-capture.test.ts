import test from "node:test";
import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {bindOriginalCapture} from "./original-capture.js";
import {runFinalize} from "../record-commands.js";

test("original source binds only its exact physical slot/remux and refuses changed bytes",async()=>{
  const root=mkdtempSync(path.join(tmpdir(),"capture-original-")),slot=path.join(root,"slot"),foreign=path.join(root,"foreign.webm");
  mkdirSync(slot);const file=path.join(slot,"raw.webm"),remux=path.join(slot,"raw.playable.webm");writeFileSync(file,"original");writeFileSync(foreign,"foreign");
  try{
    const bound=await bindOriginalCapture(file,remux,slot);assert.equal(bound.file,file);await bound.verify();
    await assert.rejects(bindOriginalCapture(foreign,foreign,slot),/outside actual slot/);
    await assert.rejects(bindOriginalCapture(file,path.join(slot,"other.playable.webm"),slot),/does not match/);
    writeFileSync(file,"replaced");await assert.rejects(bound.verify(),/changed/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("actual recovery caller forwards lean and exact original artifact after lossless normalization",async t=>{
  t.mock.method(process,"loadEnvFile",()=>undefined);
  const root=mkdtempSync(path.join(tmpdir(),"capture-recovery-original-")),recordDir=path.join(root,"raw","webinars");
  mkdirSync(recordDir,{recursive:true});const original=path.join(recordDir,"original.mkv");writeFileSync(original,"fixture");
  const calls:unknown[][]=[];
  try{
    await runFinalize(["--session-id","fixture","--tenant","fixture","--title","Fixture","--video",original,"--lean-video"],
      {repoRoot:root,recordDir,profileDir:path.join(root,"profile"),normalize:video=>video,
        finalize:async(...args)=>{calls.push(args);return args[0];}});
    assert.equal(calls.length,1);assert.equal(calls[0]![0],original);assert.equal(calls[0]![10],true);assert.equal(calls[0]![11],original);
  }finally{rmSync(root,{recursive:true,force:true});}
});
