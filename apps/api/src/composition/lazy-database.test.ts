import test from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import { createLazyDatabase, defineLazyProperties } from "./lazy-database.js";

test("constructing real scoped readers is lazy and operations use the current Mongo receiver", async () => {
  let current: Db | undefined; let reads = 0;
  const db = createLazyDatabase(() => {
    reads++;
    if (!current) throw new Error("not-connected");
    return current;
  });
  const records = scopedCollection<{ _id: string; tenantId: string }>(db, "records");
  const tenant = records("tenant-a");
  assert.equal(reads, 0);
  interface ModelCollection {
    collectionName: string;
    findOne(filter: object): Promise<{ database: string; filter: object }>;
  }
  interface ModelDatabase {
    databaseName: string; client: { name: string };
    collection(collectionName: string): ModelCollection;
  }
  const model = (name: string) => {
    const database: ModelDatabase = { databaseName: name, client: { name }, collection(collectionName: string) {
      assert.equal(this.databaseName, name);
      return { collectionName, findOne(filter: object) {
        assert.equal(this.collectionName, "records");
        return Promise.resolve({ database: name, filter });
      } };
    } };
    return database as unknown as Db;
  };
  assert.throws(() => db.databaseName, /not-connected/);
  current = model("first");
  assert.deepEqual(await tenant.findOne({ _id: "row" }), { database: "first", filter: { _id: "row", tenantId: "tenant-a" } });
  assert.equal(db.databaseName, "first");
  current = model("second");
  assert.deepEqual(await tenant.findOne({ _id: "row" }), { database: "second", filter: { _id: "row", tenantId: "tenant-a" } });
  assert.equal(db.databaseName, "second");
  assert.deepEqual(db.client, { name: "second" });
});
test("optional policy-gated properties evaluate actual current authority at access and never cache it", () => {
  let name = "refused"; let gates = 0;
  const target: { route?: { database: string } } = {};
  defineLazyProperties(target, { route: () => { gates++; return name === "allowed" ? { database: name } : undefined; } });
  assert.equal(gates, 0);
  assert.equal(target.route, undefined);
  name = "allowed";
  assert.deepEqual(target.route, { database: "allowed" });
  name = "refused";
  assert.equal(target.route, undefined);
  assert.equal(gates, 3);
});
