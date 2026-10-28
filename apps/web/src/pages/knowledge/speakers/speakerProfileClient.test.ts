import { expect, test } from "vitest";
import { validCitedSpeakerProfile, validSpeakerKnowledge } from "./speakerProfileClient.js";
const profile = { personId: "person:anita", aliases: ["Anita"], identityStatus: "unresolved", ambiguity: null, recordedConfidence: 0.7, identityEvidence: [], organizations: [], roles: [], unavailable: ["organizations", "roles"], claims: [], topics: [], sessions: [], attribution: [], withheld: { claims: 0, identityEvidence: 0, blocks: 0, profileFields: 0 } };
test("speaker transport validates exact person identity, evidence/field bounds and accepted state", () => {
  expect(validCitedSpeakerProfile(profile, "person:anita")).toBe(true); expect(validCitedSpeakerProfile(profile, "person:another")).toBe(false);
  expect(validCitedSpeakerProfile({ ...profile, identityStatus: "suggested" }, "person:anita")).toBe(false);
  expect(validCitedSpeakerProfile({ ...profile, roles: [{ value: "Counsellor", evidence: [] }] }, "person:anita")).toBe(false);
  expect(validCitedSpeakerProfile({ ...profile, recordedConfidence: 2 }, "person:anita")).toBe(false);
  expect(validCitedSpeakerProfile({ ...profile, attribution: [{ sessionId: "s", speakerRef: "spk:0", startTurnIndex: 0, endTurnIndex: 2, turnIds: ["t1"] }] }, "person:anita")).toBe(false);
});

test("speaker knowledge transport refuses foreign identity, stale revision and oversized passages", () => {
  const revision = "a".repeat(64), cite = { sessionId: "s", sessionTitle: "Session", turnId: "t", tStart: 0, tEnd: 1, quote: "Visa advice" };
  const value = { knowledge: { personId: "person:anita", identityStatus: "human-confirmed", ambiguity: null, revision, nodes: [], edges: [], statements: [], withheldRelationships: 0 }, retrieval: { revision, truncated: false, passages: [cite] } };
  expect(validSpeakerKnowledge(value, "person:anita")).toBe(true);
  expect(validSpeakerKnowledge(value, "person:foreign")).toBe(false);
  expect(validSpeakerKnowledge({ ...value, retrieval: { ...value.retrieval, revision: "b".repeat(64) } }, "person:anita")).toBe(false);
  expect(validSpeakerKnowledge({ ...value, retrieval: { ...value.retrieval, passages: [{ ...cite, quote: "x".repeat(12001) }] } }, "person:anita")).toBe(false);
});
