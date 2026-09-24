// CHECKER-authored (not the maker's). READ-ONLY. webinar-bot-live cycle 0.
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
const url = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const c = new MongoClient(url, { serverSelectionTimeoutMS: 8000 });
try {
  await c.connect();
  const db = c.db(process.env.MONGODB_DB || 'lkb');
  const names = (await db.listCollections().toArray()).map(x=>x.name).sort();
  console.log('CONNECTED  db:', db.databaseName, ' transport:', url.startsWith('mongodb+srv')?'atlas-srv':'direct');
  console.log('collections:', names.join(', '));
  for (const n of ['sessions','turns','graph_edges','speakers','sources','orgs','topics']) {
    if (names.includes(n)) console.log(`  ${n}: ${await db.collection(n).countDocuments({})}`);
  }
} catch (e) { console.log('MONGO UNREACHABLE:', e.constructor.name, String(e.message).slice(0,200)); }
finally { await c.close().catch(()=>{}); }
