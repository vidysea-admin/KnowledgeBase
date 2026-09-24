// CHECKER-authored. READ-ONLY. Has the shared lkb DB changed under the main tree?
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const SID='2026-09-24-zoho-next-european-study-destinations';
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
console.log('chunks for THIS session :', await db.collection('chunks').countDocuments({sessionId:SID}));
console.log('session_pages for it    :', await db.collection('session_pages').countDocuments({sessionId:SID}));
console.log('claims for it           :', await db.collection('claims').countDocuments({sessionId:SID}));
const ti=await db.collection('tree_index').find({tenantId:'toc'}).toArray();
console.log('tree_index docs (toc)   :', ti.length, '| any mentions this session:', ti.some(d=>JSON.stringify(d).includes(SID)));
console.log('topics total            :', await db.collection('topics').countDocuments({}), '(was 15 earlier this session)');
console.log('orgs total              :', await db.collection('orgs').countDocuments({}), '(was 6 earlier this session)');
console.log('chunks total            :', await db.collection('chunks').countDocuments({}), '(was 1452 earlier this session)');
await c.close();
