import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import { validateHydration, type SourceHydration, type SourceQuote } from "./source-context.js";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const SNAP = sha("snapshot");
const NODE = "tenant:t/session:s";
const orig: TreeIndexNode = { node_id: NODE, title: "S", level: "session", summary: "x", evidence: { sessionRef: "s" }, children: [] };

function build(turnText: string, start: number, end: number) {
  const quote = turnText.slice(start, end);
  const q: SourceQuote = { id: "q1", nodeId: NODE, sessionRef: "s", turnId: "t1", speakerRef: "spk:0", tStart: 1, tEnd: 2,
    charStart: start, charEnd: end, byteStart: Buffer.byteLength(turnText.slice(0, start), "utf8"),
    byteEnd: Buffer.byteLength(turnText.slice(0, end), "utf8"), turnTextSHA256: sha(turnText), sliceSHA256: sha(quote), quote, origin: "speech" };
  return q;
}
function hydration(q: SourceQuote, live?: { text: string } | null): SourceHydration {
  return { snapshotSHA256: SNAP, sourceBytes: 10,
    nodes: [{ ...orig, summary: JSON.stringify([q]), evidence: { sessionRef: "s", sourceQuotes: [q], sourceSnapshotSHA256: SNAP } as never }],
    ...(live === undefined ? {} : { liveTurns: live === null ? [] : [{ sessionId: "s", turnId: "t1", text: live.text }] }) };
}
const T = "Visa requires a form and a fee.";

test("valid proof is cited and output is the same node objects", () => {
  const h = hydration(build(T, 0, 21), { text: T });
  const out = validateHydration(h, [orig]);
  assert.equal(out.length, 1);
  assert.equal(out[0], h.nodes[0]);
  assert.equal(h.excludedTurns, undefined);
});
test("no live turns supplied: behaviour unchanged", () => {
  const h = hydration(build(T, 0, 21));
  assert.equal(validateHydration(h, [orig])[0], h.nodes[0]);
});
test("turn text changed at the same id is refused with a reason", () => {
  const h = hydration(build(T, 0, 21), { text: "Visa requires a form and a DIFFERENT fee." });
  assert.deepEqual(validateHydration(h, [orig]), []);
  assert.equal(h.excludedTurns![0]!.turnId, "t1");
  assert.match(h.excludedTurns![0]!.reason, /^quote-proof-stale/);
});
test("slice hash mismatch is refused", () => {
  const q = build(T, 0, 21); q.sliceSHA256 = sha("other");
  const h = hydration(q, { text: T });
  assert.deepEqual(validateHydration(h, [orig]), []);
  assert.match(h.excludedTurns![0]!.reason, /slice hash/);
});
test("offsets out of range are refused", () => {
  const q = build(T, 0, 21);
  const short = T.slice(0, 10);
  q.turnTextSHA256 = sha(short);
  const h = hydration(q, { text: short });
  assert.deepEqual(validateHydration(h, [orig]), []);
  assert.match(h.excludedTurns![0]!.reason, /offsets out of range/);
});
test("missing live turn is refused", () => {
  const h = hydration(build(T, 0, 21), null);
  assert.deepEqual(validateHydration(h, [orig]), []);
  assert.match(h.excludedTurns![0]!.reason, /live turn missing/);
});
test("multi-byte text with astral characters: valid proof still cited", () => {
  const U = "नमस्ते 🎓 वीज़ा requires café form";
  const start = U.indexOf("वीज़ा"), end = U.length;
  const h = hydration(build(U, start, end), { text: U });
  assert.equal(validateHydration(h, [orig]).length, 1);
  assert.equal(h.excludedTurns, undefined);
});
test("one stale quote is dropped, the valid sibling stays cited", () => {
  const good = build(T, 0, 21);
  const bad = { ...build(T, 22, 31), id: "q2", turnId: "t2" };
  const h: SourceHydration = { snapshotSHA256: SNAP, sourceBytes: 10, liveTurns: [{ sessionId: "s", turnId: "t1", text: T }, { sessionId: "s", turnId: "t2", text: "changed" }],
    nodes: [{ ...orig, summary: JSON.stringify([good, bad]), evidence: { sessionRef: "s", sourceQuotes: [good, bad], sourceSnapshotSHA256: SNAP } as never }] };
  const out = validateHydration(h, [orig]);
  assert.equal(out.length, 1);
  assert.deepEqual((out[0]!.evidence as never as { sourceQuotes: SourceQuote[] }).sourceQuotes.map((q) => q.id), ["q1"]);
  assert.equal(out[0]!.summary, JSON.stringify([good]));
  assert.equal(h.excludedTurns!.length, 1);
});
