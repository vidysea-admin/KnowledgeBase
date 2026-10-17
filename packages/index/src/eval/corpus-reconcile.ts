/**
 * packages/index/src/eval/corpus-reconcile.ts — read-only corpus reconciliation for U2.2.
 *
 * Pure functions over ALREADY-LOADED artefacts (no fs, no Mongo, no network). They explain, never repair:
 *  - why each persisted citation does not resolve to a current turn, and a candidate target if one exists;
 *  - which declared case artefacts are missing, with the expected path;
 *  - which turns carry invalid source times (the offending values);
 *  - which migrated sessions are NOT among the original raw transcripts (23 vs 29), with provenance.
 * Proposals are output only. Nothing here edits a citation, a turn, a label or a threshold; semantic gold
 * stays a human field and the lexical hint is explicitly an UNREVIEWED hint, never gold.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const TURN_ID = /^(.+)-t(\d+)$/;

export interface SessionSnapshot {
  sessionId: string;
  turns: Obj[];
  claims?: Obj[];
  turnsSha256?: string;
  session?: Obj;
  source?: Obj;
  /** Where the git history first added this session directory; supplied by the caller (optional). */
  firstCommit?: {hash: string; date: string; subject: string} | null;
}
export interface ReviewedMapping {
  claimId: string;
  currentTurnsSha256?: string;
  originalEvidence?: {turnId: string; sessionId?: string}[];
  proposedEvidence: {turnId: string; sessionId?: string; reviewRole?: string}[];
  reviewStatus?: string;
}

export type CitationReason =
  | "session-missing" | "id-format" | "session-prefix-mismatch" | "turn-off-range" | "turn-gap-in-range";

export interface LexicalHint {
  status: "unambiguous" | "ambiguous" | "none";
  top: {turnId: string; coverage: number}[];
  margin: number | null;
}
export interface CitationFinding {
  sessionId: string;
  claimId: string;
  citedTurnId: string;
  citedSessionId: string;
  reason: CitationReason;
  detail: Record<string, string | number | null>;
  proposal: {
    basis: "independently-reviewed-mapping" | "lexical-hint-unreviewed" | "none";
    turnIds: string[];
    boundToCurrentTurns: boolean | null;
    note: string;
  };
  reviewedMapping: {present: boolean; originalEvidenceMatchesCitation: boolean | null; boundToCurrentTurns: boolean | null};
  lexicalHint: LexicalHint;
}

const STOP = new Set(("that this with from have been were their there which would about they them than then also into more most some such " +
  "only over very will what when where while your these those because could should other being does doing just like make made many much " +
  "each both between during through after before again further once here said says say yeah okay").split(" "));
