// Ephemeral synthetic actors/data through real stored key identities. Never run against a user database.
import { createHash } from "node:crypto";
import { ACTORS, scratchMongo } from "./scratch.mjs";

const { client, db } = await scratchMongo();
try {
  const now = new Date().toISOString();
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  const scopes = ["ask", "sessions", "sources", "ingest", "jobs", "gaps", "hosting", "answer-policy:read"];
  await db.collection("api_keys").insertMany(Object.values(ACTORS).map((actor) => ({ _id: actor.id,
    tenantId: actor.tenant, keyHash: digest(actor.token), scopes: actor === ACTORS.limited ? ["ask"] : scopes,
    label: "Ephemeral synthetic CI actor", createdAt: now })));
  const original = "Synthetic CI transcript fixture.";
  const hash = digest(original);
  for (const actor of [ACTORS.a, ACTORS.b]) {
    const id = `${encodeURIComponent(actor.tenant)}:${hash}`;
    await db.collection("sources").insertOne({ _id: id, tenantId: actor.tenant, kind: "document", hash,
      captureMode: "provided", consent: { given: true, recordedBy: "Synthetic CI fixture only" }, createdAt: now,
      sourceMeta: { synthetic: true, platform: "ci-fixture" } });
    await db.collection("sessions").insertOne({ _id: `s-${actor.tenant}`, tenantId: actor.tenant, sourceId: id,
      title: "Synthetic CI fixture", date: now.slice(0, 10), status: { transcribe: "done", index: "pending" } });
    await db.collection("turns").insertOne({ _id: `t-${actor.tenant}`, tenantId: actor.tenant, sessionId: `s-${actor.tenant}`,
      speakerRef: "spk:ci", tStart: 0, tEnd: 4, text: original });
  }
  console.log(JSON.stringify({ scope: "ephemeral synthetic CI fixtures only", database: db.databaseName, actors: 4, sources: 2, sessions: 2, turns: 2 }));
} finally { await client.close(); }
