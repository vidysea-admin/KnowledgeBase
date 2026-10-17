/** Trusted, request-tenant source hydration. Retrieval payloads never supply source text. */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { getDb, scopedCollection } from "@lkb/db";
import type { Chunks, TreeIndexNode, Turns } from "@lkb/core";
import { cosineSimilarity } from "@lkb/index";
import type { EmbedResult, WriteJobFn, Job } from "@lkb/ai";
import { BoundedAskError, payloadBytes, validateHydration, type AskV2Deps, type CompleteFn, type NodeSearchFn,
  type SourceQuote, type HydrateSourcesFn } from "@lkb/ask";
import { createAskArmsFor, type ArmsEmbedFn } from "./ask-arms.js";
import { createLlmScorer } from "../score.js";
import { passageLexicalScorer, slices, type Span } from "./passage-lexical.js";
import { readEffectiveTurns } from '../transcript-review/effective-reader.js';
import { createKnowledgeVisibility } from '../visibility/knowledge.js';
import { chunkContentMatches } from '../indexing/chunk-integrity.js';
import { createGraphContextFor, hasGraphSelection, graphTurnKey, type GraphContextDeps, type GraphContextSelection, type GraphContextSnapshot } from "./graph-context.js";
import { speakerTranscriptHash } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";

