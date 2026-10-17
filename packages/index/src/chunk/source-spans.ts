/** Bounded embedding windows over immutable original turn offsets; never invent turn times. */
import {createHash} from "node:crypto";
import {buildChunks, type ChunkableTurn, type ChunkPlan} from "./build-chunks.js";
export interface SourceSpan {
  spanId: string; turnId: string; charStart: number; charEnd: number;
  byteStart: number; byteEnd: number; turnTextSHA256: string; sliceSHA256: string;
}
export interface SourceSlicePlan extends ChunkPlan {
  baseChunkIndex: number; sourceSpans: SourceSpan[]; rawTextSha256: string;
}
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function requireTrue(ok: unknown, reason: string): asserts ok {if (!ok) throw new Error(reason);}
export function sourceSpanText(span: SourceSpan, turn: ChunkableTurn): string {
  requireTrue(turn._id === span.turnId && sha(turn.text) === span.turnTextSHA256, "source turn binding changed");
  requireTrue(Number.isInteger(span.charStart) && Number.isInteger(span.charEnd) && span.charStart >= 0 &&
    span.charEnd > span.charStart && span.charEnd <= turn.text.length, "invalid source character offsets");
  const text = turn.text.slice(span.charStart, span.charEnd);
  requireTrue(Buffer.byteLength(turn.text.slice(0, span.charStart)) === span.byteStart &&
    Buffer.byteLength(turn.text.slice(0, span.charEnd)) === span.byteEnd && sha(text) === span.sliceSHA256,
    "source byte/hash binding changed");
  requireTrue(Buffer.byteLength(text) === span.byteEnd - span.byteStart && !Array.from(text).some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff), "source Unicode boundary changed");
  return text;
}
export function buildSourceSlices(turns: ChunkableTurn[], maxBytes = 1024): SourceSlicePlan[] {
  requireTrue(Number.isSafeInteger(maxBytes) && maxBytes >= 4 && maxBytes <= 1024, "invalid source slice byte limit");
  const byId = new Map<string, ChunkableTurn>();
  for (const turn of turns) {
    requireTrue(typeof turn._id === "string" && turn._id && typeof turn.text === "string" && turn.text.trim(), "invalid source turn");
    requireTrue(!byId.has(turn._id), "duplicate source turn identity");
    for (const char of turn.text) requireTrue(!(char.length === 1 && char.charCodeAt(0) >= 0xd800 &&
      char.charCodeAt(0) <= 0xdfff), "source contains an unpaired Unicode surrogate");
    byId.set(turn._id, Object.freeze({_id: turn._id, text: turn.text}));
  }
  const plans: SourceSlicePlan[] = [];
  for (const base of buildChunks([...byId.values()])) {
    let text = "", bytes = 0;
    let spans: Array<Omit<SourceSpan, "spanId" | "sliceSHA256">> = [];
    const flush = () => {
      if (!spans.length) return;
      const sourceSpans = spans.map(span => {
        const original = byId.get(span.turnId)!;
        const sliceSHA256 = sha(original.text.slice(span.charStart, span.charEnd));
        const full = {...span, sliceSHA256};
        return Object.freeze({...full, spanId: sha(JSON.stringify(full))});
      });
      const plan = {chunkIndex: plans.length, baseChunkIndex: base.chunkIndex,
        turnRefs: [...new Set(sourceSpans.map(span => span.turnId))], sourceSpans,
        text, rawTextSha256: sha(text)};
      requireTrue(sourceSpans.map(span => sourceSpanText(span, byId.get(span.turnId)!)).join(" ") === text,
        "source slice reconstruction changed");
      Object.freeze(plan.turnRefs); Object.freeze(sourceSpans); plans.push(Object.freeze(plan));
      text = ""; bytes = 0; spans = [];
    };
    for (const turnId of base.turnRefs) {
      const turn = byId.get(turnId)!; let charAt = 0, byteAt = 0;
      for (const char of turn.text) {
        const size = Buffer.byteLength(char);
        const newTurn = spans.length > 0 && spans[spans.length - 1]!.turnId !== turnId;
        if (bytes + size + (newTurn ? 1 : 0) > maxBytes) flush();
        if (spans.length && spans[spans.length - 1]!.turnId !== turnId) {text += " "; bytes++;}
        let span = spans[spans.length - 1];
        if (!span || span.turnId !== turnId) {
          span = {turnId, charStart: charAt, charEnd: charAt, byteStart: byteAt, byteEnd: byteAt, turnTextSHA256: sha(turn.text)};
          spans.push(span);
        }
        text += char; bytes += size; charAt += char.length; byteAt += size;
        span.charEnd = charAt; span.byteEnd = byteAt;
      }
    }
    flush();
  }
  const coverage = new Map<string, SourceSpan[]>();
  for (const plan of plans) for (const span of plan.sourceSpans) {const list = coverage.get(span.turnId) ?? []; list.push(span); coverage.set(span.turnId, list);}
  for (const turn of byId.values()) {
    const spans = (coverage.get(turn._id) ?? [])
      .sort((a, b) => a.charStart - b.charStart);
    let through = 0;
    for (const span of spans) {requireTrue(span.charStart <= through, "source slice coverage gap"); through = Math.max(through, span.charEnd);}
    requireTrue(through === turn.text.length, "source turn coverage incomplete");
  }
  Object.freeze(plans); return plans;
}
