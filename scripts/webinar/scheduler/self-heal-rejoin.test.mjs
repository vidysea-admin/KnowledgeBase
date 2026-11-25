/**
 * H1 recorder-self-heal-rejoin (contract qa/contracts/recorder-self-heal-rejoin.md, criteria H1-C1..C10).
 * Seam: the REAL runPipelineTick -> runSchedulerCycle recovery loop + real selectAutoRecordItems + real createCanonicalAlerts + real raiseAlert
 * over a temp state directory with a real operations.json. Fakes: clock, calendar, capture launcher, mail sender. No browser, mail, network or .env.
 * A "crash" is the row a dead process leaves: status recording, attempts n, owner absent. A process that dies mid-capture is built by abandoning a
 * tick whose launcher never settles (its state file stays at `recording`, exactly as a killed process leaves it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runPipelineTick} from '../run-pipeline.mjs';
import {runSchedulerCycle} from './dispatch.mjs';
import {event, withFixture, completed} from '../run-pipeline-fixtures.mjs';
const {webinarIdentity, webinarSessionKey} = await import('../../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {raiseAlert} = await import('../../../packages/meeting-bot/src/autojoin/alerts.ts');
const {canonicalOperationAlert} = await import('./lifecycle-alerts.mjs');

const RUNNING = '2026-09-30T12:30:00Z', ENDED = '2026-09-30T13:00:00Z', LAST_SECOND = '2026-09-30T12:59:59Z';
const idOf = ev => webinarSessionKey(webinarIdentity(ev.meetingUrl, ev.startTime));
const ID = idOf(event());
const statePath = f => join(f.stateDir, 'operations.json');
const readOps = f => JSON.parse(readFileSync(statePath(f), 'utf8')).operations;
const flush = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => {for (let i = 0; i < 40; i++) await flush();};
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const crashRow = (extra = {}) => ({tenantId: 'fixture', status: 'recording', attempts: 1, title: 'University webinar', startTime: event().startTime,
  endTime: event().endTime, captureSlot: 'career-a', careerGuidance: true, testData: false, ...extra});
const seed = (f, rows) => writeFileSync(statePath(f), JSON.stringify({version: 1, tenantId: 'fixture', operations: rows}));

const CFG = {present: true, discovery: true, webinarAutoJoin: true, careerPriority: true, testDataRouting: true,
  alerts: {email: true, dashboard: true, calendar: false, emailTo: 'operator@example.test', emailTestData: false},
  rateLimit: {emailPerHour: 6, failureEmailPerHour: 3, calendarMinGapSeconds: 60}};
const decodeMail = args => {
  const [head, body] = Buffer.from(JSON.parse(args[args.indexOf('--json') + 1]).raw, 'base64url').toString('utf8').split('\r\n\r\n');
  return {head, to: /^To: (.*)$/m.exec(head)[1].trim(), body: Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'),
    subject: Buffer.from(/Subject: =\?UTF-8\?B\?([^?]*)\?=/.exec(head)[1], 'base64').toString('utf8')};
};

/** Service-mode fixture (pool of two owned slots) with the REAL alert sink writing mail through a fake sender. */
function serviceFixture(f, {cfg = CFG, clock = RUNNING} = {}) {
  const alertDir = mkdtempSync(join(tmpdir(), 'lkb-h1-alerts-')), calls = [], results = [];
  let chain = Promise.resolve(); const serial = body => {const next = chain.then(body); chain = next.catch(() => {}); return next;};
  const alertDeps = {stateDir: alertDir, tenantId: 'fixture', cfg, now: () => f.clock(), log: line => f.logs.push(line), gws: async args => {calls.push(args); return '{}';}};
  f.clock = () => clock; f.setClock = value => {clock = value;};
  f.deps.now = () => f.clock();
  f.deps.env.LKB_JOIN_RULES_ENFORCE = 'last-valid';
  f.deps.captureSlots = ['career-a', 'career-b']; f.deps.validateCaptureSlots = async () => {};
  f.deps.captureSlotSupports = () => true; f.deps.validateCaptureSlot = async () => {}; f.deps.refreshSchedulerPolicy = async () => true;
  f.deps.flushSchedulerAlerts = async () => {}; f.deps.applyJoinRules = async selection => selection;
  f.deps.captureWait = (ms, signal) => new Promise(resolve => signal?.addEventListener('abort', resolve, {once: true})); // no real 30 s timer; a killed process never wakes up
  f.deps.autojoin = {cfg: {discovery: true, webinarAutoJoin: true, careerPriority: true, testDataRouting: true},
    topic: {keywords: ['career'], weights: {title: 3, description: 1, sender: 2}, minScore: 3}, tagsDir: join(f.root, 'raw/webinars/capture-tags'),
    raise: input => serial(async () => {const result = await raiseAlert(alertDeps, input); results.push({input, result}); return result;})};
  f.alertDeps = alertDeps; f.alertDir = alertDir; f.mailCalls = calls; f.alertResults = results;
  f.mails = () => calls.map(decodeMail);
  const cleanup = f.cleanup; f.cleanup = () => {cleanup(); rmSync(alertDir, {recursive: true, force: true});};
}
const stubLaunch = f => {f.deps.launch = async args => {f.calls.push(args); completed(f.root, args[args.indexOf('--session-id') + 1]);};};

