import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalOperationAlert, createCanonicalAlerts} from './lifecycle-alerts.mjs';
const {readWebinarOperationState, writeWebinarOperationState} = await import('../../../packages/meeting-bot/src/calendar/state/schedule-state.ts');
const NOW = '2026-10-14T12:00:00.000Z', generation = '11111111-1111-4111-8111-111111111111';
const row = status => ({tenantId: 'tenant', status, updatedAt: NOW, title: 'Career webinar', careerGuidance: true, testData: false});
function fixture(state, sink = async () => {}) {
  const notices = [], logs = []; let writes = 0, flushes = 0;
  const alerts = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: sink}),
    flush: async () => {flushes++;}, assertOwned: () => {}, save: () => {writes++;}, enqueueNotification: id => notices.push(id),
    log: line => logs.push(line), now: () => NOW});
  return {alerts, notices, logs, writes: () => writes, flushes: () => flushes};
}

test('canonical alert projection keeps finite coverage detail, staging, exact output and no private row fields', () => {
  const input = canonicalOperationAlert('session-a', {...row('ready'), controlToken: 'private-secret', artifact: 'private-file'});
  assert.equal(input.kind, 'capture-done'); assert.equal(input.outputPath, 'data/toc-migrated/session-a');
  assert.equal(input.testData, false); assert.ok(!JSON.stringify(input).includes('private'));
  const unknown = canonicalOperationAlert('session-a', {...row('failed'), careerGuidance: undefined, testData: undefined, reason: 'private-secret'});
  assert.equal(unknown.detail, 'Coverage requires review.'); assert.equal(unknown.testData, true);
  assert.equal(canonicalOperationAlert('../foreign', row('ready')), undefined);
  assert.equal(canonicalOperationAlert('session-a', {...row('action_required'), stopDisposition: {generation}}).kind, 'capture-stopped-early');
  assert.equal(canonicalOperationAlert('session-a', {...row('queued'), reason: 'capacity-full'}).kind, 'coverage-deferred');
});

test('canonical updates/artifact events/terminal outcomes reach the configured sink in order', async () => {
  const state = {operations: {'session-a': row('recording')}}, delivered = [];
  const f = fixture(state, async input => {delivered.push(input);});
  f.alerts.operation('session-a', 'capture-started');
  f.alerts.update('session-a', {status: 'ready'}); await f.alerts.wait();
  assert.deepEqual(delivered.map(input => input.kind), ['capture-started', 'capture-done']);
  assert.deepEqual(f.notices, ['session-a']); assert.ok(f.writes() >= 2);
  assert.equal(state.operations['session-a'].schedulerAlertOutbox.length, 2, 'unacknowledged injected sink remains replayable');
});

test('discovery degradation and recovery retain the same outage identity and never copy provider error values', async () => {
  const delivered = [], state = {operations: {}, discovery: {}}, f = fixture(state, async input => {delivered.push(input);});
  const failed = {status: 'failed', lastSuccessAt: '2026-10-14T11:00:00.000Z', error: 'private-token'};
  state.discovery.calendar = failed;
  f.alerts.discovery('calendar', {status: 'healthy'}, failed);
  state.discovery.calendar = {status: 'healthy', lastSuccessAt: NOW};
  f.alerts.discovery('calendar', failed, state.discovery.calendar);
  await f.alerts.wait();
  assert.deepEqual(delivered.map(input => input.kind), ['discovery-degraded', 'discovery-recovered']);
  assert.equal(delivered[0].sessionKey, delivered[1].sessionKey); assert.ok(!JSON.stringify(delivered).includes('private-token'));
});

test('canonical replay is bounded, excludes foreign tenant rows, and flushes actual durable retries', async () => {
  const operations = Object.fromEntries(Array.from({length: 100}, (_, index) => [`session-${index}`, row('failed')]));
  operations.foreign = {...row('ready'), tenantId: 'foreign'};
  const delivered = [], f = fixture({operations}, async input => delivered.push(input));
  f.alerts.tick(); await f.alerts.wait(); assert.equal(delivered.length, 25); assert.equal(f.flushes(), 1);
  f.alerts.tick(); await f.alerts.wait(); assert.equal(delivered.length, 50); assert.equal(f.flushes(), 2);
  assert.equal(new Set(delivered.map(input => input.sessionKey)).size, 50);
  f.alerts.operation('foreign'); await f.alerts.wait(); assert.equal(delivered.length, 50);
});

