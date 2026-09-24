// CHECKER-authored. READ-ONLY.
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const c = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 8000 });
await c.connect();
const db = c.db(process.env.MONGODB_DB || 'lkb');
console.log('tenants:', JSON.stringify(await db.collection('tenants').find({},{projection:{_id:1,name:1}}).toArray()));
console.log('api_keys by tenant/label:', JSON.stringify(await db.collection('api_keys').find({},{projection:{tenantId:1,label:1,revokedAt:1}}).toArray()));
const sid='2026-09-24-zoho-next-european-study-destinations';
console.log('turns for session by tenant:', JSON.stringify(await db.collection('turns').aggregate([{$match:{sessionId:sid}},{$group:{_id:'$tenantId',n:{$sum:1}}}]).toArray()));
console.log('graph_edges by tenant:', JSON.stringify(await db.collection('graph_edges').aggregate([{$group:{_id:'$tenantId',n:{$sum:1}}}]).toArray()));
await c.close();