/** One restarted process, one cycle: launches settle, then the process ends normally. */
async function restart(f, {waits} = {}) {
  const stop = new AbortController();
  f.deps.schedulerWait = async ms => {await settle(); waits?.push({ms, launched: f.calls.length}); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  await settle(); return result;
}
/** One process that is KILLED while its launcher is running: the state file keeps `recording`; the lock file is the dead process's. */
async function restartAndDie(f, {onLaunch} = {}) {
  const launched = deferred(), cycleDone = deferred(); let snapshot;
  f.deps.launch = args => {
    snapshot = JSON.parse(readFileSync(statePath(f), 'utf8')).operations[args[args.indexOf('--session-id') + 1]];
    f.calls.push(args); onLaunch?.(args); launched.resolve(); return new Promise(() => {});
  };
  f.deps.schedulerWait = () => {cycleDone.resolve(); return new Promise(() => {});};
  const tick = runPipelineTick(f.deps, true, {watch: true, signal: new AbortController().signal}); tick.catch(() => {});
  await Promise.race([launched.promise, cycleDone.promise]); await settle();
  rmSync(join(f.stateDir, 'poller.lock'), {force: true}); // the killed process's lock
  return snapshot;
}
const launches = f => f.calls.filter(args => args[0] === 'record');
const arg = (args, name) => args[args.indexOf(name) + 1];
const forget = f => rmSync(join(f.root, 'data/toc-migrated', ID), {recursive: true, force: true}); // a finished capture leaves its index proof; a later seed must not inherit it
const iso = value => new Date(value).toISOString();
const words = body => body.split('\n').filter(line => !/^(Scheduled|Topic):/.test(line)).join('\n'); // the schedule and topic lines follow the row; the wording is what each interruption owns

test('H1-C1 and C2: a started-but-not-ended meeting left at `recording` is rejoined by the first cycle of the new process, with no input but state, clock and stubs', () => withFixture(async f => {
  serviceFixture(f); seed(f, {[ID]: crashRow()}); stubLaunch(f); const waits = [];
  await restart(f, {waits});
  assert.equal(launches(f).length, 1);
  const [args] = launches(f);
  assert.equal(args[1], event().meetingUrl); assert.equal(arg(args, '--session-id'), ID); assert.equal(arg(args, '--until'), iso(event().endTime));
  assert.equal(arg(args, '--tenant'), 'fixture');
  // C2: the launcher ran in the first cycle, before the first interval wait (POLL_MS 300000 ms), not in a later attendance interval.
  assert.deepEqual(waits.map(wait => [wait.ms, wait.launched]), [[300000, 1]]);
  assert.equal(readOps(f)[ID].status, 'ready'); assert.equal(readOps(f)[ID].attempts, 2);
}, true));

test('H1-C1: single-slot mode (pool absent) rejoins the same way', () => withFixture(async f => {
  serviceFixture(f); seed(f, {[ID]: crashRow({captureSlot: undefined})}); stubLaunch(f);
  await runPipelineTick(f.deps, true); await settle();
  assert.equal(launches(f).length, 1); assert.equal(arg(launches(f)[0], '--session-id'), ID); assert.equal(arg(launches(f)[0], '--until'), iso(event().endTime));
  assert.equal(arg(launches(f)[0], '--tenant'), 'fixture'); assert.ok(!launches(f)[0].includes('--capture-slot'));
}, true));

test('H1-C1: rows that are not an interrupted capture are not rejoined', () => withFixture(async f => {
  for (const [status, extra] of [['ready', {}], ['action_required', {reason: 'cancelled'}], ['processing', {}]]) {
    f.calls.length = 0; serviceFixture(f); seed(f, {[ID]: crashRow({status, ...extra})}); stubLaunch(f);
    await restart(f);
    assert.equal(launches(f).length, 0, status);
    if (status !== 'processing') assert.equal(readOps(f)[ID].status, status, status);
  }
}, true));

test('H1-C3: every interruption is mailed once, in its own pass, with its own wording; the second interruption is not a duplicate; the third is the stop', () => withFixture(async f => {
  serviceFixture(f); seed(f, {[ID]: crashRow()});
  const attemptsSeenByLauncher = [];
  await restartAndDie(f, {onLaunch: () => attemptsSeenByLauncher.push(readOps(f)[ID].attempts)});
  assert.equal(f.mails().length, 1); assert.equal(launches(f).length, 1);
  await restartAndDie(f, {onLaunch: () => attemptsSeenByLauncher.push(readOps(f)[ID].attempts)});
  assert.equal(f.mails().length, 2, 'the second interruption of one meeting is mailed too'); assert.equal(launches(f).length, 2);
  assert.deepEqual(attemptsSeenByLauncher, [2, 3], 'the attempt number is on disk BEFORE the launcher is called');
  await restartAndDie(f); // attempts is 3: the third interruption is the stop
  assert.equal(launches(f).length, 2, 'no fourth capture'); assert.equal(f.mails().length, 3);
  const [first, second, stop] = f.mails();
  assert.ok(first.body.split('\n').includes('Coverage: interrupted-rejoining.'), first.body); assert.match(first.body, /rejoining the meeting/);
  assert.equal(words(second.body), words(first.body)); assert.ok(first.subject.includes('interrupted'), first.subject);
  assert.ok(stop.body.split('\n').includes('Coverage: retry-limit.'), stop.body); assert.match(stop.body, /will not rejoin/);
  assert.notEqual(words(stop.body), words(first.body));
  for (const mail of f.mails()) { assert.match(mail.body, /lost and not kept/); assert.equal(mail.to, 'operator@example.test'); assert.equal((mail.head.match(/^To:/gm) ?? []).length, 1); }
  const interruptionResults = f.alertResults.filter(r => r.input.interruption).map(r => r.result.email);
  assert.equal(interruptionResults.filter(r => r === 'sent').length, 3); assert.ok(interruptionResults.every(r => ['sent', 'duplicate'].includes(r)), interruptionResults.join());
  assert.equal(readOps(f)[ID].status, 'action_required'); assert.equal(readOps(f)[ID].reason, 'retry-limit');
}, true));

test('H1-C3 and C4: a meeting that has ended is not rejoined; one mail of its own wording; one second earlier it is rejoined, no minimum time left', () => withFixture(async f => {
  serviceFixture(f, {clock: ENDED}); seed(f, {[ID]: crashRow()}); stubLaunch(f);
  await restart(f);
  assert.equal(launches(f).length, 0); assert.equal(readOps(f)[ID].status, 'action_required'); assert.equal(readOps(f)[ID].reason, 'interrupted-ended');
  assert.equal(f.mails().length, 1); assert.ok(f.mails()[0].body.split('\n').includes('Coverage: interrupted-ended.'), f.mails()[0].body);
  assert.match(f.mails()[0].body, /already ended/); assert.match(f.mails()[0].body, /lost and not kept/);
  await restart(f); assert.equal(f.mails().length, 1, 'a later pass sends nothing more'); assert.equal(launches(f).length, 0);
  f.setClock(LAST_SECOND); seed(f, {[ID]: crashRow()}); await restart(f);
  assert.equal(launches(f).length, 1, 'one second before the end it is rejoined');
}, true));

test('H1-C3: email off or no valid recipient sends nothing, throws nothing, and the rejoin decision is unchanged', () => withFixture(async f => {
  for (const alerts of [{...CFG.alerts, email: false}, {...CFG.alerts, email: false, emailTo: ''}]) {
    f.calls.length = 0; forget(f); serviceFixture(f, {cfg: {...CFG, alerts}}); seed(f, {[ID]: crashRow()}); stubLaunch(f);
    await restart(f);
    assert.equal(f.mailCalls.length, 0, `${alerts.email} ${alerts.emailTo} ${JSON.stringify(f.alertResults.map(r => [r.input.kind, r.result]))}`); assert.equal(launches(f).length, 1);
  }
}, true));

test('H1-C3: interruption mails use the existing failure cap; the stop mail is never rolled into the digest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lkb-h1-cap-')), calls = [];
  const deps = {stateDir: dir, tenantId: 'tenant', cfg: {...CFG, rateLimit: {...CFG.rateLimit, failureEmailPerHour: 1}}, now: () => '2026-10-14T12:00:00.000Z', log: () => {},
    gws: async args => {calls.push(args); return '{}';}};
  const base = {tenantId: 'tenant', title: 'Career webinar', careerGuidance: true, testData: false, updatedAt: deps.now()};
  const alertOf = (row, outcomeRow) => canonicalOperationAlert('cap-x', {...base, ...row, interruption: outcomeRow});
  try {
    const rejoin1 = alertOf({status: 'queued', reason: 'interrupted-rejoining'}, {n: 1, outcome: 'rejoining'});
    const rejoin2 = alertOf({status: 'queued', reason: 'interrupted-rejoining'}, {n: 2, outcome: 'rejoining'});
    const stop = alertOf({status: 'action_required', reason: 'retry-limit'}, {n: 3, outcome: 'stopped'});
    assert.deepEqual([rejoin1, rejoin2, stop].map(a => a.interruption.outcome), ['rejoining', 'rejoining', 'stopped']);
    assert.equal((await raiseAlert(deps, rejoin1)).email, 'sent');
    assert.equal((await raiseAlert(deps, rejoin2)).email, 'digest-queued', 'a burst beyond the cap rolls into the digest as today');
    assert.equal((await raiseAlert(deps, rejoin2)).email, 'duplicate', 'one interruption is still mailed once');
    assert.equal((await raiseAlert(deps, stop)).email, 'sent', 'the terminal alert is sent at once, never held for a digest');
    assert.equal(calls.length, 2);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('H1-C5: a crash loop rejoins at most twice; the stop is mailed once and later passes launch and send nothing', () => withFixture(async f => {
  serviceFixture(f); seed(f, {}); // the first capture comes from the ordinary scheduler; the process is then killed after each launch
  const seen = [];
  for (let n = 0; n < 5; n++) await restartAndDie(f, {onLaunch: () => seen.push(readOps(f)[ID].attempts)});
  assert.equal(launches(f).length, 3, 'exactly three launches in total: the first capture and two rejoins');
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(readOps(f)[ID].status, 'action_required'); assert.equal(readOps(f)[ID].reason, 'retry-limit');
  assert.equal(f.mails().filter(mail => mail.body.includes('Coverage: retry-limit.')).length, 1, 'one stop mail, no storm');
  assert.equal(f.mails().length, 3, 'two rejoin mails and one stop mail; the first capture sends none');
}, true));

test('H1-C5: a graceful stop still restores attempts and does not use up an attempt', () => withFixture(async f => {
  serviceFixture(f); seed(f, {}); const stop = new AbortController(); let launched = 0;
  f.deps.launch = async () => {launched++;};
  f.deps.log = line => {f.logs.push(line); if (line.endsWith(': recording')) stop.abort();};
  f.deps.schedulerWait = async () => {await settle();};
  await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  const row = Object.values(readOps(f))[0];
  assert.equal(launched, 0); assert.equal(row.status, 'queued'); assert.equal(row.reason, 'service-stopped'); assert.equal(row.attempts, 0);
}, true));

test('H1-C6: with the first rejoin still running, four cycles and three alert replays start the meeting once; a second process cannot take the lane; two clashing meetings are each rejoined once', () => withFixture(async f => {
  const second = event({id: 'cal-two', meetingUrl: 'https://meeting.zoho.com/meeting/456'}), secondId = idOf(second);
  f.deps.loadCalendarEvents = async () => [event(), second];
  serviceFixture(f); seed(f, {[ID]: crashRow(), [secondId]: crashRow({captureSlot: 'career-b'})});
  const hold = deferred(), stop = new AbortController(); let cycles = 0, contender;
  f.deps.launch = async args => {f.calls.push(args); await hold.promise; completed(f.root, arg(args, '--session-id'));};
  f.deps.schedulerWait = async () => {
    await settle(); cycles++;
    if (cycles === 1) contender = await assert.rejects(runPipelineTick({...f.deps}, true, {watch: true, signal: new AbortController().signal}), /Another poller owns this lane/);
    if (cycles === 4) {hold.resolve(); stop.abort();}
  };
  await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(cycles, 4); assert.equal(launches(f).length, 2, 'each of the two meetings started exactly once over four cycles');
  assert.deepEqual(launches(f).map(args => arg(args, '--session-id')).sort(), [ID, secondId].sort());
  assert.equal(contender, undefined);
  assert.equal(f.mails().length, 2, 'one rejoin mail per meeting; a running capture is not interrupted again by later cycles or replays');
  assert.equal(readOps(f)[ID].interruption.n, 1); assert.equal(readOps(f)[secondId].interruption.n, 1);
}, true));

test('H1-C6: a rejoin that finds the capture lock held fails as an attempt that counts, and starts nothing beside the holder', () => withFixture(async f => {
  serviceFixture(f); seed(f, {[ID]: crashRow()});
  f.deps.launch = async args => {f.calls.push(args); throw new Error('capture lock held by a live process');};
  await restart(f);
  assert.equal(launches(f).length, 1); assert.equal(readOps(f)[ID].status, 'failed'); assert.equal(readOps(f)[ID].attempts, 2); // the lock holder is a fake that this test never touches; "starts nothing beside the holder" is the single launch above
  await restart(f); // own-error rejoin (D-244 default): attempt 3, fails again
  assert.equal(readOps(f)[ID].attempts, 3);
  await restart(f); assert.equal(launches(f).length, 2, 'the attempt limit bounds the loop'); assert.equal(readOps(f)[ID].reason, 'retry-limit');
}, true));

test('H1-C7: a rejoin is a join: cancellation, rule denial, opt-out and an unsafe or vanished link stop it with the existing reason and zero launcher calls', () => withFixture(async f => {
  const cases = [
    ['cancelled', () => {f.deps.applyJoinRules = async selection => ({toSchedule: [], skipped: [...selection.skipped,
      ...selection.toSchedule.map(item => ({sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title, reason: 'cancelled'}))]});}, 'cancelled'],
    ['cancelled in the calendar (no earlier inventory in a fresh process)', () => {f.deps.loadCalendarEvents = async () => [event({cancelled: true})];}, 'coverage-review'],
    ['rule-denied', () => {f.deps.applyJoinRules = async selection => ({toSchedule: [], skipped: [...selection.skipped,
      ...selection.toSchedule.map(item => ({sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title, reason: 'rule-denied'}))]});}, 'rule-denied'],
    ['opted-out', () => {f.deps.applyJoinRules = async selection => ({toSchedule: [], skipped: [...selection.skipped,
      ...selection.toSchedule.map(item => ({sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title, reason: 'opted-out'}))]});}, 'opted-out'],
    ['link no longer safe', () => {f.deps.loadCalendarEvents = async () => [event({meetingUrl: 'http://meeting.zoho.com/meeting/123'})];}, 'coverage-review'],
  ];
  for (const [name, mutate, reason] of cases) {
    f.calls.length = 0; f.deps.loadCalendarEvents = async () => [event()]; serviceFixture(f); mutate(); seed(f, {[ID]: crashRow()}); stubLaunch(f);
    await restart(f);
    assert.equal(launches(f).length, 0, name); assert.equal(readOps(f)[ID].status, 'action_required', name); assert.equal(readOps(f)[ID].reason, reason, name);
  }
}, true));

test('H1-C7: the privacy gate decides a rejoin exactly as it decides a first join', () => withFixture(async f => {
  const outcome = async rows => {
    f.calls.length = 0; forget(f); serviceFixture(f); seed(f, rows); f.deps.env.LKB_CAPTURE_CONTROL_DIR = join(f.root, 'private-controls');
    f.deps.launch = async (args, env, onLine, onControl) => {f.calls.push(args); onControl({generation: '11111111-1111-4111-8111-111111111111', stop: async () => 'accepted'}); await settle(); completed(f.root, arg(args, '--session-id'));};
    await restart(f); return {status: readOps(f)[ID].status, reason: readOps(f)[ID].reason, calls: launches(f).length};
  };
  const first = await outcome({}), rejoin = await outcome({[ID]: crashRow()});
  assert.deepEqual(rejoin, first); assert.equal(rejoin.reason, 'privacy-controller-unavailable');
}, true));

test('H1-C8 and I6: a rejoin drops the interrupted partial: no finalize, no processing row, and the old file is neither deleted nor overwritten', () => withFixture(async f => {
  serviceFixture(f); const old = join(f.root, 'old-partial.webm'); writeFileSync(old, 'partial media bytes');
  seed(f, {[ID]: crashRow({artifact: old})});
  f.deps.launch = async (args, env, onLine) => {
    f.calls.push(args); const fresh = join(f.root, 'new-capture.webm'); writeFileSync(fresh, 'new media'); onLine(`audio/video recording started: ${fresh}`);
    completed(f.root, arg(args, '--session-id'));
  };
  await restart(f);
  assert.deepEqual(f.calls.map(args => args[0]), ['record'], 'no finalize call for the interrupted partial');
  assert.ok(!f.logs.some(line => line.endsWith(': processing')), 'no processing row from the old file');
  assert.equal(readFileSync(old, 'utf8'), 'partial media bytes'); assert.equal(statSync(old).size, 19);
  assert.equal(readOps(f)[ID].interruptedArtifact, old, 'the old file stays findable for a later unit');
  assert.ok(readOps(f)[ID].artifact.endsWith('new-capture.webm'), 'the row points at the new capture');
}, true));

test('H1-C9: refused admission, rows without a launched attempt, ended meetings with a surviving file, ready rows and non-interrupted retry-limit behave as before', () => withFixture(async f => {
  serviceFixture(f); stubLaunch(f);
  seed(f, {[ID]: crashRow({status: 'failed', reason: 'admission_denied: Google Meet refused the bot; no recording made'})});
  await restart(f);
  assert.equal(launches(f).length, 0, 'a host refusing the bot is never retried');
  assert.equal(readOps(f)[ID].status, 'action_required'); assert.equal(readOps(f)[ID].reason, 'interrupted-no-recording-artifact');
  seed(f, {[ID]: crashRow({status: 'failed', attempts: 0, reason: 'Capture slot evidence revoked'})}); await restart(f);
  assert.equal(launches(f).length, 0, 'a failure before any launch is not a crash'); assert.equal(readOps(f)[ID].reason, 'interrupted-no-recording-artifact');
  const kept = join(f.root, 'ended-partial.webm'); writeFileSync(kept, 'media'); f.setClock(ENDED);
  seed(f, {[ID]: crashRow({artifact: kept})}); await restart(f);
  assert.deepEqual(f.calls.map(args => args[0]), ['finalize'], 'an ended meeting with a surviving recording is finalized as today');
  f.calls.length = 0; f.setClock(RUNNING); f.deps.loadCalendarEvents = async () => [];
  seed(f, {'plain-retry': crashRow({status: 'processing', attempts: 3})}); await restart(f);
  assert.equal(readOps(f)['plain-retry'].reason, 'retry-limit'); assert.equal(launches(f).length, 0);
  assert.ok(!f.mails().some(mail => /rejoin/.test(mail.body)), 'a non-interrupted retry-limit keeps its old plain alert');
}, true));

test('H1-C9 [ASSUMPTION, D-244 default]: a capture that failed on its own error before any recording file exists is rejoined like a crash; a failed row with a saved recording keeps today\'s finalize', () => withFixture(async f => {
  serviceFixture(f); stubLaunch(f);
  seed(f, {[ID]: crashRow({status: 'failed', reason: 'Recording pipeline exited 1'})}); await restart(f);
  assert.equal(launches(f).length, 1); assert.equal(readOps(f)[ID].status, 'ready');
  f.calls.length = 0; forget(f); const saved = join(f.root, 'failed-saved.webm'); writeFileSync(saved, 'media');
  seed(f, {[ID]: crashRow({status: 'failed', reason: 'Child exited without a completed index marker', artifact: saved})}); await restart(f);
  assert.deepEqual(f.calls.map(args => args[0]), ['finalize']);
}, true));

test('H1-C10: the mails carry no join URL, passcode, token or recording path', () => withFixture(async f => {
  serviceFixture(f); const path = join(f.root, 'private-recordings', 'secret-name-9911.webm');
  const secrets = ['pwd=FAKEPWD99', 'FAKEPASSCODE5521', 'FAKE-TELEGRAM-TOKEN', 'secret-name-9911', 'meet.google.com'];
  seed(f, {[ID]: crashRow({title: 'Career webinar https://meet.google.com/abc-defg-hij?pwd=FAKEPWD99', artifact: path,
    reason: 'passcode is FAKEPASSCODE5521 token FAKE-TELEGRAM-TOKEN https://meet.google.com/abc-defg-hij?pwd=FAKEPWD99'})});
  await restartAndDie(f); await restartAndDie(f); await restartAndDie(f);
  assert.equal(f.mails().length, 3);
  for (const mail of f.mails()) {
    const text = `${mail.subject}\n${mail.body}`;
    for (const secret of secrets) assert.ok(!text.includes(secret), secret);
  }
  assert.ok(!f.logs.join('\n').includes('FAKEPASSCODE5521'));
}, true));

test('H1-C10: a link in a title is removed from the interruption subject by the existing sink', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lkb-h1-c10-')), calls = [];
  try {
    const alert = canonicalOperationAlert('c10-x', {tenantId: 'tenant', status: 'queued', reason: 'interrupted-rejoining', interruption: {n: 1, outcome: 'rejoining'},
      title: 'Career webinar https://meet.google.com/abc-defg-hij?pwd=FAKEPWD99', careerGuidance: true, testData: false});
    await raiseAlert({stateDir: dir, tenantId: 'tenant', cfg: CFG, now: () => '2026-10-14T12:00:00.000Z', log: () => {}, gws: async args => {calls.push(args); return '{}';}}, alert);
    const [mail] = calls.map(decodeMail); assert.match(mail.subject, /\[link removed\]/);
    assert.ok(!`${mail.subject}${mail.body}`.includes('FAKEPWD99'));
  } finally {rmSync(dir, {recursive: true, force: true});}
});

