// ISS-T037W1-003: run-pipeline.mjs keeps an operation-reason vocabulary; it must cover every SkipReason in core.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPERATION_REASONS, runPipelineWatch} from './run-pipeline.mjs';

const source = readFileSync(new URL('../../packages/core/src/domain/webinar-types.ts', import.meta.url), 'utf8');
const body = /export const SKIP_REASONS = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? '';
const SKIP_REASONS = [...body.replace(/\/\/.*$/gm, '').matchAll(/"([a-z-]+)"/g)].map(m => m[1]);

test('the SkipReason list read from core source has all 14 values incl. the three veto reasons', () => {
  assert.equal(SKIP_REASONS.length, 14);
  for (const r of ['opted-out', 'rule-denied', 'rules-unevaluable', 'untrusted-sender', 'overlap-lost']) assert.ok(SKIP_REASONS.includes(r), r);
});

test('every SkipReason is in the script operation-reason vocabulary', () => {
  assert.deepEqual(SKIP_REASONS.filter(r => !OPERATION_REASONS.includes(r)), []);
});

test('runPipelineWatch shows each of the 14 skip reasons as-is and an unknown reason as details-private', async () => {
  const operations = {};
  [...SKIP_REASONS, 'brand-new-reason'].forEach((reason, i) => { operations[`op-${i}`] = {status: 'action_required', reason}; });
  const lines = [];
  await runPipelineWatch({run: false, watch: false}, {tick: async () => ({status: 'preview', operations}), log: l => lines.push(l)});
  const items = JSON.parse(lines[0]).operations.items;
  assert.equal(items.length, 15);
  SKIP_REASONS.forEach((reason, i) => assert.equal(items[i].reason, reason));
  assert.equal(items[14].reason, 'details-private');
});
