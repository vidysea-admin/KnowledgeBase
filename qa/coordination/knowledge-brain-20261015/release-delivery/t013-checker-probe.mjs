import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const file='apps/web/src/pages/counsellor/Avatar.tsx';
const bytes=fs.readFileSync(file);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'1502f4f5ea97202a76d5581b43f9399f445ec535e945563dddeb4362b9fd5bc3');
const source=bytes.toString('utf8');
const body=source.match(/const lost = \(event: Event\): void => \{ ([^\r\n]+) \};/);
assert.ok(body,'exact actual context-loss handler found');
let pending=new Set([73]); let fallback=false; let prevented=false;
const cancelled=[];
const handler=Function('frame','cancelAnimationFrame','setUnavailable',`return event => { ${body[1]} };`)(73,id=>{cancelled.push(id);pending.delete(id);},value=>{fallback=value;});
handler({preventDefault(){prevented=true;}});
assert.equal(prevented,true); assert.equal(fallback,true);
assert.deepEqual(cancelled,[73]); assert.equal(pending.size,0);
// Independent boundary: loss never requests a fresh frame; source itself must
// contain the exact cleanup closure for listener + all four owned resources.
assert.doesNotMatch(body[1],/requestAnimationFrame/);
const cleanup=source.match(/return \(\) => \{ (cancelAnimationFrame\(frame\); element\.removeEventListener\("webglcontextlost", lost\); gl\.deleteBuffer\(buffer\); gl\.deleteProgram\(program\); gl\.deleteShader\(vertex\); gl\.deleteShader\(fragment\);) \};/);
assert.ok(cleanup,'actual cleanup closure found');
const calls=[]; const resources={buffer:{},program:{},vertex:{},fragment:{}};
const gl={deleteBuffer:x=>calls.push(['buffer',x]),deleteProgram:x=>calls.push(['program',x]),deleteShader:x=>calls.push(['shader',x])};
const element={removeEventListener:(kind,listener)=>{assert.equal(kind,'webglcontextlost');assert.equal(listener,handler);calls.push(['listener']);}};
Function('frame','cancelAnimationFrame','element','lost','gl','buffer','program','vertex','fragment',cleanup[1])(73,id=>pending.delete(id),element,handler,gl,...Object.values(resources));
assert.deepEqual(calls,[['listener'],['buffer',resources.buffer],['program',resources.program],['shader',resources.vertex],['shader',resources.fragment]]);
assert.equal(pending.size,0);
console.log('PASS independent source-derived C2/C3/C4 handler and cleanup boundary; fixture only, not mounted React or GPU evidence');
