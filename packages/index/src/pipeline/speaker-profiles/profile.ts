import type { Claims, Sessions, Speakers, SpeakerSuggestions, Topics, Turns } from "@lkb/core";
import { resolveSpeakers } from "../speakers.js";
import { createHash } from "node:crypto";
import { nameOccurrences } from "../speaker-name-rules.js";
import { isReportedAt } from "../speaker-rules/speaker-reported-rules.js";

/** A read projection, never an identity writer. Raw labels and pending suggestions cannot establish a persona. */
export interface ProfileCitation { sessionId: string; sessionTitle: string; turnId: string; tStart: number; tEnd: number; quote: string }
export interface SpeakerProfile {
  personId: string; aliases: string[]; identityStatus: "human-confirmed" | "deterministic" | "unresolved";
  ambiguity: { kind: "same-name-cross-session"; sessionIds: string[] } | null; recordedConfidence: number | null;
  identityEvidence: ProfileCitation[];
  organizations: { value: string; evidence: ProfileCitation[] }[];
  roles: { value: string; evidence: ProfileCitation[] }[];
  unavailable: string[];
  claims: { id: string; text: string; status: "verified"; evidence: ProfileCitation[] }[];
  topics: { id: string; name: string; claimIds: string[] }[];
  sessions: { id: string; title: string; date: string }[];
  attribution: { sessionId: string; speakerRef: string; startTurnIndex: number; endTurnIndex: number; turnIds: string[] }[];
  withheld: { claims: number; identityEvidence: number; blocks: number; profileFields: number };
}
export interface SpeakerProfileInput {
  tenantId: string; speaker: Speakers; suggestions: SpeakerSuggestions[];
  turns: Turns[]; sessions: Sessions[]; claims: Claims[]; topics: Topics[];
}
const key = (sessionId: string, turnId: string) => JSON.stringify([sessionId, turnId]);
const norm = (s: string) => s.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

/** Source snapshot identity, shared by a future producer and this reader; no mutable array index is an identity anchor. */
export function speakerTranscriptHash(turns: readonly Turns[]): string {
  return createHash("sha256").update(JSON.stringify(turns.map(t => [t._id, t.sessionId, t.speakerRef, t.tStart, t.tEnd, t.text]))).digest("hex");
}

