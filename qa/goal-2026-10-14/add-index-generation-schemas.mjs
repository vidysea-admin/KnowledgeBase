import {readFileSync,writeFileSync} from 'node:fs';
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const identity={type:'string',minLength:1,maxLength:400};
const binding={type:'object',additionalProperties:false,required:['version','generation','sessionId','sourceId','turnDigest'],properties:{version:{const:1},generation:{type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'},sessionId:identity,sourceId:identity,turnDigest:digest}};
const reference={type:'object',additionalProperties:false,required:['id','digest'],properties:{id:identity,digest}};
const refs={type:'array',maxItems:20000,items:reference};
const manifest={type:'object',additionalProperties:false,required:['page','chunks','claims','preservedClaims','treeRevision'],properties:{page:reference,chunks:{...refs,minItems:1},claims:refs,preservedClaims:refs,treeRevision:{type:'integer',minimum:0,maximum:9007199254740991}}};
const attempt={...binding,title:'SessionIndexAttempt',required:[...binding.required,'strict','state','phase','startedAt','turnCount'],properties:{...binding.properties,strict:{type:'boolean'},state:{enum:['running','complete','failed','uncertain']},phase:{enum:['preflight','writing']},startedAt:{type:'string',format:'date-time'},finishedAt:{type:'string',format:'date-time'},turnCount:{type:'integer',minimum:1,maximum:9007199254740991},manifest},allOf:[{if:{properties:{state:{const:'complete'}},required:['state']},then:{required:['finishedAt','manifest']}}]};
const sampleBinding={version:1,generation:'11111111-1111-4111-8111-111111111111',sessionId:'sess1',sourceId:'src1',turnDigest:'a'.repeat(64)};
for(const name of ['sessions','session_pages','claims','chunks','tree_index']) {
  const path=`schema/${name}.schema.json`,schema=JSON.parse(readFileSync(path,'utf8'));
  const sample=JSON.parse(readFileSync(`schema/fixtures/${name}/valid.json`,'utf8'));
  if(name==='sessions') {schema.properties.indexAttempt=attempt;sample.indexAttempt={...sampleBinding,sessionId:sample._id,sourceId:sample.sourceId,strict:true,state:'complete',phase:'writing',startedAt:'2026-10-14T00:00:00Z',finishedAt:'2026-10-14T00:01:00Z',turnCount:1,manifest:{page:{id:'page1',digest:'b'.repeat(64)},chunks:[{id:'chunk1',digest:'c'.repeat(64)}],claims:[],preservedClaims:[],treeRevision:1}};}
  else if(name==='tree_index') {schema.properties.indexRevision={type:'integer',minimum:0,maximum:9007199254740991};schema.$defs.node.properties.indexArtifact={...binding,title:'TreeSessionIndexArtifact'};sample.indexRevision=1;sample.children.push({node_id:'tenant:toc/session:sess1',title:'Synthetic session',level:'session',summary:'',children:[],evidence:{sessionRef:'sess1'},indexArtifact:sampleBinding});}
  else {schema.properties.indexArtifact={...binding,title:({session_pages:'SessionPageIndexArtifact',claims:'ClaimIndexArtifact',chunks:'ChunkIndexArtifact'})[name]};sample.indexArtifact=sampleBinding;}
  writeFileSync(path,JSON.stringify(schema,null,2)+'\n');
  writeFileSync(`schema/fixtures/${name}/valid-index-generation.json`,JSON.stringify(sample,null,2)+'\n');
  const damaged=structuredClone(sample);
  if(name==='sessions') damaged.indexAttempt.generation='unbound';
  else if(name==='tree_index') damaged.children.at(-1).indexArtifact.turnDigest='unbound';
  else damaged.indexArtifact.generation='unbound';
  writeFileSync(`schema/fixtures/${name}/invalid-index-generation.json`,JSON.stringify(damaged,null,2)+'\n');
}
console.log('Canonical index-attempt/artifact metadata and synthetic positive/malformed fixtures authored; validation/generation pending.');
