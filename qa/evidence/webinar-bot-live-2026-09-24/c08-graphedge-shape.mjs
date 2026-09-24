import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const c=new MongoClient(process.env.MONGODB_URL,{serverSelectionTimeoutMS:8000}); await c.connect();
const db=c.db(process.env.MONGODB_DB||'lkb');
const g=db.collection('graph_edges');
console.log('edge kinds:', JSON.stringify(await g.aggregate([{$group:{_id:'$kind',n:{$sum:1}}},{$sort:{n:-1}}]).toArray()));
console.log('sample edge:', JSON.stringify(await g.findOne({}), null, 1).slice(0,700));
console.log('\nspeakers sample:', JSON.stringify(await db.collection('speakers').find({},{projection:{_id:1,name:1,tenantId:1}}).limit(6).toArray()));
console.log('topics count:', await db.collection('topics').countDocuments({}), ' orgs:', await db.collection('orgs').countDocuments({}));
await c.close();
