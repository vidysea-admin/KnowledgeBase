/** Synthetic mounted vertical evidence. No live DB/provider/browser proof and no legacy corpus.
 * Publication, immutable PDF extraction, head CAS, resolver and Ask hydration are shipped code.
 * Missing mounted stages fail with HOLD explicitly; they are never skipped or replaced by fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Db } from "mongodb";
import { treeSearch } from "@lkb/index";
import { unpackContext } from "../../../../packages/ask/src/bounded-refine.js";
import { fakeComplete, fakeWrite } from "../../../../packages/ask/src/testUtils.js";
import { buildNativeProductionIntegrations } from "../composition/integrations/native-production.js";
import { trustedTreeReads } from "../composition/integrations/trusted-readers.js";
import { createMongoKnowledgeStore } from "../knowledge/collections-store.js";
import { createSourceRequestDepsFor } from "../ask/source-context.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { createServer } from "../server.js";
import { createMongoSearchDeps } from "../search-store.js";
import { createMongoEvidenceVerifier } from "../answer-policy/answer-evidence.js";
import { createAnswerWorkflow } from "../answer-policy/answer-workflow.js";
import { createAnswerPolicyService } from "../answer-policy/service.js";
import { createInMemoryAnswerPolicyStore } from "../answer-policy/store.js";
import { createInMemoryAnswerRecordStore } from "../answer-policy/answer-record-store.js";

type Row = Record<string, any>;
const TENANT = "native-vertical-public";
const HINDI = "करियर आवेदन अक्टूबर में खुलते हैं।";

/** Real one-page PDF with an explicit Unicode CMap; text is extracted by the actual upload route.
 * PDF fixture construction is unrelated to indexing/publication/head authority. */
function pdf(text: string): string {
  const units = [...text].map((c, i) => [i + 1, c.charCodeAt(0)] as const);
  assert.ok(units.length < 255 && units.every(([, unit]) => unit < 0xd800 || unit > 0xdfff));
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /PublicHindi def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${units.length} beginbfchar\n${units.map(([id, code]) => `<${id.toString(16).padStart(2, "0")}> <${code.toString(16).padStart(4, "0")}>`).join("\n")}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const stream = `BT /F1 12 Tf 40 750 Td <${units.map(([id]) => id.toString(16).padStart(2, "0")).join("")}> Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`];
  let body = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body, "ascii").toString("base64");
}