test('saturated started event survives real durable write, terminal transition, old lookback and restart replay', {timeout: 15000}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lkb-scheduler-alert-outbox-')), file = join(directory, 'operations.json'), logs = [];
  let state = {version: 1, tenantId: 'tenant', operations: Object.fromEntries(Array.from({length: 51}, (_, n) => [`session-${n}`, {...row('recording'), updatedAt: '2026-09-01T00:00:00.000Z'}]))};
  let release; const held = new Promise(resolve => {release = resolve;});
  const accepted = {email: 'sent', dashboard: 'sent', calendar: 'disabled'};
  const make = sink => createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: sink}), assertOwned: () => {},
    save: () => writeWebinarOperationState(file, state), enqueueNotification: () => {}, log: message => logs.push(message), now: () => NOW});
  try {
    const initial = make(async () => {await held; return accepted;});
    for (const id of Object.keys(state.operations)) initial.operation(id, 'capture-started');
    initial.update('session-50', {status: 'ready'});
    state.operations['session-50'].updatedAt = '2026-09-01T00:00:00.000Z'; writeWebinarOperationState(file, state);
    const durable = readWebinarOperationState(file, 'tenant', NOW);
    assert.deepEqual(durable.operations['session-50'].schedulerAlertOutbox.map(input => input.kind), ['capture-started', 'capture-done']);
    assert.ok(logs.some(message => message.includes('queue full; durable events await replay')));
    release(); await initial.wait(); state = readWebinarOperationState(file, 'tenant', NOW);
    const replayed = [], restarted = make(async input => {replayed.push(input); return accepted;});
    for (let n = 0; n < 3; n++) {restarted.tick(); await restarted.wait();}
    assert.deepEqual(replayed.filter(input => input.sessionKey === 'session-50').map(input => input.kind), ['capture-started', 'capture-done']);
    assert.deepEqual(readWebinarOperationState(file, 'tenant', NOW).operations['session-50'].schedulerAlertOutbox, []);
  } finally {release(); rmSync(directory, {recursive: true, force: true});}
});

test('failed channel stays durable and feed acquisition preserves queued outage snapshots before first save', async () => {
  const failed = {status: 'failed', checkedAt: NOW, lastSuccessAt: '2026-10-14T11:00:00.000Z'};
  const state = {operations: {}, discovery: {calendar: failed}}, f = fixture(state, async () => ({email: 'failed', dashboard: 'sent', calendar: 'disabled'}));
  f.alerts.discovery('calendar', {status: 'healthy'}, failed); await f.alerts.wait();
  assert.equal(failed.schedulerAlertOutbox.length, 1);
  const acquired = {calendar: {status: 'healthy', checkedAt: NOW, lastSuccessAt: NOW}, gmail: {status: 'healthy', checkedAt: NOW}};
  state.discovery = f.alerts.preserveDiscovery(state.discovery, acquired);
  assert.equal(state.discovery.calendar.schedulerAlertOutbox[0].kind, 'discovery-degraded');
  f.alerts.discovery('calendar', failed, state.discovery.calendar); await f.alerts.wait();
  assert.deepEqual(state.discovery.calendar.schedulerAlertOutbox.map(input => input.kind), ['discovery-degraded', 'discovery-recovered']);
});

