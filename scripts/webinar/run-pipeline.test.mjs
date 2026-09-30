import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {runPipelineTick, validateRunGate, createPipelineDeps} from './run-pipeline.mjs';

const NOW = '2026-09-30T12:00:00Z';
const event = (changes = {}) => ({id: 'cal-one', title: 'University webinar', startTime: '2026-09-30T12:01:00Z',
  endTime: '2026-09-30T13:00:00Z', meetingUrl: 'https://meeting.zoho.com/meeting/123?token=private', ...changes});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lkb-poller-')), stateDir = join(root, 'data/webinar-release');
  const logs = [], calls = [];
  const deps = {root, stateDir, env: {MONGO_WORK_DB: 'lkb_work_release', LKB_TENANT_ID: 'fixture'}, now: () => NOW,
    validateTenant: async () => {}, log: (line) => logs.push(line), loadCalendarEvents: async () => [event()], loadCandidates: async () => [],
    launch: async (...args) => calls.push(args)};
  let generation = 0;
  deps.loadCalendarAcquisition = async (token, checkedAt) => {
    const rows = (await deps.loadCalendarEvents()).map(row => ({...row, providerUpdated: row.providerUpdated ?? new Date(Date.parse(NOW) + ++generation).toISOString()}));
    return {version: 1, tenantId: 'fixture', scope: 'available-connected-source-state', complete: true, mode: token ? 'sync' : 'baseline',
      checkedAt, requestedSyncToken: token, syncToken: `fixture-${generation}`, sourceEvents: rows, meetings: rows};
  };
  return {root, stateDir, deps, logs, calls, cleanup: () => rmSync(root, {recursive: true, force: true})};
}
async function withFixture(body, ready = false) {
  const f = fixture();
  try { if (ready) proof(f); await body(f); } finally { f.cleanup(); }
}
function proof(f) {
  mkdirSync(f.stateDir, {recursive: true});
  const file = join(f.root, 'proof.webm'); writeFileSync(file, 'test artifact');
  writeFileSync(join(f.stateDir, 'live-proof.json'), JSON.stringify({status: 'passed', platform: process.platform,
    backend: 'tab', sessionId: 'proof-session', audio: true, video: true, verifiedAt: NOW, recording: 'proof.webm'}));
}
function completed(root, id) {
  const dir = join(root, 'data/toc-migrated', id); mkdirSync(dir, {recursive: true});
  const bytes = JSON.stringify([{_id:'turn-a',tenantId:'fixture',sessionId:id,text:'Supported source'}]);
  writeFileSync(join(dir,'knowledge-turns.json'),bytes);
  writeFileSync(join(dir,'source.json'),JSON.stringify({tenantId:'fixture'}));
  const proof = {version:2,status:'done',strict:true,sessionId:id,tenantId:'fixture',generation:'generation-a',
    inputHash:createHash('sha256').update(bytes).digest('hex'),summary:'done',claims:'done',chunks:'done',tree:'done',semanticSupport:'passed',turnCount:1};
  writeFileSync(join(dir,'index-proof.json'),JSON.stringify(proof));
  writeFileSync(join(dir,'pipeline-state.json'),JSON.stringify({...proof,stage:'index'}));
}

test('terminal notifications are sanitized, awaited and deduplicated across retry/restart', () => withFixture(async (f) => {
    const notices = [];
    f.deps.notifyOperation = async (notice) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      notices.push(notice); return 'sent';
    };
    f.deps.launch = async (_args, _env, onLine) => {
      const artifact = join(f.root, 'artifact.webm'); writeFileSync(artifact, 'retained media');
      onLine(`audio/video recording started: ${artifact}`);
      throw new Error('private-credential https://provider.invalid/path?token=secret');
    };
    const first = await runPipelineTick(f.deps, true);
    const id = Object.keys(first.operations)[0];
    assert.deepEqual(notices, [{sessionId: id, status: 'failed', reason: 'pipeline-failed'}]);
    assert.equal(first.operations[id].status, 'failed');
    assert.equal(JSON.parse(readFileSync(join(f.stateDir, 'operations.json'))).operations[id].notification.status, 'sent');
    await runPipelineTick(f.deps, true);
    assert.equal(notices.length, 1, 'same failure on restart must not notify again');
    f.deps.launch = async () => completed(f.root, id);
    await runPipelineTick(f.deps, true);
    assert.deepEqual(notices[1], {sessionId: id, status: 'ready', reason: ''});
    assert.ok(!JSON.stringify(notices).includes('secret'));
    assert.ok(!JSON.stringify(notices).includes('private-credential'));
    assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false);
}, true));

