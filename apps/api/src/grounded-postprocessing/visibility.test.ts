import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndexer } from "../composition/production.js";
import { buildTranscriptIntegrations } from "../composition/integrations/transcripts.js";
import type { TranscriptIntegrationInput } from "../composition/integrations/transcripts.js";
import { fixture } from "./fixture.testsupport.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";

test("actual grounded factory refuses withdrawn recording consent before model requests or knowledge writes", async () => {
  const state = fixture();
  state.rows("sources")[0]!.consent.given = false;
  await assert.rejects(buildIndexer(state.routing, { groundedNotes: true, db: state.db })("t", "s1"),
    /Session is unavailable for aggregate indexing/);
  assert.equal(state.kinds.length, 0); assert.equal(state.jobs.length, 0);
  for (const name of ["session_pages", "claims", "chunks", "tree_index"]) assert.equal(state.rows(name).length, 0);
  assert.ok(!state.calls.some((call) => ["insertOne", "insertMany", "replaceOne", "updateOne", "deleteMany", "deleteOne"].includes(call.method)));
});

test("actual review composition rechecks recording consent and foreign scope instead of caching prior permission", async () => {
  const state = fixture();
  Object.assign(state.db, { databaseName: "lkb_t040_visibility" });
  const deps = buildTranscriptIntegrations({ db: state.db, env: {}, root: process.cwd(), routing: state.routing,
    index: async () => { throw new Error("not called during authorization"); },
    ask: {} as TranscriptIntegrationInput["ask"],
  }).transcriptReview!;
  assert.ok(deps.authorizeSession);
  assert.equal(await deps.authorizeSession("t", "s1"), true);
  const visibility = createKnowledgeVisibility(state.db);
  assert.equal(await visibility.sourceVisible("t", "src1"), true);
  state.rows("sources")[0]!.consent.given = false;
  assert.equal(await deps.authorizeSession("t", "s1"), false);
  assert.equal(await visibility.sourceVisible("t", "src1"), false);
  assert.equal(await deps.authorizeSession("foreign", "s1"), false);
  assert.equal(state.kinds.length, 0); assert.equal(state.jobs.length, 0);
});