type ReadDb = Pick<Db, "collection">;
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const NOMIC_DIGEST = "sha256:0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f";
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
interface BoundChunk extends Chunks {
  vector: [number, ...number[]];
  dims: number;
  embeddingModel: string;
  sourceSpans?: { spanId: string; turnId: string; charStart: number; charEnd: number; byteStart: number; byteEnd: number;
    turnTextSHA256: string; sliceSHA256: string }[];
}
export interface PassageDiagnostic {
  turnId: string; charStart: number; charEnd: number; lexical: number; semantic: number; score: number;
  textContribution: number; speakerContribution: number; selected: boolean;
}
/** Scope breach (foreign tenant or a session outside the admitted set): NEVER excluded, always refuses the request. */
function assertInScope(turn: Turns, tenantId: string, refs: Set<string>): void {
  if (turn.tenantId !== tenantId || !refs.has(turn.sessionId)) throw new BoundedAskError("invalid scoped source row");
}
/** D-153 (pending append): a row of the right tenant and session that is itself malformed is EXCLUDED, per turn, with a warning. */
function rowProblem(turn: Turns): string | null {
  if (!nonempty(turn._id)) return "turn id is empty";
  if (!nonempty(turn.speakerRef)) return "speakerRef is empty";
  if (typeof turn.text !== "string") return "text is not a string";
  if (!Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd)) return "tStart/tEnd is not a finite number";
  if (turn.tStart < 0) return `tStart ${turn.tStart} is negative`;
  if (turn.tEnd < turn.tStart) return `tEnd ${turn.tEnd} is before tStart ${turn.tStart}`;
  return null;
}
function quote(node: TreeIndexNode, turn: Turns, span: Span): SourceQuote {
  const text = turn.text.slice(span.charStart, span.charEnd);
  // Review overlays may change text/speaker labels, but cannot promote frame evidence to speech.
  const screenSource = turn.speakerRef === "screen" || turn.screenEvidence !== undefined;
  const origin = screenSource
    ? turn.text.startsWith("[Screen OCR; unverified]") ? "screen-ocr-unverified"
      : turn.text.startsWith("[Visual observation; unverified]") ? "visual-observation-unverified" : null
    : "speech";
  if (!origin) throw new BoundedAskError("screen source origin is unresolved");
  return {
    id: "quote-" + sha(JSON.stringify([node.node_id, turn._id, span, text])).slice(0, 24),
    nodeId: node.node_id, sessionRef: turn.sessionId, turnId: turn._id, speakerRef: screenSource ? "screen" : turn.speakerRef,
    tStart: turn.tStart, tEnd: turn.tEnd, charStart: span.charStart, charEnd: span.charEnd,
    byteStart: Buffer.byteLength(turn.text.slice(0, span.charStart), "utf8"),
    byteEnd: Buffer.byteLength(turn.text.slice(0, span.charEnd), "utf8"),
    turnTextSHA256: sha(turn.text), sliceSHA256: sha(text), quote: text, origin,
  };
}
function validateChunk(chunk: BoundChunk, tenantId: string, turns: Map<string, Turns>): void {
  if (chunk.tenantId !== tenantId || !nonempty(chunk._id) || !nonempty(chunk.sourceRef)
    || !nonempty(chunk.embeddingModel) || !Array.isArray(chunk.turnRefs) || !Array.isArray(chunk.vector) || !chunk.vector.length
    || chunk.dims !== chunk.vector.length || chunk.vector.some((n) => !Number.isFinite(n))) {
    throw new BoundedAskError("invalid scoped vector evidence");
  }
  for (const id of chunk.turnRefs) {
    if (typeof id !== "string" || turns.get(id)?.sessionId !== chunk.sourceRef) throw new BoundedAskError("chunk points outside scoped source");
  }
  if (!chunk.sourceSpans) return; // legacy chunks may guide a whole original turn, never assert slice proof.
  if (!Array.isArray(chunk.sourceSpans) || !chunk.sourceSpans.length) throw new BoundedAskError("empty vector span proof");
  const spanIds = new Set<string>();
  for (const s of chunk.sourceSpans) {
    const turn = turns.get(s.turnId);
    const identity = { turnId: s.turnId, charStart: s.charStart, charEnd: s.charEnd, byteStart: s.byteStart, byteEnd: s.byteEnd,
      turnTextSHA256: s.turnTextSHA256, sliceSHA256: s.sliceSHA256 };
    if (s.spanId !== sha(JSON.stringify(identity)) || spanIds.has(s.spanId)) throw new BoundedAskError("invalid or duplicate vector span identity");
    spanIds.add(s.spanId);
    if (!turn || !chunk.turnRefs.includes(s.turnId) || !Number.isSafeInteger(s.charStart) || !Number.isSafeInteger(s.charEnd)
      || s.charStart < 0 || s.charEnd <= s.charStart || s.charEnd > turn.text.length
      || !digest(s.turnTextSHA256) || !digest(s.sliceSHA256) || sha(turn.text) !== s.turnTextSHA256
      || sha(turn.text.slice(s.charStart, s.charEnd)) !== s.sliceSHA256
      || Buffer.byteLength(turn.text.slice(0, s.charStart), "utf8") !== s.byteStart
      || Buffer.byteLength(turn.text.slice(0, s.charEnd), "utf8") !== s.byteEnd
      || (s.charStart > 0 && /[\uD800-\uDBFF]/.test(turn.text[s.charStart - 1]!))
      || /[\uD800-\uDBFF]/.test(turn.text[s.charEnd - 1]!)) throw new BoundedAskError("vector span differs from original source");
  }
  const raw = chunk.sourceSpans.map((s) => turns.get(s.turnId)!.text.slice(s.charStart, s.charEnd)).join(" ");
  if (chunk.rawTextSha256 !== sha(raw)) throw new BoundedAskError("vector raw input differs from source spans");
  if (chunk.embeddingModel === "nomic-embed-text" && (chunk.embeddingPolicy !== "nomic-rag-prefix-v1"
    || chunk.embeddingModelDigest !== NOMIC_DIGEST || chunk.dims !== 768
    || chunk.embeddingInputSha256 !== sha("search_document: " + raw))) {
    throw new BoundedAskError("vector embedding policy or pinned model differs");
  }
}

