// Explicit isolated scratch proof with deterministic workflow inputs; no external senders.
import assert from "node:assert/strict";
import { proveAutomationMongo } from "../../../apps/api/src/automation/mongo-proof.ts";

const address = process.env.LKB_CONTAINER_MONGO_URL;
const target = new URL(address ?? "");
assert.equal(target.protocol, "mongodb:"); assert.equal(target.hostname, "docker-smoke-mongo");
assert.equal(target.port, "27017"); assert.equal(target.username, ""); assert.equal(target.password, "");
assert.equal(target.searchParams.get("replicaSet"), "rs0");
const database = process.env.LKB_CONTAINER_AUTOMATION_DB;
assert.match(database ?? "", /^lkb_work_automation_[a-z0-9_]{1,40}$/);
const result = await proveAutomationMongo(address, database);
console.log(JSON.stringify({ ...result, scope: "real scratch Mongo automation persistence; deterministic fixture workflow", realExternalIntegration: false }));
