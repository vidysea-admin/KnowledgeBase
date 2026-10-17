import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpeakerProfile, speakerTranscriptHash, type SpeakerProfileInput } from "./profile.js";
import type { Claims, Sessions, Speakers, SpeakerSuggestions, Turns } from "@lkb/core";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { resolveSpeakers } from "../speakers.js";

export function profileFixture(): SpeakerProfileInput {
  const turn = (id: string, label: string, text: string, index: number): Turns => ({ _id: id, tenantId: "A", sessionId: "s1", speakerRef: label, text, tStart: index * 10, tEnd: index * 10 + 9 });
  const suggestion: SpeakerSuggestions = { _id: "suggest-1", tenantId: "A", sessionId: "s1", speakerRef: "spk:1", personId: "person:priya", displayName: "Priya", status: "confirmed", finalProvenance: "human-confirmed", suggestedAt: "2026-10-14T00:00:00Z", provenance: [{ turnId: "t0", evidenceQuote: "Welcome Priya to our panel", evidenceKind: "called-on" }], evidence: [{ sessionId: "s1", turnId: "t0" }], blocks: [{ startTurnIndex: 1, endTurnIndex: 2 }] };
  const speaker: Speakers = { _id: "A-person:priya", tenantId: "A", personId: "person:priya", aliases: ["Priya"], evidence: [{ sessionId: "s1", turnId: "t0" }], confirmations: [{ suggestionId: "suggest-1", sessionId: "s1", speakerRef: "spk:1", provenance: "human-confirmed" }] };
  const session: Sessions = { _id: "s1", tenantId: "A", sourceId: "src", title: "Real session", date: "2026-10-14", status: { transcribe: "done", index: "done" } };
  const claim = (id: string, turnId: string): Claims => ({ _id: id, tenantId: "A", text: `Claim ${id}`, status: "verified", topicRefs: ["A:visa"], evidence: [{ sessionId: "s1", turnId: turnId }] });
  const fixture: SpeakerProfileInput = { tenantId: "A", speaker, suggestions: [suggestion], sessions: [session],
    turns: [turn("t0", "spk:0", "Welcome Priya to our panel", 0), turn("t1", "spk:1", "I work at Acme as an Adviser", 1), turn("t2", "spk:1", "Visa deadlines require preparation", 2), turn("t3", "spk:0", "We now have another panelist", 3), turn("t4", "spk:1", "Another person speaks on this reused label", 4)],
    claims: [claim("good", "t2"), claim("reused", "t4"), claim("host", "t0")], topics: [{ _id: "A:visa", tenantId: "A", name: "Visas" }] };
  suggestion.blocks![0]!.turnIds = ["t1", "t2"]; suggestion.blocks![0]!.transcriptHash = speakerTranscriptHash(fixture.turns);
  return fixture;
}
test("confirmed suggestion rehydrates quote and blocks; knowledge never bleeds into recurring labels", () => {
  const p = buildSpeakerProfile(profileFixture())!;
  assert.equal(p.identityStatus, "human-confirmed"); assert.deepEqual(p.aliases, ["Priya"]);
  assert.deepEqual(p.claims.map(c => c.id), ["good"]); assert.equal(p.withheld.claims, 2);
  assert.equal(p.identityEvidence[0]!.quote, "Welcome Priya to our panel");
  assert.deepEqual(p.topics, [{ id: "A:visa", name: "Visas", claimIds: ["good"] }]);
  assert.deepEqual(p.sessions, [{ id: "s1", title: "Real session", date: "2026-10-14" }]);
});
test("suggested, rejected, forged confirmation and fabricated quote cannot establish identity", () => {
  for (const damage of ["suggested", "rejected", "no-confirmation", "bad-quote", "wrong-tenant"] as const) {
    const f = profileFixture(); const s = f.suggestions[0]!;
    if (damage === "suggested" || damage === "rejected") s.status = damage;
    if (damage === "no-confirmation") f.speaker.confirmations = [];
    if (damage === "bad-quote") s.provenance[0].evidenceQuote = "Priya never said these words";
    if (damage === "wrong-tenant") s.tenantId = "B";
    const p = buildSpeakerProfile(f)!; assert.equal(p.identityStatus, "unresolved", damage); assert.deepEqual(p.claims, [], damage); assert.deepEqual(p.aliases, [], damage);
  }
});
test("missing sessions, invalid ranges, mixed-label blocks and ambiguous chronological ties abstain", () => {
  for (const damage of ["missing-session", "range", "mixed", "ties", "duplicate-id"] as const) {
    const f = profileFixture();
    if (damage === "missing-session") f.sessions = [];
    if (damage === "range") f.suggestions[0]!.blocks![0]!.endTurnIndex = 999;
    if (damage === "mixed") f.turns[2]!.speakerRef = "spk:9";
    if (damage === "ties") f.turns[2]!.tStart = f.turns[1]!.tStart;
    if (damage === "duplicate-id") f.turns[2]!._id = f.turns[1]!._id;
    assert.deepEqual(buildSpeakerProfile(f)!.claims, [], damage);
  }
});
test("opposing confirmed block owners refuse overlapping scope", () => {
  const f = profileFixture(); f.suggestions.push({ ...structuredClone(f.suggestions[0]!), _id: "other", personId: "person:other", displayName: "Other" });
  const p = buildSpeakerProfile(f)!; assert.deepEqual(p.claims, []); assert.equal(p.withheld.blocks, 1);
});
test("multi-speaker, unverified, visual, foreign and absent quotes cannot become this speaker's claim", () => {
  for (const damage of ["multi", "review", "visual", "foreign", "bad-quote"] as const) {
    const f = profileFixture(); const c = f.claims[0]!;
    if (damage === "multi") c.evidence.push({ sessionId: "s1", turnId: "t4" });
    if (damage === "review") c.status = "needs-review";
    if (damage === "visual") c.origin = "screen-ocr";
    if (damage === "foreign") c.tenantId = "B";
    if (damage === "bad-quote") c.evidence[0].quote = "fabricated quote";
    assert.deepEqual(buildSpeakerProfile(f)!.claims, [], damage);
  }
});
test("org and role need accepted own attribute evidence, not just identity provenance", () => {
  const f = profileFixture(); f.speaker.org = "Acme"; f.speaker.role = "Adviser";
  assert.deepEqual(buildSpeakerProfile(f)!.organizations, []);
  const evidence = [{ sessionId: "s1", turnId: "t1", quote: "I work at Acme as an Adviser", status: "accepted" }];
  f.speaker.orgEvidence = evidence; f.speaker.roleEvidence = evidence;
  const p = buildSpeakerProfile(f)!; assert.equal(p.organizations[0]!.value, "Acme"); assert.equal(p.roles[0]!.value, "Adviser");
  f.speaker.roleEvidence = [{ ...evidence[0]!, turnId: "t4" }]; assert.deepEqual(buildSpeakerProfile(f)!.roles, []);
});
test("topic identifiers match exactly, never foreign/prefix labels", () => {
  const f = profileFixture(); f.topics = [{ _id: "B:visa", tenantId: "B", name: "Foreign" }, { _id: "A:visa-extra", tenantId: "A", name: "Wrong" }];
  assert.deepEqual(buildSpeakerProfile(f)!.topics, []);
});
test("direct resolved refs require established identity; foreign speaker refused", () => {
  const f = profileFixture(); f.turns[4]!.speakerRef = "person:priya";
  f.suggestions[0]!.blocks![0]!.transcriptHash = speakerTranscriptHash(f.turns);
  assert.deepEqual(buildSpeakerProfile(f)!.claims.map(c => c.id), ["good", "reused"]);
  f.suggestions = []; assert.deepEqual(buildSpeakerProfile(f)!.claims, []);
  f.speaker.tenantId = "B"; assert.equal(buildSpeakerProfile(f), null);
});
test("old unanchored and stale re-indexed blocks never attribute another reused-label turn", () => {
  const legacy = profileFixture(); delete legacy.suggestions[0]!.blocks![0]!.turnIds;
  assert.deepEqual(buildSpeakerProfile(legacy)!.claims, []);
  const shifted = profileFixture(); shifted.turns.splice(1, 0, { ...shifted.turns[4]!, _id: "new", tStart: 5, tEnd: 9 });
  // The numeric slice still has the expected label and valid times, so only the original snapshot protects it.
  assert.deepEqual(buildSpeakerProfile(shifted)!.claims, []);
  const replaced = profileFixture(); replaced.turns[2]!.text = "A different recording now speaks here";
  assert.deepEqual(buildSpeakerProfile(replaced)!.claims, []);
});
test("same-named cross-session persona keeps merge ambiguity and recorded confidence", () => {
  const f = profileFixture(); f.speaker.personId = "person:priya-nair"; f.speaker.confidence = 0.6; f.suggestions = [];
  f.turns[1]!.text = "My name is Priya Nair";
  f.sessions.push({ ...f.sessions[0]!, _id: "s2" });
  f.turns.push({ ...f.turns[1]!, _id: "other", sessionId: "s2", tStart: 0, tEnd: 9 });
  const p = buildSpeakerProfile(f)!; assert.deepEqual(p.ambiguity, { kind: "same-name-cross-session", sessionIds: ["s1", "s2"] }); assert.equal(p.recordedConfidence, 0.6);
});
test("deterministic self-naming floor retains only its own block", () => {
  const f = profileFixture(); f.suggestions = []; f.speaker.personId = "person:priya-nair";
  f.turns[1]!.text = "My name is Priya Nair";
  const p = buildSpeakerProfile(f)!; assert.equal(p.identityStatus, "deterministic"); assert.deepEqual(p.claims.map(c => c.id), ["good"]);
});
test("quoted or reported legacy floor names cannot establish a live identity or spread into another block", () => {
  for (const text of ['The applicant said, "My name is Priya Nair."', 'She told us my name is Priya Nair']) {
    const f = profileFixture(); f.suggestions = []; f.speaker.personId = "person:priya-nair"; f.turns[1]!.text = text;
    assert.equal(resolveSpeakers(f.turns).resolved.length, 1, "fixture must reach the unsafe legacy floor before the live-evidence guard");
    const p = buildSpeakerProfile(f)!; assert.equal(p.identityStatus, "unresolved"); assert.deepEqual(p.claims, []); assert.equal(p.withheld.identityEvidence, 1);
  }
  const f = profileFixture(); f.suggestions = []; f.speaker.personId = "person:priya-nair";
  f.turns[1]!.text = "My name is Priya Nair"; f.turns[4]!.text = 'The student said, "My name is Priya Nair."';
  assert.deepEqual(buildSpeakerProfile(f)!.claims.map(c => c.id), ["good"]);
});
test("real migrated TOC corpus identity citations survive the profile projection without writes", { skip: process.env.KB_U24_PRIVATE_TOC_TESTS === "1" ? false : "HOLD: private authentic TOC input requires explicit KB_U24_PRIVATE_TOC_TESTS=1" }, () => {
  const root = new URL("../../../../../data/toc-migrated/", import.meta.url);
  let profiles = 0; let identityCitations = 0; let sessions = 0; let positionalTurns = 0; let positionalBlocks = 0;
  const digest = createHash("sha256"); const attributable = new Set<string>();
  const files: { sessionId: string; turnsSha256: string; sessionSha256: string }[] = [];
  const excludedSources: { directoryId: string; reason: string; missingFiles: string[]; availableFiles: { name: string; sha256: string }[]; positionalTurns: number }[] = [];
  const refusedFloor: { sessionId: string; personId: string; speakerRef: string; evidenceTurnIds: string[] }[] = [];
  const turnAccounting: { sessionId: string; turnId: string; speakerRef: string; status: string; personIds: string[] }[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const required = ["session.json", "turns.json"];
    const missingFiles = required.filter(name => !existsSync(new URL(`${dir.name}/${name}`, root)));
    if (missingFiles.length) {
      const availableFiles = required.filter(name => !missingFiles.includes(name)).map(name => ({ name, sha256: createHash("sha256").update(readFileSync(new URL(`${dir.name}/${name}`, root))).digest("hex") }));
      const availableTurns = missingFiles.includes("turns.json") ? [] : JSON.parse(readFileSync(new URL(`${dir.name}/turns.json`, root), "utf8")) as Turns[];
      excludedSources.push({ directoryId: dir.name, reason: "incomplete migrated session prerequisites; no session identity fabricated", missingFiles, availableFiles, positionalTurns: availableTurns.filter(t => /^spk:\d+$/.test(t.speakerRef)).length });
      continue;
    }
    const bytes = readFileSync(new URL(`${dir.name}/turns.json`, root)); digest.update(dir.name).update(bytes);
    const turns = JSON.parse(bytes.toString("utf8")) as Turns[];
    const sessionBytes = readFileSync(new URL(`${dir.name}/session.json`, root)); digest.update(sessionBytes);
    const session = JSON.parse(sessionBytes.toString("utf8")) as Sessions;
    files.push({ sessionId: dir.name, turnsSha256: createHash("sha256").update(bytes).digest("hex"), sessionSha256: createHash("sha256").update(sessionBytes).digest("hex") });
    const peopleByTurn = new Map<string, Set<string>>();
    sessions++;
    positionalTurns += turns.filter(t => /^spk:\d+$/.test(t.speakerRef)).length;
    positionalBlocks += turns.filter((t, i) => /^spk:\d+$/.test(t.speakerRef) && (i === 0 || turns[i - 1]!.speakerRef !== t.speakerRef)).length;
    for (const r of resolveSpeakers(turns).resolved) {
      const speaker: Speakers = { _id: `${session.tenantId}-${r.personId}`, tenantId: session.tenantId, personId: r.personId, aliases: [r.displayName], evidence: [r.evidence[0]!, ...r.evidence.slice(1)] };
      const p = buildSpeakerProfile({ tenantId: session.tenantId, speaker, suggestions: [], turns, sessions: [session], claims: [], topics: [] })!;
      if (p.identityStatus === "unresolved") {
        assert.deepEqual(p.identityEvidence, []); assert.deepEqual(p.attribution, []); assert.deepEqual(p.claims, []);
        refusedFloor.push({ sessionId: session._id, personId: r.personId, speakerRef: r.speakerRef, evidenceTurnIds: r.evidence.map(e => e.turnId) });
        continue;
      }
      assert.equal(p.identityStatus, "deterministic"); assert.ok(p.identityEvidence.length > 0);
      for (const e of p.identityEvidence) { const t = turns.find(t => t._id === e.turnId)!; assert.equal(e.quote, t.text); assert.equal(e.sessionId, t.sessionId); assert.equal(e.tStart, t.tStart); identityCitations++; }
      assert.deepEqual(p.claims, []); profiles++;
      for (const a of p.attribution) for (const id of a.turnIds) { const people = peopleByTurn.get(id) ?? new Set<string>(); people.add(p.personId); peopleByTurn.set(id, people); }
    }
    for (const t of turns.filter(t => /^spk:\d+$/.test(t.speakerRef))) {
      const people = [...(peopleByTurn.get(t._id) ?? [])].sort(); const status = people.length === 1 ? "attributable" : "unresolved";
      if (status === "attributable") attributable.add(`${session._id}/${t._id}`);
      turnAccounting.push({ sessionId: session._id, turnId: t._id, speakerRef: t.speakerRef, status, personIds: status === "attributable" ? people : [] });
    }
  }
  assert.ok(sessions > 0); assert.ok(profiles > 0);
  assert.equal(turnAccounting.length, positionalTurns);
  const report = { sample: "real-toc-migrated-deterministic-read-projection", sessions, positionalTurns, positionalBlocks, profiles, identityCitations,
    attributableTurns: attributable.size, unresolvedPositionalTurns: positionalTurns - attributable.size, corpusSha256: digest.digest("hex"), corpusScope: "complete session.json+turns.json pairs in data/toc-migrated; incomplete directories reported separately", skipped: excludedSources.length, excludedSources, refusedFloor, databaseWrites: 0, providerCalls: 0 };
  const out = process.env.U24_EVIDENCE_DIR;
  if (out) { mkdirSync(resolve(out), { recursive: true }); writeFileSync(join(resolve(out), "corpus-accounting.json"), JSON.stringify({ ...report, files, turnAccounting, semanticGoldApproval: false }, null, 2)); }
  console.log(JSON.stringify(report));
});
