import type { SourceIntakeResult } from "../store.js";

/** Immutable minimum receipt for publication; no provider diagnostics or arbitrary extra fields. */
export function consumedSourceResult(result: SourceIntakeResult): SourceIntakeResult | null {
  const receipt = result.indexing?.receipt, proof = receipt?.completion;
  if (!["created", "already-ingested"].includes(result.status) || !result.sessionId || !result.sourceId ||
      result.indexing?.status !== "done" || receipt?.sessionId !== result.sessionId || proof?.version !== 2 ||
      proof.complete !== true || proof.treeWritten !== true || typeof proof.strict !== "boolean" ||
      !Number.isSafeInteger(proof.turnCount) || proof.turnCount < 1 ||
      (result.status === "created" && result.turnCount !== proof.turnCount) ||
      typeof proof.generation !== "string" || !/^[A-Za-z0-9._:-]{1,100}$/.test(proof.generation) ||
      receipt.summary?.degraded !== null || receipt.claims?.degraded !== null || receipt.entities?.skipped ||
      receipt.chunks?.skipped !== null || !Number.isSafeInteger(receipt.chunks.written) || receipt.chunks.written < 1) return null;
  return { status: result.status, sessionId: result.sessionId, sourceId: result.sourceId,
    ...(result.status === "created" ? { turnCount: result.turnCount } : {}),
    indexing: { status: "done", receipt: { sessionId: result.sessionId, summary: { degraded: null }, claims: { degraded: null },
      entities: null, chunks: { written: receipt.chunks.written, skipped: null }, completion: { version: 2, strict: proof.strict,
        complete: true, treeWritten: true, generation: proof.generation, turnCount: proof.turnCount } } } } as SourceIntakeResult;
}
