import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { NativeSourceLocator } from "@lkb/core";
import { createNativeEvidenceResolver, parseNativeSourceLocator, type NativeCurrentUnit } from "./resolver.js";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const revisionHash = sha("document bytes"), quote = "😀 सही passage";
function fixture(kind: "document-page" | "message" = "document-page") {
  const base = { sourceId: "source-a", revisionHash, passage: { start: 7, end: 7 + quote.length, sha256: sha(quote) } };
  const locator: NativeSourceLocator = kind === "document-page" ? { ...base, kind, documentId: "document-a", documentSourceId: "immutable-source-a", headRevision: 2, pageNumber: 2 }
    : { ...base, kind, threadId: "thread-a", messageId: "message-a" };
  let unit: NativeCurrentUnit | null = { tenantId: "tenant-a", sourceId: "source-a", revisionHash, currentRevisionHash: revisionHash,
    eligible: true, text: `prefix ${quote} suffix`, title: "Exact native source", ...(kind === "document-page"
      ? { kind, documentId: "document-a", documentSourceId: "immutable-source-a", headRevision: 2, pageNumber: 2 } : { kind, threadId: "thread-a", messageId: "message-a" }) };
  const calls: string[] = [];
  const resolver = createNativeEvidenceResolver({ async loadCurrent(tenantId) { calls.push(tenantId); return structuredClone(unit); } });
  return { locator, resolver, calls, get: () => unit, set: (next: NativeCurrentUnit | null) => { unit = next; } };
}

test("native page/message resolution preserves exact UTF16 slice/UTF8 hash without synthetic audio", async () => {
  for (const kind of ["document-page", "message"] as const) {
    const f = fixture(kind), result = await f.resolver.resolve("tenant-a", f.locator);
    assert.equal(result?.quote, quote); assert.deepEqual(result?.sourceLocator, f.locator);
    assert.deepEqual(Object.keys(result!).sort(), ["quote", "sourceLocator", "title"]);
    assert.deepEqual(f.calls, ["tenant-a"]);
  }
});

test("bad locators and tenants fail before source read; strict variants reject fabricated times", async () => {
  const f = fixture();
  const invalid = [null, {}, { ...f.locator, documentId: undefined }, { ...f.locator, documentSourceId: undefined },
    { ...f.locator, headRevision: 0 }, { ...f.locator, headRevision: 1.5 }, { ...f.locator, pageNumber: 0 },
    { ...f.locator, sourceId: "\ud800" }, { ...f.locator, tStart: 0 }, { ...f.locator, revisionHash: "bad" },
    ...[{ start: -1 }, { end: 7 }, { end: 5008 }, { start: 7.5 }, { end: Number.MAX_SAFE_INTEGER + 1 }, { sha256: "BAD" }]
      .map(p => ({ ...f.locator, passage: { ...f.locator.passage, ...p } }))];
  for (const input of invalid) assert.equal(await f.resolver.resolve("tenant-a", input as NativeSourceLocator), null);
  assert.equal(await f.resolver.resolve(" tenant-a", f.locator), null);
  assert.deepEqual(f.calls, []);
});

test("foreign/native identity mismatches, absent head and old immutable body never authorize", async () => {
  const f = fixture(), original = f.get()!;
  for (const patch of [{ tenantId: "tenant-b" }, { sourceId: "other" }, { currentRevisionHash: undefined },
    { currentRevisionHash: sha("new head") }, { revisionHash: sha("different body") }, { eligible: false },
    { documentId: "other-document" }, { documentSourceId: "foreign-immutable-body" }, { headRevision: 1 }, { pageNumber: 1 },
    { kind: "message", threadId: "thread", messageId: "msg" },
    { text: "deleted passage" }, { text: original.text.replace("सही", "गलत") }]) {
    f.set({ ...original, ...patch } as NativeCurrentUnit);
    assert.equal(await f.resolver.resolve("tenant-a", f.locator), null, JSON.stringify(patch));
  }
  f.set(null); assert.equal(await f.resolver.resolve("tenant-a", f.locator), null);
});

test("message thread/message identity checked independently of matching text", async () => {
  const f = fixture("message"), original = f.get()!;
  for (const patch of [{ threadId: "other-thread" }, { messageId: "other-message" }]) {
    f.set({ ...original, ...patch } as NativeCurrentUnit);
    assert.equal(await f.resolver.resolve("tenant-a", f.locator), null);
  }
});

test("UTF16 offsets cannot split a source surrogate pair despite replacement-byte hash collision", async () => {
  const f = fixture(), text = f.get()!.text;
  for (const [start, end] of [[7, 8], [8, 9], [8, 11]]) {
    const passage = { start: start!, end: end!, sha256: sha(text.slice(start, end)) };
    assert.equal(await f.resolver.resolve("tenant-a", { ...f.locator, passage }), null);
  }
});

test("release revalidation reloads head/eligibility and rejects prior forged quote", async () => {
  const f = fixture(), evidence = (await f.resolver.resolve("tenant-a", f.locator))!;
  assert.equal(await f.resolver.revalidate("tenant-a", { ...evidence, quote: "invented" }), null);
  assert.equal((await f.resolver.revalidate("tenant-a", evidence))?.quote, quote);
  f.set({ ...f.get()!, currentRevisionHash: sha("replaced") });
  assert.equal(await f.resolver.revalidate("tenant-a", evidence), null);
  f.set(null); assert.equal(await f.resolver.revalidate("tenant-a", evidence), null);
  assert.equal(f.calls.length, 5);
});

test("locator is copied/frozen before awaiting loader; infrastructure remains unavailable", async () => {
  const f = fixture(); let release!: () => void;
  const barrier = new Promise<void>(r => { release = r; });
  const resolver = createNativeEvidenceResolver({ async loadCurrent(_tenant, locator) {
    assert.ok(Object.isFrozen(locator)); assert.ok(Object.isFrozen(locator.passage));
    await barrier; return f.get();
  } });
  const pending = resolver.resolve("tenant-a", f.locator);
  f.locator.passage.sha256 = sha("attacker rewrite"); release();
  assert.equal((await pending)?.quote, quote);
  assert.equal(parseNativeSourceLocator({ ...f.locator, passage: { ...f.locator.passage, sha256: sha(quote) } })?.kind, "document-page");
  const unavailable = createNativeEvidenceResolver({ async loadCurrent() { throw new Error("PRIVATE infrastructure detail"); } });
  await assert.rejects(unavailable.resolve("tenant-a", { ...f.locator, passage: { ...f.locator.passage, sha256: sha(quote) } }));
});
