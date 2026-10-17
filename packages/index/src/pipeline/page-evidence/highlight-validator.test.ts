import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageIndex, type PageSourceDocument } from "./page-segments.js";
import { validateHighlight } from "./highlight-validator.js";

/** Inline structural fixture in the shape a page-aware reader emits (real-reader e2e: scripts/t055). */
async function load() {
  const pages = [
    { pageNumber: 1, text: "Admission deadline is October." },
    { pageNumber: 2, text: "Scholarships need evidence." },
  ];
  const doc: PageSourceDocument = { tenantId: "t", sourceId: "s", version: "v", title: "Admissions", format: "pdf", pages };
  return buildPageIndex(doc);
}
const mk = (pages: { pageNumber: number; text: string }[]) => ({ tenantId: "t", sourceId: "s", version: "v", title: "x", format: "pdf" as const, pages });
const Q = "Scholarships need evidence.";

test("valid highlight from the real PDF page reader is accepted", async () => {
  const idx = await load(); const start = idx.text.indexOf(Q);
  assert.equal(idx.pageCount, 2);
  assert.equal(validateHighlight(idx, { quote: Q, page: 2, start, end: start + Q.length }).ok, true);
});
test("forged page is rejected", async () => {
  const idx = await load(); const start = idx.text.indexOf(Q);
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 1, start, end: start + Q.length }), { ok: false, reason: "quote-absent-on-page" });
});
test("absent quote is rejected", async () => {
  const idx = await load();
  assert.deepEqual(validateHighlight(idx, { quote: "Not in the document", page: 1, start: 0, end: 19 }), { ok: false, reason: "quote-absent-on-page" });
});
test("page 0 and negative/fractional pages are rejected", async () => {
  const idx = await load();
  for (const page of [0, -1, 1.5, Number.NaN]) assert.deepEqual(validateHighlight(idx, { quote: Q, page, start: 0, end: 1 }), { ok: false, reason: "invalid-page" });
});
test("page beyond the end is rejected", async () => {
  const idx = await load();
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 3, start: 0, end: 1 }), { ok: false, reason: "page-out-of-range" });
});
test("wrong offsets on the right page are rejected", async () => {
  const idx = await load(); const start = idx.text.indexOf(Q);
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 2, start: start + 1, end: start + 1 + Q.length }), { ok: false, reason: "offsets-mismatch" });
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 2, start: 0, end: Q.length }), { ok: false, reason: "offsets-mismatch" });
});
test("offsets are independent of page numbers", () => {
  const a = buildPageIndex(mk([{ pageNumber: 1, text: "alpha" }, { pageNumber: 2, text: "beta" }]));
  const b = buildPageIndex(mk([{ pageNumber: 7, text: "alpha" }, { pageNumber: 2, text: "beta" }]));
  assert.deepEqual(a.segments.map(s => [s.start, s.end]), b.segments.map(s => [s.start, s.end]));
  assert.deepEqual(b.segments.map(s => [s.page, s.start, s.end]), [[7, 0, 5], [2, 6, 10]]);
  assert.throws(() => buildPageIndex(mk([{ pageNumber: 0, text: "a" }])));
  assert.throws(() => buildPageIndex(mk([{ pageNumber: 1, text: "a" }, { pageNumber: 1, text: "b" }])));
});
test("re-ingesting the same document is idempotent", async () => {
  const a = await load(); const b = await load();
  assert.deepEqual(a, b); assert.equal(a.digest, b.digest);
});
