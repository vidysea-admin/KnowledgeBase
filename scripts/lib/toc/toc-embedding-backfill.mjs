/** Insert-only embeddings for one reviewed recovery packet; never run semantic indexing. */
import {createHash, randomUUID} from "node:crypto";
import {readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, existsSync, statfsSync} from "node:fs";
import {resolve, join, dirname, basename} from "node:path";
import {assertRecoveryPacketVerified, readRecoveryInputs, readRecoveryPacket} from "../toc-recovery.mjs";
import {requireRecoveryDatabase, RECOVERY_COLLECTIONS} from "../toc-recovery-import.mjs";
export const PACKET_ID = "477255b83bb0f001a7fce53d48af7631bdc8a92c2e24e85b3108a3c9ece749ef";
export const MODEL_DIGEST = "sha256:0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f";
export const WORK_DB = "lkb_work_20261009_01a11f9c";
export const LOCAL_MODEL = "http://127.0.0.1:11435";
export const PREFIX_POLICY = "nomic-rag-prefix-v1";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function requireTrue(ok, reason) {if (!ok) throw new Error(reason);}
export function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const documentHash = value => sha(JSON.stringify(canonical(value)));
function freeze(value) {if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value);} return value;}
export function requireEmbeddingTarget(env) {
  const target = requireRecoveryDatabase(env);
  requireTrue(target.url === "mongodb://127.0.0.1:27019" && target.dbName === WORK_DB &&
    env.OLLAMA_BASE_URL === LOCAL_MODEL, "embedding requires the exact reviewed isolated bindings");
  return target;
}
export function makeEmbeddingPlan(packet, {buildSourceSlices, embeddingInputs}) {
  assertRecoveryPacketVerified(packet);
  const {manifest, documents} = packet;
  requireTrue(manifest.packetId === PACKET_ID && manifest.tenantId === "toc" && documents.sessions.length === 29 &&
    documents.turns.length === 3424 && manifest.originalSessionIds.length === 23 && manifest.septemberSessionIds.length === 6,
    "reviewed source inventory differs");
  const rows = [], sessionIds = [...manifest.originalSessionIds, ...manifest.septemberSessionIds].sort();
  for (const sessionId of sessionIds) {
    const turns = documents.turns.filter(turn => turn.sessionId === sessionId);
    requireTrue(turns.length && turns.every(turn => turn.tenantId === "toc" && turn.recovery?.packetId === PACKET_ID), "invalid recovered turn ownership");
    for (const slice of buildSourceSlices(turns, 1024)) {
      const input = embeddingInputs({kind: "embedding", texts: [slice.text], purpose: "document"}, "nomic-embed-text")[0];
      requireTrue(input === `search_document: ${slice.text}` && Buffer.byteLength(slice.text) <= 1024, "document embedding purpose differs");
      const metadata = {sourceRef: sessionId, chunkIndex: slice.chunkIndex, baseChunkIndex: slice.baseChunkIndex,
        turnRefs: slice.turnRefs, sourceSpans: slice.sourceSpans, rawTextSha256: slice.rawTextSha256,
        embeddingInputSha256: sha(input), sourcePacketId: PACKET_ID, embeddingModelDigest: MODEL_DIGEST,
        embeddingPolicy: PREFIX_POLICY};
      rows.push({...metadata, _id: documentHash({tenantId: "toc", ...metadata}), text: slice.text});
    }
  }
  const binding = {version: 1, packetId: PACKET_ID, tenantId: "toc", database: WORK_DB, url: "mongodb://127.0.0.1:27019",
    modelEndpoint: LOCAL_MODEL, model: "nomic-embed-text", modelDigest: MODEL_DIGEST, dims: 768,
    prefixPolicy: PREFIX_POLICY, documentPrefix: "search_document: ", queryPrefix: "search_query: ",
    maxSliceBytes: 1024, byteOffsets: "UTF-8", characterOffsets: "UTF-16-code-units", numThread: 1, truncate: false,
    sourceCounts: manifest.counts, sourceHashes: manifest.hashes,
    sliceCount: rows.length, rawInputBytes: rows.reduce((n, row) => n + Buffer.byteLength(row.text), 0),
    embeddingInputBytes: rows.reduce((n, row) => n + Buffer.byteLength(`search_document: ${row.text}`), 0),
    planSha256: documentHash(rows.map(({text: _text, ...metadata}) => metadata))};
  return freeze({binding, rows, documents});
}
export async function assertSourceDatabase(plan, db, scoped) {
  requireTrue(db.databaseName === WORK_DB, "unapproved embedding destination");
  for (const name of RECOVERY_COLLECTIONS) {
    const observed = await scoped(db, name)("toc").find({}).toArray();
    const expected = plan.documents[name];
    const order = rows => [...rows].sort((a, b) => a._id.localeCompare(b._id));
    requireTrue(documentHash(order(observed)) === documentHash(order(expected)), "recovered source database differs; embeddings refused");
  }
}
export async function assertBatchSources(batch, plan, db, scoped) {
  const ids = [...new Set(batch.flatMap(row => row.turnRefs))];
  const current = await scoped(db, "turns")("toc").find({_id: {$in: ids}}).toArray();
  const expected = plan.documents.turns.filter(turn => ids.includes(turn._id));
  const order = rows => [...rows].sort((a, b) => a._id.localeCompare(b._id));
  requireTrue(documentHash(order(current)) === documentHash(order(expected)), "batch source binding changed");
}
export function validateStoredRow(row, planned) {
  requireTrue(row.tenantId === "toc" && row._id === planned._id && row.dims === 768 && row.embeddingModel === "nomic-embed-text" &&
    row.embeddingModelDigest === MODEL_DIGEST && row.embeddingPolicy === PREFIX_POLICY && row.sourcePacketId === PACKET_ID &&
    Array.isArray(row.vector) && row.vector.length === 768 && row.vector.every(Number.isFinite) && row.vector.some(n => n !== 0),
    "invalid or mixed embedding row");
  for (const key of ["sourceRef", "chunkIndex", "baseChunkIndex", "turnRefs", "sourceSpans", "rawTextSha256", "embeddingInputSha256"])
    requireTrue(documentHash(row[key]) === documentHash(planned[key]), "embedding source binding differs");
}
/** Administrative count is used only inside the approved DB to detect foreign presence, never exposed. */
export async function preflightChunks(plan, {db, scoped, receipt, loadSpool}) {
  requireTrue(db.databaseName === WORK_DB, "unapproved embedding destination");
  const own = scoped(db, "chunks")("toc");
  requireTrue(await db.collection("chunks").countDocuments({}) === await own.countDocuments({}), "foreign embedding presence; refusing before writes");
  const existing = await own.find({}).toArray();
  if (!receipt) {requireTrue(existing.length === 0, "initial embedding destination is not empty"); return new Map();}
  requireTrue(documentHash(receipt.binding) === documentHash(plan.binding), "resume binding differs");
  const intended = new Map(), plannedById = new Map(plan.rows.map(row => [row._id, row]));
  for (const intent of receipt.intents) {
    const docs = loadSpool(intent);
    requireTrue(docs.length === intent.rows.length, "resume spool inventory differs");
    for (const doc of docs) {
      const planned = plannedById.get(doc._id); requireTrue(planned, "unknown resume source row");
      validateStoredRow(doc, planned);
      requireTrue(intent.rows.some(row => row.id === doc._id && row.sha256 === documentHash(doc)) && !intended.has(doc._id), "resume row hash differs");
      intended.set(doc._id, doc);
    }
  }
  for (const doc of existing) {
    const intendedDoc = intended.get(doc._id); requireTrue(intendedDoc && documentHash(doc) === documentHash(intendedDoc), "existing embedding row is not verified receipt data");
  }
  return new Map(existing.map(doc => [doc._id, doc]));
}
/** Bound actual fetch, never mock results or allow cloud fallback from this job. */
export async function withLocalEmbeddingHttp(run, timeoutMs = 60_000) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requireTrue(url === `${LOCAL_MODEL}/api/embed` || url === `${LOCAL_MODEL}/api/tags`, "embedding job attempted an unapproved network destination");
    const timeout = AbortSignal.timeout(timeoutMs);
    return original(input, {...init, redirect: "error", signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout});
  };
  try {return await run();} finally {globalThis.fetch = original;}
}
async function assertModel() {
  const response = await fetch(`${LOCAL_MODEL}/api/tags`); requireTrue(response.ok, "local model metadata unavailable");
  const tags = await response.json(), entry = tags.models?.find(model => model.name === "nomic-embed-text:latest");
  requireTrue(entry && `sha256:${entry.digest}` === MODEL_DIGEST, "local model digest differs");
}
export function openReceipt(path, plan, resumeSha) {
  const file = resolve(path), spool = `${file}.spool`, lock = `${file}.lock`, owner = randomUUID();
  writeFileSync(lock, owner, {flag: "wx"});
  let receipt, currentHash;
  try {
    if (resumeSha) {
      requireTrue(/^[a-f0-9]{64}$/.test(resumeSha), "approved resume digest required");
      const bytes = readFileSync(file); requireTrue(sha(bytes) === resumeSha, "resume receipt is not the approved bytes");
      receipt = JSON.parse(bytes); currentHash = sha(bytes);
      requireTrue(receipt.version === 1 && Array.isArray(receipt.intents) && documentHash(receipt.binding) === documentHash(plan.binding), "resume receipt authority differs");
    } else {
      requireTrue(!existsSync(file) && !existsSync(spool), "new receipt destination required");
      receipt = {version: 1, runId: owner, binding: plan.binding, status: "preflight", intents: [], confirmedIds: [], semanticAcceptance: false,
        strictIndexAcceptance: false, liveAskAcceptance: false};
      writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, {flag: "wx"}); currentHash = sha(readFileSync(file));
    }
    mkdirSync(spool, {recursive: true});
    const record = () => {
      requireTrue(sha(readFileSync(file)) === currentHash, "receipt changed outside this job");
      const temporary = `${file}.${owner}.tmp`;
      try {writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {flag: "wx"}); renameSync(temporary, file); currentHash = sha(readFileSync(file));}
      finally {rmSync(temporary, {force: true});}
    };
    const loadSpool = intent => {
      requireTrue(/^batch-[0-9]+-[a-f0-9]{64}\.json$/.test(intent.file), "invalid resume spool name");
      const bytes = readFileSync(join(spool, basename(intent.file)));
      requireTrue(sha(bytes) === intent.sha256, "resume spool bytes changed"); return JSON.parse(bytes);
    };
    const stage = docs => {
      const bytes = Buffer.from(JSON.stringify(docs)), digest = sha(bytes), name = `batch-${receipt.intents.length}-${digest}.json`;
      writeFileSync(join(spool, name), bytes, {flag: "wx"});
      const intent = {file: name, sha256: digest, rows: docs.map(doc => ({id: doc._id, sha256: documentHash(doc)}))};
      receipt.intents.push(intent); receipt.status = "writing"; record(); return intent;
    };
    return {receipt, record, loadSpool, stage, storagePath: dirname(file), close: () => {requireTrue(readFileSync(lock, "utf8") === owner, "receipt lock ownership changed"); rmSync(lock);}};
  } catch (error) {if (readFileSync(lock, "utf8") === owner) rmSync(lock); throw error;}
}
export async function executeEmbeddingPlan(plan, {db, scoped, embed, prepareChunkDocuments, journal, assertModelBinding,
  assertSources = assertSourceDatabase, assertBatch = assertBatchSources, maxBatches = Infinity,
  availableBytes = () => {const disk = statfsSync(journal.storagePath); return disk.bavail * disk.bsize;}}) {
  const reserve = () => requireTrue(availableBytes() >= 50 * 1024 * 1024, "embedding disk reserve exhausted");
  reserve();
  const {receipt, record, loadSpool, stage} = journal; const existing = await preflightChunks(plan, {db, scoped,
    receipt: receipt.intents.length ? receipt : null, loadSpool});
  await assertSources(plan, db, scoped); await assertModelBinding();
  const own = scoped(db, "chunks")("toc");
  const insert = async docs => {
    const missing = docs.filter(doc => !existing.has(doc._id));
    if (!missing.length) return;
    reserve();
    requireTrue(await own.countDocuments({}) === existing.size && await db.collection("chunks").countDocuments({}) === existing.size, "chunk inventory changed before insertion");
    await assertBatch(missing, plan, db, scoped); await assertModelBinding();
    try {
      const result = await own.insertMany(missing.map(({tenantId: _tenant, ...doc}) => doc));
      requireTrue(result.insertedCount === missing.length, "partial vector insertion");
    } finally {
      const seen = await own.find({_id: {$in: missing.map(doc => doc._id)}}).toArray();
      for (const doc of seen) {
        const expected = missing.find(row => row._id === doc._id);
        requireTrue(expected && documentHash(doc) === documentHash(expected), "inserted vector hash differs"); existing.set(doc._id, doc);
      }
      receipt.confirmedIds = [...existing.keys()].sort(); record();
    }
  };
  for (const intent of receipt.intents) await insert(loadSpool(intent));
  let batches = 0;
  for (let offset = 0; offset < plan.rows.length; offset += 8) {
    const batch = plan.rows.slice(offset, offset + 8).filter(row => !existing.has(row._id));
    if (!batch.length) continue;
    if (batches >= maxBatches) {receipt.status = "partial-source-embeddings"; record(); return receipt;}
    reserve(); await assertBatch(batch, plan, db, scoped); await assertModelBinding();
    receipt.status = "embedding"; record();
    const result = await embed({kind: "embedding", texts: batch.map(row => row.text), purpose: "document"});
    requireTrue(result.provider === "ollama" && result.model === "nomic-embed-text" && result.dims === 768 &&
      result.vectors.length === batch.length && result.vectors.every(vector => vector.length === 768 && vector.every(Number.isFinite) && vector.some(n => n !== 0)), "invalid pinned model vectors");
    const docs = batch.map((row, index) => {
      const prepared = prepareChunkDocuments("toc", row.sourceRef, [{chunkIndex: row.chunkIndex, text: row.text, turnRefs: row.turnRefs}],
        {...result, vectors: [result.vectors[index]]})[0];
      const {text: _text, ...metadata} = row;
      return freeze({...prepared, ...metadata});
    });
    docs.forEach((doc, index) => validateStoredRow(doc, batch[index])); reserve(); stage(docs); await insert(docs); batches++;
  }
  await assertSources(plan, db, scoped); await assertModelBinding();
  requireTrue(existing.size === plan.rows.length && await own.countDocuments({}) === plan.rows.length &&
    await db.collection("chunks").countDocuments({}) === plan.rows.length, "embedding final inventory differs");
  receipt.status = "complete-source-embeddings"; receipt.completedAt = new Date().toISOString(); record(); return receipt;
}
export async function runRecoveryEmbeddingBackfill(args, {root}) {
  const names = new Set(["--dry-run", "--apply", "--packet", "--receipt", "--resume-receipt-sha256", "--max-batches"]);
  for (let i = 0; i < args.length; i++) {requireTrue(names.has(args[i]), "unknown recovery embedding argument"); if (!["--dry-run", "--apply"].includes(args[i])) i++;}
  const option = name => {const i = args.indexOf(name); if (i < 0) return undefined; requireTrue(args[i + 1] && !args[i + 1].startsWith("--"), "missing recovery embedding option"); return args[i + 1];};
  requireTrue(args.includes("--dry-run") !== args.includes("--apply"), "choose one dry-run or apply mode");
  const packetPath = option("--packet"); requireTrue(packetPath, "verified recovery packet required");
  const {buildTree, buildSourceSlices} = await import("../../../packages/index/src/index.ts");
  const {ollamaEmbeddingInputs} = await import("../../../packages/ai/src/providers/ollama.ts");
  const snapshot = readRecoveryInputs(join(root, "data/toc-migrated"), join(root, "data/eval/extraction-reconciliation-reviewed.json"), join(root, "data/eval/extraction-corpus.json"));
  const packet = readRecoveryPacket(resolve(packetPath), snapshot, buildTree);
  const plan = makeEmbeddingPlan(packet, {buildSourceSlices, embeddingInputs: ollamaEmbeddingInputs});
  if (args.includes("--dry-run")) {console.log(JSON.stringify({status: "dry-run-no-database-or-model", slices: plan.rows.length, rawBytes: plan.binding.rawInputBytes,
    inputBytes: plan.binding.embeddingInputBytes, planSha256: plan.binding.planSha256, semanticAcceptance: false})); return;}
  const target = requireEmbeddingTarget(process.env), receiptPath = option("--receipt"); requireTrue(receiptPath, "durable receipt required");
  const {connect, close, scopedCollection} = await import("../../../packages/db/src/index.ts");
  const {prepareChunkDocuments} = await import("../../../apps/api/src/indexing/session.ts");
  const {buildRouting} = await import("../../../apps/api/src/composition/production.ts");
  const journal = openReceipt(receiptPath, plan, option("--resume-receipt-sha256"));
  try {
    const db = await connect(target.url, target.dbName), provider = buildRouting().providers.ollama;
    const maxBatches = option("--max-batches") === undefined ? Infinity : Number(option("--max-batches"));
    requireTrue(maxBatches === Infinity || Number.isSafeInteger(maxBatches) && maxBatches > 0, "invalid batch limit");
    const receipt = await withLocalEmbeddingHttp(() => executeEmbeddingPlan(plan, {db, scoped: scopedCollection,
      embed: job => provider.embed(job), prepareChunkDocuments, journal, assertModelBinding: assertModel, maxBatches}));
    console.log(JSON.stringify({status: receipt.status, confirmed: receipt.confirmedIds.length, expected: plan.rows.length,
      modelDigest: MODEL_DIGEST, dims: 768, semanticAcceptance: false, strictIndexAcceptance: false, liveAskAcceptance: false}));
    if (receipt.status !== "complete-source-embeddings") process.exitCode = 1;
  } catch {
    journal.receipt.status = "partial-or-refused-source-embeddings"; journal.receipt.failure = "Embedding refused or interrupted; preserve the packet, spool and receipt for approved resume.";
    journal.record(); throw new Error("recovery embeddings refused or interrupted; inspect durable receipt");
  } finally {await close(); journal.close();}
}
