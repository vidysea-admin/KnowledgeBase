/** Prepared acceptance fixture only. No .env loader, DDL, alternate DB or service lifecycle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const owned = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(owned, '../../..');
const DATABASE = 'lkb_staging';
const WRITE = ['sources', 'sessions', 'turns', 'claims', 'session_pages', 'chunks', 'tree_index',
  'graph_edges', 'topics', 'orgs', 'transcript_reviews', 'transcript_review_revisions'];
const READ = [...WRITE, 'whatsapp_candidates', 'whatsapp_review_log'];
const enabled = process.env.LKB_T054_MONGO_RUN === '1';
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const canonical = (v: any): string => JSON.stringify(v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))]))
  : Array.isArray(v) ? v.map(x => JSON.parse(canonical(x))) : v ?? null);

test('SAFE staging-only T054 native transaction candidate', { skip: !enabled, timeout: 90000 }, async t => {
  // These controls authorize no execution themselves. The broker supplies them only after its lease/grant.
  assert.equal(process.env.LKB_T054_MONGO_DB, DATABASE, 'HOLD: explicit staging database required');
  assert.equal(process.env.LKB_ALLOW_STAGING, DATABASE, 'HOLD: explicit staging opt-in required');
  assert.equal(process.env.LKB_T054_BROKER_LEASE, 'held', 'HOLD: coordinator CPU/database lease required');
  assert.ok(!Object.keys(process.env).some(k => /^MONGODB_LOG_/i.test(k) && process.env[k] !== ''), 'HOLD: driver logging configuration');
  const url = process.env.LKB_T054_MONGO_URL;
  assert.ok(url, 'HOLD: privately supplied existing-server URI required');
  assert.match(process.env.LKB_T054_SOURCE_SHA ?? '', /^[a-f0-9]{40,64}$/, 'HOLD: candidate source identity required');
  const require = createRequire(path.join(root, 'apps/api/package.json'));
  const { MongoClient } = require('mongodb');
  const clientOptions = { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 8000,
    timeoutMS: 9000, maxPoolSize: 2, minPoolSize: 0 };
  let client = new MongoClient(url, clientOptions);
  let raw: any = client.db(DATABASE);
  const run = randomUUID();
  const tenant = `qa_t054_${run.replaceAll('-', '')}`;
  const ids = { session: `${run}:session`, source: `${run}:source`, turn: `${run}:turn`,
    reviewedTurn: `${run}:reviewed-turn`, reviewedClaim: `${run}:reviewed-claim` };
  const journal: Record<string, Set<string>> = Object.fromEntries(WRITE.map(n => [n, new Set<string>()]));
  let manifestPath: string | undefined;
  let writing = false;
  let attemptCount = 0;
  let phase = 'readiness';
  let result: 'PREPARED' | 'PASS-CANDIDATE' | 'HOLD' | 'FAIL' = 'PREPARED';
  const manifest: any = { version: 1, run, tenant, ids, database: DATABASE, sourceSha: process.env.LKB_T054_SOURCE_SHA,
    createdUtc: new Date().toISOString(), runtime: { executable: process.execPath, version: process.version },
    sourcePins: {}, ownedIds: {}, writeAttempts: 0, phase, result, cleanup: 'not-started',
    noProviderCalls: true, reconnectIsNotProcessRestart: true };
  const save = () => {
    if (!manifestPath) return;
    manifest.ownedIds = Object.fromEntries(WRITE.map(n => [n, [...journal[n]!].sort()]));
    manifest.writeAttempts = attemptCount; manifest.phase = phase; manifest.result = result;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  };
  const remember = (name: string, id: unknown) => {
    assert.equal(typeof id, 'string', 'Unexpected generated ID type');
    journal[name]!.add(id as string); save();
  };
  const scoped = (filter: any) => assert.equal(filter?.tenantId, tenant, 'Unowned tenant operation refused');
  // No client.db escape: refresh gets only startSession; its real transaction view wraps guarded collections.
  const guarded: any = new Proxy({}, { get(_target, key) {
    if (key === 'client') return { startSession: (...args: any[]) => client.startSession(...args) };
    if (key !== 'collection') throw new Error('Unsupported database operation refused');
    return (name: string) => {
      assert.ok(READ.includes(name), 'Unknown collection refused');
      const collection = raw.collection(name);
      return new Proxy({}, { get(_c, method) {
        assert.ok(typeof method === 'string' && ['find', 'findOne', 'countDocuments', 'distinct',
          'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'].includes(method), 'Unsupported collection operation refused');
        return (...args: any[]) => {
          const m = method as string;
          const mutates = /^(insert|update|replace|delete)/.test(m);
          if (!mutates) { scoped(args[m === 'distinct' ? 1 : 0]); return collection[m](...args); }
          assert.ok(writing && WRITE.includes(name), 'Unapproved write refused');
          if (m === 'insertOne' || m === 'insertMany') {
            const docs = m === 'insertOne' ? [args[0]] : args[0];
            for (const doc of docs) { scoped(doc); remember(name, doc._id); }
          } else {
            scoped(args[0]);
            const update = args[1];
            if (m === 'replaceOne') { scoped(update); remember(name, update._id); }
            if (m.startsWith('update')) {
              assert.ok(!Array.isArray(update), 'Update pipeline refused');
              for (const [operator, body] of Object.entries(update ?? {})) {
                assert.ok(['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet', '$pull'].includes(operator), 'Unknown update operator refused');
                for (const field of Object.keys(body as object)) {
                  assert.ok(!field.startsWith('tenantId.') && (field !== 'tenantId' ||
                    (['$set', '$setOnInsert'].includes(operator) && (body as any)[field] === tenant)), 'Tenant mutation refused');
                  assert.ok(field !== '_id' || (body as any)[field] === args[0]._id, 'ID mutation refused');
                }
              }
              if (args[2]?.upsert) remember(name, args[0]._id);
            }
          }
          // Persist every potential inserted identity BEFORE issuing its operation, including aborted transaction IDs.
          attemptCount++; save();
          return collection[m](...args);
        };
      } });
    };
  } });
  try {
    await client.connect();
    const topology = await raw.command({ hello: 1, maxTimeMS: 8000 });
    if (!(typeof topology.setName === 'string' && topology.setName && topology.isWritablePrimary === true &&
      typeof topology.logicalSessionTimeoutMinutes === 'number' && topology.maxWireVersion >= 7)) {
      result = 'HOLD'; t.diagnostic('HOLD: existing Mongo is not an authenticated writable replica-set primary; database writes=0');
      t.skip('Native transaction prerequisite unavailable; no database mutation attempted'); return;
    }
    // listCollections is filtered to public schema names; never enumerate documents outside the fresh tenant.
    const infos = await raw.listCollections({ name: { $in: READ } }, { nameOnly: false, maxTimeMS: 8000 }).toArray();
    assert.ok(READ.every(n => infos.some((x: any) => x.name === n && x.type === 'collection')), 'HOLD: required canonical collection absent/view');
    const specs = JSON.parse(fs.readFileSync(path.join(root, 'schema/index.json'), 'utf8'));
    const readiness: any = {};
    for (const name of READ) {
      const indexes = await raw.collection(name).listIndexes({ maxTimeMS: 8000 }).toArray();
      for (const spec of specs[name] ?? []) {
        assert.ok(indexes.some((actual: any) => canonical(actual.key) === canonical(spec.keys) &&
          ['unique', 'sparse', 'partialFilterExpression', 'expireAfterSeconds', 'collation'].every(k =>
            canonical(actual[k] ?? (['unique', 'sparse'].includes(k) ? false : null)) ===
            canonical(spec[k] ?? (['unique', 'sparse'].includes(k) ? false : null)))), 'HOLD: canonical index prerequisite absent');
      }
      assert.equal(await raw.collection(name).countDocuments({ tenantId: tenant }, { maxTimeMS: 8000 }), 0, 'HOLD: QA tenant collision');
      readiness[name] = { indexesHash: sha(canonical(indexes)), validatorHash: sha(canonical(infos.find((x: any) => x.name === name)?.options?.validator ?? null)) };
    }
    if (process.env.LKB_T054_WRITE_GRANT !== 'bounded-owned-fixtures') {
      result = 'HOLD'; t.diagnostic('HOLD: read-only prerequisites satisfied; separate bounded fixture-write grant missing; writes=0');
      t.skip('Readiness only: no fixture-write authorization'); return;
    }
    const dir = path.join(owned, `run-${run}`);
    fs.mkdirSync(dir); // exclusive ownership: never reuse a prior directory
    manifestPath = path.join(dir, 'ownership.json');
    fs.writeFileSync(manifestPath, '{}', { flag: 'wx', mode: 0o600 });
    manifest.readiness = readiness;
    for (const p of ['qa/evidence/native-acceptance-preflight/t054-staging-native.test.ts', 'schema/index.json',
      'apps/api/src/transcript-review/service.ts', 'apps/api/src/transcript-review/store.ts',
      'apps/api/src/transcript-review/refresh-executor.ts', 'apps/api/src/transcript-review/transaction-db.ts',
      'apps/api/src/transcript-review/effective-reader.ts', 'apps/api/src/indexing/session.ts',
      'apps/api/src/indexing/generation.ts', 'apps/api/src/indexing/chunk-write.ts',
      'apps/api/src/indexing/promote-entities.ts', 'apps/api/src/indexing/grounded-write.ts',
      'apps/api/src/grounded-content/reader.ts', 'packages/db/src/lib/tenantScope.ts']) {
      manifest.sourcePins[p] = sha(fs.readFileSync(path.join(root, p)));
    }
    save();
    const { commitReview, loadReview, loadReviewHistory, runRefresh } = await import('../../../apps/api/src/transcript-review/service.js');
    const { createMongoReviewStore } = await import('../../../apps/api/src/transcript-review/store.js');
    const { createTranscriptRefreshExecutor } = await import('../../../apps/api/src/transcript-review/refresh-executor.js');
    const { indexSession } = await import('../../../apps/api/src/indexing/session.js');
    const { readEffectiveTurns } = await import('../../../apps/api/src/transcript-review/effective-reader.js');
    const { createGroundedContentDeps } = await import('../../../apps/api/src/grounded-content/reader.js');
    const TEXT = 'The programme fee is 1,000 rupees today.';
    const complete = async (job: { messages: { content: string }[] }) => {
      const p = JSON.parse(job.messages[1]!.content);
      const item = { text: TEXT, origin: 'speaker-statement', verification: 'unverified',
        evidence: [{ turnId: ids.turn, sessionId: ids.session, quote: TEXT }] };
      const output = p.phase === 'extract-summary' ? { processed: p.inventory, items: [{ ...item, kind: 'insight' }], qa: [] }
        : p.phase === 'extract-claims' ? { processed: p.inventory, claims: [item] }
        : { processed: p.inventory, complete: true, noContent: false, noClaims: false,
          verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
      return { text: JSON.stringify(output), usage: { inputTokens: 0, outputTokens: 0 }, provider: 'fixture', model: 'fixture', costUsd: 0 };
    };
    phase = 'fixtures'; writing = true; save();
    const original = { _id: ids.turn, tenantId: tenant, sessionId: ids.session, speakerRef: 'spk:0',
      text: 'The programme fee is 2,000 rupees today.', tStart: 0, tEnd: 4 };
    await guarded.collection('turns').insertOne(original);
    await guarded.collection('turns').insertOne({ _id: ids.reviewedTurn, tenantId: tenant, sessionId: ids.session,
      speakerRef: 'spk:0', text: 'Admissions are open.', tStart: 5, tEnd: 7 });
    await guarded.collection('sources').insertOne({ _id: ids.source, tenantId: tenant, kind: 'recording', path: `offline-fixture/${run}` });
    await guarded.collection('sessions').insertOne({ _id: ids.session, tenantId: tenant, sourceId: ids.source,
      title: 'Fees', org: 'Acme University', date: '2026-10-14', status: { transcribe: 'done', index: 'pending' } });
    await guarded.collection('claims').insertOne({ _id: ids.reviewedClaim, tenantId: tenant, text: 'Admissions are open.', status: 'verified',
      evidence: [{ turnId: ids.reviewedTurn, sessionId: ids.session, quote: 'Admissions are open.' }], topicRefs: [] });
    let store = createMongoReviewStore(guarded);
    const request = (revision: string, text: string) => ({ tenantId: tenant, sessionId: ids.session, actorRef: 'apikey:fixture',
      now: new Date().toISOString(), request: { expectedRevision: revision, reason: 'Synthetic recording checked', corrections: [{ turnId: ids.turn, text }] } });
    const r0 = (await loadReview(store, tenant, ids.session)).snapshot.revision;
    const receipt = await commitReview(store, { ...request(r0, TEXT), request: { ...request(r0, TEXT).request,
      mapping: { turnIds: [ids.turn], speakerRef: `person:${run}`, speakerLabel: 'Mapped speaker' } } });
    const realIndex: Parameters<typeof createTranscriptRefreshExecutor>[0]['index'] = (tId, sId, view) =>
      indexSession(tId, sId, { db: view, complete: complete as never, extractDecisions: false, suggestSpeakers: false,
        retrievalMode: 'vectorless', embed: async () => { assert.fail('Embedding calls forbidden'); }, strictWebinar: true, dropUnverified: true });
    phase = 'real-refresh'; save();
    assert.equal((await runRefresh(store, createTranscriptRefreshExecutor({ db: guarded, index: realIndex }), tenant, ids.session))?.status, 'complete');
    await client.close();
    client = new MongoClient(url, clientOptions); await client.connect(); raw = client.db(DATABASE);
    const reconnectHello = await raw.command({ hello: 1, maxTimeMS: 8000 });
    assert.equal(reconnectHello.setName, topology.setName, 'Replica identity changed on reconnect');
    assert.equal(reconnectHello.isWritablePrimary, true);
    store = createMongoReviewStore(guarded);
    assert.equal((await loadReview(store, tenant, ids.session)).snapshot.revision, receipt.revision);
    assert.equal((await loadReviewHistory(store, tenant, ids.session))[0]!.changes[0]!.after.text, TEXT);
    assert.equal((await guarded.collection('turns').findOne({ tenantId: tenant, _id: ids.turn }))!.text, original.text);
    assert.equal((await readEffectiveTurns(guarded, tenant, [original], ids.session))[0]!.text, TEXT);
    assert.equal(await guarded.collection('claims').countDocuments({ tenantId: tenant, _id: ids.reviewedClaim, status: 'verified' }), 1);
    for (const name of ['session_pages', 'chunks', 'tree_index', 'graph_edges']) assert.ok(await guarded.collection(name).countDocuments({ tenantId: tenant }));
    const content = await createGroundedContentDeps({ async getSessionDetail(tenantId, sessionId) {
      assert.equal(tenantId, tenant); assert.equal(sessionId, ids.session);
      const turns = await guarded.collection('turns').find({ tenantId, sessionId }).toArray();
      return { session: await guarded.collection('sessions').findOne({ _id: sessionId, tenantId }),
        page: await guarded.collection('session_pages').findOne({ tenantId, sessionId }),
        claims: await guarded.collection('claims').find({ tenantId, 'evidence.sessionId': sessionId }).toArray(),
        turns: await readEffectiveTurns(guarded, tenantId, turns as never, sessionId) } as never;
    } }).getGroundedContent(tenant, ids.session);
    assert.ok(content?.notes.length);
    assert.ok(content!.notes.every(n => n.evidence.every(e => e.available && e.quote === TEXT && e.speaker === 'Mapped speaker')));
    phase = 'transaction-supersession'; save();
    const prior = await commitReview(store, request(receipt.revision, TEXT + ' This is the current fee.'));
    const derived = ['session_pages', 'chunks', 'tree_index', 'graph_edges'];
    const snapshot = async () => Promise.all(derived.map(name => guarded.collection(name).find({ tenantId: tenant }).sort({ _id: 1 }).toArray()));
    const before = await snapshot();
    let superseded = false;
    const executor = createTranscriptRefreshExecutor({ db: guarded, index: async (tId, sId, view) => {
      const indexed = await realIndex(tId, sId, view);
      if (!superseded) { superseded = true; await commitReview(store, request(prior.revision, TEXT + ' Ask the office for confirmation.')); }
      return indexed;
    } });
    await assert.rejects(executor({ tenantId: tenant, sessionId: ids.session, revision: prior.revision, target: 'claims' }));
    assert.equal(superseded, true, 'Failure before actual concurrent correction is not publication-fence proof');
    assert.deepEqual(await snapshot(), before, 'No superseded derived generation published');
    assert.equal((await loadReview(store, tenant, ids.session)).refresh?.status, 'pending');
    result = 'PASS-CANDIDATE'; save();
  } catch (error) {
    result = writing ? 'FAIL' : 'HOLD';
    // No raw driver exception can reach TAP output; receipts contain only fixed classes/codes.
    manifest.failure = { name: /^[A-Za-z][A-Za-z0-9]{0,79}$/.test((error as any)?.name ?? '') ? (error as any).name : 'Error',
      code: Number.isSafeInteger((error as any)?.code) ? (error as any).code : null };
    save(); throw new Error(`${result}: native candidate unsuccessful; inspect bounded private broker evidence`);
  } finally {
    writing = false;
    try {
      if (manifestPath) {
        phase = 'cleanup'; manifest.cleanup = 'pending'; save();
        const onDisk = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.equal(onDisk.run, run); assert.equal(onDisk.tenant, tenant); assert.equal(onDisk.database, DATABASE);
        assert.equal(canonical(onDisk.ownedIds), canonical(Object.fromEntries(WRITE.map(n => [n, [...journal[n]!].sort()]))));
        // Never discover-and-delete arbitrary tenant records: only IDs journaled before harness writes.
        for (const name of WRITE) {
          const rows = await raw.collection(name).find({ tenantId: tenant }, { projection: { _id: 1 }, maxTimeMS: 8000 }).toArray();
          assert.ok(rows.every((r: any) => journal[name]!.has(r._id)), 'Unjournaled record: cleanup HOLD');
        }
        for (const name of [...WRITE].reverse()) {
          const ownedIds = [...journal[name]!];
          if (ownedIds.length) await raw.collection(name).deleteMany({ tenantId: tenant, _id: { $in: ownedIds } }, { maxTimeMS: 8000 });
          assert.equal(await raw.collection(name).countDocuments({ tenantId: tenant }, { maxTimeMS: 8000 }), 0, 'Owned cleanup incomplete');
        }
        manifest.cleanup = 'verified-owned-records-absent'; save();
      }
    } catch {
      manifest.cleanup = 'HOLD-manual-owned-recovery-required'; result = 'HOLD'; save();
      throw new Error('HOLD: owned cleanup incomplete; preserve exact run receipt; never broad-clean staging');
    } finally { await client.close().catch(() => { throw new Error('HOLD: client close failed'); }); }
  }
});
