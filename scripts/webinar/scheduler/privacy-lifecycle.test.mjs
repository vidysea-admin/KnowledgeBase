import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturePrivacyLifecycle} from './privacy-lifecycle.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };

test('child exit awaits late private publication and revokes exactly the actual controller', async () => {
  const pending = deferred(), calls = [], control = {generation: 'owned-generation'};
  let disposed = 0, finished = false;
  const lifecycle = createCapturePrivacyLifecycle({tenantId: 'tenant', sessionId: 'session', required: true,
    publish: input => {calls.push(input); return pending.promise;}, onFailure: error => {throw error;}});
  lifecycle.attach(control);
  const closing = lifecycle.finish().then(() => {finished = true;});
  await Promise.resolve(); assert.equal(finished, false);
  assert.deepEqual(calls, [{tenantId: 'tenant', sessionId: 'session', control}]);
  pending.resolve(async () => {disposed++;}); await closing;
  assert.equal(disposed, 1); assert.equal(finished, true);
});

test('publication rejection is generic and delivered once without publishing private failure detail', async () => {
  const errors = [];
  const lifecycle = createCapturePrivacyLifecycle({tenantId: 'tenant', sessionId: 'session', required: true,
    publish: () => {throw new Error('private token must never be public');}, onFailure: error => errors.push(error.message)});
  assert.doesNotThrow(() => lifecycle.attach({generation: 'owned'})); await lifecycle.finish();
  assert.deepEqual(errors, ['Recorder privacy controller unavailable']);
});

test('configured publication requires actual controller and disposer; missing configuration remains unavailable', async () => {
  const errors = [];
  const make = required => createCapturePrivacyLifecycle({tenantId: 'tenant', sessionId: 'session', required,
    publish: async () => undefined, onFailure: error => errors.push(error.message)});
  const missing = make(true); await missing.finish();
  const noDisposer = make(true); noDisposer.attach({generation: 'owned'}); await noDisposer.finish();
  const unconfigured = make(false); unconfigured.attach({generation: 'owned'}); await unconfigured.finish();
  assert.equal(errors.length, 2);
});

test('disposal failure prevents success while preserving generic public error', async () => {
  const errors = [];
  const lifecycle = createCapturePrivacyLifecycle({tenantId: 'tenant', sessionId: 'session', required: true,
    publish: async () => async () => {throw new Error('private locator');}, onFailure: error => errors.push(error.message)});
  lifecycle.attach({generation: 'owned'}); await lifecycle.finish();
  assert.deepEqual(errors, ['Recorder privacy controller unavailable']);
});
