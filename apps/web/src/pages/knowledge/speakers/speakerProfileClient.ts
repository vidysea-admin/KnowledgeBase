import { apiFetch, ApiError } from "../../../api/client.js";
export interface SpeakerCitation { sessionId: string; sessionTitle: string; turnId: string; tStart: number; tEnd: number; quote: string }
export interface CitedSpeakerProfile {
  personId: string; aliases: string[]; identityStatus: "human-confirmed" | "deterministic" | "unresolved";
  ambiguity: { kind: "same-name-cross-session"; sessionIds: string[] } | null; recordedConfidence: number | null;
  identityEvidence: SpeakerCitation[]; organizations: Array<{ value: string; evidence: SpeakerCitation[] }>; roles: Array<{ value: string; evidence: SpeakerCitation[] }>;
  unavailable: string[]; claims: Array<{ id: string; text: string; status: "verified"; evidence: SpeakerCitation[] }>;
  topics: Array<{ id: string; name: string; claimIds: string[] }>; sessions: Array<{ id: string; title: string; date: string }>;
  attribution: Array<{ sessionId: string; speakerRef: string; startTurnIndex: number; endTurnIndex: number; turnIds: string[] }>;
  withheld: { claims: number; identityEvidence: number; blocks: number; profileFields: number };
}
const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === "string");
const nonempty = (v: unknown) => typeof v === "string" && v.length > 0;
const citation = (v: unknown): v is SpeakerCitation => obj(v) && nonempty(v.sessionId) && typeof v.sessionTitle === "string" && nonempty(v.turnId) && nonempty(v.quote) && typeof v.tStart === "number" && v.tStart >= 0 && Number.isFinite(v.tStart) && typeof v.tEnd === "number" && v.tEnd >= v.tStart && Number.isFinite(v.tEnd);
const citations = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(citation);
const counts = (v: unknown) => obj(v) && ["claims", "identityEvidence", "blocks", "profileFields"].every(k => Number.isInteger(v[k]) && Number(v[k]) >= 0);
export function validCitedSpeakerProfile(v: unknown, personId: string): v is CitedSpeakerProfile {
  return obj(v) && v.personId === personId && strings(v.aliases) && ["human-confirmed", "deterministic", "unresolved"].includes(v.identityStatus as string) &&
    (v.ambiguity === null || obj(v.ambiguity) && v.ambiguity.kind === "same-name-cross-session" && strings(v.ambiguity.sessionIds)) &&
    (v.recordedConfidence === null || typeof v.recordedConfidence === "number" && Number.isFinite(v.recordedConfidence) && v.recordedConfidence >= 0 && v.recordedConfidence <= 1) &&
    Array.isArray(v.identityEvidence) && v.identityEvidence.every(citation) && strings(v.unavailable) &&
    Array.isArray(v.organizations) && v.organizations.every(f => obj(f) && nonempty(f.value) && citations(f.evidence)) &&
    Array.isArray(v.roles) && v.roles.every(f => obj(f) && nonempty(f.value) && citations(f.evidence)) &&
    Array.isArray(v.claims) && v.claims.every(c => obj(c) && nonempty(c.id) && typeof c.text === "string" && c.status === "verified" && citations(c.evidence)) &&
    Array.isArray(v.topics) && v.topics.every(t => obj(t) && nonempty(t.id) && typeof t.name === "string" && strings(t.claimIds)) &&
    Array.isArray(v.sessions) && v.sessions.every(s => obj(s) && nonempty(s.id) && typeof s.title === "string" && typeof s.date === "string") &&
    Array.isArray(v.attribution) && v.attribution.every(a => obj(a) && nonempty(a.sessionId) && nonempty(a.speakerRef) && Number.isInteger(a.startTurnIndex) && Number(a.startTurnIndex) >= 0 && Number.isInteger(a.endTurnIndex) && Number(a.endTurnIndex) >= Number(a.startTurnIndex) && strings(a.turnIds) && a.turnIds.length === Number(a.endTurnIndex) - Number(a.startTurnIndex) + 1) &&
    counts(v.withheld);
}
export async function loadCitedSpeakerProfile(key: string, personId: string): Promise<CitedSpeakerProfile> {
  const r = await apiFetch<{ profile: unknown }>(`/speaker-profiles/${encodeURIComponent(personId)}`, key);
  if (!r || !validCitedSpeakerProfile(r.profile, personId)) throw new ApiError(503, "Invalid speaker profile response.");
  return r.profile;
}

export interface SpeakerKnowledgeResponse {
  knowledge: {
    personId: string; identityStatus: CitedSpeakerProfile["identityStatus"]; ambiguity: CitedSpeakerProfile["ambiguity"]; revision: string;
    nodes: Array<{ id: string; kind: "person" | "session" | "topic" | "statement"; label: string }>;
    edges: Array<{ source: string; target: string; type: string; evidence: SpeakerCitation[] }>;
    statements: Array<{ id: string; text: string; topicIds: string[]; evidence: SpeakerCitation[] }>; withheldRelationships: number;
  };
  retrieval: { passages: SpeakerCitation[]; truncated: boolean; revision: string };
}
export function validSpeakerKnowledge(v: unknown, personId: string): v is SpeakerKnowledgeResponse {
  if (!obj(v) || !obj(v.knowledge) || !obj(v.retrieval)) return false;
  const k = v.knowledge, r = v.retrieval;
  return k.personId === personId && ["human-confirmed", "deterministic", "unresolved"].includes(k.identityStatus as string) &&
    (k.ambiguity === null || obj(k.ambiguity) && k.ambiguity.kind === "same-name-cross-session" && strings(k.ambiguity.sessionIds)) &&
    typeof k.revision === "string" && /^[a-f0-9]{64}$/.test(k.revision) && r.revision === k.revision &&
    Array.isArray(k.nodes) && k.nodes.every(n => obj(n) && nonempty(n.id) && ["person", "session", "topic", "statement"].includes(n.kind as string) && typeof n.label === "string") &&
    Array.isArray(k.edges) && k.edges.every(e => obj(e) && nonempty(e.source) && nonempty(e.target) && nonempty(e.type) && citations(e.evidence)) &&
    Array.isArray(k.statements) && k.statements.every(s => obj(s) && nonempty(s.id) && typeof s.text === "string" && strings(s.topicIds) && citations(s.evidence)) &&
    Number.isInteger(k.withheldRelationships) && Number(k.withheldRelationships) >= 0 && typeof r.truncated === "boolean" &&
    Array.isArray(r.passages) && r.passages.length <= 20 && r.passages.every(citation) && r.passages.reduce((n, c) => n + c.quote.length, 0) <= 12000;
}
export async function loadSpeakerKnowledge(key: string, personId: string, query: string): Promise<SpeakerKnowledgeResponse> {
  const value: unknown = await apiFetch(`/speaker-profiles/${encodeURIComponent(personId)}/knowledge?q=${encodeURIComponent(query)}`, key);
  if (!validSpeakerKnowledge(value, personId)) throw new ApiError(503, "Invalid speaker knowledge response.");
  return value;
}
