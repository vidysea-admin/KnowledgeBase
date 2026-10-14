import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareChunkDocuments } from "./session.js";

const plans = [{ chunkIndex: 0, turnRefs: ["t1"], text: "x" }];
const embedded = { vectors: [[0.1, 0.2]], dims: 2, model: "m" } as never;

test("chunks carry the legacy-unbound stamp when given one (D-149 pending append)", () => {
  const [c] = prepareChunkDocuments("t", "s1", plans, embedded, { status: "legacy-unbound", reason: "D-149" });
  assert.deepEqual((c as { provenance?: unknown }).provenance, { status: "legacy-unbound", reason: "D-149" });
});
test("chunks are unchanged (no provenance key) when no stamp is given", () => {
  const [c] = prepareChunkDocuments("t", "s1", plans, embedded);
  assert.equal("provenance" in (c ?? {}), false);
});