test('first durable transition save includes its event and restart replays after crash before enqueue', {timeout: 15000}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lkb-scheduler-alert-transition-'));
  const accepted = {email: 'sent', dashboard: 'sent', calendar: 'disabled'};
  try {
    for (const kind of ['capture-started', 'capture-done', 'discovery-degraded', 'discovery-recovered']) {
      const file = join(directory, `${kind}.json`), initialCalls = [], crash = new Error('fixture crash after atomic durable write');
      const failed = {status: 'failed', lastSuccessAt: '2026-10-14T11:00:00.000Z', checkedAt: NOW};
      const healthy = {status: 'healthy', lastSuccessAt: NOW, checkedAt: NOW};
      let state = {version: 1, tenantId: 'tenant', operations: {'session-a': row('recording')},
        discovery: {calendar: kind === 'discovery-recovered' ? failed : healthy, gmail: healthy}}, writes = 0;
      const initial = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: async input => {initialCalls.push(input); return accepted;}}),
        assertOwned: () => {}, save: () => {writes++; writeWebinarOperationState(file, state); throw crash;},
        enqueueNotification: () => {throw new Error('notification must follow durable commit');}, log: () => {}, now: () => NOW});
      assert.throws(() => {
        if (kind === 'capture-started') initial.update('session-a', {artifact: 'fixture-recording.webm'}, kind);
        else if (kind === 'capture-done') initial.update('session-a', {status: 'ready'});
        else initial.acquireDiscovery({calendar: kind === 'discovery-degraded' ? failed : healthy, gmail: healthy});
      }, error => error === crash);
      await initial.wait(); assert.equal(writes, 1); assert.deepEqual(initialCalls, []);
      state = readWebinarOperationState(file, 'tenant', NOW);
      const carrier = kind.startsWith('capture-') ? state.operations['session-a'] : state.discovery.calendar;
      assert.deepEqual(carrier.schedulerAlertOutbox.map(input => input.kind), [kind]);
      if (kind === 'capture-started') assert.equal(carrier.artifact, 'fixture-recording.webm');
      if (kind === 'capture-done') assert.equal(carrier.status, 'ready');
      if (kind.startsWith('discovery-')) assert.equal(carrier.status, kind === 'discovery-degraded' ? 'failed' : 'healthy');
      const replayed = [], restarted = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: async input => {replayed.push(input); return accepted;}}),
        assertOwned: () => {}, save: () => writeWebinarOperationState(file, state), enqueueNotification: () => {}, log: () => {}, now: () => NOW});
      restarted.tick(); await restarted.wait(); assert.deepEqual(replayed.map(input => input.kind), [kind]);
      const durable = readWebinarOperationState(file, 'tenant', NOW);
      assert.deepEqual((kind.startsWith('capture-') ? durable.operations['session-a'] : durable.discovery.calendar).schedulerAlertOutbox, []);
    }
  } finally {rmSync(directory, {recursive: true, force: true});}
});

// ---- B10: failure alert mail (D-236, D-238). Real createCanonicalAlerts + raiseAlert + flushFailureDigest over a temp stateDir with a FAKE gws runner; no real mail. ----
const {raiseAlert, flushFailureDigest} = await import('../../../packages/meeting-bot/src/autojoin/alerts.ts');
const {loadAutojoinConfig} = await import('../../../packages/meeting-bot/src/autojoin/config.ts');
const {launchControlledRecording} = await import('../../../packages/meeting-bot/src/capture/reconnect-gaps.ts');
const {createOperationNotifications, createTelegramChannel} = await import('../../../packages/meeting-bot/src/capture/notify/telegram-channel.ts');
const {runSchedulerCycle} = await import('./dispatch.mjs');
const {safeText} = await import('../run-pipeline-deps.mjs');
const CFG = {present: true, discovery: true, webinarAutoJoin: true, careerPriority: true, testDataRouting: true,
  alerts: {email: true, dashboard: true, calendar: false, emailTo: 'operator@example.test', emailTestData: false},
  rateLimit: {emailPerHour: 6, failureEmailPerHour: 3, calendarMinGapSeconds: 60}};
const OLD_NAMES = ['capacity-full', 'capture-slot-unavailable', 'missed-coverage', 'missed-while-processing', 'retry-limit', 'cancelled', 'rescheduled',
  'coverage-review', 'controller-disconnected', 'privacy-controller-unavailable', 'interrupted-no-recording-artifact', 'rule-denied', 'opted-out',
  'rules-unevaluable', 'needs-registration', 'needs-review'];
