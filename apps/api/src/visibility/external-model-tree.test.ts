/** W11 part B G1 (R-32): the tree /ask and /route read never carries a WhatsApp node whose link is not studentData "no". */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TreeIndexNode } from "@lkb/core";
import { createExternalModelTreeStore } from "../store.js";
import type { TreeStore } from "../routes/ask/ask.js";
import { PUB_SESSION, PUB_SOURCE, TENANT, WA_SESSION, WA_SOURCE, waWorld } from "./wa-quarantine.testsupport.js";
import { EXCLUDED, linkCase } from "./external-model.testsupport.js";

const node = (id: string, level: TreeIndexNode["level"], evidence: Record<string, unknown>, children: TreeIndexNode[] = []): TreeIndexNode =>
  ({ node_id: id, level, title: id, summary: `summary ${id}`, evidence, children } as TreeIndexNode);
const native = (id: string, sourceId: unknown) => node(id, "native-source", { sourceId, revisionHash: "h" }, [node(`${id}/p`, "native-passage", { sourceId, revisionHash: "h" })]);
const tree = (): TreeIndexNode => node(`tenant:${TENANT}`, "tenant", {}, [
  node("s-wa", "session", { sessionRef: WA_SESSION }), node("s-pub", "session", { sessionRef: PUB_SESSION }),
  node("t-mixed", "topic", { sessionRefs: [PUB_SESSION, WA_SESSION] }), node("t-pub", "topic", { sessionRefs: [PUB_SESSION] }),
  native("n-wa", WA_SOURCE), native("n-pub", PUB_SOURCE), native("n-bad", 42), native("n-gone", "no-such-source"),
  node("year", "year", {}, [node("s-wa2", "session", { sessionRef: WA_SESSION }), node("s-pub2", "session", { sessionRef: PUB_SESSION })]),
]);
const ids = (t: TreeIndexNode | null): string[] => t ? [t.node_id, ...t.children.flatMap(c => ids(c))] : [];
const inner = (): TreeStore & { loads: number } => { const s = { loads: 0, async load() { s.loads++; return tree(); },
  async loadWithExclusions() { return { tree: tree(), excluded: { total: 3, reasons: { "not-visible": 3 } } }; } }; return s; };
const build = (kind: Parameters<typeof linkCase>[1]) => { const w = waWorld("approved"); linkCase(w, kind); return createExternalModelTreeStore(inner(), () => w.db as never); };

for (const kind of EXCLUDED) {
  test(`G1: a ${kind} link prunes every WhatsApp node, keeps public nodes (load and loadWithExclusions)`, async () => {
    const store = build(kind);
    for (const result of [await store.load(TENANT), (await store.loadWithExclusions!(TENANT)).tree]) {
      const kept = ids(result);
      for (const gone of ["s-wa", "t-mixed", "n-wa", "n-wa/p", "n-bad", "n-gone", "s-wa2"]) assert.equal(kept.includes(gone), false, gone);
      for (const stay of ["s-pub", "t-pub", "n-pub", "n-pub/p", "s-pub2", "year", `tenant:${TENANT}`]) assert.equal(kept.includes(stay), true, stay);
    }
  });
}
test("G1: a studentData no link keeps WhatsApp nodes (D-206 default) but still drops unresolvable native sources", async () => {
  const kept = ids(await build("no").load(TENANT));
  for (const stay of ["s-wa", "t-mixed", "n-wa", "n-wa/p", "s-pub", "n-pub"]) assert.equal(kept.includes(stay), true, stay);
  for (const gone of ["n-bad", "n-gone"]) assert.equal(kept.includes(gone), false, gone);
});
test("G1: exclusion counts and a null tree pass through", async () => {
  const w = waWorld("approved"); linkCase(w, "yes");
  const store = createExternalModelTreeStore({ load: async () => null, loadWithExclusions: async () => ({ tree: null, excluded: { total: 2, reasons: {} } }) }, () => w.db as never);
  assert.equal(await store.load(TENANT), null);
  assert.deepEqual((await store.loadWithExclusions!(TENANT)).excluded.total, 2);
});
test("G1: the input tree is not mutated", async () => {
  const shared = tree(); const w = waWorld("approved"); linkCase(w, "yes");
  const store = createExternalModelTreeStore({ load: async () => shared }, () => w.db as never);
  await store.load(TENANT);
  assert.equal(ids(shared).includes("s-wa"), true);
});
test("G1 wiring: production gives both /ask and /route the gated tree store", () => {
  const source = readFileSync(new URL("../composition/production.ts", import.meta.url), "utf8");
  assert.match(source, /createRouteDeps\(\{ tree: createExternalModelTreeStore\(createMongoTreeStore\(native\.resolver\)\)/);
  assert.match(source, /ask: \{\s*tree: createExternalModelTreeStore\(createMongoTreeStore\(native\.resolver\)\)/);
  assert.equal((source.match(/createMongoTreeStore\(/g) ?? []).length, 2, "no ungated tree store is handed to a consumer");
});
