import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { PageDocument } from "./document-pages.js";
import { documentPagePassages } from "./native-document-passages.js";

function document(): PageDocument {
  return { _id: "immutable-document", tenantId: "a", sourceId: "immutable-source", version: "a".repeat(64),
    title: "Admissions", format: "pdf", createdAt: "2026-10-15T00:00:00Z",
    pages: [{ pageNumber: 2, text: " शुल्क😀\névidence " }, { pageNumber: 7, text: "申请截止日期" }] };
}
const binding = { sourceId: "stable-head", headRevision: 3 };

test("native pages preserve source distinctions, genuine pages, Unicode offsets and exact hashed bytes", () => {
  const doc = document();
  const original = JSON.stringify(doc);
  const passages = documentPagePassages(doc, binding, 7);
  assert.equal(JSON.stringify(doc), original);
  for (const page of doc.pages) {
    const selected = passages.filter(p => p.locator.pageNumber === page.pageNumber);
    assert.equal(selected.map(p => p.text).join(""), page.text);
    let through = 0;
    for (const { text, locator } of selected) {
      assert.equal(locator.kind, "document-page");
      assert.equal(locator.sourceId, "stable-head");
      assert.equal(locator.documentId, "immutable-document");
      assert.equal(locator.documentSourceId, "immutable-source");
      assert.equal(locator.headRevision, 3);
      assert.equal(locator.revisionHash, doc.version);
      assert.equal(locator.passage.start, through);
      assert.equal(page.text.slice(locator.passage.start, locator.passage.end), text);
      assert.ok(Buffer.byteLength(text, "utf8") <= 7);
      assert.equal(locator.passage.sha256, createHash("sha256").update(text, "utf8").digest("hex"));
      assert.ok(!Array.from(text).some(c => c.length === 1 && /[\ud800-\udfff]/u.test(c)));
      through = locator.passage.end;
    }
    assert.equal(through, page.text.length);
  }
});

test("empty pages emit nothing and whitespace remains exact source content", () => {
  const doc = document(); doc.pages = [{ pageNumber: 1, text: "" }, { pageNumber: 4, text: " \n " }];
  assert.deepEqual(documentPagePassages(doc, binding).map(p => [p.locator.pageNumber, p.text]), [[4, " \n "]]);
});

test("invalid bounds, identities, revisions, duplicate pages and broken Unicode refuse", () => {
  for (const bytes of [0, 3, 1025, 4.5, NaN]) assert.throws(() => documentPagePassages(document(), binding, bytes));
  for (const revision of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => documentPagePassages(document(), { ...binding, headRevision: revision }));
  }
  assert.throws(() => documentPagePassages(document(), { ...binding, sourceId: " " }));
  const badHash = document(); badHash.version = "not-a-revision";
  assert.throws(() => documentPagePassages(badHash, binding));
  const duplicate = document(); duplicate.pages[1]!.pageNumber = duplicate.pages[0].pageNumber;
  assert.throws(() => documentPagePassages(duplicate, binding));
  for (const text of ["\ud800", "a\udfff"]) {
    const broken = document(); broken.pages[0].text = text;
    assert.throws(() => documentPagePassages(broken, binding), /Unicode/);
  }
});
