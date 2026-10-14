/**
 * ISS-T045TENANTID-001 (D-136, pending append): url / recording / document / whatsapp adapters store the
 * tenant-scoped source _id, tenantSourceId(tenant, contentHash), with the bare hash kept in `hash`. The issue's
 * recorded scenario is replayed per adapter: identical content, two tenants, through the intake path that
 * previously refused the bare-hash source as `unscoped-source`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { tenantSourceId, type Source } from "../source.js";
import { intakeFromSource, type IntakePlan, type IntakeSink } from "../intake.js";
import { createUrlSource } from "./url.js";
import { createRecordingSource } from "./recording.js";
import { createDocumentSource } from "./document.js";
import { createWhatsAppSource } from "./whatsapp.js";
import { baseConsent, fakeBytesReader, fakeHasher, fakeTextReader, fakeUrlFetcher, FIXED_NOW } from "../testUtils.js";

const URL_ = "https://example.com/a";
const msgs = [{ messageId: "m1", personId: "p1", displayName: "P", text: "hi", ts: "2026-10-01T00:00:00Z" }];

const CASES: { id: string; adapter: Source; input: (tenantId: string) => Record<string, unknown>; mediaKind: boolean }[] = [
  {
    id: "url",
    adapter: createUrlSource({ hasher: fakeHasher, fetcher: fakeUrlFetcher({ [URL_]: "same page text" }), now: () => FIXED_NOW }),
    input: (tenantId) => ({ kind: "url", url: URL_, tenantId }),
    mediaKind: false,
  },
  {
    id: "recording",
    adapter: createRecordingSource({
      hasher: fakeHasher,
      reader: fakeBytesReader({ "call.mp3": new Uint8Array([1, 2, 3]) }),
      transcribe: async () => [{ speakerRef: "s", tStart: 0, tEnd: 1, text: "t" }],
      now: () => FIXED_NOW,
    }),
    input: (tenantId) => ({ kind: "recording", path: "call.mp3", tenantId }),
    mediaKind: true,
  },
  {
    id: "document",
    adapter: createDocumentSource({ hasher: fakeHasher, reader: fakeTextReader({ "n.md": "para one" }), now: () => FIXED_NOW }),
    input: (tenantId) => ({ kind: "document", path: "n.md", tenantId }),
    mediaKind: false,
  },
  {
    id: "whatsapp",
    adapter: createWhatsAppSource({ hasher: fakeHasher, fetcher: async () => msgs, now: () => FIXED_NOW }),
    input: (tenantId) => ({ kind: "whatsapp", groupJid: "g@g.us", ownerUserId: "u1", tenantId }),
    mediaKind: false,
  },
];

function ignoringSink() {
  const plans: IntakePlan[] = [];
  const bySource = new Map<string, string>();
  const sink: IntakeSink & { plans: IntakePlan[] } = {
    plans,
    findSessionBySource: async (_tenant, sourceId) => (bySource.has(sourceId) ? { sessionId: bySource.get(sourceId)! } : undefined),
    save: async (plan) => {
      if (bySource.has(plan.source._id)) throw new Error("E11000 duplicate key sources._id");
      bySource.set(plan.source._id, plan.session._id);
      plans.push(plan);
    },
  };
  return sink;
}

for (const c of CASES) {
  test(`ISS-T045TENANTID-001 ${c.id}: identical content in two tenants gets two tenant-scoped source ids, hash kept`, async () => {
    const a = await c.adapter.fetch(c.input("tenant-a"), baseConsent());
    const b = await c.adapter.fetch(c.input("tenant:b/2"), baseConsent());
    assert.equal(a.source.hash, b.source.hash);
    assert.notEqual(a.source._id, b.source._id);
    assert.equal(a.source._id, tenantSourceId("tenant-a", a.source.hash));
    assert.equal(b.source._id, tenantSourceId("tenant:b/2", b.source.hash));
    assert.notEqual(a.source._id, a.source.hash, "no bare content hash as _id");
    for (const m of a.media) {
      assert.equal(m.sourceRef, a.source._id);
      assert.equal(m._id, `${a.source._id}-media`);
    }
    if (c.mediaKind) assert.equal(a.media.length, 1);
  });

  test(`ISS-T045TENANTID-001 ${c.id}: replay of the issue scenario - intake no longer refuses and both tenants are created`, async () => {
    const sink = ignoringSink();
    let n = 0;
    const deps = { adapters: [c.adapter], sink, newId: () => `s${++n}`, now: () => FIXED_NOW };
    const ra = await intakeFromSource(c.input("tenant-a"), baseConsent(), deps);
    const rb = await intakeFromSource(c.input("tenant-b"), baseConsent(), deps);
    assert.equal(ra.status, "created");
    assert.equal(rb.status, "created");
    assert.notEqual(ra.sourceId, rb.sourceId);
    const again = await intakeFromSource(c.input("tenant-a"), baseConsent(), deps);
    assert.equal(again.status, "already-ingested");
    assert.equal(sink.plans.length, 2);
  });
}
