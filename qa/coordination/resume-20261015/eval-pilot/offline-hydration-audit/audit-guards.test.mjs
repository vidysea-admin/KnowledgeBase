import test from 'node:test';import assert from 'node:assert/strict';import {sha,verifyQuote,assertCoverage,assertCurrentSnapshot} from './audit-guards.mjs';
test('audit coverage and citation verifier reject duplicates UTF16 byte drift hashes and revoked consent',()=>{
 const ids=Array.from({length:92},(_,i)=>'synthetic-'+i);assert.doesNotThrow(()=>assertCoverage(ids,ids.map(id=>({id}))));assert.throws(()=>assertCoverage(ids,ids.map((id,i)=>({id:i===91?ids[0]:id}))));
 const turn={_id:'t',sessionId:'s',speakerRef:'spk:1',text:'A😀 visa',tStart:1,tEnd:2},node={node_id:'session:s',evidence:{sessionRef:'s'}},source={consent:{given:true}};
 const span={charStart:1,charEnd:3},quote=turn.text.slice(1,3),q={id:'quote-'+sha([node.node_id,turn._id,span,quote]).slice(0,24),nodeId:node.node_id,sessionRef:'s',turnId:'t',speakerRef:'spk:1',tStart:1,tEnd:2,...span,byteStart:1,byteEnd:5,quote,origin:'speech',turnTextSHA256:sha(turn.text),sliceSHA256:sha(quote)};
 assert.equal(verifyQuote(q,turn,node,source).sliceSHA256,sha(quote));
 for(const patch of [{byteEnd:3},{charStart:2},{sliceSHA256:sha('forged')},{speakerRef:'other'},{turnId:'foreign'}])assert.throws(()=>verifyQuote({...q,...patch},turn,node,source));
 assert.throws(()=>verifyQuote(q,turn,node,{consent:{given:false}}));
});

test('admitted snapshot oracle preserves invalid timerange data yet rejects forged snapshot and excluded-turn quote',()=>{
 const valid={_id:'good',sessionId:'s',text:'Current supported excerpt',speakerRef:'spk:0',tStart:1,tEnd:2},invalid={_id:'bad',sessionId:'s',text:'Excluded original unchanged',speakerRef:'spk:0',tStart:5,tEnd:4};
 const raw=[valid,invalid],admitted=[valid],rawBefore=sha(raw),expected=sha({rows:admitted,chunks:[]});
 assert.equal(assertCurrentSnapshot({snapshotSHA256:expected},raw,admitted).admittedIds.size,1);assert.equal(sha(raw),rawBefore);
 assert.throws(()=>assertCurrentSnapshot({snapshotSHA256:sha({rows:raw,chunks:[]})},raw,admitted),/current-snapshot-revision/);
 assert.throws(()=>assertCurrentSnapshot({snapshotSHA256:expected},raw,[{...valid,text:'forged'}]),/admitted-row-not-current-raw/);
 assert.throws(()=>verifyQuote({turnId:'bad'},invalid,{evidence:{sessionRef:'s'}},{consent:{given:true}},new Set(['good'])),/quoted-turn-not-admitted/);
 const four=['a','b','c','d'];assert.doesNotThrow(()=>assertCoverage(four,four.map(id=>({id})),4));assert.throws(()=>assertCoverage(four,[{id:'a'},{id:'a'},{id:'c'},{id:'d'}],4));
});
