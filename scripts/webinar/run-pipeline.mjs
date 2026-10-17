#!/usr/bin/env node
/** Portable discovery/capture/process runner. Preview default; explicit --run and live proof gate. */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {isProtectedWorkDbName} from '../lib/transcript-provenance.mjs';
import { register } from 'tsx/esm/api';
import {validateSlots, createCapturePool, runAutonomousCycles, POLL_MS} from './scheduler/service.mjs';
import {runSchedulerCycle} from './scheduler/dispatch.mjs';
import {projectWatchResult} from './scheduler/watch-output.mjs';
import {createCapturePrivacyLifecycle} from './scheduler/privacy-lifecycle.mjs';
import {createOwnedCaptureStop} from './scheduler/capture-stop.mjs';
import {createCanonicalAlerts} from './scheduler/lifecycle-alerts.mjs';
register();
const {selectAutoRecordItems} = await import('../../packages/meeting-bot/src/calendar/auto-join.ts');
const {loadWebinarSourcesWithHealth} = await import('../../packages/meeting-bot/src/calendar/schedule-tick.ts');
const {validateIndexProof} = await import('../../packages/meeting-bot/src/capture/record-commands.ts');
const {loadTrustedSenderConfig, activeWebinarStopReason, runWebinarRegistrations, reconcileWebinarRegistrationState, projectWebinarSelection} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {createOperationNotifications} = await import('../../packages/meeting-bot/src/capture/notify/telegram-channel.ts');
const {readWebinarOperationState, writeWebinarOperationState, prepareWebinarSourceState, webinarCompletionState, validateWebinarRegistration, confirmWebinarRegistration} = await import('../../packages/meeting-bot/src/calendar/state/schedule-state.ts');
const {createPipelineDeps, safeText, captureWait} = await import('./run-pipeline-deps.mjs');
const {graphEnabled, runSessionGraph, runFreshSessionGraph} = await import('./graph/graph-finalize.mjs'); // T-050: flag only
const {SKIP_REASON_MEANING} = await import('../../packages/meeting-bot/src/calendar/state/skip-describe.ts');
const {REGISTRATION_REASONS} = await import('../../packages/meeting-bot/src/calendar/registration-workflow.ts');
const {acquireLock, lockStillOwned, releaseLock} = await import('../../packages/meeting-bot/src/calendar/join-rules/join-rules-store-lock.ts');
const {createTopicLookup, dropOwnMarkerEvents, writeCaptureTags, announceScheduled} = await import('../../packages/meeting-bot/src/autojoin/tick-wiring.ts');
const {readCaptureTags} = await import('../../packages/meeting-bot/src/autojoin/capture-tags.ts');
// Operation reasons that are not skip reasons; every skip reason is derived from the total SKIP_REASON_MEANING record, so a new one is covered automatically.
const OPERATION_ONLY_REASONS = ['retry-limit', 'interrupted-no-recording-artifact', 'missed-while-processing', 'missed-coverage', 'controller-disconnected',
  'coverage-review', 'source-discontinuity', 'unproven-calendar-history', 'rejected', 'rescheduled', 'rescheduled-completed', 'recurring-series',
  'unknown-tombstone', 'ambiguous-provider', 'contradictory-revision', 'missing-revision', 'ambiguous-identity', 'capacity-full', 'capture-slot-unavailable', 'graph-aborted', 'service-stopped', 'privacy-controller-unavailable'];
