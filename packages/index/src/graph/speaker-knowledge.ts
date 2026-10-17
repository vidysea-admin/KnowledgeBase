import { createHash } from "node:crypto";
import { buildSpeakerProfile, speakerTranscriptHash, type ProfileCitation, type SpeakerProfileInput, type SpeakerProfile } from "../pipeline/speaker-profiles/profile.js";

/** Relations are curated assertions, never derived from semantic similarity. */
export interface SpeakerKnowledgeRelation {
  id: string; tenantId: string; status: "accepted" | "suggested" | "revoked";
  fromClaimId: string; toClaimId: string; type: "agrees_with" | "contradicts" | "supersedes";
  evidence: { sessionId: string; turnId: string; quote: string; transcriptHash: string }[];
}
export interface SpeakerKnowledgeView {
  tenantId: string; personId: string; identityStatus: SpeakerProfile["identityStatus"];
  ambiguity: SpeakerProfile["ambiguity"]; revision: string;
  nodes: { id: string; kind: "person" | "session" | "topic" | "statement"; label: string }[];
  edges: { source: string; target: string; type: string; evidence: ProfileCitation[] }[];
  statements: { id: string; text: string; topicIds: string[]; evidence: ProfileCitation[] }[];
  withheldRelationships: number;
}
const canonical = (kind: string, id: string) => id.startsWith(`${kind}:`) ? id : `${kind}:${id}`;
const locator = (e: { sessionId: string; turnId: string }) => JSON.stringify([e.sessionId, e.turnId]);
const normalise = (s: string) => s.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();

/** Pure read projection. All speaker attribution remains the privacy-hardened profile's decision.
 * Callers must reload tenant-authorized sources on every request; this is not a permission cache. */
export function buildSpeakerKnowledgeView(input: SpeakerProfileInput & { visibleSessionIds: readonly string[]; relationships?: readonly SpeakerKnowledgeRelation[] }): SpeakerKnowledgeView | null {
  // Refuse oversized snapshots; truncating the transcript would reinterpret identity blocks.
  if (input.sessions.length > 100 || input.turns.length > 10000 || input.claims.length > 10000 ||
      input.suggestions.length > 10000 || input.topics.length > 10000 || input.visibleSessionIds.length > 100 ||
      (input.relationships?.length ?? 0) > 1000) return null;
  // Authorization comes from the caller's current metadata-visibility snapshot, never from
  // inferred graph membership. Absence/revocation fails closed before identity hydration.
  const visible = new Set(input.visibleSessionIds);
  const sessions = input.sessions.filter(s => s.tenantId === input.tenantId && visible.has(s._id));
  const valid = new Set(sessions.map(s => s._id));
  const turns = input.turns.filter(t => t.tenantId === input.tenantId && valid.has(t.sessionId));
  const turnMap = new Map<string, (typeof turns)[number]>();
  // Turns use _id, whereas evidence uses turnId. Never normalize an asserted quote into
  // something the transcript does not literally contain.
  for (const t of turns) turnMap.set(locator({ sessionId: t.sessionId, turnId: t._id }), t);
  const claimsInput = input.claims.filter(c => c.evidence.length && c.evidence.every(e => valid.has(e.sessionId) &&
    (e.quote === undefined || (e.quote.trim().length > 0 && turnMap.get(locator(e))?.text.includes(e.quote)))));
  if (new Set(claimsInput.map(c => c._id)).size !== claimsInput.length) return null;
  const profile = buildSpeakerProfile({ ...input, sessions, claims: claimsInput,
    turns, suggestions: input.suggestions.filter(s => valid.has(s.sessionId)) });
  if (!profile) return null;
  const nodes: SpeakerKnowledgeView["nodes"] = [];
  const edges: SpeakerKnowledgeView["edges"] = [];
  const person = canonical("person", profile.personId);
  // An unresolved identity has no asserted identity, statement or session graph.
  if (profile.identityStatus !== "unresolved") nodes.push({ id: person, kind: "person", label: profile.aliases[0] ?? profile.personId });
  for (const s of profile.sessions) {
    nodes.push({ id: canonical("session", s.id), kind: "session", label: s.title });
    const evidence = [...profile.identityEvidence, ...profile.claims.flatMap(c => c.evidence)].filter(e => e.sessionId === s.id);
    if (evidence.length) edges.push({ source: person, target: canonical("session", s.id), type: "spoke_in", evidence });
  }
  const statements = profile.claims.map(c => ({ id: c.id, text: c.text, evidence: c.evidence, topicIds: profile.topics.filter(t => t.claimIds.includes(c.id)).map(t => t.id) }));
  for (const c of statements) {
    const statement = canonical("statement", c.id);
    nodes.push({ id: statement, kind: "statement", label: c.text });
    edges.push({ source: person, target: statement, type: "stated", evidence: c.evidence });
    for (const session of new Set(c.evidence.map(e => e.sessionId))) edges.push({ source: statement, target: canonical("session", session), type: "supported_by", evidence: c.evidence.filter(e => e.sessionId === session) });
  }
  for (const t of profile.topics) {
    nodes.push({ id: canonical("topic", t.id), kind: "topic", label: t.name });
    for (const c of statements.filter(c => c.topicIds.includes(t.id))) edges.push({ source: canonical("statement", c.id), target: canonical("topic", t.id), type: "about", evidence: c.evidence });
  }
  // Prefix-qualified legacy IDs must not silently alias an unqualified entity.
  if (new Set(nodes.map(n => n.id)).size !== nodes.length) return null;
  const claims = new Map(statements.map(c => [c.id, c]));
  const hashes = new Map<string, string>();
  const relationKeys = new Set<string>();
  let withheldRelationships = 0;
  for (const r of input.relationships ?? []) {
    const from = claims.get(r.fromClaimId); const to = claims.get(r.toClaimId);
    const allowed = new Map([...(from?.evidence ?? []), ...(to?.evidence ?? [])].map(e => [locator(e), e]));
    const evidence: ProfileCitation[] = [];
    if (r.tenantId !== input.tenantId || r.status !== "accepted" || !from || !to || from.id === to.id ||
        !["agrees_with", "contradicts", "supersedes"].includes(r.type) || !r.evidence.length) { withheldRelationships++; continue; }
    for (const e of r.evidence) {
      const citation = allowed.get(locator(e));
      let hash = hashes.get(e.sessionId);
      if (!hash) {
        hash = speakerTranscriptHash(input.turns.filter(t => t.tenantId === input.tenantId && t.sessionId === e.sessionId).sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id)));
        hashes.set(e.sessionId, hash);
      }
      if (!citation || !e.quote.trim() || !citation.quote.includes(e.quote) || hash !== e.transcriptHash) break;
      evidence.push({ ...citation, quote: e.quote });
    }
    if (evidence.length !== r.evidence.length) { withheldRelationships++; continue; }
    const relationKey = JSON.stringify([from.id, to.id, r.type]);
    if (relationKeys.has(relationKey)) continue;
    relationKeys.add(relationKey);
    edges.push({ source: canonical("statement", from.id), target: canonical("statement", to.id), type: r.type, evidence });
  }
  const revision = createHash("sha256").update(JSON.stringify({ tenantId: input.tenantId, personId: profile.personId, identityStatus: profile.identityStatus, nodes, edges, statements })).digest("hex");
  const view: SpeakerKnowledgeView = { tenantId: input.tenantId, personId: profile.personId, identityStatus: profile.identityStatus, ambiguity: profile.ambiguity, revision, nodes, edges, statements, withheldRelationships };
  // Bounded graph output, including repeated evidence and metadata, not only row counts.
  // Refusal preserves whole evidence; no partial quote or partial graph is published.
  return Buffer.byteLength(JSON.stringify(view), "utf8") <= 512 * 1024 ? view : null;
}

