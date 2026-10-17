// Explicit disposable replica-set target only; never called by the API entrypoint.
import { createRequire } from "node:module";
import { scratchMongo } from "./scratch.mjs";

const { client, db } = await scratchMongo();
try {
  await createRequire(import.meta.url)("/app/migrations/20261014100000-transcript-reviews.cjs").up(db);
  const indexes = {};
  for (const name of ["transcript_reviews", "transcript_review_revisions"]) indexes[name] = await db.collection(name).listIndexes().toArray();
  console.log(JSON.stringify({ database: db.databaseName, scope: "explicit T054 migration on disposable CI Mongo only", indexes }));
} finally { await client.close(); }