export function createSourceHydrator(tenantId: string, deps: { db?: ReadDb; embed?: ArmsEmbedFn; graphScope?: () => Promise<GraphContextSnapshot>; observePassages?: (sessionId: string, rows: PassageDiagnostic[]) => void }): HydrateSourcesFn {
  return async (query, admitted) => {
    const nodes = admitted.filter((n) => n.level === "session");
    const refs = new Set(nodes.map((n) => n.evidence?.sessionRef));
    if ([...refs].some((r) => !nonempty(r)) || refs.size !== nodes.length) throw new BoundedAskError("ambiguous session source identity");
    const sessionIds = [...refs] as string[];
    const db = deps.db ?? getDb();
    // Query both collections by exact admitted session IDs and tenant-scoped wrappers.
    const rawRows = await scopedCollection<Turns>(db as never, "turns")(tenantId).find({ sessionId: { $in: sessionIds } }).toArray();
    for (const row of rawRows) assertInScope(row, tenantId, new Set(sessionIds)); // typed scope refusal before any review-overlay read
    const visibility = createKnowledgeVisibility(db);
    const rows = await visibility.filterTurns(tenantId, await readEffectiveTurns(db, tenantId, rawRows));
    const graphScope = deps.graphScope ? await deps.graphScope() : undefined;
    const graphQuotes = new Map<string, string[]>();
    if (graphScope) {
      for (const sessionId of sessionIds) {
        const current = graphScope.visibleSources.find(s => s.tenantId === tenantId && s.sessionId === sessionId);
        const sessionRows = rows.filter(t => t.sessionId === sessionId).sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id));
        if (!current || speakerTranscriptHash(sessionRows) !== current.revisionHash) throw new BoundedAskError("graph source changed before hydration");
      }
      for (const e of graphScope.turns) {
        const turn = rows.find(t => t.sessionId === e.sessionId && t._id === e.turnId);
        if (!sessionIds.includes(e.sessionId)) continue;
        if (!turn || typeof e.quote !== "string" || !e.quote.trim() || !turn.text.includes(e.quote)) throw new BoundedAskError("graph evidence changed before hydration");
        const key = graphTurnKey(e.sessionId, e.turnId);
        graphQuotes.set(key, [...(graphQuotes.get(key) ?? []), e.quote]);
      }
    }
    const chunks = deps.embed ? await scopedCollection<BoundChunk>(db as never, "chunks")(tenantId)
      .find({ sourceRef: { $in: sessionIds } }).toArray() : [];
    // Parse and hash the SAME frozen serialization, then use only these parsed rows.
    const bytes = JSON.stringify({ rows, chunks });
    const snapshot = JSON.parse(bytes) as { rows: Turns[]; chunks: BoundChunk[] };
    const snapshotSHA256 = sha(bytes);
    const byTurn = new Map<string, Turns>();
    const excludedTurns: { sessionId: string; turnId: string; reason: string }[] = [];
    const validRows: Turns[] = [];
    for (const turn of snapshot.rows) {
      assertInScope(turn, tenantId, new Set(sessionIds));
      const problem = rowProblem(turn);
      if (problem) { excludedTurns.push({ sessionId: turn.sessionId, turnId: nonempty(turn._id) ? turn._id : "(no id)", reason: problem }); continue; }
      if (byTurn.has(turn._id)) throw new BoundedAskError("duplicate source turn identity");
      byTurn.set(turn._id, turn);
      validRows.push(turn);
    }
    // Every row in scope invalid: the existing refusal, never an empty success.
    if (snapshot.rows.length > 0 && validRows.length === 0) throw new BoundedAskError("invalid scoped source row");
    const excludedIds = new Set(excludedTurns.map((e) => e.turnId));
    snapshot.rows = validRows;
    // A vector chunk that covers an excluded turn is dropped with it: its embedded text may contain that turn.
    // Scope first: a chunk of another tenant or outside the admitted sessions refuses the request whatever else is wrong with it.
    for (const c of snapshot.chunks) if (c.tenantId !== tenantId || !sessionIds.includes(c.sourceRef)) throw new BoundedAskError("invalid scoped vector evidence");
    snapshot.chunks = snapshot.chunks.filter((c) => !(Array.isArray(c.turnRefs) && c.turnRefs.some((id) => excludedIds.has(id)))
      && !(Array.isArray(c.sourceSpans) && c.sourceSpans.some((s) => excludedIds.has(s.turnId))));
    const boundChunks = snapshot.chunks.filter(chunk => chunkContentMatches(chunk, byTurn, tenantId));
    const staleVectors = boundChunks.length !== snapshot.chunks.length;
    snapshot.chunks = boundChunks;
    for (const chunk of snapshot.chunks) validateChunk(chunk, tenantId, byTurn);
    let embedding: EmbedResult | undefined;
    let degraded: string | undefined = staleVectors ? 'source vector changed or requires content-bound reindexing; scoped lexical excerpts used' : undefined;
    if (snapshot.chunks.length && deps.embed) {
      try {
        const candidate = await deps.embed({ kind: "embedding", texts: [query], purpose: "query" });
        const vector = candidate.vectors[0];
        if (!vector?.length || candidate.dims !== vector.length || vector.some((n) => !Number.isFinite(n))) {
          throw new Error("malformed query embedding");
        }
        embedding = candidate;
      } catch { degraded = "source vector unavailable; scoped lexical excerpts used"; }
    }
    const result: TreeIndexNode[] = [];
    for (const node of nodes) {
      const turns = snapshot.rows.filter((t) => t.sessionId === node.evidence!.sessionRef)
        .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd || a._id.localeCompare(b._id));
      if (!turns.length) {
        // No rows at all stays a refusal; a session whose every row was excluded is skipped (it is named in the warning).
        if (excludedTurns.some((e) => e.sessionId === node.evidence!.sessionRef)) continue;
        throw new BoundedAskError("admitted session has no source rows");
      }
      const lexicalScore = passageLexicalScorer(query, turns);
      const spansFor = (turn: Turns): Span[] => graphScope ? (graphQuotes.get(graphTurnKey(turn.sessionId, turn._id)) ?? []).flatMap(text => {
        const spans: Span[] = []; let from = 0;
        while (from <= turn.text.length) { const at = turn.text.indexOf(text, from); if (at < 0) break; spans.push({ charStart: at, charEnd: at + text.length }); from = at + text.length; }
        return spans;
      }) : slices(turn.text);
      const choices = turns.flatMap((turn) => spansFor(turn).map((span) => {
        const text = turn.text.slice(span.charStart, span.charEnd);
        const contributions = lexicalScore(text, turn.speakerRef);
        const lexical = contributions.textContribution + contributions.speakerContribution;
        return { turn, span, score: lexical, lexical, ...contributions, vectorScore: 0, order: turn.tStart };
      }));
      if (embedding) {
        const qv = embedding.vectors[0];
        if (!qv?.length || qv.some((n) => !Number.isFinite(n))) throw new BoundedAskError("invalid source query vector");
        for (const chunk of snapshot.chunks.filter((c) => c.sourceRef === node.evidence!.sessionRef)) {
          if (chunk.embeddingModel !== embedding.model || chunk.dims !== qv.length) continue;
          const score = cosineSimilarity(qv, chunk.vector);
          for (const choice of choices) {
            const spans = chunk.sourceSpans;
            if (spans ? spans.some((s) => s.turnId === choice.turn._id && s.charStart < choice.span.charEnd && s.charEnd > choice.span.charStart)
              : chunk.turnRefs.includes(choice.turn._id)) choice.vectorScore = Math.max(choice.vectorScore, score);
          }
        }
      }
      for (const choice of choices) choice.score += Math.max(0, choice.vectorScore);
      const ranked = choices.filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
      if (!ranked.length) continue;
      const selected: SourceQuote[] = [];
      const add = (turn: Turns, span: Span) => {
        const q = quote(node, turn, span);
        if (!q.quote.trim() || selected.some((s) => s.id === q.id)) return;
        if (payloadBytes([...selected, q]) > 3500) return; // explicit excerpt selection, never whole-source coverage.
        selected.push(q);
      };
      for (const hit of ranked.slice(0, 2)) add(hit.turn, hit.span);
      // Neighbor context retains e.g. a numeric assertion followed by its country qualifier.
      const first = ranked[0]!;
      const at = turns.indexOf(first.turn);
      for (const i of [at - 1, at + 1]) {
        const turn = turns[i];
        if (turn) { const span = spansFor(turn)[0]; if (span) add(turn, span); }
      }
      deps.observePassages?.(node.evidence!.sessionRef!, ranked.map((hit) => ({
        turnId: hit.turn._id, ...hit.span, lexical: hit.lexical, semantic: hit.vectorScore, score: hit.score,
        textContribution: hit.textContribution, speakerContribution: hit.speakerContribution,
        selected: selected.some((q) => q.turnId === hit.turn._id && q.charStart === hit.span.charStart && q.charEnd === hit.span.charEnd),
      })));
      if (selected.length) result.push({
        ...node, children: [], summary: JSON.stringify(selected),
        evidence: { sessionRef: node.evidence!.sessionRef, sourceQuotes: selected,
          sourceSnapshotSHA256: snapshotSHA256, sourceMode: "exact-scoped-turn-excerpts" },
      });
    }
    return { nodes: result, snapshotSHA256, sourceBytes: Buffer.byteLength(bytes, "utf8"), ...(degraded ? { degraded } : {}), ...(excludedTurns.length ? { excludedTurns } : {}) };
  };
}

