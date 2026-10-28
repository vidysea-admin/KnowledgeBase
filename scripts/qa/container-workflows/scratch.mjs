import assert from "node:assert/strict";
import { createRequire } from "node:module";

export const ACTORS = {
  a: { id: "ci-key-a", tenant: "ci-a", token: "ci-public-fixture-key-a" },
  b: { id: "ci-key-b", tenant: "ci-b", token: "ci-public-fixture-key-b" },
  editor: { id: "ci-key-editor", tenant: "ci-a", token: "ci-public-fixture-key-editor" },
  limited: { id: "ci-key-limited", tenant: "ci-a", token: "ci-public-fixture-key-limited" },
};

export async function scratchMongo() {
  const name = process.env.MONGODB_DB;
  const address = process.env.MONGODB_URL;
  assert.match(name ?? "", /^lkb_work_container_[a-z0-9_]{1,40}$/);
  const target = new URL(address ?? "");
  assert.equal(target.protocol, "mongodb:"); assert.equal(target.hostname, "docker-smoke-mongo");
  assert.equal(target.port, "27017"); assert.equal(target.username, ""); assert.equal(target.password, "");
  assert.equal(target.searchParams.get("replicaSet"), "rs0");
  const { MongoClient } = createRequire("/app/apps/api/dist/server.js")("mongodb");
  const client = new MongoClient(address, { serverSelectionTimeoutMS: 5_000, connectTimeoutMS: 5_000 });
  await client.connect();
  return { client, db: client.db(name) };
}