const NEUTRAL = 'Coverage requires review.', CARRIED = 'admission_denied: Recording pipeline exited 1';
const REFUSED_LINE = 'lkb capture failed: admission_denied: Google Meet refused the bot; secret=abc';
const decodeMail = args => {
  const [head, body] = Buffer.from(JSON.parse(args[args.indexOf('--json') + 1]).raw, 'base64url').toString('utf8').split('\r\n\r\n');
  return {head, to: /^To: (.*)$/m.exec(head)[1].trim(), body: Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'),
    subject: Buffer.from(/Subject: =\?UTF-8\?B\?([^?]*)\?=/.exec(head)[1], 'base64').toString('utf8')};
};
function mailHarness({cfg = CFG, sender, raise, enqueueNotification = () => {}} = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), 'lkb-b10-')), state = {operations: {}}, calls = [], logs = [], inputs = [];
  let chain = Promise.resolve(); // the real runtime serialises raise and flush through one chain (deps-runtime.mjs:42-44)
  const serial = body => {const next = chain.then(body); chain = next.catch(() => {}); return next;};
  const deps = {stateDir, tenantId: 'tenant', cfg, now: () => NOW, log: line => logs.push(line), gws: async args => {calls.push(args); return sender ? sender(args) : '{}';}};
  const alerts = createCanonicalAlerts({state, tenantId: 'tenant', now: () => NOW, assertOwned: () => {}, save: () => {}, enqueueNotification, log: line => logs.push(line),
    autojoin: () => ({raise: input => {inputs.push(input); return raise ? raise(input) : serial(() => raiseAlert(deps, input));}}), flush: () => serial(() => flushFailureDigest(deps))});
  const mails = () => calls.map(decodeMail);
  return {alerts, state, calls, logs, inputs, mails, failures: () => mails().filter(mail => mail.subject.startsWith('[LKB bot] Recording FAILED')),
    ticks: async n => {for (let i = 0; i < n; i++) {alerts.tick(); await alerts.wait();}}, done: () => rmSync(stateDir, {recursive: true, force: true})};
}
const failedRow = (extra = {}) => ({status: 'failed', reason: CARRIED, title: 'Career webinar', careerGuidance: true, testData: false, ...extra});

test('B10-C1: one failure alert per failed capture over ticks, replays and a retry that fails again', async () => {
  const h = mailHarness();
  try {
    h.alerts.update('cap-x', failedRow({attempts: 1})); await h.alerts.wait(); await h.ticks(4);
    assert.equal(h.failures().length, 1);
    h.alerts.update('cap-x', {status: 'processing', attempts: 2}); h.alerts.update('cap-x', failedRow({attempts: 2})); await h.alerts.wait(); await h.ticks(2);
    assert.equal(h.failures().length, 1, 'a retry that fails again adds no second alert for the same capture');
    h.alerts.update('cap-y', failedRow({attempts: 1})); await h.alerts.wait(); await h.ticks(2);
    assert.equal(h.failures().length, 2);
    assert.ok(h.inputs.every(input => input.kind === 'capture-failed')); assert.deepEqual([...new Set(h.inputs.map(input => input.sessionKey))].sort(), ['cap-x', 'cap-y']);
    for (const mail of h.mails()) { assert.equal(mail.to, 'operator@example.test'); assert.equal((mail.head.match(/^To:/gm) ?? []).length, 1); assert.ok(!/^(Cc|Bcc):/im.test(mail.head)); }
    assert.equal(h.state.operations['cap-x'].status, 'failed');
  } finally {h.done();}
});