export function buildSpeakerProfile(input: SpeakerProfileInput): SpeakerProfile | null {
  const { tenantId, speaker } = input;
  if (speaker.tenantId !== tenantId || !nonempty(speaker.personId)) return null;
  const sessions = new Map(input.sessions.filter(s => s.tenantId === tenantId).map(s => [s._id, s]));
  const ordered = new Map<string, Turns[]>();
  for (const s of sessions.keys()) ordered.set(s, input.turns.filter(t => t.tenantId === tenantId && t.sessionId === s).sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id)));
  const turns = new Map([...ordered.values()].flat().map(t => [key(t.sessionId, t._id), t]));
  const ambiguousOrder = new Set([...ordered].filter(([, list]) => new Set(list.map(t => t._id)).size !== list.length ||
    list.some((t, i) => i > 0 && t.tStart === list[i - 1]!.tStart)).map(([id]) => id));
  const hashes = new Map<string, string>();
  const snapshotHash = (sessionId: string): string => {
    let hash = hashes.get(sessionId);
    if (hash === undefined) { hash = speakerTranscriptHash(ordered.get(sessionId) ?? []); hashes.set(sessionId, hash); }
    return hash;
  };
  const withheld = { claims: 0, identityEvidence: 0, blocks: 0, profileFields: 0 };
  const cite = (sessionId: string, turnId: string, quote?: string): ProfileCitation | null => {
    const t = turns.get(key(sessionId, turnId)); const s = sessions.get(sessionId);
    if (!t || !s || !nonempty(t.text) || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart) return null;
    if (quote !== undefined && (!nonempty(quote) || !norm(t.text).includes(norm(quote)))) return null;
    return { sessionId, sessionTitle: s.title, turnId, tStart: t.tStart, tEnd: t.tEnd, quote: quote ?? t.text };
  };
  const identityEvidence: ProfileCitation[] = [];
  const acceptedAliases = new Set<string>();
  const attributed = new Set<string>();
  const attribution: SpeakerProfile["attribution"] = [];
  let humanConfirmed = false; let deterministic = false;
  const accepted = input.suggestions.filter(s => s.tenantId === tenantId && s.status === "confirmed" && s.finalProvenance === "human-confirmed");
  const addIdentity = (c: ProfileCitation) => { if (!identityEvidence.some(e => key(e.sessionId, e.turnId) === key(c.sessionId, c.turnId) && e.quote === c.quote)) identityEvidence.push(c); };
  // Stored indexes require the original unambiguous chronological order. Ties or duplicate turn IDs abstain.
  const allowBlock = (sessionId: string, label: string, start: number, end: number): void => {
    const list = ordered.get(sessionId) ?? [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= list.length ||
        ambiguousOrder.has(sessionId)) { withheld.blocks++; return; }
    const block = list.slice(start, end + 1);
    if (block.some(t => t.speakerRef !== label || !cite(sessionId, t._id)) || accepted.some(s => s.sessionId === sessionId && s.personId !== speaker.personId &&
      (s.blocks ?? []).some(b => b.startTurnIndex <= end && b.endTurnIndex >= start))) { withheld.blocks++; return; }
    for (const t of block) attributed.add(key(sessionId, t._id));
    if (!attribution.some(a => a.sessionId === sessionId && a.startTurnIndex === start && a.endTurnIndex === end)) attribution.push({ sessionId, speakerRef: label, startTurnIndex: start, endTurnIndex: end, turnIds: block.map(t => t._id) });
  };
  for (const s of accepted.filter(s => s.personId === speaker.personId)) {
    const confirmations = speaker.confirmations;
    if (!Array.isArray(confirmations) || !confirmations.some(c => c && typeof c === "object" && c.suggestionId === s._id &&
      c.sessionId === s.sessionId && c.speakerRef === s.speakerRef && c.provenance === "human-confirmed")) { withheld.identityEvidence++; continue; }
    const citations = s.provenance.map(p => cite(s.sessionId, p.turnId, p.evidenceQuote));
    if (!citations.length || citations.some(c => c === null) || !s.provenance.some(p => norm(p.evidenceQuote).includes(norm(s.displayName))) ||
        !s.evidence.every(e => e.sessionId === s.sessionId && cite(e.sessionId, e.turnId))) { withheld.identityEvidence++; continue; }
    humanConfirmed = true;
    acceptedAliases.add(s.displayName);
    for (const c of citations) if (c) addIdentity(c);
    for (const b of s.blocks ?? []) {
      const list = ordered.get(s.sessionId) ?? [];
      if (!Array.isArray(b.turnIds) || b.transcriptHash !== snapshotHash(s.sessionId) ||
          JSON.stringify(b.turnIds) !== JSON.stringify(list.slice(b.startTurnIndex, b.endTurnIndex + 1).map(t => t._id))) { withheld.blocks++; continue; }
      allowBlock(s.sessionId, s.speakerRef, b.startTurnIndex, b.endTurnIndex);
    }
  }
  // The deterministic floor is re-derived from actual tenant-owned turns, not a global label/name lookup.
  for (const [sessionId, list] of ordered) {
    const floor = resolveSpeakers(list).resolved.filter(r => r.personId === speaker.personId);
    for (const r of floor) {
      if (accepted.some(s => s.sessionId === sessionId && s.speakerRef === r.speakerRef && s.personId !== r.personId)) continue;
      const liveEvidence = r.evidence.filter(e => {
        const turn = turns.get(key(e.sessionId, e.turnId));
        return turn && nameOccurrences(turn.text, r.displayName).some(at => /\bmy name(?:'s| is)\s+$/i.test(turn.text.slice(0, at)) && !isReportedAt(turn.text, r.displayName, at));
      });
      withheld.identityEvidence += r.evidence.length - liveEvidence.length;
      const evidence = liveEvidence.map(e => cite(e.sessionId, e.turnId));
      if (!evidence.length) continue;
      if (evidence.some(e => e === null)) { withheld.identityEvidence += evidence.filter(e => e === null).length; continue; }
      deterministic = true;
      acceptedAliases.add(r.displayName);
      for (const c of evidence) if (c) addIdentity(c);
      for (const b of r.blocks) {
        if (!liveEvidence.some(e => list.slice(b.startTurnIndex, b.endTurnIndex + 1).some(t => t._id === e.turnId))) { withheld.blocks++; continue; }
        allowBlock(sessionId, r.speakerRef, b.startTurnIndex, b.endTurnIndex);
      }
    }
  }
  // Already resolved source turns are permitted only after identity evidence is independently established.
  if (humanConfirmed || deterministic) for (const t of turns.values()) if (t.speakerRef === speaker.personId) attributed.add(key(t.sessionId, t._id));
  const claims: SpeakerProfile["claims"] = []; const topicClaims = new Map<string, string[]>();
  for (const c of input.claims.filter(c => c.tenantId === tenantId)) {
    if (c.status !== "verified" || c.origin === "screen-ocr" || c.origin === "visual-observation" || !c.evidence.length ||
        !c.evidence.every(e => attributed.has(key(e.sessionId, e.turnId)))) { withheld.claims++; continue; }
    const evidence = c.evidence.map(e => cite(e.sessionId, e.turnId, e.quote));
    if (evidence.some(e => e === null)) { withheld.claims++; continue; }
    claims.push({ id: c._id, text: c.text, status: "verified", evidence: evidence.filter((e): e is ProfileCitation => e !== null) });
    for (const ref of c.topicRefs ?? []) topicClaims.set(ref, [...(topicClaims.get(ref) ?? []), c._id]);
  }
  const field = (name: "org" | "role"): SpeakerProfile["roles"] => {
    const value = speaker[name]; if (!nonempty(value)) return [];
    // Attribute assertions need their OWN accepted quote provenance; identity evidence alone is insufficient.
    const raw = speaker[`${name}Evidence`];
    if (!Array.isArray(raw)) { withheld.profileFields++; return []; }
    const evidence: ProfileCitation[] = [];
    for (const e of raw) {
      if (!e || typeof e !== "object" || e.status !== "accepted" || !nonempty(e.sessionId) || !nonempty(e.turnId) || !nonempty(e.quote) ||
          !norm(e.quote).includes(norm(value)) || !attributed.has(key(e.sessionId, e.turnId))) continue;
      const c = cite(e.sessionId, e.turnId, e.quote); if (c) evidence.push(c);
    }
    if (!evidence.length) { withheld.profileFields++; return []; }
    return [{ value, evidence }];
  };
  const organizations = field("org"); const roles = field("role");
  const topics = input.topics.filter(t => t.tenantId === tenantId && topicClaims.has(t._id)).map(t => ({ id: t._id, name: t.name, claimIds: [...new Set(topicClaims.get(t._id))].sort() })).sort((a, b) => a.id.localeCompare(b.id));
  const used = new Set([...identityEvidence, ...claims.flatMap(c => c.evidence), ...organizations.flatMap(x => x.evidence), ...roles.flatMap(x => x.evidence)].map(e => e.sessionId));
  const identitySessions = [...new Set([...identityEvidence.map(e => e.sessionId), ...speaker.evidence.filter(e => cite(e.sessionId, e.turnId)).map(e => e.sessionId)])].sort();
  return {
    personId: speaker.personId, aliases: [...acceptedAliases].sort(), identityStatus: humanConfirmed ? "human-confirmed" : deterministic ? "deterministic" : "unresolved",
    ambiguity: identitySessions.length > 1 ? { kind: "same-name-cross-session", sessionIds: identitySessions } : null,
    recordedConfidence: typeof speaker.confidence === "number" && Number.isFinite(speaker.confidence) ? speaker.confidence : null,
    identityEvidence: identityEvidence.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.tStart - b.tStart || a.turnId.localeCompare(b.turnId)),
    organizations, roles, unavailable: [...(!organizations.length ? ["organizations"] : []), ...(!roles.length ? ["roles"] : []), ...(!topics.length ? ["topics"] : []), ...(!claims.length ? ["claims"] : [])],
    claims: claims.sort((a, b) => a.id.localeCompare(b.id)), topics,
    sessions: [...sessions.values()].filter(s => used.has(s._id)).map(s => ({ id: s._id, title: s.title, date: s.date })).sort((a, b) => a.id.localeCompare(b.id)),
    attribution: attribution.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.startTurnIndex - b.startTurnIndex), withheld,
  };
}
