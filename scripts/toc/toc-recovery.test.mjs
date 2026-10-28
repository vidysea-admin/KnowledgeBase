import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {join, resolve, dirname} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {buildTree} from "../../packages/index/src/tree/build.ts";
import {readRecoveryInputs, buildRecoveryPacket, writeRecoveryPacket, readRecoveryPacket, ORIGINAL_SESSION_IDS, sha256,
  validateRecoveryMappingFields, APPROVED_REVIEW_SHA256} from "./toc-recovery.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CORPUS = join(ROOT, "data", "toc-migrated");
const source = readRecoveryInputs(CORPUS, join(ROOT, "data/eval/extraction-reconciliation-reviewed.json"), join(ROOT, "data/eval/extraction-corpus.json"));
const build = snapshot => buildRecoveryPacket(snapshot, buildTree);
function changed(name, change) {
  const snapshot = {files: new Map([...source.files].map(([key, bytes]) => [key, Buffer.from(bytes)]))};
  const doc = JSON.parse(snapshot.files.get(name)); change(doc);
  snapshot.files.set(name, Buffer.from(`${JSON.stringify(doc, null, 2)}\n`)); return snapshot;
}
const REVIEW = "original/reviewed.json", NZ = "2026-04-21-visa-blueprint-part2-italy-france-nz";
const XAVIER = "2026-05-22-uniaccess-xavier-university";
function withPacket(run) {
  const temporary = mkdtempSync(join(tmpdir(), "lkb-recovery-")), directory = join(temporary, "packet");
  try {const packet = build(source); writeRecoveryPacket(packet, directory, CORPUS); return run(directory, packet);}
  finally {rmSync(temporary, {recursive: true, force: true});}
}
test("all real source text retained with explicit 23+6, 7+65 and three invalid intervals", () => {
  const packet = build(source), {documents: docs, manifest} = packet;
  assert.equal(docs.sessions.length, 29); assert.equal(docs.turns.length, 3424); assert.equal(docs.claims.length, 7);
  assert.equal(manifest.sourceTurns, 3427); assert.equal(manifest.unresolvedClaimIds.length, 65);
  assert.deepEqual(manifest.originalSessionIds, ORIGINAL_SESSION_IDS); assert.equal(manifest.septemberSessionIds.length, 6);
  assert.equal(manifest.excludedTurns.length, 3); assert.equal(manifest.missingCases.length, 6);
  assert.equal(new Set([...manifest.reviewedClaimIds, ...manifest.unresolvedClaimIds]).size, 72);
  const excluded = new Set(manifest.excludedTurns.map(t => t.legacyTurnId));
  for (const session of docs.sessions) {
    const original = JSON.parse(source.files.get(`original/${session._id}/turns.json`));
    const recovered = docs.turns.filter(t => t.sessionId === session._id);
    assert.deepEqual(recovered.map(t => [t.legacyTurnId, t.speakerRef, t.tStart, t.tEnd, t.text]),
      original.filter(t => !excluded.has(t._id)).map(t => [t._id, t.speakerRef, t.tStart, t.tEnd, t.text]));
    const page = docs.session_pages.find(p => p.sessionId === session._id);
    recovered.forEach(t => assert.ok(page.summary.includes(t.text)));
    assert.equal(session.status.index, "pending"); assert.equal(session.status.summarize, "pending");
    assert.equal(page.recovery.semanticAcceptance, false); assert.equal("coveredTurnIds" in page, false);
  }
  assert.equal(docs.gaps.filter(g => g.kind === "vector-pending").length, 29);
  assert.equal(docs.gaps.flatMap(g => g.kind === "source-pending" ? g.recovery.unresolvedClaimIds : []).length, 65);
  const walk = node => [node, ...node.children.flatMap(walk)];
  assert.deepEqual(walk(docs.tree_index[0]).filter(n => n.level === "session").map(n => n.evidence.sessionRef).sort(), docs.sessions.map(s => s._id).sort());
  assert.ok(manifest.treeBytes > 1000000); // Records real context footprint rather than implying a bounded Ask prompt.
});
test("seven replacement claims preserve exact reviewed support, NZ has both contexts, identity unverified", () => {
  const packet = build(source), nz = packet.documents.claims.find(c => c.legacyClaimId === `${NZ}-c02`);
  assert.deepEqual(nz.evidence.map(e => e.reviewRole), ["assertion support", "country context"]);
  for (const claim of packet.documents.claims) {
    assert.equal(claim.status, "needs-review"); assert.equal(claim.recovery.externallyVerified, false);
    assert.notEqual(claim._id, claim.legacyClaimId);
    for (const evidence of claim.evidence) {
      const turn = packet.documents.turns.find(t => t._id === evidence.turnId);
      assert.ok(turn); assert.equal(evidence.quote, turn.text); assert.equal(evidence.speakerRef, turn.speakerRef);
      assert.equal(evidence.tStart, turn.tStart); assert.equal(evidence.tEnd, turn.tEnd);
    }
  }
});
test("fresh packet preserves every original byte and immutable identities; verified snapshot freezes exact buffers", () => withPacket((directory, packet) => {
  for (const [name, bytes] of source.files) assert.deepEqual(readFileSync(join(directory, name)), bytes);
  const verified = readRecoveryPacket(directory, source, buildTree);
  assert.deepEqual(verified.manifest.counts, packet.manifest.counts);
  assert.ok(Object.isFrozen(verified.documents.turns[0]));
  assert.throws(() => {verified.documents.turns[0].text = "poison";}, TypeError);
  assert.ok(verified.documents.turns.every(t => t._id !== t.legacyTurnId && /^[a-f0-9]{64}$/.test(t._id.split("-t-")[1])));
  const second = build(source); assert.equal(second.manifest.packetId, packet.manifest.packetId);
  assert.deepEqual(second.files.get("tree.json"), packet.files.get("tree.json"));
}));
for (const [name, change, pattern] of [
  ["altered claim text", r => {r.mappings[0].claimText += " fabricated";}, /hash mismatch/],
  ["altered current-turn hash", r => {r.mappings[0].currentTurnsSha256 = "0".repeat(64);}, /hash mismatch/],
  ["altered original-claim hash", r => {r.mappings[0].originalClaimsSha256 = "0".repeat(64);}, /hash mismatch/],
  ["altered support hash", r => {r.mappings[0].proposedEvidence[0].turnTextSha256 = "0".repeat(64);}, /supporting turn/],
  ["duplicate reviewed claim", r => {r.mappings[1] = r.mappings[0];}, /claim identity/],
  ["duplicate unresolved claim", r => {r.unreviewedClaimIds[1] = r.unreviewedClaimIds[0];}, /unresolved claim/],
  ["foreign reviewed owner", r => {r.mappings[0].tenantId = "foreign";}, /claim identity/],
  ["foreign support session", r => {r.mappings[0].proposedEvidence[0].sessionId = XAVIER;}, /supporting turn/],
  ["missing NZ country context", r => {r.mappings[0].proposedEvidence.pop();}, /both required/],
  ["wrong NZ review role", r => {r.mappings[0].proposedEvidence[1].reviewRole = "assertion support";}, /both required/],
  ["unknown unresolved id", r => {r.unreviewedClaimIds[0] = "unknown";}, /unresolved claim/],
]) test(`reject ${name}`, () => {
  const snapshot = changed(REVIEW, change);
  assert.throws(() => build(snapshot), /approved review authority/);
  assert.throws(() => validateRecoveryMappingFields(snapshot), pattern);
});
test("reject self-consistent forged review support even though field/source hashes all validate", () => {
  assert.equal(sha256(source.files.get(REVIEW)), APPROVED_REVIEW_SHA256);
  const unrelated = JSON.parse(source.files.get(`original/${XAVIER}/turns.json`))[0];
  const snapshot = changed(REVIEW, review => {
    const mapping = review.mappings.find(m => m.claimId === `${XAVIER}-c01`);
    mapping.proposedEvidence = [{sessionId: XAVIER, turnId: unrelated._id, turnTextSha256: sha256(unrelated.text),
      tStart: unrelated.tStart, tEnd: unrelated.tEnd, speakerRef: unrelated.speakerRef, reviewRole: "assertion support"}];
  });
  assert.doesNotThrow(() => validateRecoveryMappingFields(snapshot));
  assert.throws(() => build(snapshot), /approved review authority changed/);
});
test("reject unreviewed invalid interval instead of silently excluding additional source text", () => {
  const snapshot = changed(`original/${XAVIER}/turns.json`, turns => {turns[0].tEnd = turns[0].tStart - 1;});
  assert.throws(() => build(snapshot), /unreviewed invalid interval/);
});
test("reject foreign/duplicate original turns and incomplete evaluation inventory", () => {
  assert.throws(() => build(changed(`original/${XAVIER}/turns.json`, turns => {turns[0].tenantId = "foreign";})), /original turn/);
  assert.throws(() => build(changed(`original/${XAVIER}/turns.json`, turns => {turns[1]._id = turns[0]._id;})), /original turn/);
  assert.throws(() => build(changed("original/evaluation-corpus.json", c => {c.cases.pop();})), /inventory changed/);
});
test("changed output or archive refuses packet before it can be imported", () => withPacket(directory => {
  const path = join(directory, `sessions/${XAVIER}/turns.json`), original = readFileSync(path);
  const doc = JSON.parse(original); doc[0].text += " changed"; writeFileSync(path, JSON.stringify(doc));
  assert.throws(() => readRecoveryPacket(directory, source, buildTree), /packet changed/);
  writeFileSync(path, original); writeFileSync(join(directory, REVIEW), "{}");
  assert.throws(() => readRecoveryPacket(directory, source, buildTree), /packet changed/);
}));
test("fresh-generation proof is required, and original corpus destination is refused", () => withPacket((directory, packet) => {
  const proof = join(directory, "sessions", XAVIER, "derivation-provenance.json");
  const doc = JSON.parse(readFileSync(proof)); doc.status = "stale"; writeFileSync(proof, JSON.stringify(doc));
  assert.throws(() => readRecoveryPacket(directory, source, buildTree), /stale or mismatched/);
  assert.throws(() => writeRecoveryPacket(packet, CORPUS, CORPUS), /outside original corpus/);
  assert.throws(() => writeRecoveryPacket(packet, join(CORPUS, "..draft-new"), CORPUS), /outside original corpus/);
}));
test("actual dry-run CLI runs with unreachable Mongo config without any database import", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/recover-toc.mjs"), "--dry-run"],
    {cwd: ROOT, encoding: "utf8", env: {...process.env, MONGODB_URL: "mongodb://127.0.0.1:1", MONGO_WORK_DB: "lkb"}, timeout: 15000});
  assert.equal(result.status, 0, result.stderr); const resultDoc = JSON.parse(result.stdout);
  assert.equal(resultDoc.status, "dry-run-no-database-import"); assert.equal(resultDoc.counts.turns, 3424);
  assert.equal(resultDoc.strictIndexAcceptance, false);
});
