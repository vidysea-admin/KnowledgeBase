import { test } from "node:test";
import assert from "node:assert/strict";
import { readPdfPages } from "../../packages/ingest/src/sources/document-pages.ts";
import { buildPageIndex } from "../../packages/index/src/pipeline/page-evidence/page-segments.ts";
import { validateHighlight } from "../../packages/index/src/pipeline/page-evidence/highlight-validator.ts";

/** Real two-page PDF built in-test (no committed binary, no private content). */
function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Admission deadline is October.) Tj ET",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Scholarships need evidence.) Tj ET",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [];
  objects.forEach((c, i) => {
    offsets.push(Buffer.byteLength(pdf));
    const body = i === 3 || i === 5 ? `<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}\nendstream` : c;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
const Q = "Scholarships need evidence.";

test("real PDF reader pages feed the validator end to end", async () => {
  const pages = await readPdfPages(pdfFixture());
  const mk = () => buildPageIndex({ tenantId: "t", sourceId: "s", version: "v", title: "Admissions", format: "pdf", pages });
  const idx = mk(); const start = idx.text.indexOf(Q); const end = start + Q.length;
  assert.equal(idx.pageCount, 2);
  assert.equal(validateHighlight(idx, { quote: Q, page: 2, start, end }).ok, true);
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 1, start, end }), { ok: false, reason: "quote-absent-on-page" });
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 0, start, end }), { ok: false, reason: "invalid-page" });
  assert.deepEqual(validateHighlight(idx, { quote: Q, page: 3, start, end }), { ok: false, reason: "page-out-of-range" });
  assert.deepEqual(mk(), idx);
});