export interface RequestAskOptions {
  dispatch: (job: Job, tenantId: string) => ReturnType<CompleteFn>;
  /** Compatibility input only. Public request composition is always vectorless, including false. */
  vectorless?: boolean;
  embed?: ArmsEmbedFn;
  db?: ReadDb;
  treeSearchFn: NodeSearchFn;
  tavilySearchFn?: AskV2Deps["tavilySearchFn"];
  write: WriteJobFn;
  graph?: GraphContextDeps;
  nativeSources?: (tenantId: string) => { hydrate: HydrateSourcesFn; revalidate: (nodes: TreeIndexNode[]) => Promise<void> };
}
/** Actual production scorer and arms share request-local completion/embedding boundaries. */
export function createSourceRequestDepsFor(options: RequestAskOptions) {
  return (tenantId: string, selection?: GraphContextSelection): Omit<AskV2Deps, "tenantId"> => {
    const complete: CompleteFn = (job) => options.dispatch(job, tenantId);
    const selected = hasGraphSelection(selection);
    if (selected && !options.graph) throw new BoundedAskError("selected graph authority unavailable");
    const graph = selected ? createGraphContextFor(options.graph!)(tenantId, selection!) : undefined;
    const ordinaryArms = createAskArmsFor({ db: options.db })(tenantId);
    const transcriptHydrate = createSourceHydrator(tenantId, { db: options.db, ...(graph ? { graphScope: graph.scope } : {}) });
    const nativeSource = options.nativeSources?.(tenantId);
    const nativeHydrate = nativeSource?.hydrate;
    const isNative = (n: TreeIndexNode) => typeof n.evidence?.sourceId === "string" && typeof n.evidence?.sessionRef !== "string";
    return {
      complete, scoreFn: createLlmScorer(complete), scoreFnForComplete: createLlmScorer,
      treeSearchFn: graph ? () => [] : options.treeSearchFn, tavilySearchFn: graph ? undefined : options.tavilySearchFn, write: options.write,
      extraCandidateArmsFn: async (query, tree) => {
        const routed = graph ? await graph.arm(query, tree) : undefined;
        const ordinary = await ordinaryArms(query, tree);
        if (!routed) return ordinary;
        const allowed = new Set(routed.arms.flat().map(n => n.node_id));
        return { arms: [...ordinary.arms.map(arm => arm.filter(n => allowed.has(n.node_id))), ...routed.arms], degraded: [ordinary.degraded, routed.degraded].filter(Boolean).join("; ") || null };
      },
      sourceContext: { hydrate: async (query, admitted) => {
        const native = admitted.filter(isNative);
        if (graph && native.length) throw new BoundedAskError("native source selection requires graph authority");
        if (native.length && !nativeHydrate) throw new BoundedAskError("native source hydration unavailable");
        if (!native.length) return transcriptHydrate(query, admitted);
        if (native.length === admitted.length) return nativeHydrate!(query, admitted);
        const transcriptAdmitted = admitted.filter(n => !isNative(n));
        const transcript = await transcriptHydrate(query, transcriptAdmitted);
        const other = await nativeHydrate!(query, native);
        const proven = [...validateHydration(transcript, transcriptAdmitted), ...validateHydration(other, native)];
        const snapshotSHA256 = sha(JSON.stringify([transcript.snapshotSHA256, other.snapshotSHA256]));
        const nodes = proven.map(node => { const copy = structuredClone(node); return { ...copy, evidence: { ...copy.evidence, sourceSnapshotSHA256: snapshotSHA256 } }; });
        const excludedTurns = [...(transcript.excludedTurns ?? []), ...(other.excludedTurns ?? [])];
        return { nodes, snapshotSHA256, sourceBytes: transcript.sourceBytes + other.sourceBytes, ...(excludedTurns.length ? { excludedTurns } : {}),
          degraded: [transcript.degraded, other.degraded].filter(Boolean).join("; ") || undefined };
      }, ...(nativeSource ? { revalidate: (nodes: TreeIndexNode[]) => nativeSource.revalidate(nodes.filter(isNative)) } : {}) },
    };
  };
}
