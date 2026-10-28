/** T-056 stale/withdrawn citation refusal boundary: every way a stored citation can stop matching current evidence must refuse. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { AskV2Result } from "@lkb/ask";
import { answerEvidence, createMongoEvidenceVerifier, digest } from "./answer-evidence.js";
import { answerTestDb } from "./answer-testdb.js";

const text = "Fee is 100.", sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const db = answerTestDb(), quote = { id: "q1", nodeId: "n1", sessionRef: "s1", turnId: "t1", speakerRef: "spk:0", tStart: 10, tEnd: 20,
    charStart: 0, charEnd: text.length, byteStart: 0, byteEnd: Buffer.byteLength(text), turnTextSHA256: sha(text), sliceSHA256: sha(text), quote: text, origin: "speech" };
  db.rows("sessions").push({ _id: "s1", tenantId: "tenant-a", sourceId: "source1" });
  db.rows("sources").push({ _id: "source1", tenantId: "tenant-a", kind: "recording" });
  db.rows("turns").push({ _id: "t1", tenantId: "tenant-a", sessionId: "s1", speakerRef: "spk:0", tStart: 10, tEnd: 20, text });
  const candidate: AskV2Result = { answer: text, verdict: "ambiguous", reason: "partial", scored: [], auditLog: [], web_used: false, insufficient_coverage: false,
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [quote] } }], web: [] } };
  return { ...db, evidence: answerEvidence(candidate), verify: createMongoEvidenceVerifier(db.db) };
}

test("stale citation baseline is accepted, then each withdrawal path is refused", async () => {
  const f = fixture();
  assert.equal(await f.verify("tenant-a", f.evidence), true, "green baseline");
  const sessions = structuredClone(f.rows("sessions")), turns = structuredClone(f.rows("turns")), sources = structuredClone(f.rows("sources"));
  const restore = () => { for (const [name, original] of [["sessions", sessions], ["turns", turns], ["sources", sources]] as const) { f.rows(name).splice(0, f.rows(name).length, ...structuredClone(original)); } };
  f.rows("turns").length = 0;
  assert.equal(await f.verify("tenant-a", f.evidence), false, "withdrawn/deleted turn");
  restore(); f.rows("sessions").length = 0;
  assert.equal(await f.verify("tenant-a", f.evidence), false, "withdrawn/deleted session");
  restore(); f.rows("sessions")[0]!.sourceId = "source-missing";
  assert.equal(await f.verify("tenant-a", f.evidence), false, "session points to a removed source");
  restore(); f.rows("sessions")[0]!.tenantId = "tenant-b";
  assert.equal(await f.verify("tenant-a", f.evidence), false, "session moved to another tenant");
  restore(); f.rows("turns")[0]!.text = "Fee is 100. Updated.";
  assert.equal(await f.verify("tenant-a", f.evidence), false, "turn text re-edited after the answer was stored");
  restore(); assert.equal(await f.verify("tenant-a", f.evidence), true, "restored baseline");
});

test("tampered or hollow stored bindings are refused", async () => {
  const f = fixture();
  assert.equal(await f.verify("tenant-a", []), false, "no bindings cannot authorize release");
  const forged = structuredClone(f.evidence); forged[0]!.fingerprint = "0".repeat(64);
  assert.equal(await f.verify("tenant-a", forged), false, "fingerprint no longer matches the stored source");
  const blank = structuredClone(f.evidence); blank[0]!.excerpt = "   ";
  assert.equal(await f.verify("tenant-a", blank), false, "blank excerpt");
  const noQuotes = structuredClone(f.evidence); (noQuotes[0]!.source as { evidence: { sourceQuotes: unknown[] } }).evidence.sourceQuotes = [];
  noQuotes[0]!.fingerprint = digest(noQuotes[0]!.source);
  assert.equal(await f.verify("tenant-a", noQuotes), false, "citation with no quotes");
  const noEvidence = structuredClone(f.evidence); delete (noEvidence[0]!.source as { evidence?: unknown }).evidence; noEvidence[0]!.fingerprint = digest(noEvidence[0]!.source);
  assert.equal(await f.verify("tenant-a", noEvidence), false, "citation with no evidence object");
  const foreignSession = structuredClone(f.evidence), source = foreignSession[0]!.source as { evidence: { sessionRef: string; sourceQuotes: Record<string, unknown>[] } };
  source.evidence.sessionRef = "s-other"; source.evidence.sourceQuotes[0]!.sessionRef = "s-other"; foreignSession[0]!.fingerprint = digest(foreignSession[0]!.source);
  assert.equal(await f.verify("tenant-a", foreignSession), false, "citation to a session that does not exist for this tenant");
});

test("one stale binding among current ones refuses the whole set; web proof and WhatsApp eligibility are mandatory", async () => {
  const f = fixture(), web = { id: "w", origin: "web" as const, source: { url: "https://example.test", content: text }, excerpt: text,
    fingerprint: digest({ url: "https://example.test", content: text }) };
  const both = [...f.evidence, web];
  assert.equal(await f.verify("tenant-a", both), false, "web binding without a trusted verifier is refused");
  let webCurrent = true;
  const withWeb = createMongoEvidenceVerifier(f.db, async () => webCurrent);
  assert.equal(await withWeb("tenant-a", both), true);
  webCurrent = false; assert.equal(await withWeb("tenant-a", both), false, "web page withdrawn since the answer was stored");
  webCurrent = true; f.rows("turns")[0]!.text = "changed";
  assert.equal(await withWeb("tenant-a", both), false, "stale internal binding refuses even when the web binding is current");
  f.rows("turns")[0]!.text = text; f.rows("sources")[0]!.kind = "whatsapp";
  assert.equal(await withWeb("tenant-a", both), false, "WhatsApp-derived citation without an eligibility callback");
  assert.equal(await createMongoEvidenceVerifier(f.db, async () => true, async () => false)("tenant-a", both), false, "WhatsApp approval withdrawn");
  assert.equal(await createMongoEvidenceVerifier(f.db, async () => true, async () => true)("tenant-a", both), true);
});
