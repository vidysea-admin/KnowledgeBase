import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedCaptureStop} from './capture-stop.mjs';
const generation = '11111111-1111-4111-8111-111111111111';
const now = () => '2026-10-14T12:00:00.000Z';

test('owned stop is durably generation-bound before sending and repeated reasons never replace it', async () => {
  const state = {operations: {session: {}}}, calls = [];
  let release;
  const stop = createOwnedCaptureStop({state, id: 'session', tenantId: 'tenant', now, active: () => true,
    update: (id, row) => {state.operations[id] = {...state.operations[id], ...row};}, onFailure: error => {throw error;},
    control: () => ({generation, stop: async reason => {
      assert.equal(state.operations.session.stopDisposition.generation, generation); calls.push(reason);
      await new Promise(resolve => {release = resolve;}); return 'accepted';
    }})});
  stop.request('coverage-review'); stop.request('graph-aborted');
  assert.equal(state.operations.session.reason, 'coverage-review');
  const drained = stop.drain(); await Promise.resolve(); assert.deepEqual(calls, ['cancelled']);
  release(); await drained;
  assert.deepEqual(state.operations.session.stopDisposition, {tenantId: 'tenant', sessionId: 'session', generation,
    reason: 'cancelled', requestedAt: now()});
});

test('settled captures and absent controller capabilities never cause a guessed stop', async () => {
  let controls = 0, active = false;
  const stop = createOwnedCaptureStop({state: {operations: {session: {}}}, id: 'session', tenantId: 'tenant', now,
    active: () => active, update: () => {throw new Error('must not write');}, onFailure: error => {throw error;},
    control: () => {controls++; return undefined;}});
  stop.request('coverage-review'); active = true; stop.request('graph-aborted'); await stop.drain();
  assert.equal(controls, 2);
});

test('lane write refusal still stops only the existing owned handle without delayed metadata writes', async () => {
  const errors = [], calls = []; let writes = 0;
  const stop = createOwnedCaptureStop({state: {operations: {session: {}}}, id: 'session', tenantId: 'tenant', now,
    active: () => true, update: () => {writes++; throw new Error('Lane ownership lost');}, onFailure: error => errors.push(error.message),
    control: () => ({generation, stop: async reason => {calls.push(reason); return 'accepted';}})});
  stop.request('coverage-review'); await stop.drain();
  assert.equal(writes, 1); assert.deepEqual(errors, ['Lane ownership lost']); assert.deepEqual(calls, ['cancelled']);
});
