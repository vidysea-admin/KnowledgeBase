// CHECKER-authored. READ-ONLY. Does the new session exist in tree_index / chunks?
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const SID='2026-09-24-zoho-next-european-study-destinations';
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
const ti = await db.collection('tree_index').find({tenantId:'toc'}).toArray();
console.log('tree_index docs for toc:', ti.length);
for (const d of ti) {
  const s=JSON.stringify(d);
  console.log('  _id:', d._id, '| updatedAt:', d.updatedAt||d.builtAt||'(none)', '| mentions this session:', s.includes(SID));
}
console.log('chunks for this session:', await db.collection('chunks').countDocuments({sessionId:SID}));
console.log('chunks total (toc):', await db.collection('chunks').countDocuments({tenantId:'toc'}));
console.log('session_pages for this session:', await db.collection('session_pages').countDocuments({sessionId:SID}));
const sess = await db.collection('sessions').findOne({_id:SID});
console.log('session doc keys:', sess?Object.keys(sess).join(','):'(missing)');
await c.close();