test('B10-C1: queued, recording, processing and ready captures send no failure alert; email off or no valid recipient sends nothing and does not throw', async () => {
  for (const status of ['queued', 'recording', 'processing', 'ready']) {
    const h = mailHarness();
    try {
      h.alerts.update('cap-z', {status, title: 'Career webinar', careerGuidance: true, testData: false}); await h.alerts.wait(); await h.ticks(2);
      assert.equal(h.failures().length, 0, status);
      assert.deepEqual(h.mails().map(mail => mail.subject.split(':')[0]), status === 'ready' ? ['[LKB bot] Recording finished'] : [], status);
    } finally {h.done();}
  }
  const directory = mkdtempSync(join(tmpdir(), 'lkb-b10-cfg-'));
  try {
    const cfgFor = emailTo => {
      const file = join(directory, 'autojoin.json'); writeFileSync(file, JSON.stringify({alerts: {email: true, dashboard: true, emailTo}}));
      return loadAutojoinConfig(directory, {LKB_AUTOJOIN_CONFIG: file}, () => {});
    };
    for (const [name, cfg, expected] of [['email off', {...CFG, alerts: {...CFG.alerts, email: false}}, 0], ['invalid recipient', cfgFor('not an address'), 0],
      ['no recipient', cfgFor(''), 0], ['valid recipient (control)', cfgFor('operator@example.test'), 1]]) {
      const h = mailHarness({cfg});
      try {
        h.alerts.update('cap-x', failedRow()); await h.alerts.wait(); await h.ticks(2);
        assert.equal(h.calls.length, expected, name); assert.equal(h.state.operations['cap-x'].status, 'failed', name);
      } finally {h.done();}
    }
  } finally {rmSync(directory, {recursive: true, force: true});}
});

test('B10-C2: the reason lookup matches a listed name only as a whole word, and every old exact reason keeps its own entry', () => {
  const detailOf = reason => canonicalOperationAlert('session-a', {...row('failed'), reason}).detail;
  for (const name of [...OLD_NAMES, 'admission_denied']) {
    assert.equal(detailOf(name), `Coverage: ${name}.`, name);
    assert.equal(detailOf(`${name}: free text`), `Coverage: ${name}.`); assert.equal(detailOf(`${name} - free text`), `Coverage: ${name}.`);
    for (const reason of [`${name}_extra`, `${name}x`, `${name}2`, `x${name}`, `the host said ${name} later`, `${name}é`, `${name}-foo`]) assert.equal(detailOf(reason), NEUTRAL, reason);
  }
  for (const reason of ['admission', '', 'admission_', 'Admission_Denied', 'private-secret']) assert.equal(detailOf(reason), NEUTRAL, JSON.stringify(reason));
  assert.equal(detailOf(undefined), undefined);
  // Review R1: a hyphen glued to a listed name is part of a longer value, never the end of the name (auto-record-policy.ts writes `rescheduled-completed`).
  for (const reason of ['rescheduled-completed', 'cancelled-by-host', 'retry-limit-reached', 'admission_denied-foo']) assert.equal(detailOf(reason), NEUTRAL, reason);
  assert.equal(detailOf('rescheduled'), 'Coverage: rescheduled.'); assert.equal(detailOf('rescheduled: x\r\n'), 'Coverage: rescheduled.');
});

test('B10-C3: the mail names the event and the matched name only; no secret from the reason, the environment or a URL title reaches it', async () => {
  const secrets = ['sk-ant-FAKEAPIKEY1234', '123456789:FAKE-TELEGRAM-TOKEN', 'pwd=FAKEPWD99', 'FAKEPASSCODE5521', 'the quarterly revenue is up', 'free text after the name'];
  const saved = {key: process.env.LKB_API_KEY, telegram: process.env.TELEGRAM_BOT_TOKEN}, h = mailHarness();
  process.env.LKB_API_KEY = secrets[0]; process.env.TELEGRAM_BOT_TOKEN = secrets[1];
  try {
    const reason = `admission_denied: ${secrets[5]} key ${secrets[0]} token ${secrets[1]} join https://meet.google.com/abc-defg-hij?${secrets[2]} passcode is ${secrets[3]} transcript: ${secrets[4]}`;
    h.alerts.update('cap-x', failedRow({reason, title: 'Career webinar https://meet.google.com/abc-defg-hij?pwd=TITLEPWD'})); await h.alerts.wait(); await h.ticks(2);
    assert.equal(h.mails().length, 1); const [mail] = h.mails(), text = `${mail.subject}\n${mail.body}`;
    assert.match(mail.subject, /^\[LKB bot\] Recording FAILED: Career webinar \[link removed\]$/); assert.ok(mail.body.split('\n').includes('Coverage: admission_denied.'));
    for (const secret of [...secrets, 'TITLEPWD', 'meet.google.com']) { assert.ok(!text.includes(secret), secret); assert.ok(!h.logs.join('\n').includes(secret), `log: ${secret}`); }
    assert.ok(!JSON.stringify(h.inputs).includes('FAKE'), 'the alert input carries only the matched name');
  } finally {
    for (const [name, value] of [['LKB_API_KEY', saved.key], ['TELEGRAM_BOT_TOKEN', saved.telegram]]) value === undefined ? delete process.env[name] : process.env[name] = value;
    h.done();
  }
});

