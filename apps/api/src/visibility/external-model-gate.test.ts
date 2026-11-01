/** W11 part B (R-32): the one predicate `externalModelEligible` and G4 (indexSession refuses WhatsApp sources). D-206 default studentData "no" stays; gate H-10. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createKnowledgeVisibility } from "./knowledge.js";
import { indexSession } from "../indexing/session.js";
import { memoryDb, PUB_SESSION, PUB_SOURCE, TENANT, WA_SESSION, WA_SOURCE, waWorld } from "./wa-quarantine.testsupport.js";
import { TERMINAL_LINK_STATES, isLiveLinkState } from "@lkb/db";
import { EXCLUDED, NON_LIVE_STATES, linkCase } from "./external-model.testsupport.js";

test("a WhatsApp source whose link is studentData no is eligible, by source and by session", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const v = createKnowledgeVisibility(w.db);
  assert.equal(await v.externalModelEligible(TENANT, WA_SOURCE), true);
  assert.equal(await v.externalModelEligibleSession(TENANT, WA_SESSION), true);
});
for (const kind of EXCLUDED) {
  test(`a WhatsApp source with a ${kind} link is excluded (fails closed), by source and by session`, async () => {
    const w = waWorld("approved"); linkCase(w, kind);
    const v = createKnowledgeVisibility(w.db);
    assert.equal(await v.externalModelEligible(TENANT, WA_SOURCE), false);
    assert.equal(await v.externalModelEligibleSession(TENANT, WA_SESSION), false);
  });
}
// H-14 (fail closed): a link that is not live never feeds an external model, whatever studentData says.
test("H-14: the non-live fixtures cover every terminal link state of the state model, and none of them is live", () => {
  assert.deepEqual([...NON_LIVE_STATES].sort(), [...TERMINAL_LINK_STATES].sort());
  for (const state of NON_LIVE_STATES) assert.equal(isLiveLinkState(state), false);
});
for (const state of ["requested", "approved", "active"]) {
  test(`H-14: a live ${state} link with studentData no stays eligible, by source and by session`, async () => {
    const w = waWorld("approved"); linkCase(w, "no"); w.data.whatsapp_links![0]!.state = state;
    const v = createKnowledgeVisibility(w.db);
    assert.equal(await v.externalModelEligible(TENANT, WA_SOURCE), true);
    assert.equal(await v.externalModelEligibleSession(TENANT, WA_SESSION), true);
  });
}
test("H-14: a link that goes revoked after being eligible is excluded on the next request", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  assert.equal(await createKnowledgeVisibility(w.db).externalModelEligible(TENANT, WA_SOURCE), true);
  Object.assign(w.data.whatsapp_links![0]!, { state: "revoked", live: false });
  assert.equal(await createKnowledgeVisibility(w.db).externalModelEligible(TENANT, WA_SOURCE), false);
});
test("non-WhatsApp sources are unaffected whatever the links say", async () => {
  const w = waWorld("approved"); linkCase(w, "yes");
  const v = createKnowledgeVisibility(w.db);
  assert.equal(await v.externalModelEligible(TENANT, PUB_SOURCE), true);
  assert.equal(await v.externalModelEligibleSession(TENANT, PUB_SESSION), true);
});
test("unknown, empty and non-string ids are excluded", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const v = createKnowledgeVisibility(w.db);
  for (const id of ["no-such-source", "", undefined as never, 7 as never, { $ne: null } as never]) assert.equal(await v.externalModelEligible(TENANT, id), false);
  for (const id of ["no-such-session", "", undefined as never]) assert.equal(await v.externalModelEligibleSession(TENANT, id), false);
});
test("tenant scoping: another tenant, or an invalid tenant id, never reaches the source", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const v = createKnowledgeVisibility(w.db);
  assert.equal(await v.externalModelEligible("tenant-b", WA_SOURCE), false);
  assert.equal(await v.externalModelEligible("", WA_SOURCE), false);
  assert.equal(await v.externalModelEligibleSession("tenant-b", WA_SESSION), false);
});
test("a database read error fails closed instead of throwing", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const broken = { ...w.db, collection: () => { throw new Error("mongo down"); } } as never;
  assert.equal(await createKnowledgeVisibility(broken).externalModelEligible(TENANT, WA_SOURCE), false);
});
test("the answer is resolved live from the link row, and memoised per instance", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const log: { collection: string }[] = []; const db = memoryDb(w.data, log as never);
  const first = createKnowledgeVisibility(db);
  assert.equal(await first.externalModelEligible(TENANT, WA_SOURCE), true);
  const reads = log.length;
  assert.equal(await first.externalModelEligible(TENANT, WA_SOURCE), true);
  assert.equal(log.length, reads, "the second ask in one request does not re-read");
  w.data.whatsapp_links![0]!.studentData = "yes";
  assert.equal(await first.externalModelEligible(TENANT, WA_SOURCE), true, "same request keeps its snapshot");
  assert.equal(await createKnowledgeVisibility(db).externalModelEligible(TENANT, WA_SOURCE), false, "the next request sees the flip");
});

// G4: indexing never sends a WhatsApp session to a model, whatever the link says.
for (const kind of [...EXCLUDED, "no"] as const) {
  test(`G4: indexSession refuses a WhatsApp session with a ${kind} link before any model call`, async () => {
    const w = waWorld("approved"); linkCase(w, kind);
    let calls = 0;
    await assert.rejects(() => indexSession(TENANT, WA_SESSION, { db: w.db as never, retrievalMode: "vector", complete: async () => { calls++; return { text: "{}" } as never; } } as never), /unavailable for aggregate indexing/);
    assert.equal(calls, 0);
  });
}
test("G4 control: a non-WhatsApp session is not refused by the visibility gate", async () => {
  const w = waWorld("approved"); linkCase(w, "yes");
  // The memory db has no write surface, so the run stops later; the point is that it is NOT the WhatsApp refusal.
  const outcome = await indexSession(TENANT, PUB_SESSION, { db: w.db as never, retrievalMode: "vector", complete: async () => ({ text: "{}" }) as never } as never).then(() => "", e => String(e));
  assert.doesNotMatch(outcome, /unavailable for aggregate indexing/);
});
test("G4 wiring: the WhatsApp deps in production are not bound to the indexer", () => {
  const source = readFileSync(new URL("../composition/production.ts", import.meta.url), "utf8");
  assert.match(source, /createMongoWhatsAppDeps\(undefined,/);
  assert.doesNotMatch(source, /createMongoWhatsAppDeps\(boundIndexer/);
});
