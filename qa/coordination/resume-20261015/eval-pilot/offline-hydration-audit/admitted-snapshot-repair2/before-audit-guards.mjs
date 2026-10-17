import {createHash} from 'node:crypto';
export const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function assertCoverage(expected,rows){if(expected.length!==92||new Set(expected).size!==92||rows.length!==92||new Set(rows.map(r=>r.id)).size!==92||sha(rows.map(r=>r.id))!==sha(expected))throw Error('accepted-coverage-drift');}
export function verifyQuote(q,turn,node,source){
 if(!turn||!source||source.consent?.given!==true||turn.sessionId!==node.evidence.sessionRef||q.sessionRef!==turn.sessionId||q.nodeId!==node.node_id||q.turnId!==turn._id)throw Error('quote-source-identity');
 const screen=turn.speakerRef==='screen'||turn.screenEvidence!==undefined,origin=screen?(turn.text.startsWith('[Screen OCR; unverified]')?'screen-ocr-unverified':turn.text.startsWith('[Visual observation; unverified]')?'visual-observation-unverified':null):'speech';
 if(q.speakerRef!==(screen?'screen':turn.speakerRef)||q.origin!==origin||!origin||q.tStart!==turn.tStart||q.tEnd!==turn.tEnd)throw Error('quote-speaker-origin-time');
 if(!Number.isSafeInteger(q.charStart)||!Number.isSafeInteger(q.charEnd)||q.charStart<0||q.charEnd<=q.charStart||q.charEnd>turn.text.length
  ||q.quote!==turn.text.slice(q.charStart,q.charEnd)||q.byteStart!==Buffer.byteLength(turn.text.slice(0,q.charStart),'utf8')||q.byteEnd!==Buffer.byteLength(turn.text.slice(0,q.charEnd),'utf8')
  ||(q.charStart>0&&/[\uD800-\uDBFF]/.test(turn.text[q.charStart-1]))||/[\uD800-\uDBFF]/.test(turn.text[q.charEnd-1]))throw Error('quote-offset-or-substring');
 if(q.turnTextSHA256!==sha(turn.text)||q.sliceSHA256!==sha(q.quote)||q.id!=='quote-'+sha([node.node_id,turn._id,{charStart:q.charStart,charEnd:q.charEnd},q.quote]).slice(0,24))throw Error('quote-revision-hash');
 return {id:q.id,turnId:q.turnId,sessionRef:q.sessionRef,speakerRef:q.speakerRef,charStart:q.charStart,charEnd:q.charEnd,byteStart:q.byteStart,byteEnd:q.byteEnd,turnTextSHA256:q.turnTextSHA256,sliceSHA256:q.sliceSHA256,origin:q.origin};
}
