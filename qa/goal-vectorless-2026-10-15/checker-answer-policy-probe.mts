import assert from 'node:assert/strict';
import { createAnswerWorkflow } from '../../apps/api/src/answer-policy/answer-workflow.ts';
import { createAnswerPolicyService } from '../../apps/api/src/answer-policy/service.ts';
import { createInMemoryAnswerPolicyStore } from '../../apps/api/src/answer-policy/store.ts';
import { createInMemoryAnswerRecordStore } from '../../apps/api/src/answer-policy/answer-record-store.ts';
import { digest } from '../../apps/api/src/answer-policy/answer-evidence.ts';

// Independently seeded records exercise release failures without a provider call.
let checks = 0;
for (const boundary of ['verify-throws', 'policy-throws', 'digest-corrupt'] as const) {
  const policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore());
  const records = createInMemoryAnswerRecordStore();
  const candidate = { answer: 'PRIVATE', sources: { internal: [], web: [] }, scored: [], auditLog: [], verdict: 'correct', reason: 'fixture' };
  const run: any = { id: boundary, tenantId: 'tenant-a', state: 'review', candidate,
    candidateDigest: digest(candidate), evidence: [], evidenceDigest: digest([]), policy: null,
    query: 'Question', questionClass: 'fees', filters: { sessionIds: [], sources: 'all' },
    evidenceMode: true, feedback: [], actor: { actor: 'fixture' }, createdAt: new Date(0).toISOString(), reason: 'fixture' };
  if (boundary === 'digest-corrupt') run.candidateDigest = 'wrong';
  await records.create('tenant-a', run);
  if (boundary === 'policy-throws') policies.list = async () => { throw new Error('offline policy store'); };
  const app = createAnswerWorkflow(policies, records, async () => {
    if (boundary === 'verify-throws') throw new Error('offline evidence verifier');
    return true;
  });
  for (const value of [(await app.get('tenant-a', run.id)).result, (await app.history('tenant-a'))[0]!.result]) {
    assert.equal(value.state, 'stale'); assert.equal(value.answer, '');
    assert.deepEqual(value.sources, { internal: [], web: [] }); assert.deepEqual(value.sourceEvidence, []);
    assert.deepEqual(value.scored, []); assert.deepEqual(value.auditLog, []); checks++;
  }
  const queued = (await app.queue('tenant-a'))[0]!;
  assert.equal(queued.candidate.answer, ''); assert.deepEqual(queued.evidence, []); checks++;
  await assert.rejects(app.review('tenant-a', run.id, { decision: 'approved', note: 'Review', candidateDigest: run.candidateDigest, evidenceDigest: run.evidenceDigest }, { actor: 'fixture' }));
  assert.equal((await records.get('tenant-a', run.id))!.state, 'review'); checks++;
}
console.log(JSON.stringify({ independent: true, boundaries: 3, checks, providerCalls: 0, result: 'PASS' }));
