import { expect, test } from "vitest";
import { sessionRef, sourceQuotes } from "./provenance.js";
test("malformed source evidence never invents a citation", () => {
  expect(sessionRef({ node_id: "n", evidence: { sessionRef: "  " } })).toBeNull();
  const valid = { id: "q", turnId: "t", speakerRef: "spk:1", tStart: 1, tEnd: 2, quote: "source", origin: "speech" };
  expect(sourceQuotes({ node_id: "n", evidence: { sourceQuotes: [null, {}, { ...valid, tStart: -1 }, { ...valid, tEnd: 0 }, { ...valid, turnId: "" }, valid] } })).toEqual([valid]);
});
