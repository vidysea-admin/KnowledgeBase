import { createHash } from "node:crypto";
import { sourceSpanText, type SourceSpan } from "@lkb/index";

interface IntegrityChunk { _id: string; tenantId?: string; sourceRef: string; turnRefs: string[];
  sourceSpans?: SourceSpan[]; rawTextSha256?: string }
interface IntegrityTurn { _id: string; tenantId?: string; sessionId: string; text: string }

/** Stable natural identity binds the numeric embedding to its exact ordered source text. */
export function chunkContentId(tenantId: string, sourceRef: string, turnRefs: string[], text: string): string {
  return `chunk-v1:${createHash("sha256").update(JSON.stringify([tenantId, sourceRef, turnRefs, text])).digest("hex")}`;
}

/** Accept content IDs or existing verified source-span fingerprints; refuse unbound legacy rows. */
export function chunkContentMatches(chunk: IntegrityChunk, turns: ReadonlyMap<string, IntegrityTurn>, tenantId: string): boolean {
  if (typeof tenantId !== "string" || !tenantId.trim() || chunk.tenantId !== tenantId ||
      !Array.isArray(chunk.turnRefs) || chunk.turnRefs.length === 0) return false;
  const source = chunk.turnRefs.map(id => turns.get(id));
  if (source.some(turn => !turn || turn.tenantId !== tenantId || turn.sessionId !== chunk.sourceRef ||
      typeof turn.text !== "string" || !turn.text.trim())) return false;
  if (chunk.sourceSpans !== undefined) {
    try {
      if (!Array.isArray(chunk.sourceSpans) || !chunk.sourceSpans.length) return false;
      if (JSON.stringify([...new Set(chunk.sourceSpans.map(span => span.turnId))]) !== JSON.stringify(chunk.turnRefs)) return false;
      const slices = chunk.sourceSpans.map(span => {
        const { spanId, ...binding } = span;
        if (spanId !== createHash("sha256").update(JSON.stringify(binding)).digest("hex")) throw new Error("span identity mismatch");
        return sourceSpanText(span, turns.get(span.turnId)!);
      });
      const text = slices.join(" ");
      return text.trim().length > 0 && chunk.rawTextSha256 === createHash("sha256").update(text).digest("hex");
    } catch { return false; }
  }
  const text = source.map(turn => turn!.text.trim()).join(" ");
  return chunk._id === chunkContentId(tenantId, chunk.sourceRef, chunk.turnRefs, text);
}