const fakeChild = (code, stderr = '') => () => {
  const child = Object.assign(new EventEmitter(), {stdout: new EventEmitter(), stderr: new EventEmitter(), connected: false});
  setImmediate(() => { if (stderr) child.stderr.emit('data', Buffer.from(stderr)); child.emit('close', code); });
  return child;
};
/** Runs the REAL runSchedulerCycle (dispatch.mjs) for the given captures; each capture's child is a fake spawn through the REAL launcher. */
async function cycle(h, captures) {
  const executed = [], items = captures.map(([id]) => ({sessionKey: id, title: 'Career webinar', meetingUrl: 'https://meet.google.com/abc-defg-hij',
    startTime: '2026-10-14T12:00:00.000Z', endTime: '2026-10-14T13:00:00.000Z'}));
  await runSchedulerCycle({state: h.state, pool: undefined, now: () => NOW, update: h.alerts.update, select: () => ({toSchedule: items, skipped: []}),
    complete: () => false, finishOperation: () => {}, root: process.cwd(), env: {}, work: 'work', deps: {validateTenant: async () => {}},
    execute: async (id, args) => { executed.push(id); await launchControlledRecording(process.cwd(), args, {LKB_TENANT_ID: 'tenant'}, () => {}, undefined, captures.find(([key]) => key === id)[1]); },
    refresh: async () => ({}), register: async () => {}, setPreview: () => {}, notify: () => {}, graphEnabled: () => false, reconsider: () => false,
    confined: (_root, path) => path, safeText, log: line => h.logs.push(line), tenantId: 'tenant', validId: id => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id),
    priority: () => 0, tagsForItem: () => ({careerGuidance: true, testData: false}), prepareCapture: async () => {}});
  return executed;
}

test('B10-C4: a refused capture reaches the failed row as admission_denied and sends one mail naming it; any other exit gives the neutral line', async () => {
  for (const [name, child, reason, line] of [['refused', fakeChild(1, `${REFUSED_LINE}\n`), CARRIED, 'Coverage: admission_denied.'],
    ['no stderr', fakeChild(1), 'Recording pipeline exited 1', NEUTRAL]]) {
    const h = mailHarness();
    try {
      await cycle(h, [['cap-x', child]]); await h.alerts.wait(); await h.ticks(2);
      assert.equal(h.state.operations['cap-x'].status, 'failed', name); assert.equal(h.state.operations['cap-x'].reason, reason, name);
      assert.equal(h.failures().length, 1, name); assert.equal(h.mails().length, 1, name);
      assert.ok(h.failures()[0].body.split('\n').includes(line), `${name}: ${h.failures()[0].body}`);
      assert.equal(h.failures()[0].body.includes('admission_denied'), name === 'refused');
      assert.ok(!h.mails().map(mail => mail.body).concat(h.logs).join('\n').includes('secret=abc'), name); assert.equal(h.inputs[0].sessionKey, 'cap-x');
    } finally {h.done();}
  }
});