const STOP = {tenantId: 'fixture', sessionId: ID, generation: '11111111-1111-4111-8111-111111111111', reason: 'cancelled', requestedAt: '2026-09-30T12:10:00.000Z'};
test('H1-C7: a row that already carries a stop request is never rejoined (a rejoin could not be stopped again); it keeps today handling and alert', () => withFixture(async f => {
  for (const [name, row] of [['recording + cancelled stop', crashRow({stopDisposition: STOP})],
    ['recording + controller-disconnected stop, acknowledged', crashRow({stopDisposition: {...STOP, reason: 'controller-disconnected', acknowledged: 'accepted'}})],
    ['failed + stop', crashRow({status: 'failed', reason: 'Recording pipeline exited 1', stopDisposition: STOP})]]) {
    f.calls.length = 0; forget(f); serviceFixture(f); seed(f, {[ID]: row}); stubLaunch(f);
    await restart(f);
    assert.equal(launches(f).length, 0, name); assert.equal(readOps(f)[ID].status, 'action_required', name);
    assert.equal(readOps(f)[ID].reason, 'interrupted-no-recording-artifact', name); assert.ok(readOps(f)[ID].stopDisposition, name);
    assert.equal(readOps(f)[ID].interruption, undefined, name);
    assert.ok(!f.mails().some(mail => /rejoining/.test(mail.body)), name);
  }
}, true));

