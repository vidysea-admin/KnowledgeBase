/** [I1] which tenants actually hold graph_edges rows — proves the scoping is doing work. */
import "dotenv/config";
import { MongoClient } from "../../../packages/db/node_modules/mongodb/lib/index.js";
const c = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 8000 });
await c.connect();
const db = c.db(process.env.MONGODB_DB || "lkb");
console.log("graph_edges by tenant:", JSON.stringify(await db.collection("graph_edges").aggregate([{ $group: { _id: "$tenantId", n: { $sum: 1 } } }]).toArray()));
console.log("sessions by tenant:", JSON.stringify(await db.collection("sessions").aggregate([{ $group: { _id: "$tenantId", n: { $sum: 1 } } }]).toArray()));
console.log("tree_index roots:", JSON.stringify(await db.collection("tree_index").find({ level: "tenant" }, { projection: { node_id: 1, tenantId: 1 } }).toArray()));
await c.close();