test('disabled and failed notifications retain the actual operation and retry delivery', async () => {
  for (const outcome of ['disabled', 'throw', 'invalid']) {
    await withFixture(async (f) => {
      let calls = 0;
      f.deps.launch = async (_args, _env, onLine) => {
        const artifact = join(f.root, 'artifact.webm'); writeFileSync(artifact, 'retained media');
        onLine(`audio/video recording started: ${artifact}`); throw new Error('pipeline failed');
      };
      f.deps.notifyOperation = async () => { calls++; if (outcome === 'throw') throw new Error('token-secret'); return outcome; };
      const result = await runPipelineTick(f.deps, true), id = Object.keys(result.operations)[0];
      const saved = JSON.parse(readFileSync(join(f.stateDir, 'operations.json'))).operations[id];
      assert.equal(saved.status, 'failed');
      assert.equal(saved.notification.status, outcome === 'disabled' ? 'disabled' : 'failed');
      assert.equal(saved.notification.acknowledged, undefined);
      assert.ok(!f.logs.join(' ').includes('token-secret'));
      f.deps.notifyOperation = async () => { calls++; return 'sent'; };
      await runPipelineTick(f.deps, true);
      assert.equal(calls, 2);
      assert.equal(JSON.parse(readFileSync(join(f.stateDir, 'operations.json'))).operations[id].notification.status, 'sent');
    }, true);
  }
});

test('preview and refused ownership/live gates never invoke the alert callback', () => withFixture(async (f) => {
    let alerts = 0;
    f.deps.notifyOperation = async () => { alerts++; return 'sent'; };
    await runPipelineTick(f.deps, false);
    await assert.rejects(runPipelineTick(f.deps, true), /Manual live/);
    proof(f);
    writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'foreign', operations: {}}));
    await assert.rejects(runPipelineTick(f.deps, true), /ownership/);
    assert.equal(alerts, 0);
}));

test('unchanged action-required and ready operations retry failed or disabled alerts on restart', async () => {
  for (const status of ['action_required', 'ready']) for (const delivery of ['failed', 'disabled']) {
    await withFixture(async (f) => {
      const notices = [];
      const id = 'saved-operation';
      writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture', operations: {
        [id]: {tenantId: 'fixture', status, reason: status === 'action_required' ? 'needs-registration' : undefined,
          notification: {status: delivery, retryable: delivery === 'failed'}},
      }}));
      f.deps.loadCalendarEvents = async () => [];
      f.deps.notifyOperation = async (notice) => { notices.push(notice); return 'sent'; };
      const result = await runPipelineTick(f.deps, true);
      assert.equal(result.operations[id].status, status);
      assert.equal(notices.length, 1);
      assert.equal(result.operations[id].notification.status, 'sent');
      await runPipelineTick(f.deps, true);
      assert.equal(notices.length, 1, 'acknowledged unchanged terminal state must not send again');
      assert.equal(f.calls.length, 0);
    }, true);
  }
});