test('H1-C7: a stop-requested row with a surviving recording is finalized as today, never rejoined', () => withFixture(async f => {
  serviceFixture(f); stubLaunch(f); const saved = join(f.root, 'stopped-partial.webm'); writeFileSync(saved, 'media');
  seed(f, {[ID]: crashRow({stopDisposition: STOP, artifact: saved})}); await restart(f);
  assert.deepEqual(f.calls.map(args => args[0]), ['finalize']);
}, true));

test('H1-C7: a monitoring gap of the dead process is not a stop request; the rejoin starts a fresh capture and the gap is not carried onto it', () => withFixture(async f => {
  serviceFixture(f); stubLaunch(f);
  seed(f, {[ID]: crashRow({monitorGap: {tenantId: 'fixture', sessionId: ID, reason: 'discovery-unavailable', checkedAt: '2026-09-30T12:05:00.000Z'}})});
  await restart(f);
  assert.equal(launches(f).length, 1); assert.equal(readOps(f)[ID].monitorGap, undefined); assert.equal(readOps(f)[ID].status, 'ready');
}, true));

test('H1-I5: the recovery loop itself leaves a row of another tenant alone (called directly, past the state reader that would reject it first)', async () => {
  const operations = {'foreign-rec': crashRow({tenantId: 'foreign'}), 'foreign-failed': crashRow({tenantId: 'foreign', status: 'failed', reason: 'Recording pipeline exited 1'})};
  const before = JSON.stringify(operations), state = {operations}, updated = []; let launched = 0;
  const c = {state, tenantId: 'fixture', slots: [], now: () => RUNNING, env: {}, signal: undefined, refresh: async () => ({}), register: async () => {},
    select: () => ({toSchedule: [], skipped: []}), setPreview: () => {}, notify: () => {}, update: id => {updated.push(id);},
    priority: () => 1, validId: () => true, reconsider: () => false, complete: () => false, execute: async () => {launched++;},
    prepareCapture: async () => {}, safeText: String, log: () => {}, graphEnabled: () => false, root: tmpdir(),
    deps: {refreshSchedulerPolicy: async () => true, captureSlotSupports: () => true, validateCaptureSlot: async () => {}, validateTenant: async () => {}}};
  await runSchedulerCycle(c);
  assert.deepEqual(updated, []); assert.equal(launched, 0); assert.equal(JSON.stringify(operations), before);
});

test('H1-I5: a row of another tenant is left exactly as found', () => withFixture(async f => {
  serviceFixture(f); stubLaunch(f); const ops = {[ID]: crashRow({tenantId: 'foreign'})};
  seed(f, ops); await assert.rejects(restart(f), () => true); // the state reader refuses a foreign row; nothing was launched or rewritten
  assert.equal(launches(f).length, 0); assert.equal(JSON.parse(readFileSync(statePath(f), 'utf8')).operations[ID].tenantId, 'foreign');
  assert.ok(existsSync(statePath(f)));
}, true));
