import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { DocumentPageSourceLocator, MessageSourceLocator, Turns } from "@lkb/core";
import type { NativeSourceQuote, SourceQuote } from "@lkb/ask";
import { createNativeEvidenceResolver } from "../native-evidence/resolver.js";
import { createMongoEvidenceVerifier, digest } from "./answer-evidence.js";
import type { EvidenceBinding } from "./answer-records.js";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const text = "Exact native आवेदन passage 😀.", revisionHash = sha("current revision");
const document: DocumentPageSourceLocator = { kind: "document-page", documentId: "document", documentSourceId: "immutable-document-source",
  sourceId: "source", headRevision: 1, revisionHash, pageNumber: 2, passage: { start: 0, end: text.length, sha256: sha(text) } };
const message: MessageSourceLocator = { kind: "message", sourceId: "source", revisionHash, threadId: "thread", messageId: "message",
  passage: { start: 0, end: text.length, sha256: sha(text) } };
const quote = (sourceLocator = document as DocumentPageSourceLocator | MessageSourceLocator): NativeSourceQuote =>
  ({ id: "native-quote", nodeId: "native-node", origin: sourceLocator.kind, quote: text, sourceLocator });
function binding(quotes: unknown[] = [quote()], evidence: Record<string, unknown> = {}): EvidenceBinding {
  const source = { node_id: "native-node", title: "Native", level: "topic", summary: "", children: [],
    evidence: { sourceId: "source", revisionHash, sourceQuotes: quotes, ...evidence } };
  return { id: "internal:native-node", origin: "internal", source, fingerprint: digest(source),
    excerpt: quotes.map(q => q && typeof q === "object" && "quote" in q ? q.quote : "").join("\n") };
}
const noDb = { collection: () => { throw new Error("Native release must not manufacture session/turn reads"); } } as unknown as Db;
function rig() {
  let live = true, headRevision = 1, currentRevisionHash = revisionHash, calls = 0;
  const resolver = createNativeEvidenceResolver({ loadCurrent: async (tenantId, locator) => {
    calls++;
    assert.equal(tenantId, "tenant-a");
    if (!live) return null;
    const base = { tenantId, sourceId: "source", revisionHash, currentRevisionHash, eligible: true as const, text };
    return locator.kind === "document-page" ? { ...base, kind: "document-page", documentId: "document",
      documentSourceId: "immutable-document-source", headRevision, pageNumber: 2 } :
      { ...base, kind: "message", threadId: "thread", messageId: "message" };
  } });
  return { resolver, revoke: () => { live = false; }, advanceEpoch: () => { headRevision++; },
    advanceRevision: () => { currentRevisionHash = sha("new revision"); }, calls: () => calls };
}

test("actual Mongo evidence verifier accepts native document/message bindings using fourth resolver and no audio reads", async () => {
  const r = rig(), verify = createMongoEvidenceVerifier(noDb, undefined, undefined, r.resolver);
  for (const locator of [document, message]) assert.equal(await verify("tenant-a", [binding([quote(locator)])]), true);
  assert.equal(r.calls(), 2);
});

test("actual cached release verifier rereads current epoch/revision and withdrawal", async () => {
  for (const change of ["epoch", "revision", "withdrawal"] as const) {
    const r = rig(), verify = createMongoEvidenceVerifier(noDb, undefined, undefined, r.resolver), evidence = binding();
    assert.equal(await verify("tenant-a", [evidence]), true);
    if (change === "epoch") r.advanceEpoch();
    else if (change === "revision") r.advanceRevision();
    else r.revoke();
    assert.equal(await verify("tenant-a", [evidence]), false);
    assert.equal(r.calls(), 2);
  }
});

