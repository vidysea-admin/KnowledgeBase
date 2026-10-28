import type { TreeIndexNode } from "@lkb/core";
import type { IndexSessionResult } from "../indexing/types.js";
import { tenantSourceId } from "@lkb/ingest";
import { fingerprint, FlywheelError, type CaptureReceipt, type SourceRows, type IndexedRows, type IndexReceiptContext } from "./types.js";

import { buildChunks, runtimeChronologicalTurns } from "@lkb/index";
import { indexArtifactDigest, indexAttemptBinding, indexTurnDigest } from "../indexing/generation.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";

const present = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
export function captureReceipt(t: string, sourceId: string, sessionId: string, rows: SourceRows): CaptureReceipt {
  const { source, session, turns } = rows;
  if (!source || !session || source.tenantId !== t || session.tenantId !== t || source._id !== sourceId
    || session._id !== sessionId || session.sourceId !== sourceId || !present(source.hash) || source._id !== tenantSourceId(t, source.hash)
    || !["provided", "public", "notes"].includes(source.captureMode) || source.consent?.given !== true
    || !present(source.consent.recordedBy) || session.status.transcribe !== "done" || !turns.length)
    throw new FlywheelError("unavailable", 503);
  const ids = new Set<string>();
  for (const turn of turns) {
    if (turn.tenantId !== t || turn.sessionId !== sessionId || !present(turn._id) || ids.has(turn._id)
      || !present(turn.text) || !present(turn.speakerRef) || !Number.isFinite(turn.tStart) || !Number.isFinite(turn.tEnd)
      || turn.tStart < 0 || turn.tEnd < turn.tStart) throw new FlywheelError("unavailable", 503);
    ids.add(turn._id);
  }
  const ordered = [...turns].sort((a, b) => a.tStart - b.tStart || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  return { sourceId, sessionId, sourceDigest: source.hash, transcriptDigest: fingerprint(ordered), turnCount: turns.length,
    turnIds: [ordered[0]!._id, ...ordered.slice(1).map((r) => r._id)] };
}
export function indexedDigests(t: string, receipt: CaptureReceipt, rows: IndexedRows, context?: IndexReceiptContext): { treeDigest: string; chunksDigest: string } {
  const { tree, chunks } = rows;
  const matches = (n: TreeIndexNode): boolean => n.level === "session" && n.evidence?.sessionRef === receipt.sessionId
    || n.children.some(matches);
  if (!tree || tree.tenantId !== t || tree.node_id !== `tenant:${t}` || !matches(tree) || !chunks.length)
    throw new FlywheelError("unavailable", 503);
  if (context && fingerprint(captureReceipt(t, receipt.sourceId, receipt.sessionId, context.source)) !== fingerprint(receipt))
    throw new FlywheelError("unavailable", 503);
  const attempt = context?.source.session?.indexAttempt;
  // Legacy records have no canonical attempt: keep their strict vector-only checks.
  // A lexical receipt always requires the current completed manifest and source binding.
  let mode: "vector" | "vectorless" = "vector";
  if (attempt) {
    const manifest = attempt.manifest;
    const storedMode = manifest?.retrievalMode;
    if (!context || !manifest || !["vector", "vectorless", undefined].includes(storedMode)
      || attempt.version !== 1 || typeof attempt.strict !== "boolean" || attempt.state !== "complete" || attempt.phase !== "writing"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attempt.generation)
      || !Number.isFinite(Date.parse(attempt.startedAt)) || !Number.isFinite(Date.parse(attempt.finishedAt ?? ""))
      || context.source.session?.status.index !== "done" || attempt.generation !== context.generation
      || attempt.sessionId !== receipt.sessionId || attempt.sourceId !== receipt.sourceId
      || attempt.turnCount !== receipt.turnCount || attempt.turnDigest !== indexTurnDigest(context.source.turns)
      || !Number.isSafeInteger(manifest.treeRevision) || manifest.treeRevision < 1
      || !Number.isSafeInteger(tree.indexRevision) || tree.indexRevision! < manifest.treeRevision)
      throw new FlywheelError("unavailable", 503);
    mode = storedMode ?? "vector"; // Historical canonical manifests without a mode were vector-only.
    const binding = indexAttemptBinding(attempt);
    const bound = (value: unknown) => fingerprint(value) === fingerprint(binding);
    if (manifest.chunks.length !== chunks.length || new Set(manifest.chunks.map(ref => ref.id)).size !== chunks.length
      || chunks.some(c => !bound(c.indexArtifact) || !manifest.chunks.some(ref => ref.id === c._id && ref.digest === indexArtifactDigest(c))))
      throw new FlywheelError("unavailable", 503);
    const sessions: TreeIndexNode[] = [];
    const visit = (node: TreeIndexNode): void => {
      if (node.level === "session" && node.evidence?.sessionRef === receipt.sessionId) sessions.push(node);
      node.children.forEach(visit);
    };
    visit(tree);
    if (sessions.length !== 1 || !bound(sessions[0]!.indexArtifact)) throw new FlywheelError("unavailable", 503);
    if (mode === "vectorless") {
      const plans = buildChunks(attempt.strict ? runtimeChronologicalTurns(context.source.turns) : context.source.turns);
      if (!plans.length || plans.length !== chunks.length || plans.some(plan => !chunks.some(c =>
        c._id === chunkContentId(t, receipt.sessionId, plan.turnRefs, plan.text) && c.chunkIndex === plan.chunkIndex
        && fingerprint(c.turnRefs) === fingerprint(plan.turnRefs)))) throw new FlywheelError("unavailable", 503);
    }
  }
  if (context?.retrievalMode !== undefined && context.retrievalMode !== mode) throw new FlywheelError("unavailable", 503);
  const ids = new Set<string>();
  for (const c of chunks) {
    if (c.tenantId !== t || c.sourceRef !== receipt.sessionId || !present(c._id) || ids.has(c._id)
      || !Array.isArray(c.turnRefs) || !c.turnRefs.length || c.turnRefs.some((id) => !receipt.turnIds.includes(id))
      || (mode === "vectorless" ? c.vector !== undefined || c.dims !== undefined || c.embeddingModel !== undefined
        : !Array.isArray(c.vector) || !c.vector.length || c.vector.some((v) => !Number.isFinite(v))
          || c.dims !== c.vector.length || !present(c.embeddingModel)))
      throw new FlywheelError("unavailable", 503);
    ids.add(c._id);
  }
  return { treeDigest: fingerprint(tree), chunksDigest: fingerprint(chunks) };
}
export function assertIndexResult(result: IndexSessionResult, receipt: CaptureReceipt): void {
  const c = result?.completion;
  if (result?.sessionId !== receipt.sessionId || !c || c.version !== 2 || c.complete !== true || c.treeWritten !== true
    || !present(c.generation) || c.turnCount !== receipt.turnCount || c.turnCount < 1
    || !result.chunks || result.chunks.skipped !== null || result.chunks.written < 1
    || !result.summary || result.summary.degraded !== null || !result.claims || result.claims.degraded !== null)
    throw new FlywheelError("unavailable", 503);
}
