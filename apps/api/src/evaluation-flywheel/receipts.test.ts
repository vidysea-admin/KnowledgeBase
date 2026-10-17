import { test } from "node:test";
import assert from "node:assert/strict";
import { captureReceipt, indexedDigests } from "./receipts.js";
import { rig, SOURCE } from "./test-fixture.js";

test("legacy vector receipt validation remains strict without canonical mode", async () => {
  const r = rig(), source = await r.deps.store.sourceRows("t", SOURCE._id, "s1");
  const captured = captureReceipt("t", SOURCE._id, "s1", source);
  const rows = await r.deps.store.indexedRows("t", "s1");
  assert.ok(indexedDigests("t", captured, rows).chunksDigest);
  for (const change of [
    (c: any) => { delete c.vector; }, (c: any) => { c.vector = []; }, (c: any) => { c.vector = [NaN, 0]; },
    (c: any) => { c.dims = 3; }, (c: any) => { c.embeddingModel = ""; }, (c: any) => { c.tenantId = "foreign"; },
    (c: any) => { c.turnRefs = ["foreign"]; },
  ]) {
    const altered = structuredClone(rows); change(altered.chunks[0]);
    assert.throws(() => indexedDigests("t", captured, altered));
  }
  assert.throws(() => indexedDigests("t", captured, rows, { source, generation: "caller", retrievalMode: "vectorless" }));
});
