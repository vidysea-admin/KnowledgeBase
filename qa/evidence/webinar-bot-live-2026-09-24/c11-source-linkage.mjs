// CHECKER-authored. READ-ONLY. Resolve chunks/claims to the session via its real source id.
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const SID='2026-09-24-zoho-next-european-study-destinations';
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
const sess=await db.collection('sessions').findOne({_id:SID});
console.log('session.sourceId =', sess?.sourceId);
const sref=sess?.sourceId;
console.log('chunks  where sourceRef=sourceId :', await db.collection('chunks').countDocuments({sourceRef:sref}));
const turnIds=(await db.collection('turns').find({sessionId:SID},{projection:{_id:1}}).toArray()).map(t=>t._id);
console.log('turns in session                 :', turnIds.length);
console.log('chunks whose turnRefs hit a turn :', await db.collection('chunks').countDocuments({turnRefs:{$in:turnIds}}));
console.log('claims whose evidence hits a turn:', await db.collection('claims').countDocuments({'evidence.turnId':{$in:turnIds}}));
const anyClaim=await db.collection('claims').findOne({'evidence.turnId':{$in:turnIds}});
console.log('sample linked claim              :', anyClaim? JSON.stringify(anyClaim).slice(0,180) : '(none)');
await c.close();
