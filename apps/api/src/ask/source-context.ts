/** Trusted, request-tenant source hydration. Retrieval payloads never supply source text. */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { getDb, scopedCollection } from "@lkb/db";
import type { Chunks, TreeIndexNode, Turns } from "@lkb/core";
import { cosineSimilarity, lexicalQueryTokens } from "@lkb/index";
import type { EmbedResult, WriteJobFn, Job } from "@lkb/ai";
import { BoundedAskError, payloadBytes, type AskV2Deps, type CompleteFn, type NodeSearchFn,
  type SourceQuote, type HydrateSourcesFn } from "@lkb/ask";
import { createAskArmsFor, type ArmsEmbedFn } from "../ask-arms.js";
import { createLlmScorer } from "../score.js";

type ReadDb = Pick<Db, "collection">;
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const NOMIC_DIGEST = "sha256:0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f";
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
interface Span { charStart: number; charEnd: number }
interface BoundChunk extends Chunks {
  vector: [number, ...number[]];
  dims: number;
  embeddingModel: string;
  sourceSpans?: { spanId: string; turnId: string; charStart: number; charEnd: number; byteStart: number; byteEnd: number;
    turnTextSHA256: string; sliceSHA256: string }[];
}
/** Unicode-safe half-open slices; no new turns or invented sub-turn timestamps. */
function slices(text: string): Span[] {
  const result: Span[] = [];
  let start = 0, end = 0, bytes = 0;
  for (const char of text) {
    const next = Buffer.byteLength(char, "utf8");
    if (bytes + next > 1024) { result.push({ charStart: start, charEnd: end }); start = end; bytes = 0; }
    bytes += next; end += char.length;
  }
  if (end > start) result.push({ charStart: start, charEnd: end });
  return result;
}
function validTurn(turn: Turns, tenantId: string, refs: Set<string>): void {
  if (turn.tenantId !== tenantId || !refs.has(turn.sessionId) || !nonempty(turn._id) || !nonempty(turn.speakerRef)
    || typeof turn.text !== "string" || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd)
    || turn.tStart < 0 || turn.tEnd < turn.tStart) throw new BoundedAskError("invalid scoped source row");
}
function quote(node: TreeIndexNode, turn: Turns, span: Span): SourceQuote {
  const text = turn.text.slice(span.charStart, span.charEnd);
  const origin = turn.speakerRef === "screen"
    ? turn.text.startsWith("[Screen OCR; unverified]") ? "screen-ocr-unverified"
      : turn.text.startsWith("[Visual observation; unverified]") ? "visual-observation-unverified" : null
    : "speech";
  if (!origin) throw new BoundedAskError("screen source origin is unresolved");
  return {
    id: "quote-" + sha(JSON.stringify([node.node_id, turn._id, span, text])).slice(0, 24),
    nodeId: node.node_id, sessionRef: turn.sessionId, turnId: turn._id, speakerRef: turn.speakerRef,
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

export function createSourceHydrator(tenantId: string, deps: { db?: ReadDb; embed?: ArmsEmbedFn }): HydrateSourcesFn {
  return async (query, admitted) => {
    const nodes = admitted.filter((n) => n.level === "session");
    const refs = new Set(nodes.map((n) => n.evidence?.sessionRef));
    if ([...refs].some((r) => !nonempty(r)) || refs.size !== nodes.length) throw new BoundedAskError("ambiguous session source identity");
    const sessionIds = [...refs] as string[];
    const db = deps.db ?? getDb();
    // Query both collections by exact admitted session IDs and tenant-scoped wrappers.
    const rows = await scopedCollection<Turns>(db as never, "turns")(tenantId).find({ sessionId: { $in: sessionIds } }).toArray();
    const chunks = deps.embed ? await scopedCollection<BoundChunk>(db as never, "chunks")(tenantId)
      .find({ sourceRef: { $in: sessionIds } }).toArray() : [];
    // Parse and hash the SAME frozen serialization, then use only these parsed rows.
    const bytes = JSON.stringify({ rows, chunks });
    const snapshot = JSON.parse(bytes) as { rows: Turns[]; chunks: BoundChunk[] };
    const snapshotSHA256 = sha(bytes);
    const byTurn = new Map<string, Turns>();
    for (const turn of snapshot.rows) {
      validTurn(turn, tenantId, new Set(sessionIds));
      if (byTurn.has(turn._id)) throw new BoundedAskError("duplicate source turn identity");
      byTurn.set(turn._id, turn);
    }
    for (const chunk of snapshot.chunks) validateChunk(chunk, tenantId, byTurn);
    let embedding: EmbedResult | undefined;
    let degraded: string | undefined;
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
    const tokens = lexicalQueryTokens(query);
    const result: TreeIndexNode[] = [];
    for (const node of nodes) {
      const turns = snapshot.rows.filter((t) => t.sessionId === node.evidence!.sessionRef)
        .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd || a._id.localeCompare(b._id));
      if (!turns.length) throw new BoundedAskError("admitted session has no source rows");
      const choices = turns.flatMap((turn) => slices(turn.text).map((span) => {
        const text = turn.text.slice(span.charStart, span.charEnd);
        const words = new Set(lexicalQueryTokens(text));
        const lexical = tokens.filter((t) => words.has(t)).length / Math.max(1, tokens.length);
        return { turn, span, score: lexical, vectorScore: 0, order: turn.tStart };
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
        if (turn) { const span = slices(turn.text)[0]; if (span) add(turn, span); }
      }
      if (selected.length) result.push({
        ...node, children: [], summary: JSON.stringify(selected),
        evidence: { sessionRef: node.evidence!.sessionRef, sourceQuotes: selected,
          sourceSnapshotSHA256: snapshotSHA256, sourceMode: "exact-scoped-turn-excerpts" },
      });
    }
    return { nodes: result, snapshotSHA256, sourceBytes: Buffer.byteLength(bytes, "utf8"), ...(degraded ? { degraded } : {}) };
  };
}

export interface RequestAskOptions {
  dispatch: (job: Job, tenantId: string) => ReturnType<CompleteFn>;
  embed?: ArmsEmbedFn;
  db?: ReadDb;
  treeSearchFn: NodeSearchFn;
  tavilySearchFn?: AskV2Deps["tavilySearchFn"];
  write: WriteJobFn;
}
/** Actual production scorer and arms share request-local completion/embedding boundaries. */
export function createSourceRequestDepsFor(options: RequestAskOptions) {
  return (tenantId: string): Omit<AskV2Deps, "tenantId"> => {
    let query: string | undefined, pending: Promise<EmbedResult> | undefined;
    const embed: ArmsEmbedFn | undefined = options.embed ? (job) => {
      const text = job.texts[0];
      if (job.purpose !== "query" || job.texts.length !== 1 || typeof text !== "string") {
        return Promise.reject(new BoundedAskError("invalid shared query embedding request"));
      }
      if (query !== undefined && query !== text) return Promise.reject(new BoundedAskError("query changed during source hydration"));
      query = text;
      return pending ??= options.embed!(job);
    } : undefined;
    const complete: CompleteFn = (job) => options.dispatch(job, tenantId);
    return {
      complete, scoreFn: createLlmScorer(complete), scoreFnForComplete: createLlmScorer,
      treeSearchFn: options.treeSearchFn, tavilySearchFn: options.tavilySearchFn, write: options.write,
      extraCandidateArmsFn: createAskArmsFor({ embed, db: options.db })(tenantId),
      sourceContext: { hydrate: createSourceHydrator(tenantId, { db: options.db, embed }) },
    };
  };
}
