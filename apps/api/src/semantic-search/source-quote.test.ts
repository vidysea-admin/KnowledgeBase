import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceSlices, verifyQuoteSpan } from "@lkb/index";
import { selectSourceQuote } from "./source-quote.js";

test("bounded vector quote stays inside its embedded span even when query matches elsewhere in turn", () => {
  const turn = { _id: "original", tenantId: "tenant", sessionId: "source", tStart: 3, tEnd: 9,
    text: "First local evidence. " + "Distant visa instructions. ".repeat(10) };
  const first = buildSourceSlices([turn], 32)[0]!;
  const quote = selectSourceQuote(first.sourceSpans, [turn], "Distant visa instructions");
  verifyQuoteSpan(quote, turn);
  assert.ok(first.sourceSpans.some(span => quote.turnId === span.turnId && quote.charStart >= span.charStart && quote.charEnd <= span.charEnd));
  assert.throws(() => selectSourceQuote(first.sourceSpans, [{ ...turn, text: "Changed source" }], "q"), /binding changed/);
  assert.throws(() => selectSourceQuote(first.sourceSpans, [], "q"), /turn missing/);
});

test("quote cap preserves actual Unicode glyph boundaries and malformed span proofs refuse", () => {
  const turn = { _id: "emoji", tenantId: "tenant", sessionId: "source", tStart: 0, tEnd: 1,
    text: "a".repeat(299) + "😀 more actual source text." };
  const quote = selectSourceQuote(undefined, [turn], "q");
  verifyQuoteSpan(quote, turn); assert.equal(quote.charEnd, 299); assert.equal(quote.text, "a".repeat(299));
  assert.throws(() => selectSourceQuote(null as never, [turn], "q"), /malformed/);
  assert.throws(() => selectSourceQuote(undefined, [{ ...turn, text: "\ud800 malformed source" }], "q"), /Unicode/);
});
