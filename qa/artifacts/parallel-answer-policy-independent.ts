import assert from 'node:assert/strict';
import { createAnswerPolicyVersion, simulateAnswerPolicy } from '../../packages/ask/src/answer-policy.js';
import type { AskV2Result } from '../../packages/ask/src/ask-shared.js';

let checks = 0;
const check = (name: string, fn: () => void): void => { fn(); checks++; console.log(`PASS ${name}`); };
const base = (): AskV2Result => ({ answer: 'Tenant A source answer', verdict: 'correct', reason: 'covered',
  scored: [], auditLog: [], web_used: false, insufficient_coverage: false,
  sources: { internal: [{ node_id: 'a-node', evidence: { sessionRef: 'a-session' } }], web: [] } });
const policy = createAnswerPolicyVersion('tenant-a', 'checker-draft', 'internal-only');
const evaluate = (result: AskV2Result) => simulateAnswerPolicy('tenant-a', policy, { tenantId: 'tenant-a', result });

check('foreign result is not observed', () => {
  let reads = 0;
  assert.throws(() => simulateAnswerPolicy('tenant-a', policy, { tenantId: 'tenant-b',
    get result(): AskV2Result { reads++; return base(); } }), /tenant mismatch/);
  assert.equal(reads, 0);
});
check('foreign policy is rejected before result read', () => {
  let reads = 0;
  assert.throws(() => simulateAnswerPolicy('tenant-a', { ...policy, tenantId: 'tenant-b' },
    { tenantId: 'tenant-a', get result(): AskV2Result { reads++; return base(); } }), /tenant mismatch/);
  assert.equal(reads, 0);
});
check('immutable revisions stay detached from mutable previous input', () => {
  const previous = { ...policy };
  const revision = createAnswerPolicyVersion('tenant-a', 'checker-draft', 'internal-and-web', previous);
  previous.mode = 'internal-and-web'; previous.version = 99;
  assert.equal(policy.version, 1); assert.equal(policy.mode, 'internal-only'); assert.equal(revision.version, 2);
  assert.ok(Object.isFrozen(revision)); assert.throws(() => { (revision as { version: number }).version = 77; });
});
check('policy output contains no answer or sources and preserves input bytes', () => {
  const input = base(); const before = JSON.stringify(input); const result = evaluate(input);
  assert.equal(result.decision, 'allow'); assert.equal(JSON.stringify(input), before);
  assert.equal('answer' in result, false); assert.equal('sources' in result, false);
});
check('web source cannot be hidden by false web_used', () => {
  const input = base(); input.sources.web = [{ url: 'https://example.test/source' }];
  assert.equal(evaluate(input).reason, 'web-disallowed');
});
check('insufficient correct result cannot allow', () => {
  const input = base(); input.insufficient_coverage = true;
  assert.equal(evaluate(input).decision, 'review');
});
check('blank internal session provenance cannot allow', () => {
  const input = base(); input.sources.internal[0]!.evidence = { sessionRef: '  ' };
  assert.equal(evaluate(input).reason, 'missing-provenance');
});
check('source-free answer is refused', () => {
  const input = base(); input.sources.internal = [];
  assert.equal(evaluate(input).decision, 'refuse');
});
check('web policy still checks unsafe source provenance', () => {
  const input = base(); input.web_used = true; input.sources.web = [{ url: 'data:text/plain,source' }];
  const both = createAnswerPolicyVersion('tenant-a', 'checker-draft', 'internal-and-web');
  assert.equal(simulateAnswerPolicy('tenant-a', both, { tenantId: 'tenant-a', result: input }).reason, 'missing-provenance');
});
check('inconsistent web metadata requires review with web-enabled draft', () => {
  const input = base(); input.sources.web = [{ url: 'https://example.test/source' }];
  const both = createAnswerPolicyVersion('tenant-a', 'checker-draft', 'internal-and-web');
  assert.equal(simulateAnswerPolicy('tenant-a', both, { tenantId: 'tenant-a', result: input }).reason, 'insufficient-coverage');
});
check('non-boolean coverage cannot allow', () => {
  const input = base(); input.insufficient_coverage = undefined as unknown as boolean;
  assert.equal(evaluate(input).reason, 'invalid-result');
});
console.log(`${checks}/${checks} independent policy boundaries passed`);
