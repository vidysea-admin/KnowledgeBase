import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TOKEN_FIELDS, snapshot, phaseDelta, writeReceipt } from '../../../scripts/qa/review-runtime-usage.mjs';
const root = await mkdtemp(path.join(tmpdir(), 'checker-public-runtime-'));
const file = path.join(root, 'public.jsonl');
const t = '2026-10-15T00:00:00Z';
const take = async (n, boundary, complete=true) => {
  const events = [
    {type:'session_meta', payload:{id:'public-thread',agent_path:'/root/public',base_instructions:'PRIVATE_SENTINEL'}},
    {type:'response_item',payload:{content:'PRIVATE_SENTINEL'}},
    {timestamp:t,type:'event_msg',payload:{type:'task_started'}},
    {timestamp:t,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:Object.fromEntries(TOKEN_FIELDS.map(k=>[k,n]))},secret:'PRIVATE_SENTINEL'}},
    ...(complete ? [{timestamp:t,type:'event_msg',payload:{type:'task_complete',last_agent_message:'PRIVATE_SENTINEL'}}] : [])
  ];
  await writeFile(file, events.map(x=>JSON.stringify(x)).join('\n')+'\n');
  return snapshot({unit:'independent-public',cycle:0,phase:'review',boundary,agentPrefix:'/root/public',sessions:[file]});
};
try {
  const baseline = await take(20,'baseline');
  const end = await take(25,'end');
  assert.equal(JSON.stringify({baseline,end}).includes('PRIVATE_SENTINEL'),false);
  const delta = phaseDelta(baseline,end);
  assert.equal(delta.actual_tokens.total_tokens,5);
  assert.equal(delta.actual_tokens.input_tokens,5);
  assert.equal(delta.advisory.full_role_ratio_verified,false);
  for (const sample of [phaseDelta({...baseline,records:[]},end),phaseDelta(baseline,await take(19,'end')),phaseDelta(baseline,await take(26,'end',false))]) {
    assert.equal(sample.status,'unknown'); assert.equal(sample.actual_tokens,null);
  }
  await assert.rejects(writeReceipt(root,path.join(path.dirname(root),'checker-public-refused.json'),{}),/outside_workspace/);
  await assert.rejects(writeReceipt(root,'relative.json',{}),/absolute/);
  console.log('PASS independent public privacy; missing/reset/inflight unknown; output confinement');
} finally { await rm(root,{recursive:true,force:true}); }