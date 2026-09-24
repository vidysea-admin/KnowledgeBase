// CHECKER-authored. READ-ONLY. How do the new chunks/claims link back to the session?
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const SID='2026-09-24-zoho-next-european-study-destinations';
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
const one=await db.collection('chunks').findOne({});
console.log('chunk field names:', one?Object.keys(one).join(', '):'(none)');
for (const f of ['sessionId','sessionRef','session_id','sourceId','pageId']) {
  try { console.log(`  chunks where ${f}=SID:`, await db.collection('chunks').countDocuments({[f]:SID})); } catch(e){}
}
const cl=await db.collection('claims').findOne({});
console.log('claim field names:', cl?Object.keys(cl).join(', '):'(none)');
for (const f of ['sessionId','sessionRef','session_id','sourceId']) {
  try { console.log(`  claims where ${f}=SID:`, await db.collection('claims').countDocuments({[f]:SID})); } catch(e){}
}
const sp=await db.collection('session_pages').findOne({sessionId:SID});
console.log('session_page keys:', sp?Object.keys(sp).join(', '):'(none)');
await c.close();
