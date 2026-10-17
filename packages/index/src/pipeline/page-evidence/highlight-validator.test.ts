import { test } from "node:test";
import assert from "node:assert/strict";
import { readPdfPages } from "../../../../ingest/src/sources/document-pages.js";
import { buildPageIndex, type PageSourceDocument } from "./page-segments.js";
import { validateHighlight } from "./highlight-validator.js";

/** Real two-page PDF built in-test (no committed binary, no private content). */
function pdfFixture(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Admission deadline is October.) Tj ET",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Scholarships need evidence.) Tj ET",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((c, i) => {
    offsets.push(Buffer.byteLength(pdf));
    const body = i === 3 || i === 5 ? `<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}\nendstream` : c;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
async function load() {
  const pages = await readPdfPages(pdfFixture());
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