test('a stuck alert reaches the overall deadline and releases the lane without losing failure state', {timeout: 12000}, () => withFixture(async (f) => {
    f.deps.launch = async () => { throw new Error('capture failed'); };
    f.deps.notifyOperation = async () => new Promise(() => {});
    const started = Date.now(), result = await runPipelineTick(f.deps, true);
    assert.ok(Date.now() - started >= 8900);
    const row = Object.values(result.operations)[0];
    assert.equal(row.status, 'failed');
    assert.equal(row.notification.status, 'failed');
    assert.equal(row.notification.retryable, true);
    assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false);
}, true));
test('preview deduplicates cross-source token rotation and writes/captures nothing', () => withFixture(async (f) => {
    f.deps.loadCandidates = async () => [{id: 'mail-one', status: 'pending', title: 'University webinar',
      senderEmail: 'speaker@university.edu', senderDomain: 'university.edu', startTime: event().startTime,
      endTime: event().endTime, meetingUrl: 'https://meeting.zoho.com/meeting/123?token=rotated'}];
    const result = await runPipelineTick(f.deps);
    assert.equal(result.status, 'preview'); assert.equal(result.toRecord.length, 1);
    assert.equal(result.skipped.filter((item) => item.reason === 'duplicate-session').length, 1);
    assert.ok(!JSON.stringify(result).includes('private')); assert.ok(!JSON.stringify(result).includes('rotated'));
    assert.equal(f.calls.length, 0); assert.equal(existsSync(f.stateDir), false);
}));
test('run refuses missing proof/production database before discovery or child launch', () => withFixture(async (f) => {
    let reads = 0;
    f.deps.loadCalendarEvents = async () => { reads++; return []; };
    await assert.rejects(runPipelineTick(f.deps, true), /Manual live audio\/video proof/);
    proof(f); f.deps.env.MONGO_WORK_DB = 'lkb';
    await assert.rejects(runPipelineTick(f.deps, true), /production writes refused/);
    assert.equal(reads, 0); assert.equal(f.calls.length, 0);
    f.deps.env.MONGO_WORK_DB = 'lkb_work_release';
    const marker = JSON.parse(readFileSync(join(f.stateDir, 'live-proof.json')));
    marker.platform = process.platform === 'win32' ? 'linux' : 'win32';
    writeFileSync(join(f.stateDir, 'live-proof.json'), JSON.stringify(marker));
    assert.throws(() => validateRunGate(f.root, f.deps.env), /different operating system/);
}));
test('single capture reaches ready only with index marker and never duplicates next tick', () => withFixture(async (f) => {
    f.deps.launch = async (args, env, onLine) => {
      f.calls.push(args); assert.equal(env.MONGO_WORK_DB, 'lkb_work_release');
      assert.equal(args[0], 'record'); assert.ok(args.includes('--backend')); assert.ok(args.includes('--process-video')); assert.ok(args.includes('--index'));
      const id = args[args.indexOf('--session-id') + 1];
      assert.match(id, /^webinar-[a-f0-9]{24}$/);
      onLine('[pipeline] processing'); completed(f.root, id);
    };
    const first = await runPipelineTick(f.deps, true);
    assert.equal(Object.values(first.operations)[0].status, 'ready');
    await runPipelineTick(f.deps, true); assert.equal(f.calls.length, 1);
    assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false);
}, true));