/** Mongo protocol only. No candidate, head, passage, resolver or retrieval decisions are mocked. */
function memoryDb() {
  const tables = new Map<string, Row[]>(), calls: string[] = [];
  const counters = { embedding: 0, vectors: 0 };
  const rows = (name: string) => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
  const at = (row: Row, path: string): any => path.split(".").reduce((value, key) => value?.[key], row);
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([key, expected]) => {
    if (key === "$and") return expected.every((part: Row) => matches(row, part));
    if (key === "$or") return expected.some((part: Row) => matches(row, part));
    const actual = at(row, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected) return (actual !== undefined) === expected.$exists;
      if ("$nin" in expected) return !expected.$nin.includes(actual);
      if ("$in" in expected) return expected.$in.includes(actual);
      if ("$eq" in expected) return actual === expected.$eq;
      throw new Error("Unsupported public fixture filter " + key);
    }
    return actual === expected;
  });
  const set = (row: Row, path: string, value: unknown) => {
    const keys = path.split("."); let target = row;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)!] = structuredClone(value);
  };
  const db = { databaseName: "synthetic-native-vertical",
    // Protocol fixture only: exercises the production snapshot wrapper without claiming MVCC.
    client: { startSession() { return { async withTransaction<T>(run: () => Promise<T>) { return run(); }, async endSession() {}, inTransaction() { return false; } }; } },
    collection(name: string) {
    if (/chunk|vector|embedding/i.test(name)) { counters.vectors++; throw new Error("Forbidden vector storage " + name); }
    if (!["sources", "tree_index", "document_documents", "turns", "sessions", "session_pages", "transcript_reviews", "whatsapp_candidates", "whatsapp_review_log", "claims"].includes(name)) {
      throw new Error("Unmeasured collection access " + name);
    }
    return {
      find(filter: Row) {
        calls.push(name + ".find"); let max = Infinity;
        const cursor = { limit(n: number) { max = n; return cursor; },
          async toArray() { return structuredClone(rows(name).filter(row => matches(row, filter)).slice(0, max)); } };
        return cursor;
      },
      async findOne(filter: Row) { calls.push(name + ".findOne"); return structuredClone(rows(name).find(row => matches(row, filter)) ?? null); },
      async insertOne(row: Row) {
        calls.push(name + ".insertOne");
        if (rows(name).some(old => old._id === row._id && old.tenantId === row.tenantId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        rows(name).push(structuredClone(row)); return { acknowledged: true, insertedId: row._id };
      },
      async updateOne(filter: Row, update: Row, options: Row = {}) {
        calls.push(name + ".updateOne"); let row = rows(name).find(row => matches(row, filter)); const inserted = !row;
        if (!row && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        if (!row) { row = structuredClone(filter); rows(name).push(row!); }
        for (const [key, value] of Object.entries(update.$set ?? {})) set(row!, key, value);
        if (inserted) for (const [key, value] of Object.entries(update.$setOnInsert ?? {})) set(row!, key, value);
        return { acknowledged: true, matchedCount: inserted ? 0 : 1, modifiedCount: 1, upsertedCount: inserted ? 1 : 0 };
      },
      async replaceOne(filter: Row, replacement: Row) {
        calls.push(name + ".replaceOne"); const i = rows(name).findIndex(row => matches(row, filter));
        if (i < 0) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        rows(name)[i] = structuredClone(replacement); return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      },
    };
  } } as unknown as Db;
  const forbiddenEmbed = async (): Promise<never> => { counters.embedding++; throw new Error("Forbidden embedding call"); };
  return { db, rows, calls, counters, forbiddenEmbed };
}

async function fixture(withPolicy = false) {
  const f = memoryDb(), knowledgeStore = createMongoKnowledgeStore(f.db);
  const native = buildNativeProductionIntegrations(f.db);
  assert.equal(typeof native.resolver.forReadView, "function", "Actual production factory must bind trusted-tree native authority");
  assert.equal(typeof native.graph.readSnapshot, "function", "Actual production graph reader must be available for request DI");
  const stages: string[] = [], writes = fakeWrite();
  let answerHook: (() => Promise<void>) | undefined;
  const complete = fakeComplete(job => {
    if (job.kind === "ask.select_nodes") {
      const prompt = job.messages[1]!.content;
      return { json: { node_ids: [...prompt.matchAll(/^- (.*?) \| /gm)].map(match => match[1]) } };
    }
    if (job.kind === "evaluator") return { text: JSON.stringify({ score: 0.95, reason: "Synthetic approved text-model relevance control" }) };
    if (job.kind === "ask.answer") {
      const context = unpackContext(JSON.parse(job.messages[1]!.content).context);
      assert.ok(context.length > 0); assert.equal(context[0]!.origin, "document-page");
      return { json: { sentences: [{ text: context[0]!.text, sourceIds: [context[0]!.sourceId] }] } };
    }
    if (job.kind === "ask.answer_grounding") return { json: { decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] } };
    throw new Error("Unexpected approved text-model job " + job.kind);
  });
  const requestDepsFor = createSourceRequestDepsFor({ db: f.db, treeSearchFn: treeSearch, write: writes,
    vectorless: true, embed: f.forbiddenEmbed,
    nativeSources: native.nativeSources, graph: native.graph,
    dispatch: async (job, tenantId) => {
      assert.equal(tenantId, TENANT);
      const result = await complete(job);
      if (job.kind === "ask.answer_grounding") await answerHook?.();
      return result;
    },
  });
  // Public in-memory record/policy persistence is a disclosed test boundary; freshness/release
  // uses the actual Mongo evidence verifier and the same factory resolver as citations and Ask.
  const policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore());
  const records = createInMemoryAnswerRecordStore();
  const workflow = withPolicy ? createAnswerWorkflow(policies, records,
    createMongoEvidenceVerifier(f.db, undefined, undefined, native.resolver)) : undefined;
  if (withPolicy) await policies.save(TENANT, "native-career", { questionClass: "career", mode: "internal-only",
    style: "detailed", onInsufficient: "review", citations: "required", note: "Synthetic native source policy" }, { actor: "synthetic-owner" });
  const deps = buildTestDeps({ keyStore: fakeKeyStore({ owner: { tenantId: TENANT, keyId: "synthetic-owner", scopes: ["ingest", "sessions", "citations", "search", "ask"] },
    foreign: { tenantId: "foreign", keyId: "synthetic-foreign", scopes: ["ingest", "sessions", "citations", "search", "ask"] },
    limited: { tenantId: TENANT, keyId: "synthetic-limited", scopes: ["search"] } }),
    knowledge: { store: knowledgeStore, nativeDocuments: native.headStore },
    nativeEvidence: native.resolver,
    search: createMongoSearchDeps({ db: f.db, nativeEvidence: native.resolver }),
    ...(workflow ? { answerWorkflow: workflow, answerPolicyService: policies } : {}),
    ask: { tree: trustedTreeReads(() => f.db, native.resolver),
      askDeps: requestDepsFor(TENANT), requestDepsFor, ...(workflow ? { answerWorkflow: workflow } : {}) },
  });
  const server = createServer(deps).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, method = "GET", body?: unknown, key = "owner") => fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = async (response: Response, status: number, stage: string): Promise<Row> => {
    const text = await response.text();
    assert.equal(response.status, status, `HOLD ${stage}: HTTP ${response.status} ${text.slice(0, 500)}`);
    let body: unknown;
    try { body = JSON.parse(text); } catch { assert.fail(`HOLD ${stage}: response must be JSON`); }
    stages.push(stage); assert.deepEqual(f.counters, { embedding: 0, vectors: 0 }, stage); return body as Row;
  };
  const upload = async (text = HINDI) => json(await call("/knowledge/documents", "POST", { title: "करियर आवेदन", format: "pdf", contentBase64: pdf(text) }), 200, "immutable real-page upload");
  const register = async () => (await json(await call("/knowledge/document-sources", "POST", { consentGiven: true }), 201, "verified consent registration")).sourceId as string;
  const publish = async (sourceId: string, doc: Row, revision: number | null) => json(await call(`/knowledge/document-sources/${encodeURIComponent(sourceId)}`, "PUT", {
    documentId: doc.id, documentSourceId: doc.sourceId, revisionHash: doc.version, expectedHeadRevision: revision,
  }), 200, "actual publication CAS");
  return { ...f, native, knowledgeStore, stages, complete, writes, call, json, upload, register, publish,
    setAnswerHook(hook?: () => Promise<void>) { answerHook = hook; },
    async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

test("native document vertical: actual mounted consent/upload/publication, Hindi source and request-bound Ask", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    await f.json(await f.call("/knowledge/document-sources", "POST", { consentGiven: false }), 400, "refuse absent consent");
    await f.json(await f.call("/knowledge/document-sources", "POST", { consentGiven: true }, ""), 401, "refuse unauthenticated source registration");
    const sourceId = await f.register(), doc = await f.upload();
    const page = await f.json(await f.call(`/knowledge/documents/${encodeURIComponent(doc.id)}/pages/1`), 200, "actual Hindi page read");
    assert.equal(page.text, HINDI, "Real PDF page must extract the Hindi fixture exactly");
    assert.equal(await f.native.headStore.loadPublished(TENANT, sourceId), null);
    await f.publish(sourceId, doc, null);
    assert.notEqual(sourceId, doc.id); assert.notEqual(sourceId, doc.sourceId);
    const locators = await f.native.listLocators(TENANT, { sourceId, revisionHash: doc.version });
    assert.ok(locators.length); assert.equal((await f.native.resolver.resolve(TENANT, locators[0]!))?.quote, HINDI);
    const search = await f.json(await f.call("/search?q=" + encodeURIComponent("आवेदन")), 200, "actual native keyword search");
    assert.equal(search.nativeTruncated, false, "HOLD: production native inventory/search must be configured");
    const hit = search.hits.find((row: Row) => row.nativeSourceLocator?.sourceId === sourceId);
    assert.ok(hit, "HOLD: actual native publication must be discoverable through shipped search");
    assert.deepEqual(Object.keys(hit).sort(), ["nativeSourceLocator", "score", "title"]);
    assert.equal("turnId" in hit, false); assert.equal("sessionId" in hit, false); assert.equal("quote" in hit, false);
    await f.json(await f.call("/search?q=" + encodeURIComponent("आवेदन"), "GET", undefined, ""), 401, "unauthenticated search refusal");
    const foreignSearch = await f.json(await f.call("/search?q=" + encodeURIComponent("आवेदन"), "GET", undefined, "foreign"), 200, "foreign search isolation");
    assert.deepEqual(foreignSearch.hits, []);
    const citation = await f.json(await f.call("/citations/native/resolve", "POST", { sourceLocator: hit.nativeSourceLocator }), 200, "actual search-to-mounted-native-citation");
    assert.equal(citation.evidence.quote, HINDI); assert.deepEqual(citation.evidence.sourceLocator, hit.nativeSourceLocator);
    await f.json(await f.call("/citations/native/resolve", "POST", { sourceLocator: locators[0] }, "foreign"), 404, "foreign native citation refusal");
    await f.json(await f.call("/citations/native/resolve", "POST", { sourceLocator: locators[0] }, "limited"), 403, "native citation scope refusal");
    const answer = await f.json(await f.call("/ask", "POST", { query: "आवेदन", filters: { mode: "deep" } }), 200, "actual createServer Ask request + native source context");
    assert.equal(answer.answer, HINDI);
    const proofs = answer.sources.internal.flatMap((node: Row) => node.evidence?.sourceQuotes ?? []);
    assert.ok(proofs.length); assert.ok(proofs.every((proof: Row) => proof.origin === "document-page" && proof.quote === HINDI));
    for (const proof of proofs) {
      assert.ok(await f.native.resolver.resolve(TENANT, proof.sourceLocator));
      assert.equal("turnId" in proof, false); assert.equal("tStart" in proof, false); assert.equal("sessionRef" in proof, false);
    }
    assert.ok(f.complete.calls.some(job => job.kind === "ask.answer"));
    assert.deepEqual(f.counters, { embedding: 0, vectors: 0 });
  } finally { await f.close(); }
});