export const OPERATION_REASONS = [...OPERATION_ONLY_REASONS, ...Object.keys(SKIP_REASON_MEANING)];
export {createPipelineDeps};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function confined(root, file) {
  const actual = realpathSync(file), rel = relative(realpathSync(root), actual);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Recording is outside project directory');
  return actual;
}
export function validateRunGate(root, env) {
  const work = env.MONGO_WORK_DB?.trim();
  if (isProtectedWorkDbName(work, env)) throw new Error('MONGO_WORK_DB must identify an isolated work database; production writes refused');
  const file = join(root, 'data/webinar-release/live-proof.json');
  if (!existsSync(file)) throw new Error('Manual live audio/video proof is required before unattended --run; see docs/webinar-release.md');
  const proof = load(file);
  if (proof.status !== 'passed' || proof.backend !== 'tab' || proof.platform !== process.platform ||
    proof.audio !== true || proof.video !== true || !ID.test(proof.sessionId ?? '') ||
    !Number.isFinite(Date.parse(proof.verifiedAt)) || typeof proof.recording !== 'string') throw new Error('Live proof is invalid or belongs to a different operating system');
  const recording = confined(root, resolve(root, proof.recording));
  if (!statSync(recording).isFile() || statSync(recording).size === 0 || !/\.(webm|mkv|mp4)$/i.test(recording)) {
    throw new Error('Live proof must reference a nonempty media file');
  }
  return work;
}
export async function runPipelineTick(deps, run = false, {watch = false, signal} = {}) {
  const {root, stateDir, env, now, log} = deps;
  const tenantId = env.LKB_TENANT_ID;
  const autonomous = watch && run;
  const slots = autonomous ? validateSlots(deps.captureSlots) : [];
  if (autonomous && (!['last-valid', 'fail-closed'].includes(env.LKB_JOIN_RULES_ENFORCE) ||
    ['applyJoinRules', 'validateCaptureSlots', 'captureSlotSupports', 'validateCaptureSlot', 'refreshSchedulerPolicy', 'flushSchedulerAlerts']
      .some(name => typeof deps[name] !== 'function')))
    throw new Error('Automatic scheduler requires enforced tenant-bound join rules and actual owned capture-slot readiness');
  if (autonomous && (!deps.autojoin?.topic || ['discovery', 'webinarAutoJoin', 'careerPriority', 'testDataRouting']
    .some(flag => deps.autojoin.cfg[flag] !== true))) throw new Error('Automatic scheduler requires enabled discovery, joining, career priority and staging controls');
  const attendance = deps.calendarAttendance;
  if (attendance) {
    attendance.assertOwner(tenantId);
    await deps.validateTenant(); await attendance.verifyAccount();
    if (run) await attendance.checkReady(deps, validateRunGate);
  }
  if (run && (!tenantId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId))) throw new Error('LKB_TENANT_ID must explicitly identify this capture lane owner');
  const work = run ? validateRunGate(root, env) : undefined;
  const statePath = join(stateDir, 'operations.json');
  const state = readWebinarOperationState(statePath, tenantId, new Date(now()).toISOString());
  if (run) { if (typeof deps.validateTenant !== 'function') throw new Error('Connected API ownership validation required'); await deps.validateTenant(); }
  if (autonomous) await deps.validateCaptureSlots(slots);
  const pool = autonomous ? createCapturePool(slots) : undefined;
  let calendarEvents, candidates, preview, lookup;
  const reconsider = (row) => row?.status === 'action_required' &&
    (['needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link'].includes(row.reason) ||
      (autonomous && !row.attempts && ['rule-denied', 'opted-out', 'rules-unevaluable'].includes(row.reason)));
  const select = () => {
    if (deps.autojoin) lookup = createTopicLookup(deps.autojoin, calendarEvents, candidates);
    return (attendance ? attendance.select : selectAutoRecordItems)({calendarEvents: deps.autojoin ? dropOwnMarkerEvents(calendarEvents) : calendarEvents,
    candidates: attendance ? [...candidates, ...Object.values(state.source?.reconciliation?.occurrences ?? {}).filter(row => row.source === 'gmail').map(row => row.snapshot)] : candidates,
    now: now(), leadMinutes: 5,
    trustedSenders: loadTrustedSenderConfig(env), alreadyScheduled: Object.entries(state.operations).filter(([, row]) =>
      ['ready', 'recording', 'processing', 'action_required'].includes(row.status) && !reconsider(row)).map(([id]) => id),
    everyWebinar: true, ...lookup?.hooks}, {parallel: autonomous});
  };
  if (!run) {
    const loaded = await loadWebinarSourcesWithHealth(deps, now());
    if (attendance) attendance.assertAcquisition(loaded);
    if (loaded.failed) throw new Error('Webinar discovery unavailable');
    ({calendarEvents, candidates} = loaded);
    let selection = select();
    if (deps.applyJoinRules) selection = await deps.applyJoinRules(selection, {readOnly: true, now: now()});
    preview = projectWebinarSelection(selection, run);
    log(`Preview: ${preview.toRecord.length} due ${attendance ? 'meeting(s)' : 'webinar(s)'}, ${preview.skipped.length} skipped; no writes or captures`); return preview;
  }
  mkdirSync(stateDir, {recursive: true});
  const lock = join(stateDir, 'poller.lock');
  let lockToken;
  try { lockToken = acquireLock(lock, {waitMs: 0}); } catch { throw new Error('Another poller owns this lane, or interrupted poller.lock needs inspection'); }
  const assertOwned = () => { if (!lockStillOwned(lock, lockToken)) throw new Error('Scheduler lane ownership was lost; writes refused'); };
  if (existsSync(statePath)) {
    try {
      const latest = readWebinarOperationState(statePath, tenantId, new Date(now()).toISOString());
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, latest);
    } catch (error) { releaseLock(lock, lockToken); throw error; }
  }
  const save = () => { assertOwned(); writeWebinarOperationState(statePath, state); };
  const notifications = createOperationNotifications({state, save, notifyOperation: deps.notifyOperation, log, now});
  const enqueueNotification = notifications.enqueue;
  const alerts = createCanonicalAlerts({state, tenantId, autojoin: () => deps.autojoin, flush: deps.flushSchedulerAlerts,
    assertOwned, save, enqueueNotification, log, now});
  const update = alerts.update;
  const complete = (id) => {
    const marker = join(root, 'data/toc-migrated', id, 'pipeline-state.json');
    if (!existsSync(marker)) return false;
    const value = load(marker);
    try {
      const dir = join(root, 'data/toc-migrated', id);
      const proof = validateIndexProof(dir, id, env.MONGO_WORK_DB);
      confined(root, join(dir, proof.version === 3 ? proof.inputArtifact : 'knowledge-turns.json'));
      return value.status === 'done' && value.stage === 'index' && [2, 3].includes(proof.version) && value.version === proof.version && value.sessionId === id &&
        (proof.version !== 3 || ['sourceId', 'sourceHash', 'workDb', 'inputArtifact'].every(key => value[key] === proof[key])) &&
        proof.tenantId === tenantId && value.tenantId === tenantId && value.inputHash === proof.inputHash &&
        value.generation === proof.generation && typeof proof.generation === 'string' && Boolean(proof.generation);
    } catch { return false; }
  };
  async function execute(id, args, item, options = {}) {
    let recording = args[0] === 'record', settled = false, control, failure;
    const originalEnd = state.operations[id].endTime, wake = new AbortController();
    const ownedStop = createOwnedCaptureStop({state, id, tenantId, update, now, control: () => control,
      active: () => !settled && recording, onFailure: error => {failure ??= error;}});
    const privacy = createCapturePrivacyLifecycle({publish: recording ? deps.publishCaptureControl : undefined,
      tenantId, sessionId: id, required: recording && Boolean(env.LKB_CAPTURE_CONTROL_DIR),
      onFailure: error => { failure ??= error; ownedStop.request('privacy-controller-unavailable'); }});
    const abort = () => ownedStop.request('graph-aborted');
    options.signal?.addEventListener('abort', abort, {once: true});
    const child = Promise.resolve().then(() => {
      if (recording && autonomous && signal?.aborted) throw Object.assign(new Error('Scheduler stopped before capture launch'), {code: 'SCHEDULER_STOPPED'});
      return deps.launch(args, {...env, MONGO_WORK_DB: work, LKB_CAPTURE_BACKEND: 'tab'}, (line) => {
      const artifact = /audio\/video recording started:\s*(.+)/.exec(line);
      if (artifact) {
        let path;
        try { path = confined(root, artifact[1].trim()); } catch { /* untrusted line never becomes a file path */ }
        if (path) update(id, {artifact: path}, 'capture-started');
      }
      if (/audio →|\[pipeline\] processing/.test(line)) { recording = false; wake.abort(); update(id, {status: 'processing'}); }
      if (control && line === '[bot] capture-control: controller-disconnected') update(id, {stopDisposition: {
        tenantId, sessionId: id, generation: control.generation, reason: 'controller-disconnected', requestedAt: new Date(now()).toISOString()}});
    }, handle => {control = handle; privacy.attach(handle); if (options.signal?.aborted) abort();}); });
    const closed = child.then(() => {settled = true; wake.abort();}, error => {failure ??= error; settled = true; wake.abort();});
    try { while (!settled && recording) {
      await (deps.captureWait ?? captureWait)(30000, wake.signal);
      if (settled || !recording) break;
      try {
        const prepared = await refresh();
        if (settled || !recording) break;
        const ruled = item && deps.applyJoinRules ? await deps.applyJoinRules({toSchedule: [item], skipped: []}, {readOnly: false, now: now()}) : undefined;
        const veto = ruled && !ruled.toSchedule.some(row => row.sessionKey === id) ? ruled.skipped[0]?.reason ?? 'rules-unevaluable' : undefined;
        const reason = activeWebinarStopReason(id, originalEnd, prepared) ?? attendance?.activeStopReason(id, prepared) ?? (veto ? 'cancelled' : undefined);
        if (reason && control && !state.operations[id].stopDisposition) {
          update(id, {reason: veto ?? reason, stopDisposition: {tenantId, sessionId: id, generation: control.generation, reason, requestedAt: new Date(now()).toISOString()}});
          if (!settled && recording) {
            const acknowledged = await Promise.resolve().then(() => control.stop(reason)).catch(() => 'unavailable');
            update(id, {stopDisposition: {...state.operations[id].stopDisposition, acknowledged}});
          }
        }
        if (prepared.transitions.some(row => row.reason === 'unresolved' && row.aliases.includes(id))) monitoringGap(id, 'uncertain-source');
        for (const [otherId, row] of Object.entries(state.operations)) if (!autonomous && otherId !== id && row.status === 'queued' &&
          Date.parse(row.startTime) <= Date.parse(now()) + 5 * 60000 && Date.parse(row.startTime) < Date.parse(originalEnd) &&
          Date.parse(row.endTime) > Date.parse(state.operations[id].startTime)) update(otherId, {status: 'action_required', reason: 'overlap-lost'});
      } catch (error) {
        if (error?.code === 'SCHEDULER_OWNERSHIP_UNVERIFIED') {failure ??= error; ownedStop.request('coverage-review');}
        monitoringGap(id, 'discovery-unavailable');
      }
    }} catch (error) {failure ??= error;} finally {
      wake.abort(); await closed; await ownedStop.drain(); await privacy.finish(); options.signal?.removeEventListener('abort', abort);
    }
    if (failure) throw failure;
    if (options.captureOnly) return confined(root, state.operations[id].artifact);
    if (!complete(id)) throw new Error('Child exited without a completed index marker; session is not ready');
    finishOperation(id);
  }
  const monitoringGap = (id, reason) => update(id, {reason: state.operations[id].stopDisposition?.reason ?? 'coverage-review',
    monitorGap: {tenantId, sessionId: id, reason, checkedAt: new Date(now()).toISOString()}});
  const finishOperation = id => update(id, webinarCompletionState(join(root, 'data/toc-migrated', id, 'source.json'), tenantId, id, state.operations[id], now()));
  let refreshTail = Promise.resolve();
  function serializeOperation(body) {
    const next = refreshTail.then(body); refreshTail = next.catch(() => {}); return next;
  }
  const refresh = () => serializeOperation(refreshOnce);
  async function refreshOnce() {
    try { await deps.validateTenant(); } catch { throw Object.assign(new Error('Capture owner verification unavailable'), {code: 'SCHEDULER_OWNERSHIP_UNVERIFIED'}); }
    const previous = state.discovery;
    const checkedAt = new Date(now()).toISOString();
    const loaded = await loadWebinarSourcesWithHealth(deps, checkedAt, previous, true, {syncToken: state.source?.coverage.calendarSyncToken});
    if (attendance) attendance.assertAcquisition(loaded);
    alerts.acquireDiscovery(loaded.health);
    for (const feed of ['calendar', 'gmail']) {
      const row = state.discovery[feed];
      if (row.status === 'failed' || previous?.[feed]?.status === 'failed' ||
        (row.status === 'healthy' && row.notification && row.notification.acknowledged !== 'healthy:')) enqueueNotification(feed, true);
    }
    if (loaded.failed) throw Object.assign(new Error('Webinar discovery unavailable; coverage requires attention'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});
    await notifications.wait();
    try {
      const prepared = attendance ? prepareWebinarSourceState(state, loaded.calendarAcquisition, loaded.candidates, checkedAt) : await reconcileWebinarRegistrationState({state, tenantId, candidates: loaded.candidates, now,
        validate: validateWebinarRegistration, confirm: confirmWebinarRegistration, createUUID: randomUUID,
        value: loaded.calendarAcquisition, checkedAt, prepare: prepareWebinarSourceState,
        persistSync: value => { assertOwned(); writeWebinarOperationState(statePath, value); return undefined; }});
      if (attendance) { Object.assign(state, prepared.state); save(); }
      ({calendarEvents, candidates} = prepared);
      return prepared;
    } catch {
      state.discovery.calendar.status = 'failed'; save(); enqueueNotification('calendar', true);
      throw Object.assign(new Error('Webinar acquisition validation failed; prior source checkpoint retained'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});
    }
  }
  try {
    const cycle = () => {alerts.tick(); return runSchedulerCycle({state, pool, slots, now, update, select, complete, finishOperation, execute,
      root, env, work, deps, tenantId, signal, refresh, reconsider, confined, graphEnabled, runSessionGraph, runFreshSessionGraph, validateIndexProof, safeText, log,
      sourceFingerprint: item => createHash('sha256').update(JSON.stringify({tenantId, ...item,
        source: state.source?.reconciliation.occurrences[item.sessionKey]})).digest('hex'),
      graphDeps: slot => ({...deps, signal, launch: (args, ...rest) => deps.launch([...args,
        ...(slot && !args.includes('--capture-slot') ? ['--capture-slot', slot] : []),
        ...(!args.includes('--tenant') ? ['--tenant', tenantId] : [])], ...rest)}),
      validId: id => ID.test(id), notify: id => { if (!ID.test(id)) throw new Error('Unsafe operation id in persisted state'); enqueueNotification(id); },
      priority: item => lookup?.hooks.priorityOf?.(item) ?? 0,
      tagsForItem: item => lookup?.tagsFor(item) ?? {},
      setPreview: selection => { preview = projectWebinarSelection(selection, run); },
      prepareCapture: async item => { const tags = lookup?.tagsFor(item) ?? {};
        if (deps.autojoin) writeCaptureTags(deps.autojoin.tagsDir, item.sessionKey, tags, log);
        if (autonomous) { const persisted = readCaptureTags(dirname(deps.autojoin.tagsDir), item.sessionKey);
          if (typeof tags.testData !== 'boolean' || persisted.testData !== tags.testData || persisted.careerGuidance !== tags.careerGuidance)
            throw new Error('Capture staging tags were not durably preserved'); }
        await announceScheduled(deps.autojoin, item, tags, log); },
      register: acquired => attendance ? undefined : serializeOperation(() => runWebinarRegistrations({state, tenantId, candidates,
        acquisition: {...acquired, state: state.source.reconciliation}, now, config: deps.registrationConfig,
        register: deps.registerWebinar, update, validate: validateWebinarRegistration, confirm: confirmWebinarRegistration, createUUID: randomUUID}))});};
    if (autonomous) await runAutonomousCycles({cycle, drain: () => pool.drain(), signal, wait: deps.schedulerWait, log,
      now: () => Date.parse(now())});
    else await cycle();
    return {...preview, operations: state.operations};
  } finally { try { await pool?.drain(); await refreshTail; await notifications.wait(); await alerts.wait(); } finally { releaseLock(lock, lockToken); } }
}
export async function runPipelineWatch({run = false, watch = false} = {}, deps = {}) {
  if (watch && !run) throw new Error('--watch requires --run; preview is a single read-only tick');
  const signal = deps.signal;
  const tick = deps.tick ?? (() => runPipelineTick(createPipelineDeps(), run, {watch, signal})), wait = deps.wait ?? sleep, log = deps.log ?? console.log;
  do {
    try {
      const result = await tick();
      log(JSON.stringify(projectWatchResult(result, OPERATION_REASONS, safeText, REGISTRATION_REASONS), null, 2));
    }
    catch (error) {
      if (!watch || error?.code !== 'WEBINAR_DISCOVERY_UNAVAILABLE') throw error;
      log('Webinar discovery unavailable; retrying next tick; coverage requires attention');
    }
    if (watch && !signal?.aborted) await wait(POLL_MS);
  } while (watch && !signal?.aborted);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const shutdown = new AbortController();
  const stop = () => { console.log('Scheduler stopping discovery; draining owned captures and downstream work'); shutdown.abort(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
    const run = process.argv.includes('--run') && !process.argv.includes('--dry-run');
    const watch = process.argv.includes('--watch');
    const accountFlags = process.argv.filter(value => value === '--calendar-attendance-account');
    if (accountFlags.length > 1) throw new Error('Attendance account may be specified only once');
    const accountIndex = process.argv.indexOf('--calendar-attendance-account');
    if (accountIndex >= 0) {
      const {configureCalendarAttendance} = await import('./calendar-attendance-source.mjs');
      const deps = await configureCalendarAttendance(createPipelineDeps(), process.argv[accountIndex + 1]);
      if (process.argv.includes('--check-ready')) { await deps.calendarAttendance.checkReady(deps, validateRunGate); console.log('Attendance readiness checks passed; no scheduling or work writes'); }
      else await runPipelineWatch({run, watch}, {signal: shutdown.signal, tick: () => runPipelineTick(deps, run, {watch, signal: shutdown.signal})});
    } else {
      if (process.argv.includes('--check-ready')) throw new Error('--check-ready requires an explicit attendance account');
      await runPipelineWatch({run, watch}, {signal: shutdown.signal});
    }
  } catch (error) { console.error(safeText(error.message)); process.exitCode = 1; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