test("mixed and forged native envelopes fail closed before authority or legacy DB reads", async () => {
  const r = rig(), verify = createMongoEvidenceVerifier(noDb, undefined, undefined, r.resolver), q = quote();
  const attacks = [
    binding([q, { id: "legacy", nodeId: "native-node", origin: "speech", quote: text, sessionRef: "session", turnId: "turn" }]),
    binding([{ ...q, sessionRef: "session" }]), binding([{ ...q, tStart: 0 }]), binding([q], { sessionRef: "session" }),
    binding([{ ...q, nodeId: "foreign-node" }]), binding([q], { sourceId: "foreign-source" }), binding([q], { revisionHash: sha("old") }),
    binding([{ ...q, origin: "speech" }]), binding([{ ...q, sourceLocator: { ...document, headRevision: 0 } }]),
    binding([{ ...q, sourceLocator: { ...document, documentSourceId: "" } }]), binding([q, q]), binding([null]),
  ];
  for (const attack of attacks) assert.equal(await verify("tenant-a", [attack]), false);
  assert.equal(r.calls(), 0);
});

test("native binding requires exact joined excerpt, original fingerprint and current resolver capability", async () => {
  const r = rig(), verify = createMongoEvidenceVerifier(noDb, undefined, undefined, r.resolver), b = binding();
  assert.equal(await verify("tenant-a", [{ ...b, excerpt: b.excerpt + " forged" }]), false);
  assert.equal(await verify("tenant-a", [{ ...b, fingerprint: sha("forged") }]), false);
  assert.equal(await createMongoEvidenceVerifier(noDb)("tenant-a", [b]), false);
  assert.equal(r.calls(), 0);
});

test("native authority infrastructure errors cannot release a cached binding", async () => {
  const resolver = createNativeEvidenceResolver({ loadCurrent: async () => { throw new Error("current head unavailable"); } });
  await assert.rejects(createMongoEvidenceVerifier(noDb, undefined, undefined, resolver)("tenant-a", [binding()]), /current head unavailable/);
});

test("existing transcript verifier retains scoped turn/overlay checks and optional eligibility callback", async () => {
  const raw: Turns = { _id: "turn", tenantId: "tenant-a", sessionId: "session", text: "Exact speech", speakerRef: "speaker", tStart: 1, tEnd: 2 };
  const q: SourceQuote = { id: "speech", nodeId: "session-node", sessionRef: "session", turnId: "turn", speakerRef: "speaker", tStart: 1, tEnd: 2,
    charStart: 0, charEnd: raw.text.length, byteStart: 0, byteEnd: Buffer.byteLength(raw.text), turnTextSHA256: sha(raw.text), sliceSHA256: sha(raw.text), quote: raw.text, origin: "speech" };
  const source = { node_id: "session-node", evidence: { sessionRef: "session", sourceQuotes: [q] } };
  const evidence: EvidenceBinding = { id: "internal:session-node", origin: "internal", source, fingerprint: digest(source), excerpt: raw.text };
  const names: string[] = [];
  const db = { collection: (name: string) => ({ findOne: async (filter: Record<string, unknown>) => {
    names.push(name); assert.equal(filter.tenantId, "tenant-a");
    return name === "sessions" ? { _id: "session", sourceId: "recording" } : name === "sources" ? { _id: "recording", kind: "recording" } : name === "turns" ? raw : null;
  } }) } as unknown as Db;
  let eligible = true;
  const verify = createMongoEvidenceVerifier(db, undefined, async () => eligible);
  assert.equal(await verify("tenant-a", [evidence]), true);
  eligible = false;
  assert.equal(await verify("tenant-a", [evidence]), false);
  assert.ok(names.includes("transcript_reviews"));
});

test("web freshness remains supplied by the existing trusted web verifier", async () => {
  const source = { url: "https://example.test/source", text: "Web passage" };
  const evidence: EvidenceBinding = { id: "web:one", origin: "web", fingerprint: digest(source), source, excerpt: "Web passage" };
  assert.equal(await createMongoEvidenceVerifier(noDb)("tenant-a", [evidence]), false);
  assert.equal(await createMongoEvidenceVerifier(noDb, async (tenantId, bindings) => tenantId === "tenant-a" && bindings[0] === evidence)("tenant-a", [evidence]), true);
});
