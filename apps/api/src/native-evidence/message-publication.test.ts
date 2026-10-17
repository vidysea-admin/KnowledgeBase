import { test } from "node:test";
import assert from "node:assert/strict";
import type { Sources, TreeIndexRootDocument } from "@lkb/core";
import { messagePublicationFixture } from "./message-publication-fixture.js";
import { createWhatsAppNativeAuthority } from "./whatsapp-authority.js";
import { buildNativeIntegrations } from "../composition/integrations/native.js";

test("actual candidate approval atomically publishes exact native tree and reaches production native hydrator", async () => {
  const f = await messagePublicationFixture(); const candidate = (await f.wiring.repository.list("tenant-a")).find(row => row.text.startsWith("Scholarship")); assert.ok(candidate);
  assert.equal(f.fx.rows("tree_index").length, 0);
  assert.equal((await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer")).result, "ok");
  const approvalOperations = [...f.operations];
  const root = await f.db.collection<TreeIndexRootDocument>("tree_index").findOne({ tenantId: "tenant-a", level: "tenant" });
  assert.ok(root); assert.equal(root.children.length, 1); const node = root.children[0]!;
  assert.equal(node.level, "native-source"); assert.ok(node.children.length);
  const authority = createWhatsAppNativeAuthority(f.db);
  const native = buildNativeIntegrations({ db: f.db, knowledgeStore: { getDocument: async () => null }, messageAuthority: {
    loadCurrent: (tenant, locator) => locator.kind === "message" ? authority.loadCurrent(tenant, locator) : Promise.resolve(null),
    listLocators: (tenant, identity) => authority.listCurrent(tenant, identity),
  } });
  const hydrated = await native.nativeSources("tenant-a").hydrate("Scholarship Friday", [node]);
  assert.equal(hydrated.nodes.length, 1); assert.match(hydrated.nodes[0]!.summary, /Scholarship closes Friday/u);
  const txOperations = approvalOperations.filter(o => o.name === "tree_index" && ["find", "findOne", "updateOne"].includes(o.operation));
  assert.ok(txOperations.length >= 3); assert.ok(txOperations.every(o => o.session && o.session === txOperations[0]!.session));
});

test("two sequential approvals preserve both current native messages despite consent fence rotation", async () => {
  const f = await messagePublicationFixture(); const candidates = await f.wiring.repository.list("tenant-a");
  for (const candidate of candidates) assert.equal((await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer")).result, "ok");
  const authority = createWhatsAppNativeAuthority(f.db);
  const locators = await authority.listCurrent("tenant-a", { sourceId: f.result.sourceId }); assert.equal(locators.length, 2);
  for (const locator of locators) assert.ok(await authority.loadCurrent("tenant-a", locator));
  assert.equal((f.fx.rows("tree_index")[0]!.children as unknown[]).length, 2);
});

test("tree write failure rolls back source fence, candidate decision and claim", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a"); assert.ok(candidate);
  const before = f.fx.rows("sources"); f.failTree();
  await assert.rejects(f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer"), /fixture tree publication failed/);
  assert.equal(f.fx.rows("claims").length, 0); assert.equal(f.fx.rows("tree_index").length, 0);
  assert.equal(f.fx.rows("whatsapp_candidates").find(row => row._id === candidate._id)!.status, "needs-review");
  assert.deepEqual(f.fx.rows("sources"), before);
});

test("rejection cannot publish; source edits remove only revoked candidate branch while sibling survives", async () => {
  const f = await messagePublicationFixture(); const candidates = await f.wiring.repository.list("tenant-a");
  for (const candidate of candidates) await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer");
  f.edit(0, "Scholarship source edited; requires a new review.");
  await f.wiring.whatsapp.ingestGroup("tenant-a", "group@g.us");
  assert.equal((f.fx.rows("tree_index")[0]!.children as unknown[]).length, 1);
  const pending = await f.wiring.repository.list("tenant-a"); assert.equal(pending.length, 1);
  await f.wiring.repository.decide("tenant-a", pending[0]!._id, "rejected", "reviewer");
  assert.equal((f.fx.rows("tree_index")[0]!.children as unknown[]).length, 1);
});

test("withdrawn source hides previously published native message without granting foreign authority", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a"); assert.ok(candidate);
  await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer");
  const authority = createWhatsAppNativeAuthority(f.db); const [locator] = await authority.listCurrent("tenant-a", { sourceId: f.result.sourceId }); assert.ok(locator);
  await f.db.collection<Sources>("sources").updateOne({ _id: f.result.sourceId, tenantId: "tenant-a" }, { $set: { "consent.given": false } });
  assert.equal(await authority.loadCurrent("tenant-a", locator), null);
  assert.equal(await authority.loadCurrent("tenant-b", locator), null);
});

/** Privacy gate: a source without a current explicit consent.given === true must never publish a native tree branch. */
type Fixture = Awaited<ReturnType<typeof messagePublicationFixture>>;
const sourcePatch = (f: Fixture, $set: Record<string, unknown>) =>
  f.fx.db.collection("sources").updateOne({ _id: f.result.sourceId, tenantId: "tenant-a" } as never, { $set } as never);
async function assertNothingPublished(f: Fixture, candidateId: string): Promise<void> {
  assert.equal(f.fx.rows("tree_index").length, 0);
  assert.equal(f.fx.rows("claims").length, 0);
  assert.equal(f.fx.rows("whatsapp_candidates").find(row => row._id === candidateId)!.status, "needs-review");
  assert.equal(f.operations.filter(o => o.name === "tree_index" && o.operation === "updateOne").length, 0);
}
async function refused(f: Fixture, pattern: RegExp, candidateId?: string): Promise<void> {
  const candidate = { _id: candidateId ?? (await f.wiring.repository.list("tenant-a"))[0]!._id };
  await assert.rejects(f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer"), pattern);
  await assertNothingPublished(f, candidate._id);
}

test("consent control: an explicitly consented source publishes exactly one native branch", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a"); assert.ok(candidate);
  assert.equal(f.fx.rows("sources")[0]!.consent && (f.fx.rows("sources")[0]!.consent as { given: boolean }).given, true);
  assert.equal((await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer")).result, "ok");
  assert.equal((f.fx.rows("tree_index")[0]!.children as unknown[]).length, 1);
});

test("consent record absent: approval is refused by the publication gate and writes nothing to tree_index", async () => {
  const f = await messagePublicationFixture(); await sourcePatch(f, { consent: undefined });
  assert.equal(f.fx.rows("sources")[0]!.consent, undefined);
  await refused(f, /whatsapp_native_publication_unavailable/);
});

test("consent.given === false: approval is refused and writes nothing to tree_index", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a"); await sourcePatch(f, { "consent.given": false });
  await refused(f, /authorization fence|source\/session evidence unavailable/, candidate!._id);
});

test("consent withdrawn before publication: approval is refused and writes nothing to tree_index", async () => {
  const f = await messagePublicationFixture(); const [candidate] = await f.wiring.repository.list("tenant-a");
  await sourcePatch(f, { consent: { given: false, recordedBy: "whatsapp-owner:111111111111111111111111", withdrawnAt: "2026-10-14T10:30:00Z" } });
  await refused(f, /authorization fence|source\/session evidence unavailable/, candidate!._id);
});

test("consent withdrawn mid-transaction after the review evidence check: the publication gate refuses and rolls back", async () => {
  const f = await messagePublicationFixture(); let decided = false, withdrawn = false;
  f.onOperation((name, operation) => {
    if (name === "whatsapp_candidates" && operation === "updateOne") decided = true;
    // First session read after the decision write is the materializer's own evidence check; the gate's source read follows it.
    else if (decided && !withdrawn && name === "sessions" && operation === "findOne") { withdrawn = true; void sourcePatch(f, { "consent.given": false }); }
  });
  await refused(f, /whatsapp_native_publication_unavailable/); assert.equal(withdrawn, true);
});

test("consent withdrawn mid-transaction before the materializer starts: approval is refused and writes nothing", async () => {
  const f = await messagePublicationFixture(); let withdrawn = false;
  f.onOperation((name, operation) => {
    if (!withdrawn && name === "whatsapp_candidates" && operation === "updateOne") { withdrawn = true; void sourcePatch(f, { "consent.given": false }); }
  });
  await refused(f, /source\/session evidence unavailable|whatsapp_native_publication_unavailable/); assert.equal(withdrawn, true);
});
