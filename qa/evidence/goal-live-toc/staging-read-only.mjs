/** D-146/D-143: actual lkb_staging source/visibility readiness; never creates or writes DB data. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';
import { assertDerivedArtifactsCurrent } from '../../../scripts/lib/transcript-provenance.mjs';
import { createKnowledgeVisibility } from '../../../apps/api/src/visibility/knowledge.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PACKET = 'C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/work/toc-recovery-v1';
const SESSION = '2026-08-27-in-focus-4', TENANT = 'toc', DB_NAME = 'lkb_staging';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (value, code) => { if (!value) throw new Error(code); };

async function main() {
  requireValue(process.argv.length === 2, 'arguments-refused');
  const pinPath = join(ROOT, 'qa/evidence/goal-live-toc/staging-read-only-pins.json');
  const pins = JSON.parse(readFileSync(pinPath));
  const verifyPins = () => {
    requireValue(Array.isArray(pins) && pins.length > 5, 'pins-missing');
    for (const pin of pins) requireValue(sha(readFileSync(resolve(ROOT, pin.path))) === pin.sha256, 'source-pin-drift');
  };
  verifyPins();
  const firstBytes = readFileSync(join(ROOT, 'qa/evidence/goal-live-toc/one-call-receipt.json'));
  requireValue(sha(firstBytes) === '548a0b1de6e380849028811658c42a127823741e981fdc40ea9e917d2e701d9d', 'first-source-proof-changed');
  const first = JSON.parse(firstBytes);
  const dir = join(PACKET, 'sessions', SESSION);
  const generation = assertDerivedArtifactsCurrent(dir), { source, session, turns } = generation.documents;
  requireValue(sha(readFileSync(join(PACKET, 'packet.json'))) === first.packetSHA256
    && sha(readFileSync(join(PACKET, 'original/reviewed.json'))) === first.approvedReviewSHA256
    && sha(readFileSync(join(dir, 'turns.json'))) === first.turnArtifactSHA256
    && source.hash === first.sourceSHA256 && sha(readFileSync(join(ROOT, source.path))) === first.sourceSHA256
    && source.captureMode === 'provided' && source.consent?.given === true, 'approved-source-proof-refused');
  const privateInputPath = join(ROOT, '.cache/provider-validation', first.startedAt.replaceAll(':', '-'), 'input.json');
  const selected = JSON.parse(readFileSync(privateInputPath)).selectedTurns;
  requireValue(sha(JSON.stringify(selected)) === first.sampleSHA256 && selected.length === first.selectedTurnCount
    && selected.every(row => turns.some(turn => JSON.stringify(turn) === JSON.stringify(row))), 'sample-bytes-refused');
  const configured = parse(readFileSync(join(ROOT, '.env')));
  const uri = process.env.MONGODB_URL?.trim() || configured.MONGODB_URL?.trim();
  requireValue(typeof uri === 'string' && /^mongodb(?:\+srv)?:\/\//.test(uri), 'mongo-credentials-unavailable');
  // Private child environment only; do not reuse the URI's default database or any production opt-in.
  process.env.MONGODB_URL = uri; process.env.MONGODB_DB = DB_NAME; process.env.LKB_ALLOW_STAGING = DB_NAME;
  delete process.env.LKB_I_KNOW_THIS_IS_PRODUCTION;
  const requireFromApi = createRequire(join(ROOT, 'apps/api/package.json'));
  const { MongoClient } = requireFromApi('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, timeoutMS: 10000 });
  const receipt = { status: 'connecting', startedAt: new Date().toISOString(), dbName: DB_NAME, tenantId: TENANT,
    sessionId: SESSION, pinsSHA256: sha(readFileSync(pinPath)), approvedSampleSHA256: first.sampleSHA256,
    providerCalls: 0, databaseWrites: 0, productionAccess: false };
  const started = Date.now();
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    requireValue(db.databaseName === DB_NAME && db.databaseName !== 'lkb', 'namespace-refused');
    await db.command({ ping: 1 }); receipt.connected = true; receipt.namespaceAsserted = true;
    const liveSession = await db.collection('sessions').findOne({ tenantId: TENANT, _id: SESSION });
    const liveSource = await db.collection('sources').findOne({ tenantId: TENANT, _id: source._id });
    const liveTurns = await db.collection('turns').find({ tenantId: TENANT, sessionId: SESSION,
      _id: { $in: selected.map(turn => turn._id) } }).limit(selected.length + 1).toArray();
    receipt.sessionPresent = Boolean(liveSession); receipt.sourcePresent = Boolean(liveSource); receipt.selectedTurnsFound = liveTurns.length;
    const tuple = turn => JSON.stringify([turn.tenantId, turn.sessionId, turn._id, turn.speakerRef, turn.tStart, turn.tEnd, turn.text]);
    requireValue(liveSession?.sourceId === session.sourceId && liveSource?.hash === first.sourceSHA256
      && liveSource?.captureMode === 'provided' && liveSource?.consent?.given === true
      && selected.every(turn => liveTurns.some(live => tuple(turn) === tuple(live))) && liveTurns.length === selected.length,
      'approved-source-not-present-in-staging');
    const visibility = createKnowledgeVisibility(db);
    const visibleTurns = await visibility.filterTurns(TENANT, selected);
    receipt.sourceVisible = await visibility.sourceVisible(TENANT, source._id);
    receipt.sessionVisible = await visibility.sessionVisible(TENANT, SESSION);
    receipt.currentVisibleTurns = visibleTurns.length;
    requireValue(receipt.sourceVisible && receipt.sessionVisible && visibleTurns.length === selected.length, 'current-source-visibility-refused');
    verifyPins(); receipt.status = 'staging-source-and-current-visibility-ready';
  } catch { receipt.status = 'not-ready'; receipt.failure = receipt.connected ? 'approved-source-or-current-visibility-refused' : 'staging-connection-unavailable'; process.exitCode = 1; }
  finally {
    await client.close().catch(() => undefined); receipt.completedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
    const bytes = JSON.stringify(receipt, null, 2);
    requireValue(!bytes.includes(uri), 'connection-secret-in-receipt-refused');
    writeFileSync(join(ROOT, 'qa/evidence/goal-live-toc/staging-read-only-receipt.json'), bytes, { flag: 'wx' });
    console.log(JSON.stringify(receipt));
  }
}
main().catch(() => { console.error('Staging preflight refused; no raw diagnostic disclosed.'); process.exitCode = 1; });