export interface SpeakerKnowledgeRouteInput { query: string; maxPassages?: number; maxCharacters?: number; sessionIds?: readonly string[]; topicIds?: readonly string[] }
/** Unicode lexical routing over exact evidence. No vectors, provider calls or summary-as-evidence. */
export function routeSpeakerKnowledge(view: SpeakerKnowledgeView, input: SpeakerKnowledgeRouteInput): { passages: ProfileCitation[]; truncated: boolean; revision: string } {
  const bounded = (v: number | undefined, fallback: number, cap: number) => v === undefined ? fallback : Number.isFinite(v) ? Math.max(0, Math.min(cap, Math.floor(v))) : 0;
  const maxPassages = bounded(input.maxPassages, 8, 20); const maxCharacters = bounded(input.maxCharacters, 6000, 12000);
  const tokens = [...new Set(normalise(input.query.slice(0, 4096)).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])].slice(0, 64);
  if (!tokens.length || view.identityStatus === "unresolved") return { passages: [], truncated: false, revision: view.revision };
  const ranked = view.statements.filter(c => !input.topicIds || c.topicIds.some(t => input.topicIds!.includes(t))).flatMap(c => c.evidence
    .filter(e => !input.sessionIds || input.sessionIds.includes(e.sessionId))
    .map(e => ({ e, score: tokens.reduce((n, t) => n + (normalise(`${c.text} ${e.quote}`).includes(t) ? 1 : 0), 0) })))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.e.sessionId.localeCompare(b.e.sessionId) || a.e.tStart - b.e.tStart || a.e.turnId.localeCompare(b.e.turnId));
  const passages: ProfileCitation[] = []; const seen = new Set<string>(); let characters = 0; let truncated = false;
  for (const { e } of ranked) {
    const id = locator(e); if (seen.has(id)) continue; seen.add(id);
    // Never truncate a quote into a fabricated locator/snippet. Skip over-budget passages whole.
    if (passages.length >= maxPassages || characters + e.quote.length > maxCharacters) { truncated = true; continue; }
    passages.push(e); characters += e.quote.length;
  }
  return { passages, truncated, revision: view.revision };
}
