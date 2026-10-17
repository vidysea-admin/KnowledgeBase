import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizedCaptureVideo } from "./finalize-workspace-recording.js";
test("downstream consumes actual public derivative; void and empty production results cannot fall back to raw",()=>{
  assert.equal(finalizedCaptureVideo("public.mp4","raw.webm",false),"public.mp4");
  assert.throws(()=>finalizedCaptureVideo(undefined,"raw.webm",false),/verified public/);
  assert.throws(()=>finalizedCaptureVideo("","raw.webm",false),/verified public/);
  assert.equal(finalizedCaptureVideo(undefined,"synthetic.webm",true),"synthetic.webm");
});
