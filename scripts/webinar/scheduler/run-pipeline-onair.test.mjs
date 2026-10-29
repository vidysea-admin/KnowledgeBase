/** D-207 item 4 / D-208 item 6: the Linux driver (run-pipeline-deps.mjs) runs the OnAir mail lane by default. Fakes only: no gws, no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipelineDeps} from '../run-pipeline-deps.mjs';
const f = await import('../../../packages/meeting-bot/src/calendar/onair/onair-mail.fixtures.ts');

const BASE_ROW = {_id: 'g1', subject: 'Existing', senderEmail: 'x@example.invalid', senderDomain: 'example.invalid', status: 'approved'};
const who = (r) => r.id === 'g1' ? 'base' : r.id;
async function run(env, {mails = async () => [f.registered, f.onDemand], refresh = false} = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { return new Response(JSON.stringify([BASE_ROW]), {status: 200}); };
  let mailCalls = 0;
  try {
    const deps = createPipelineDeps({LKB_API_URL: 'http://api.invalid', LKB_API_KEY: 'k', LKB_TENANT_ID: 't', ...env},
      {loadOnairMails: async () => { mailCalls++; return mails(); }, resolveOnair: f.fakeResolver()});
    const rows = await deps.loadCandidates(refresh);
    return {rows, mailCalls, deps};
  } finally { globalThis.fetch = real; }
}

test('Linux driver loader includes OnAir mail candidates by default (no LKB_ONAIR_MAIL)', async () => {
  const {rows, mailCalls} = await run({});
  assert.equal(mailCalls, 1);
  assert.deepEqual(rows.map(who).sort(), ['base', `onair:${f.SLUG_A}`, `onair:${f.SLUG_B}`].sort());
});

test('LKB_ONAIR_MAIL=0 excludes OnAir candidates and never reads mail; LKB_ONAIR_MAIL=1 includes them', async () => {
  const off = await run({LKB_ONAIR_MAIL: '0'});
  assert.deepEqual(off.rows.map(who), ['base']);
  assert.equal(off.mailCalls, 0);
  const on = await run({LKB_ONAIR_MAIL: '1'});
  assert.equal(on.rows.length, 3);
});

test('a failing OnAir mail read never loses the Gmail candidates, and its error text cannot fail discovery', async () => {
  const {rows} = await run({}, {mails: async () => { throw new Error('fetch failed: skipping'); }});
  assert.deepEqual(rows.map(who), ['base']);
});

test('the record child env gets LKB_ONAIR_WATCH=1 by default and an explicit 0 is kept', async () => {
  assert.equal((await run({})).deps.env.LKB_ONAIR_WATCH, '1');
  assert.equal((await run({LKB_ONAIR_WATCH: 'true'})).deps.env.LKB_ONAIR_WATCH, '1');
  assert.equal((await run({LKB_ONAIR_WATCH: '0'})).deps.env.LKB_ONAIR_WATCH, '0');
});
