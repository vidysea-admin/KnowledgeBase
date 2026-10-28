import { selectQuote, sourceSpanText, type EvidenceTurn, type QuoteSpan, type SourceSpan } from "@lkb/index";

function finishQuote(quote: QuoteSpan, turns: EvidenceTurn[]): QuoteSpan {
  const turn = turns.find(value => value._id === quote.turnId);
  if (!turn) throw new Error("quoted source turn missing");
  let end = quote.charEnd;
  if (end < turn.text.length && end > quote.charStart &&
      /[\uD800-\uDBFF]/.test(turn.text[end - 1]!) && /[\uDC00-\uDFFF]/.test(turn.text[end]!)) end--;
  const text = turn.text.slice(quote.charStart, end);
  try { encodeURIComponent(text); } catch { throw new Error("source quote has malformed Unicode"); }
  return { ...quote, charEnd: end, text };
}

/** Select only within text actually embedded; return original turn IDs and original offsets. */
export function selectSourceQuote(sourceSpans: SourceSpan[] | undefined,
  turns: EvidenceTurn[], query: string): QuoteSpan {
  if (sourceSpans === undefined) return finishQuote(selectQuote(turns, query), turns);
  if (!Array.isArray(sourceSpans) || !sourceSpans.length) throw new Error("source span proof is malformed");
  const original = new Map(turns.map(turn => [turn._id, turn]));
  const slices = sourceSpans.map(span => {
    const turn = original.get(span.turnId);
    if (!turn) throw new Error("source span turn missing");
    return { ...turn, _id: span.spanId, text: sourceSpanText(span, turn) };
  });
  const selected = selectQuote(slices, query);
  const span = sourceSpans.find(value => value.spanId === selected.turnId);
  if (!span) throw new Error("quote is outside embedded source spans");
  return finishQuote({ ...selected, turnId: span.turnId, charStart: span.charStart + selected.charStart,
    charEnd: span.charStart + selected.charEnd }, turns);
}
