import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildSourceSlices,sourceSpanText} from "./source-spans.js";
const hash = (s:string) => createHash("sha256").update(s).digest("hex");
test("long multilingual source has exact contiguous UTF16/UTF8 coverage without invented refs", () => {
 const original={_id:"long",text:"🙂नमस्ते東京".repeat(900)};
 const slices=buildSourceSlices([original]); assert.ok(slices.length>10);
 let chars=0,bytes=0;const restored=[];
 for(const slice of slices){assert.ok(Buffer.byteLength(slice.text)<=1024);assert.equal(slice.rawTextSha256,hash(slice.text));
  assert.deepEqual(slice.turnRefs,["long"]); assert.ok(Object.isFrozen(slice));
  for(const span of slice.sourceSpans){assert.equal(span.charStart,chars);assert.equal(span.byteStart,bytes);const text=sourceSpanText(span,original);restored.push(text);chars=span.charEnd;bytes=span.byteEnd;}}
 assert.equal(restored.join(""),original.text); assert.equal(bytes,Buffer.byteLength(original.text));
});
test("adjacent turns reconstruct exact slices with only explicit separator",()=>{
 const turns=[{_id:"a",text:"first"},{_id:"b",text:"second🙂"}];
 for(const plan of buildSourceSlices(turns,8)){assert.equal(plan.text,plan.sourceSpans.map(s=>sourceSpanText(s,turns.find(t=>t._id===s.turnId)!)).join(" "));}
});
test("changed source, byte offsets, slice hash and split-surrogate offsets refuse",()=>{
 const original={_id:"a",text:"🙂original"};const span=buildSourceSlices([original])[0]!.sourceSpans[0]!;
 for(const bad of [{...span,byteStart:1},{...span,sliceSHA256:"0".repeat(64)}])assert.throws(()=>sourceSpanText(bad,original));
 assert.throws(()=>sourceSpanText(span,{...original,text:"different"}));
 const half={...span,charStart:1,byteStart:3,sliceSHA256:hash(original.text.slice(1))};assert.throws(()=>sourceSpanText(half,original));
});
test("duplicate ids, malformed Unicode and invalid size refuse rather than drop text",()=>{
 assert.throws(()=>buildSourceSlices([{_id:"a",text:"one"},{_id:"a",text:"two"}]));
 assert.throws(()=>buildSourceSlices([{_id:"a",text:"\ud800"}]));
 assert.throws(()=>buildSourceSlices([{_id:"a",text:"okay"}],2048));
});
