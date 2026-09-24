// CHECKER: validate T-024b [C8] — every non-structural graph_edges row has evidence resolving to a turn of the same session/tenant.
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const STRUCTURAL=new Set(['held_on','in_month','captured','located_in']);
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
const edges=await db.collection('graph_edges').find({}).toArray();
const turns=new Map((await db.collection('turns').find({},{projection:{_id:1,sessionId:1,tenantId:1}}).toArray()).map(t=>[t._id,t]));
let ok=0,noEv=0,bad=0;
for(const e of edges){
  if(STRUCTURAL.has(e.type)) continue;
  const ev=e.evidence||[];
  if(!ev.length){ noEv++; console.log('  NO EVIDENCE:', e.type, e._id.slice(0,70)); continue; }
  let good=true;
  for(const x of ev){ const t=turns.get(x.turnId); if(!t||t.sessionId!==e.sessionRef||t.tenantId!==e.tenantId){ good=false; } }
  good?ok++:bad++;
  if(!good) console.log('  UNRESOLVED:', e.type, e._id.slice(0,70));
}
console.log(`non-structural edges: ok=${ok} noEvidence=${noEv} unresolved=${bad}`);
console.log('C8 verdict:', (noEv===0&&bad===0)?'HOLDS':'FAILS');
await c.close();
