import { expect, test } from "vitest";
import { documentPageHref, validDocumentDetail, validPageEvidence } from "./documentPageModel.js";
const doc = { id: "a:hash", sourceId: "a:hash", version: "a".repeat(64), title: "Admissions", format: "pdf" as const, pageCount: 2, highlights: [{ id: "h", pageNumber: 2, quote: "Exact evidence.", text: "Exact evidence.", verification: "unverified" as const }] };
test("document detail/page model refuses forged page/source/version and empty evidence", () => {
  expect(validDocumentDetail(doc)).toBe(true);
  expect(validDocumentDetail({ ...doc, highlights: [{ ...doc.highlights[0], quote: "" }] })).toBe(false);
  const page = { id: doc.id, sourceId: doc.sourceId, version: doc.version, title: doc.title, pageNumber: 2, text: "Exact evidence." };
  expect(validPageEvidence(page, doc, 2)).toBe(true);
  for (const patch of [{ sourceId: "foreign" }, { version: "b".repeat(64) }, { pageNumber: 1 }, { title: "Another source" }]) expect(validPageEvidence({ ...page, ...patch }, doc, 2)).toBe(false);
  expect(documentPageHref("a:doc/with space", 2)).toBe("/knowledge/documents/a%3Adoc%2Fwith%20space/pages/2");
});