/** Distinctive tokens: lowercase alphanumerics (and %), 4+ chars or any token containing a digit, minus stop words. */
export function distinctiveTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[a-z0-9%]+/g)) {
    const w = m[0];
    if ((w.length >= 4 || /\d/.test(w)) && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** Rank a session's turns by the share of the claim's distinctive tokens they contain. Unreviewed hint only. */
export function lexicalHint(claimText: string, turns: Obj[]): LexicalHint {
  const claim = distinctiveTokens(claimText);
  if (claim.size < 4) return {status: "none", top: [], margin: null};
  const scored = turns.flatMap(t => {
    const id = str(t._id), text = str(t.text);
    if (!id || text === undefined) return [];
    const tokens = distinctiveTokens(text);
    let hit = 0; for (const w of claim) if (tokens.has(w)) hit++;
    return [{turnId: id, coverage: Math.round((hit / claim.size) * 1000) / 1000}];
  }).sort((a, b) => b.coverage - a.coverage || a.turnId.localeCompare(b.turnId, "en"));
  const top = scored.slice(0, 3).filter(s => s.coverage > 0);
  if (top.length === 0) return {status: "none", top: [], margin: null};
  const margin = top.length > 1 ? Math.round((top[0]!.coverage - top[1]!.coverage) * 1000) / 1000 : top[0]!.coverage;
  // Unambiguous = a clear majority of the claim's distinctive tokens in one turn AND a visible lead over the runner-up.
  return {status: top[0]!.coverage >= 0.6 && margin >= 0.15 ? "unambiguous" : "ambiguous", top, margin};
}

function indexOf(turns: Obj[]): {ids: Set<string>; max: number; count: number} {
  const ids = new Set<string>(); let max = 0;
  for (const t of turns) {
    const id = str(t._id); if (!id) continue; ids.add(id);
    const m = TURN_ID.exec(id); if (m) max = Math.max(max, Number(m[2]));
  }
  return {ids, max, count: ids.size};
}

/** Every persisted citation whose turn does not exist in the cited session's current turns, with a reason. */
export function reconcileCitations(sessions: SessionSnapshot[], reviewed: ReviewedMapping[] = []): CitationFinding[] {
  const by = new Map(sessions.map(s => [s.sessionId, s] as const));
  const idx = new Map(sessions.map(s => [s.sessionId, indexOf(s.turns)] as const));
  const mappings = new Map(reviewed.map(m => [m.claimId, m] as const));
  const out: CitationFinding[] = [];
  for (const s of [...sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId, "en"))) {
    for (const claim of s.claims ?? []) {
      const claimId = str(claim._id) ?? "(no-id)";
      const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
      for (const ev of evidence) {
        if (!obj(ev)) continue;
        const turnId = str(ev.turnId) ?? "", citedSession = str(ev.sessionId) ?? s.sessionId;
        const target = by.get(citedSession), index = idx.get(citedSession);
        let reason: CitationReason | undefined; let detail: CitationFinding["detail"] = {};
        const m = TURN_ID.exec(turnId);
        if (!target || !index) {reason = "session-missing"; detail = {citedSession};}
        else if (index.ids.has(turnId)) continue;
        else if (!m) {reason = "id-format"; detail = {expectedPattern: "<sessionId>-t<digits>"};}
        else if (m[1] !== citedSession) {reason = "session-prefix-mismatch"; detail = {idPrefix: m[1]!, citedSession};}
        else if (Number(m[2]) > index.max) {
          reason = "turn-off-range";
          detail = {citedIndex: Number(m[2]), sessionTurnCount: index.count, maxTurnIndex: index.max, overshoot: Number(m[2]) - index.max};
        } else {reason = "turn-gap-in-range"; detail = {citedIndex: Number(m[2]), sessionTurnCount: index.count, maxTurnIndex: index.max};}

        const mapping = mappings.get(claimId);
        const bound = mapping ? (mapping.currentTurnsSha256 !== undefined && target?.turnsSha256 !== undefined ? mapping.currentTurnsSha256 === target.turnsSha256 : null) : null;
        const origMatches = mapping ? (mapping.originalEvidence ?? []).some(e => e.turnId === turnId) : null;
        const hint = target ? lexicalHint(str(claim.text) ?? "", target.turns) : {status: "none" as const, top: [], margin: null};
        let proposal: CitationFinding["proposal"] = {basis: "none", turnIds: [], boundToCurrentTurns: null,
          note: "No unambiguous target; owner/reviewer must choose or drop the claim."};
        if (mapping && mapping.proposedEvidence.length > 0 && bound !== false && origMatches) {
          proposal = {basis: "independently-reviewed-mapping", turnIds: mapping.proposedEvidence.map(e => e.turnId), boundToCurrentTurns: bound,
            note: "Replacement proposed by an independent reviewer (data/eval/extraction-reconciliation-reviewed.json); not applied."};
        } else if (hint.status === "unambiguous") {
          proposal = {basis: "lexical-hint-unreviewed", turnIds: [hint.top[0]!.turnId], boundToCurrentTurns: null,
            note: "Deterministic token-overlap hint only; NOT reviewed, NOT gold. Needs a human/independent check before any use."};
        }
        out.push({sessionId: s.sessionId, claimId, citedTurnId: turnId, citedSessionId: citedSession, reason, detail, proposal,
          reviewedMapping: {present: !!mapping, originalEvidenceMatchesCitation: origMatches, boundToCurrentTurns: bound}, lexicalHint: hint});
      }
    }
  }
  return out.sort((a, b) => a.claimId.localeCompare(b.claimId, "en") || a.citedTurnId.localeCompare(b.citedTurnId, "en"));
}

export interface TimeFinding {
  sessionId: string; turnId: string; tStart: unknown; tEnd: unknown;
  problem: "start-not-finite-number" | "end-not-finite-number" | "negative-start" | "end-before-start";
  durationSec: number | null;
}
/** Turns whose tStart/tEnd fail the harness rule (finite numbers, 0 <= tStart <= tEnd), with the offending values. */
export function findInvalidTurnTimes(sessions: SessionSnapshot[]): TimeFinding[] {
  const out: TimeFinding[] = [];
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  for (const s of sessions) for (const t of s.turns) {
    const a = t.tStart, b = t.tEnd, turnId = str(t._id) ?? "(no-id)";
    let problem: TimeFinding["problem"] | undefined;
    if (!fin(a)) problem = "start-not-finite-number"; else if (!fin(b)) problem = "end-not-finite-number";
    else if (a < 0) problem = "negative-start"; else if (b < a) problem = "end-before-start";
    if (problem) out.push({sessionId: s.sessionId, turnId, tStart: a ?? null, tEnd: b ?? null, problem, durationSec: fin(a) && fin(b) ? b - a : null});
  }
  return out.sort((x, y) => x.sessionId.localeCompare(y.sessionId, "en") || x.turnId.localeCompare(y.turnId, "en"));
}

export interface MissingArtifactCase {
  id: string; sessionId?: string;
  artifacts: {kind: string; expectedPath: string; exists: boolean}[];
  directory: string; directoryExists: boolean; directoryEntries: string[];
  interpretation: "directory-absent" | "directory-present-artifact-absent";
}
/** Cases whose declared artefacts are not on disk. `exists`/`entries` are injected so this stays pure. */
export function findMissingArtifacts(cases: {id: string; sessionId?: string; artifacts: Record<string, string>}[],
  fsView: {exists: (p: string) => boolean; entries: (dir: string) => string[] | null}, resolveFromManifest: (rel: string) => string,
  dirname: (p: string) => string): MissingArtifactCase[] {
  const out: MissingArtifactCase[] = [];
  for (const c of cases) {
    const rows = Object.entries(c.artifacts).sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([kind, rel]) => ({kind, expectedPath: rel, exists: fsView.exists(resolveFromManifest(rel))}));
    if (rows.every(r => r.exists)) continue;
    const first = c.artifacts.turns ?? Object.values(c.artifacts)[0] ?? "";
    const dir = dirname(resolveFromManifest(first)), entries = fsView.entries(dir);
    out.push({id: c.id, ...(c.sessionId !== undefined ? {sessionId: c.sessionId} : {}), artifacts: rows, directory: dirname(first),
      directoryExists: entries !== null, directoryEntries: entries ? [...entries].sort() : [],
      interpretation: entries === null ? "directory-absent" : "directory-present-artifact-absent"});
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export interface ProvenanceRow {
  sessionId: string; date: string | null; title: string | null; sourceKind: string | null; sourcePath: string | null;
  sourceCreatedAt: string | null; sourceId: string | null; origin: "original-transcript" | "addition";
  matchedRawTranscript: string | null; firstCommit: {hash: string; date: string; subject: string} | null;
}
/** 23-vs-29: a session is an original iff its source path names one of the raw transcript files; otherwise an addition. */
export function reconcileProvenance(sessions: SessionSnapshot[], rawTranscriptFiles: string[]) {
  const raw = new Set(rawTranscriptFiles), used = new Set<string>();
  const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
  const rows: ProvenanceRow[] = [...sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId, "en")).map(s => {
    const path = str(s.source?.path) ?? null, base = path ? basename(path) : null;
    const hit = base && raw.has(base) ? base : null; if (hit) used.add(hit);
    return {sessionId: s.sessionId, date: str(s.session?.date) ?? null, title: str(s.session?.title) ?? null, sourceKind: str(s.source?.kind) ?? null,
      sourcePath: path, sourceCreatedAt: str(s.source?.createdAt) ?? null, sourceId: str(s.session?.sourceId) ?? null,
      origin: hit ? "original-transcript" : "addition", matchedRawTranscript: hit, firstCommit: s.firstCommit ?? null};
  });
  return {rawTranscriptCount: raw.size, sessionCount: sessions.length,
    originals: rows.filter(r => r.origin === "original-transcript").length, additions: rows.filter(r => r.origin === "addition"),
    rawTranscriptsWithoutSession: [...raw].filter(f => !used.has(f)).sort(), rows};
}

export interface ReconcileInput {
  sessions: SessionSnapshot[]; reviewed?: ReviewedMapping[]; baselineUnresolved?: {sessionId: string; claimId: string; turnId: string}[];
  missingArtifacts: MissingArtifactCase[]; rawTranscriptFiles: string[];
  undeclaredDirectories?: string[];
}
export function buildReconciliationReport(input: ReconcileInput) {
  const citations = reconcileCitations(input.sessions, input.reviewed ?? []);
  const times = findInvalidTurnTimes(input.sessions);
  const prov = reconcileProvenance(input.sessions, input.rawTranscriptFiles);
  const key = (v: {sessionId: string; claimId: string; turnId: string}) => `${v.sessionId}|${v.claimId}|${v.turnId}`;
  const found = new Set(citations.map(c => key({sessionId: c.sessionId, claimId: c.claimId, turnId: c.citedTurnId})));
  const base = input.baselineUnresolved ? new Set(input.baselineUnresolved.map(key)) : null;
  const byReason: Record<string, number> = {}; for (const c of citations) byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;
  const timeSessions = [...new Set(times.map(t => t.sessionId))].sort();
  return {
    version: 1, tool: "corpus-reconciliation-v1", readOnly: true,
    notice: "Proposals only. No citation, turn, claim, label or threshold was modified; applying any correction is an owner decision. Lexical hints are unreviewed and are not gold.",
    summary: {
      citations: {unresolved: citations.length, byReason, withReviewedProposal: citations.filter(c => c.proposal.basis === "independently-reviewed-mapping").length,
        withUnreviewedLexicalProposal: citations.filter(c => c.proposal.basis === "lexical-hint-unreviewed").length,
        withoutProposal: citations.filter(c => c.proposal.basis === "none").length,
        matchesCorpusBaseline: base ? base.size === found.size && [...base].every(k => found.has(k)) : null},
      missingArtifactCases: input.missingArtifacts.length,
      invalidTimeSessions: timeSessions.length, invalidTimeTurns: times.length,
      provenance: {rawTranscripts: prov.rawTranscriptCount, sessions: prov.sessionCount, originals: prov.originals, additions: prov.additions.length,
        rawTranscriptsWithoutSession: prov.rawTranscriptsWithoutSession.length},
      undeclaredDirectories: input.undeclaredDirectories ?? [],
    },
    citations, missingArtifacts: input.missingArtifacts, invalidTurnTimes: times, provenance: prov,
  };
}
export type ReconciliationReport = ReturnType<typeof buildReconciliationReport>;

const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
export function renderReconciliationMarkdown(r: ReconciliationReport): string {
  const L: string[] = [];
  const s = r.summary;
  L.push("# Corpus reconciliation report (U2.2)", "", `> ${r.notice}`, "", "## Summary", "",
    `- Unresolved citations: **${s.citations.unresolved}** (${Object.entries(s.citations.byReason).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}); matches corpus baseline list: ${s.citations.matchesCorpusBaseline}`,
    `- Proposed target: ${s.citations.withReviewedProposal} from an independent reviewed mapping, ${s.citations.withUnreviewedLexicalProposal} unreviewed lexical hint, ${s.citations.withoutProposal} none`,
    `- Artifact-missing cases: **${s.missingArtifactCases}**`, `- Invalid-time sessions: **${s.invalidTimeSessions}** (${s.invalidTimeTurns} turns)`,
    `- Provenance: ${s.provenance.rawTranscripts} raw transcripts, ${s.provenance.sessions} migrated sessions, ${s.provenance.originals} originals, **${s.provenance.additions} additions**`, "",
    "## Unresolved citations", "", "| Claim | Cited turn | Reason | Detail | Proposed target | Basis |", "|---|---|---|---|---|---|");
  for (const c of r.citations) L.push(`| ${cell(c.claimId)} | ${cell(c.citedTurnId)} | ${c.reason} | ${cell(Object.entries(c.detail).map(([k, v]) => `${k}=${v}`).join(", "))} | ${cell(c.proposal.turnIds.join(", ") || "none")} | ${c.proposal.basis} |`);
  L.push("", "## Artifact-missing cases", "", "| Case | Expected path(s) | Directory | State |", "|---|---|---|---|");
  for (const m of r.missingArtifacts) L.push(`| ${cell(m.id)} | ${cell(m.artifacts.filter(a => !a.exists).map(a => `${a.kind}: ${a.expectedPath}`).join("; "))} | ${cell(m.directory)} (${m.directoryEntries.join(", ") || "absent"}) | ${m.interpretation} |`);
  L.push("", "## Invalid-time turns", "", "| Session | Turn | tStart | tEnd | Problem |", "|---|---|---|---|---|");
  for (const t of r.invalidTurnTimes) L.push(`| ${cell(t.sessionId)} | ${cell(t.turnId)} | ${cell(JSON.stringify(t.tStart))} | ${cell(JSON.stringify(t.tEnd))} | ${t.problem} |`);
  L.push("", "## 23 vs 29 sessions", "", "Original = the session's source path names a file in raw/TOC/TOC-Materials/Transcripts; otherwise an addition.", "",
    "| Session | Kind | Source | Source createdAt | First commit |", "|---|---|---|---|---|");
  for (const a of r.provenance.additions) L.push(`| ${cell(a.sessionId)} | ${cell(a.sourceKind)} | ${cell(a.sourcePath)} | ${cell(a.sourceCreatedAt)} | ${cell(a.firstCommit ? `${a.firstCommit.hash} ${a.firstCommit.date} ${a.firstCommit.subject}` : "n/a")} |`);
  if (r.provenance.rawTranscriptsWithoutSession.length) L.push("", `Raw transcripts with no migrated session: ${r.provenance.rawTranscriptsWithoutSession.join(", ")}`);
  return L.join("\n") + "\n";
}