test('corrected discovery reconsiders prerequisite barriers without duplicate capture', async () => {
  for (const [reason, before] of [
    ['needs-registration', {registrationOnly: true}],
    ['needs-review', {title: 'University information update'}],
    ['invalid-time', {endTime: '2026-09-30T12:00:00Z'}],
  ]) {
    await withFixture(async (f) => {
      let candidate = {...event(), id: 'mail-one', status: 'pending', senderEmail: 'host@example.org', senderDomain: 'example.org', providerUpdated: '2026-09-30T11:00:00.000Z', ...before};
      f.deps.loadCalendarEvents = async () => [];
      f.deps.loadCandidates = async () => [candidate];
      const first = await runPipelineTick(f.deps, true);
      assert.equal(first.skipped[0].reason, reason);
      const id = Object.keys(first.operations)[0];
      assert.equal(first.operations[id].status, 'action_required');
      await runPipelineTick(f.deps, true);
      assert.equal(f.calls.length, 0, 'unchanged prerequisite must remain blocked');
      candidate = {...candidate, ...event(), registrationOnly: false, providerUpdated: '2026-09-30T11:10:00.000Z'};
      f.deps.launch = async args => { f.calls.push(args); completed(f.root, args[args.indexOf('--session-id') + 1]); };
      const corrected = await runPipelineTick(f.deps, true);
      const expected = reason === 'needs-registration' ? 0 : 1;
      assert.equal(f.calls.length, expected, 'toggling the same registration flag cannot bypass a standing barrier');
      assert.equal(corrected.operations[id].status, expected ? 'ready' : 'action_required');
      if (expected) assert.equal(corrected.operations[id].reason, undefined, 'resolved prerequisite is not a current failure');
      candidate = {...candidate, status: 'rejected', providerUpdated: '2026-09-30T11:20:00.000Z'};
      await runPipelineTick(f.deps, true); assert.equal(f.calls.length, expected);
      candidate = {...candidate, status: 'pending', providerUpdated: '2026-09-30T11:30:00.000Z'};
      await runPipelineTick(f.deps, true);
      assert.equal(f.calls.length, expected, 'explicit rejection cannot be reopened by a pending snapshot');
    }, true);
  }
});

test('only explicit prerequisite reasons reopen; terminal and coverage barriers stay blocked', async () => {
  for (const reason of ['unsafe-join-link', 'retry-limit', 'interrupted-no-recording-artifact',
    'missed-coverage', 'cancelled', 'overlap-lost', 'missed-while-processing', 'operator-rejected']) {
    await withFixture(async (f) => {
      const id = (await runPipelineTick(f.deps)).toRecord[0].sessionKey;
      writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture',
        operations: {[id]: {tenantId: 'fixture', status: 'action_required', reason, attempts: 0}}}));
      f.deps.launch = async args => { f.calls.push(args); completed(f.root, id); };
      const result = await runPipelineTick(f.deps, true);
      assert.equal(f.calls.length, reason === 'unsafe-join-link' ? 1 : 0, reason);
      assert.equal(result.operations[id].status, reason === 'unsafe-join-link' ? 'ready' : 'action_required', reason);
    }, true);
  }
});
test('zero exit without index proof stays failed; restart resumes saved artifact with finalize', () => withFixture(async (f) => {
    const artifact = join(f.root, 'saved.webm'); writeFileSync(artifact, 'partial media');
    f.deps.launch = async (args, _env, onLine) => {
      f.calls.push(args);
      if (args[0] === 'record') onLine(`audio/video recording started: ${artifact}`);
      else completed(f.root, args[args.indexOf('--session-id') + 1]);
    };
    const first = await runPipelineTick(f.deps, true);
    assert.equal(Object.values(first.operations)[0].status, 'failed');
    const second = await runPipelineTick(f.deps, true);
    assert.equal(Object.values(second.operations)[0].status, 'ready');
    assert.deepEqual(f.calls.map((args) => args[0]), ['record', 'finalize']);
    assert.ok(f.calls[1].includes(artifact));
}, true));
test('overlapping webinar is explicit action required and personal meeting is excluded', () => withFixture(async (f) => {
    f.deps.loadCalendarEvents = async () => [event(), event({id: 'second', meetingUrl: 'https://meeting.zoho.com/meeting/456', startTime: '2026-09-30T12:02:00Z'}),
      event({id: 'personal', title: 'Team meeting', meetingUrl: 'https://meeting.zoho.com/meeting/789'})];
    f.deps.launch = async (args) => { f.calls.push(args); completed(f.root, args[args.indexOf('--session-id') + 1]); };
    const result = await runPipelineTick(f.deps, true);
    assert.equal(f.calls.length, 1);
    assert.ok(Object.values(result.operations).some((row) => row.status === 'action_required' && row.reason === 'overlap-lost'));
    assert.ok(result.skipped.some((row) => row.reason === 'not-webinar'));
    assert.ok(!f.logs.join('\n').includes('private'));
}, true));
test('failed Gmail HTTP discovery cannot masquerade as healthy empty feed', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ok: false, status: 503});
    const deps = createPipelineDeps({LKB_API_KEY: 'fixture-key', LKB_API_URL: 'http://fixture.invalid'});
    await assert.rejects(deps.loadCandidates(), /discovery unavailable/);
  } finally { globalThis.fetch = original; }
});

