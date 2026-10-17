import { test } from "node:test";
import assert from "node:assert/strict";
import { messagePublicationFixture } from "../../native-evidence/message-publication-fixture.js";
import { auditWhatsAppQuarantine } from "./quarantine.js";
import { createWhatsAppNativeAuthority } from "../../native-evidence/whatsapp-authority.js";

test("quarantine audit allows only complete exact currently approved native message branches", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a"); assert.ok(candidate);
  await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer");
  f.operations.length = 0;
  assert.deepEqual(await auditWhatsAppQuarantine(f.db, "tenant-a"), []);
  const sessions = f.operations.filter(o => ["sources", "tree_index", "turns", "whatsapp_candidates", "claims"].includes(o.name)).map(o => o.session);
  assert.ok(sessions.length > 5); assert.ok(sessions.every(session => session === sessions[0] && session));
  const root = f.fx.rows("tree_index")[0]!;
  const children = root.children as Record<string, unknown>[];
  children[0]!.privateExtra = "unapproved sibling text";
  await f.db.collection<{ _id: string }>("tree_index").replaceOne({ _id: String(root._id) }, root as { _id: string });
  assert.ok((await auditWhatsAppQuarantine(f.db, "tenant-a")).some(v => /malformed native/u.test(v.reason)));
});

test("authority supplied session must be active and cannot silently fall back to another transaction", async () => {
  const f = await messagePublicationFixture(); const inactive = f.db.client.startSession();
  try {
    await assert.rejects(createWhatsAppNativeAuthority(f.db, { session: inactive }).listCurrent("tenant-a", { sourceId: f.result.sourceId }), /unavailable/);
  } finally { await inactive.endSession(); }
});
