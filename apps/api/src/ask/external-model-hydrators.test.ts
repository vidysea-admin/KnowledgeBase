/** W11 part B G2 (R-32): both source hydrators refuse a WhatsApp source whose link is not studentData "no" before reading or quoting any of its text. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { NativeSourceLocator, TreeIndexNode } from "@lkb/core";
import { createSourceHydrator } from "./source-context.js";
import { createNativeSourceHydrator } from "./native-source-context.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { leaks, PUB_SESSION, PUB_SOURCE, TENANT, WA_SESSION, WA_SOURCE, waWorld } from "../visibility/wa-quarantine.testsupport.js";
import { EXCLUDED, linkCase, type LinkCase } from "../visibility/external-model.testsupport.js";

const QUERY = "PLANTZEBRA scholarship deadline engineering admissions";
const sessionNode = (sessionId: string): TreeIndexNode => ({ node_id: `tenant:${TENANT}/session:${sessionId}`, level: "session", title: sessionId, summary: "s", children: [], evidence: { sessionRef: sessionId } });
const refused = (error: unknown) => (error as { code?: string }).code === "source_context_unavailable" && leaks(String(error) + JSON.stringify(error)).length === 0;

for (const kind of EXCLUDED) {
  test(`G2 transcript: a ${kind} link refuses an admitted WhatsApp session, quoting nothing`, async () => {
    const w = waWorld("approved"); linkCase(w, kind);
    await assert.rejects(() => createSourceHydrator(TENANT, { db: w.db })(QUERY, [sessionNode(WA_SESSION)]), refused);
    await assert.rejects(() => createSourceHydrator(TENANT, { db: w.db })(QUERY, [sessionNode(WA_SESSION), sessionNode(PUB_SESSION)]), refused, "a public session beside it does not rescue the request");
  });
}
test("G2 transcript: a studentData no link hydrates the approved text; a public session is unaffected by any link", async () => {
  const w = waWorld("approved"); linkCase(w, "no");
  const result = await createSourceHydrator(TENANT, { db: w.db })(QUERY, [sessionNode(WA_SESSION)]);
  assert.equal(JSON.stringify(result).includes("wa-turn-1"), true);
  assert.deepEqual(leaks(result, { allowApprovedText: true }), []);
  const yes = waWorld("approved"); linkCase(yes, "yes");
  assert.equal(JSON.stringify(await createSourceHydrator(TENANT, { db: yes.db })(QUERY, [sessionNode(PUB_SESSION)])).includes("pub-turn-1"), true);
});

const text = "Approved WhatsApp scholarship deadline guidance.";
const locator = (sourceId: string): NativeSourceLocator => ({ kind: "document-page", documentId: "doc", documentSourceId: "bytes", headRevision: 1, sourceId, revisionHash: "r".repeat(64), pageNumber: 1,
  passage: { start: 0, end: text.length, sha256: "p".repeat(64) } } as never);
const nativeNode = (sourceId: string): TreeIndexNode => ({ node_id: `n-${sourceId}`, level: "native-source", title: "t", summary: "s", children: [], evidence: { sourceId, revisionHash: "r".repeat(64) } });
function native(kind: LinkCase) {
  const w = waWorld("approved"); linkCase(w, kind); const calls: string[] = []; const visibility = createKnowledgeVisibility(w.db);
  const hydrate = createNativeSourceHydrator(TENANT, { externalEligible: (t, s) => visibility.externalModelEligible(t, s),
    listLocators: async (_t, id) => { calls.push("list"); return [locator(id.sourceId)]; },
    resolver: { async resolve(_t: string, sourceLocator: NativeSourceLocator) { calls.push("resolve"); return { sourceLocator, quote: text }; }, async revalidate(_t: string, e: unknown) { return e; } } as never });
  return { hydrate, calls };
}
for (const kind of EXCLUDED) {
  test(`G2 native: a ${kind} link refuses a WhatsApp native source before any locator or text is read`, async () => {
    const f = native(kind);
    await assert.rejects(() => f.hydrate("scholarship deadline", [nativeNode(WA_SOURCE)]), refused);
    assert.deepEqual(f.calls, []);
  });
}
test("G2 native: a studentData no link hydrates; a non-WhatsApp native source is unaffected", async () => {
  assert.equal((await native("no").hydrate("scholarship deadline", [nativeNode(WA_SOURCE)])).nodes.length, 1);
  const f = native("yes");
  assert.equal((await f.hydrate("scholarship deadline", [nativeNode(PUB_SOURCE)])).nodes.length, 1);
});
test("G2 native: the gate dependency is required (a caller cannot omit it)", async () => {
  const hydrate = createNativeSourceHydrator(TENANT, { listLocators: async () => [], resolver: {} as never } as never);
  await assert.rejects(() => hydrate("q", [nativeNode(WA_SOURCE)]));
});
