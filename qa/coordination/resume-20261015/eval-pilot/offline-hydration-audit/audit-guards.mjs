import {createHash} from 'node:crypto';
export const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function assertCoverage(expected,rows,requiredCount=92){if(![4,92].includes(requiredCount)||expected.length!==requiredCount||new Set(expected).size!==requiredCount||rows.length!==requiredCount||new Set(rows.map(r=>r.id)).size!==requiredCount||sha(rows.map(r=>r.id))!==sha(expected))throw Error('accepted-coverage-drift');}
export function verifyQuote(q,turn,node,source,admittedIds){
 if(admittedIds&&!admittedIds.has(q.turnId))throw Error('quoted-turn-not-admitted');
 if(!turn||!source||source.consent?.given!==true||turn.sessionId!==node.evidence.sessionRef||q.sessionRef!==turn.sessionId||q.nodeId!==node.node_id||q.turnId!==turn._id)throw Error('quote-source-identity');
 const screen=turn.speakerRef==='screen'||turn.screenEvidence!==undefined,origin=screen?(turn.text.startsWith('[Screen OCR; unverified]')?'screen-ocr-unverified':turn.text.startsWith('[Visual observation; unverified]')?'visual-observation-unverified':null):'speech';
 if(q.speakerRef!==(screen?'screen':turn.speakerRef)||q.origin!==origin||!origin||q.tStart!==turn.tStart||q.tEnd!==turn.tEnd)throw Error('quote-speaker-origin-time');
 if(!Number.isSafeInteger(q.charStart)||!Number.isSafeInteger(q.charEnd)||q.charStart<0||q.charEnd<=q.charStart||q.charEnd>turn.text.length
  ||q.quote!==turn.text.slice(q.charStart,q.charEnd)||q.byteStart!==Buffer.byteLength(turn.text.slice(0,q.charStart),'utf8')||q.byteEnd!==Buffer.byteLength(turn.text.slice(0,q.charEnd),'utf8')
  ||(q.charStart>0&&/[\uD800-\uDBFF]/.test(turn.text[q.charStart-1]))||/[\uD800-\uDBFF]/.test(turn.text[q.charEnd-1]))throw Error('quote-offset-or-substring');
 if(q.turnTextSHA256!==sha(turn.text)||q.sliceSHA256!==sha(q.quote)||q.id!=='quote-'+sha([node.node_id,turn._id,{charStart:q.charStart,charEnd:q.charEnd},q.quote]).slice(0,24))throw Error('quote-revision-hash');
 return {id:q.id,turnId:q.turnId,sessionRef:q.sessionRef,speakerRef:q.speakerRef,charStart:q.charStart,charEnd:q.charEnd,byteStart:q.byteStart,byteEnd:q.byteEnd,turnTextSHA256:q.turnTextSHA256,sliceSHA256:q.sliceSHA256,origin:q.origin};
}

/** Oracle rows are read independently BEFORE candidate hydration; candidate hash is never an expected value. */
export function assertCurrentSnapshot(proof,rawRows,admittedRows){
 const raw=new Map(rawRows.map(t=>[t._id,t])),seen=new Set();
 for(const row of admittedRows){if(seen.has(row._id)||!raw.has(row._id)||sha(row)!==sha(raw.get(row._id)))throw Error('admitted-row-not-current-raw');seen.add(row._id);}
 const expected=sha({rows:admittedRows,chunks:[]});if(proof.snapshotSHA256!==expected)throw Error('current-snapshot-revision');
 return {expectedSnapshotSHA256:expected,rawSnapshotSHA256:sha({rows:rawRows,chunks:[]}),admittedIds:seen};
}
