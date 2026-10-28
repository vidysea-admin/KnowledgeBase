import { test } from "node:test";
import assert from "node:assert/strict";
import { producePageDocument, readPdfPages } from "./document-pages.js";

/** Actual two-page PDF fixture, including page objects, font, streams and byte-correct cross-reference table. */
function pdfFixture(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Admission deadline is October.) Tj ET",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "BT /F1 12 Tf 50 700 Td (Scholarships need evidence.) Tj ET",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((content, i) => {
    offsets.push(Buffer.byteLength(pdf)); const body = i === 3 || i === 5 ? `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream` : content;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
test("actual PDF reader preserves two real page boundaries and quotes", async () => {
  const pages = await readPdfPages(pdfFixture());
  assert.deepEqual(pages, [{ pageNumber: 1, text: "Admission deadline is October." }, { pageNumber: 2, text: "Scholarships need evidence." }]);
});
test("producer version/id are original-byte derived, repeatable and tenant separated", async () => {
  const input = { tenantId: "a", title: "Admissions", format: "pdf" as const, bytes: pdfFixture(), createdAt: "2026-10-14T00:00:00.000Z" };
  const one = await producePageDocument(input); const repeated = await producePageDocument(input); const foreign = await producePageDocument({ ...input, tenantId: "b" });
  assert.deepEqual(one, repeated); assert.notEqual(one._id, foreign._id); assert.equal(one.version, foreign.version);
  assert.equal(one.sourceId, one._id); assert.equal(one.pages[1]?.pageNumber, 2);
});
test("unavailable DOCX rendering and unsupported/malformed/oversized input fail", async () => {
  const base = { tenantId: "a", title: "Admissions", format: "docx" as const, bytes: new Uint8Array([1]), createdAt: "2026-10-14T00:00:00.000Z" };
  await assert.rejects(producePageDocument(base), /renderer unavailable/);
  await assert.rejects(readPdfPages(new Uint8Array([1, 2, 3])));
  await assert.rejects(producePageDocument({ ...base, bytes: new Uint8Array(512001) }), /byte limit/);
  await assert.rejects(producePageDocument({ ...base, tenantId: " a " }), /tenant/);
});
test("DOCX original bytes own version while renderer supplies genuine PDF pages", async () => {
  let calls = 0; const bytes = new Uint8Array([80, 75, 3, 4]);
  const doc = await producePageDocument({ tenantId: "a", title: "Rendered DOCX", format: "docx", bytes, createdAt: "2026-10-14T00:00:00.000Z" }, async value => { assert.deepEqual(value, bytes); calls++; return pdfFixture(); });
  assert.equal(calls, 1); assert.equal(doc.format, "docx"); assert.equal(doc.pages.length, 2);
  // Renderer seam exercised; this test does not claim a real LibreOffice invocation or DOCX visual acceptance.
});
