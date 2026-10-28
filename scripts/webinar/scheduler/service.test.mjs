import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSlots, createCapturePool, runAutonomousCycles, POLL_MS, abortableWait} from './service.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject}; };

test('slot capacity is finite, distinct and excludes unsafe filesystem identities', () => {
  assert.deepEqual(validateSlots(['career-a', 'career_b']), ['career-a', 'career_b']);
  for (const slots of [[], ['one'], ['one', 'one'], ['../one', 'two'], ['CON', 'two'], ['com1', 'two'], Array.from({length: 9}, (_, i) => `slot${i}`)])
    assert.throws(() => validateSlots(slots));
});

test('independent slot promises overlap, remain held during processing and release after failure', async () => {
  const pool = createCapturePool(['a', 'b']), first = deferred(), second = deferred(), began = [];
  const a = pool.start('first', 'a', async () => {began.push('first'); await first.promise;});
  const b = pool.start('second', 'b', async () => {began.push('second'); await second.promise;});
  await Promise.resolve(); assert.deepEqual(began, ['first', 'second']); assert.equal(pool.size, 2);
  assert.equal(pool.slot(), undefined); assert.throws(() => pool.start('other', 'a', () => {}));
  first.reject(new Error('failed owned capture')); await assert.rejects(a); assert.equal(pool.slot(), 'a');
  assert.equal(pool.has('second'), true); second.resolve(); await b; await pool.drain(); assert.equal(pool.size, 0);
});

test('five-minute deadlines keep cycling while capture is blocked, subtract acquisition duration and drain on stop', async () => {
  const stop = new AbortController(), pending = deferred(); let time = 0, cycles = 0, drained = false;
  const waits = [];
  const run = runAutonomousCycles({signal: stop.signal, now: () => time,
    cycle: async () => {cycles++; time += 2000;},
    wait: async ms => {waits.push(ms); time += ms; if (cycles === 3) stop.abort();},
    drain: async () => {await pending.promise; drained = true;}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cycles, 3); assert.deepEqual(waits, [POLL_MS - 2000, POLL_MS - 2000, POLL_MS - 2000]);
  assert.equal(drained, false); pending.resolve(); await run; assert.equal(drained, true);
});

test('discovery outage retries at deadline but ownership/unexpected errors fail and drain', async () => {
  const stop = new AbortController(); let calls = 0, drains = 0;
  await runAutonomousCycles({signal: stop.signal, cycle: async () => {calls++; throw Object.assign(new Error('outage'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});},
    wait: async () => {if (calls === 2) stop.abort();}, drain: async () => {drains++;}});
  assert.equal(calls, 2); assert.equal(drains, 1);
  await assert.rejects(runAutonomousCycles({cycle: async () => {throw new Error('owner mismatch');}, drain: async () => {drains++;}}), /owner mismatch/);
  assert.equal(drains, 2);
});

test('an already-aborted wait returns without leaving an active timer', async () => {
  const stop = new AbortController(); stop.abort(); await abortableWait(POLL_MS, stop.signal);
});