test("native lifecycle vertical: retry/head advance/restart/body mutation/revoke/delete invalidate exact evidence", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const sourceId = await f.register(), first = await f.upload();
    const initial = await f.publish(sourceId, first, null);
    const old = (await f.native.listLocators(TENANT, { sourceId, revisionHash: first.version }))[0]!;
    const retry = await f.publish(sourceId, first, null); assert.deepEqual(retry, initial);
    assert.equal(f.rows("tree_index")[0]!.children.length, 1);
    const second = await f.upload("करियर आवेदन नवंबर में खुलते हैं।"); await f.publish(sourceId, second, 1);
    const reopened = buildNativeProductionIntegrations(f.db);
    assert.equal(typeof reopened.resolver.forReadView, "function"); assert.equal(typeof reopened.graph.readSnapshot, "function");
    assert.equal(await reopened.resolver.resolve(TENANT, old), null);
    await f.json(await f.call("/citations/native/resolve", "POST", { sourceLocator: old }), 404, "old head mounted citation refusal");
    assert.deepEqual(await reopened.listLocators(TENANT, { sourceId, revisionHash: first.version }), []);
    const current = (await reopened.listLocators(TENANT, { sourceId, revisionHash: second.version }))[0]!;
    assert.ok(await reopened.resolver.resolve(TENANT, current));
    assert.equal(await reopened.resolver.resolve("foreign", current), null);
    const updatedSearch = await f.json(await f.call("/search?q=" + encodeURIComponent("आवेदन")), 200, "head-advanced search consumes current publication");
    assert.ok(updatedSearch.hits.some((row: Row) => row.nativeSourceLocator?.revisionHash === second.version));
    assert.ok(!updatedSearch.hits.some((row: Row) => row.nativeSourceLocator?.revisionHash === first.version));
    const stored = f.rows("document_documents").find(row => row._id === second.id)!;
    const original = stored.pages[0].text; stored.pages[0].text = "अनधिकृत बदलाव";
    try { assert.equal(await reopened.resolver.resolve(TENANT, current), null); }
    finally { stored.pages[0].text = original; }
    await f.json(await f.call(`/knowledge/document-sources/${encodeURIComponent(sourceId)}/revoke`, "POST", { expectedHeadRevision: 2 }), 200, "mounted revoke CAS");
    assert.equal(await reopened.resolver.resolve(TENANT, current), null);
    const revokedSearch = await f.json(await f.call("/search?q=" + encodeURIComponent("आवेदन")), 200, "next-request revoked search refusal");
    assert.ok(!revokedSearch.hits.some((row: Row) => row.nativeSourceLocator?.sourceId === sourceId));
    await f.json(await f.call(`/knowledge/document-sources/${encodeURIComponent(sourceId)}`, "DELETE", { expectedHeadRevision: 3 }), 200, "mounted delete tombstone CAS");
    assert.equal(await reopened.headStore.loadPublished(TENANT, sourceId), null);
    assert.deepEqual(f.counters, { embedding: 0, vectors: 0 });
  } finally { await f.close(); }
});