test('either failed feed blocks capture, persists health and alerts once until recovery', async () => {
  for (const [feed, loader] of [['gmail', 'loadCandidates'], ['calendar', 'loadCalendarEvents']]) {
    await withFixture(async f => {
      let failed = true; const notices = [];
      f.deps[loader] = async () => { if (failed) throw new Error('private-token'); return []; };
      f.deps.notifyOperation = async notice => { notices.push(notice); return 'sent'; };
      for (let i = 0; i < 2; i++) await assert.rejects(runPipelineTick(f.deps, true), error => error.code === 'WEBINAR_DISCOVERY_UNAVAILABLE' && /discovery unavailable/.test(error.message));
      const saved = JSON.parse(readFileSync(join(f.stateDir, 'operations.json')));
      assert.equal(saved.discovery[feed].status, 'failed'); assert.equal(f.calls.length, 0);
      assert.deepEqual(notices, [{feed, status: 'failed'}]);
      assert.deepEqual(saved.operations, {}); assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false);
      failed = false; f.deps.loadCalendarEvents = async () => []; f.deps.loadCandidates = async () => [];
      await runPipelineTick(f.deps, true); await runPipelineTick(f.deps, true);
      assert.deepEqual(notices, [{feed, status: 'failed'}, {feed, status: 'healthy'}]);
      assert.equal(JSON.parse(readFileSync(join(f.stateDir, 'operations.json'))).discovery[feed].status, 'healthy');
      assert.ok(!f.logs.join(' ').includes('private-token'));
    }, true);
  }
});

test('ledger002 weak or stale strict markers never certify zero-exit child as ready', async () => {
  for (const attack of ['versionless','degraded-summary','embedding-skip','stale-input','foreign-tenant','stale-generation']) {
    await withFixture(async (f) => {
      f.deps.launch=async (args)=>{
        const id=args[args.indexOf('--session-id')+1];completed(f.root,id);
        const dir=join(f.root,'data/toc-migrated',id),path=join(dir,'index-proof.json');
        const value=JSON.parse(readFileSync(path));
        if(attack==='versionless')delete value.version;
        if(attack==='degraded-summary')value.summary='degraded';
        if(attack==='embedding-skip')value.chunks='skipped';
        if(attack==='stale-input')value.inputHash='0'.repeat(64);
        if(attack==='foreign-tenant')value.tenantId='foreign';
        if(attack==='stale-generation')value.generation='other-generation';
        writeFileSync(path,JSON.stringify(value));
      };
      const result=await runPipelineTick(f.deps,true);
      assert.equal(Object.values(result.operations)[0].status,'failed',attack);
    }, true);
  }
});

test('runner refuses missing, mismatched and unowned durable tenant state without captures', () => withFixture(async (f) => {
    proof(f); delete f.deps.env.LKB_TENANT_ID;
    await assert.rejects(runPipelineTick(f.deps, true), /LKB_TENANT_ID/);
    f.deps.env.LKB_TENANT_ID = 'fixture';
    const state = join(f.stateDir, 'operations.json');
    for (const owner of [undefined, 'other-tenant']) {
      const bytes = JSON.stringify({ version: 1, tenantId: owner, operations: {} });
      writeFileSync(state, bytes);
      await assert.rejects(runPipelineTick(f.deps, true), /ownership/);
      assert.equal(readFileSync(state, 'utf8'), bytes);
    }
    assert.equal(f.calls.length, 0);
}));