test('B10-C5: a failing sender changes no row, never blocks the next capture, leaks nothing, and stops after 3 attempts', async () => {
  for (const [name, options, sends] of [['throws', {sender: async () => {throw new Error('sender exploded');}}, 3], ['exits non-zero', {sender: async () => {throw new Error('gws failed (1): quota');}}, 3],
    ['raise itself rejects', {raise: async () => {throw new Error('capture owner lost');}}, 0]]) {
    const h = mailHarness(options);
    try {
      const executed = await cycle(h, [['cap-x', fakeChild(1, `${REFUSED_LINE}\n`)], ['cap-y', fakeChild(0)]]); await h.alerts.wait();
      assert.deepEqual(executed, ['cap-x', 'cap-y'], name);
      assert.equal(h.state.operations['cap-x'].status, 'failed', name); assert.equal(h.state.operations['cap-x'].reason, CARRIED, name);
      assert.equal(h.state.operations['cap-y'].status, 'recording', name); assert.ok(h.logs.some(line => line.includes(sends ? 'alert email failed' : 'Scheduler alert unavailable')), name);
      await h.ticks(6); assert.ok(!h.logs.join('\n').includes('secret=abc'), name);
      assert.equal(h.calls.length, sends, `${name}: at most MAX_ATTEMPTS (3) sends for one capture and kind, then it stops`);
      assert.equal(h.state.operations['cap-x'].reason, CARRIED, name);
    } finally {h.done();}
  }
  let attempts = 0; const delivered = [], h = mailHarness({sender: async args => {if (++attempts <= 2) throw new Error('gws failed (1): temporary'); delivered.push(args); return '{}';}});
  try {
    h.alerts.update('cap-x', failedRow()); await h.alerts.wait(); await h.ticks(6);
    assert.equal(attempts, 3, 'two failed attempts, then one that works, then no more'); assert.equal(delivered.length, 1, 'exactly one mail in the end');
  } finally {h.done();}
});

test('B10-C5: a sender that hangs until the 30 s gws timeout is bounded per tick (measured on a fake clock)', async t => {
  const h = mailHarness({sender: () => new Promise((_, reject) => {setTimeout(() => reject(new Error('gws failed (ETIMEDOUT): ')), 30_000);})});
  mock.timers.enable({apis: ['setTimeout']});
  const drain = async promise => { // advance the fake clock in 30 s steps until the promise settles; returns fake ms elapsed
    let settled = false, elapsed = 0; promise.then(() => {settled = true;});
    for (;;) { await new Promise(resolve => setImmediate(resolve)); if (settled) return elapsed; mock.timers.tick(30_000); elapsed += 30_000; }
  };
  try {
    h.alerts.update('cap-x', failedRow()); const first = await drain(h.alerts.wait());
    const before = h.calls.length; h.alerts.tick(); const tick = await drain(h.alerts.wait());
    t.diagnostic(`measured: first send ${first} ms; one tick ${tick} ms with ${h.calls.length - before} send attempt(s)`);
    assert.equal(h.state.operations['cap-x'].status, 'failed'); assert.equal(h.state.operations['cap-x'].reason, CARRIED);
    assert.ok(tick <= 3 * 30_000 && h.calls.length - before <= 3, 'one tick makes at most 3 attempts of 30 s');
    assert.ok(h.calls.length <= 3, 'never more than MAX_ATTEMPTS');
  } finally {mock.timers.reset(); h.done();}
});

test('B10-C6: Telegram and email are independent; with Telegram set one failure gives one Telegram message and one mail, with it unset one mail', async () => {
  for (const telegram of [true, false]) {
    const texts = [], channel = createTelegramChannel({token: telegram ? 'FAKE-TOKEN' : '', chatId: telegram ? 'FAKE-CHAT' : '', log: () => {}, send: async (_token, _chat, text) => {texts.push(text);}});
    const notify = async ({sessionId, status}) => { if (!channel) return 'disabled'; await channel.send(`Webinar ${sessionId}: ${status}`); return 'sent'; };
    let notifications; const h = mailHarness({enqueueNotification: id => notifications.enqueue(id)});
    notifications = createOperationNotifications({state: h.state, save: () => {}, log: () => {}, now: () => NOW, notifyOperation: notify});
    try {
      h.alerts.update('cap-x', failedRow()); await h.alerts.wait(); await notifications.wait(); await h.ticks(2);
      assert.equal(texts.length, telegram ? 1 : 0); assert.equal(h.failures().length, 1); assert.equal(h.state.operations['cap-x'].notification.status, telegram ? 'sent' : 'disabled');
    } finally {h.done();}
  }
});