test("native Ask vertical: deletion after grounding refuses the completed answer", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const sourceId = await f.register(), doc = await f.upload(); await f.publish(sourceId, doc, null);
    let triggered = false;
    f.setAnswerHook(async () => {
      triggered = true;
      await f.native.headStore.tombstone(TENANT, { sourceId, expectedHeadRevision: 1, status: "deleted" });
    });
    const response = await f.call("/ask", "POST", { query: "आवेदन", filters: { mode: "deep" } });
    const body = await f.json(response, 503, "post-grounding native authority refusal");
    assert.equal(triggered, true, "Attack must reach real answer-grounding callback");
    assert.equal("answer" in body, false);
    assert.ok(f.writes.writes.some(write => write.kind === "ask.source_context_refused"));
    assert.deepEqual(f.counters, { embedding: 0, vectors: 0 });
  } finally { await f.close(); }
});

test("native policy vertical: actual policy release and mounted history refuse advanced or revoked canonical evidence", { timeout: 30_000 }, async () => {
  for (const invalidation of ["head-advance", "revoke"] as const) {
    const f = await fixture(true);
    try {
      const sourceId = await f.register(), doc = await f.upload(); await f.publish(sourceId, doc, null);
      const answer = await f.json(await f.call("/ask", "POST", { query: "आवेदन", questionClass: "career",
        policyId: "native-career", policyVersion: 1, evidenceMode: true, filters: { sessionIds: [], sources: "internal", mode: "deep" } }),
      200, "actual native policy workflow release");
      assert.equal(answer.state, "allowed", "HOLD: native policy must independently authorize current exact source evidence");
      assert.equal(answer.answer, HINDI); assert.equal(answer.policy.policyId, "native-career");
      assert.ok(answer.sourceEvidence.length > 0); assert.ok(answer.runId);
      const historyPath = "/answer-history/" + encodeURIComponent(answer.runId);
      const current = await f.json(await f.call(historyPath), 200, "mounted current native answer history");
      assert.equal(current.result.answer, HINDI); assert.equal(current.result.state, "allowed");
      await f.json(await f.call(historyPath, "GET", undefined, "foreign"), 404, "foreign answer history refusal");
      if (invalidation === "head-advance") {
        const next = await f.upload("करियर आवेदन नवंबर में खुलते हैं।"); await f.publish(sourceId, next, 1);
      } else {
        await f.json(await f.call(`/knowledge/document-sources/${encodeURIComponent(sourceId)}/revoke`, "POST", { expectedHeadRevision: 1 }),
          200, "native policy source revocation");
      }
      const stale = await f.json(await f.call(historyPath), 200, "native policy history refuses " + invalidation);
      assert.equal(stale.result.state, "stale"); assert.equal(stale.result.answer, "");
      assert.deepEqual(stale.result.sourceEvidence, []); assert.deepEqual(stale.result.sources, { internal: [], web: [] });
      const list = await f.json(await f.call("/answer-history"), 200, "native policy history list refuses " + invalidation);
      const saved = list.history.find((row: Row) => row.id === answer.runId);
      assert.ok(saved); assert.equal(saved.result.state, "stale"); assert.equal(saved.result.answer, "");
      assert.ok(f.complete.calls.some(job => job.kind === "ask.answer"));
      assert.deepEqual(f.counters, { embedding: 0, vectors: 0 });
    } finally { await f.close(); }
  }
});

// Approved Hinglish WhatsApp remains a parent gate until the frozen authority owner supplies its real adapter.
