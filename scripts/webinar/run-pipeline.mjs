#!/usr/bin/env node
/** Portable discovery/capture/process runner. Preview default; explicit --run and live proof gate. */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';
register();
const {selectAutoRecordItems} = await import('../../packages/meeting-bot/src/calendar/auto-join.ts');
const {createHttpCalendarLoader, createHttpCandidateLoader, loadWebinarSourcesWithHealth} = await import('../../packages/meeting-bot/src/calendar/schedule-tick.ts');
const {validateIndexProof} = await import('../../packages/meeting-bot/src/capture/record-commands.ts');
const {loadTrustedSenderConfig, redactJoinLink, activeWebinarStopReason} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {launchControlledRecording} = await import('../../packages/meeting-bot/src/capture/reconnect-gaps.ts');
const {createTelegramChannel, createOperationNotifications} = await import('../../packages/meeting-bot/src/capture/telegram-channel.ts');
const {readWebinarOperationState, writeWebinarOperationState, prepareWebinarSourceState, webinarCompletionState} = await import('../../packages/meeting-bot/src/calendar/schedule-state.ts');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function captureWait(ms, signal) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); signal.addEventListener('abort', finish, {once: true});
    if (signal.aborted) finish();
  });
}
function safeText(text) {
  // Feed errors can include opaque URLs; leave no query, fragment, userinfo or token in logs.
  return String(text).replace(/https?:\/\/[^\s"']+/gi, (url) => {
    try { const parsed = new URL(redactJoinLink(url)); return `${parsed.protocol}//${parsed.host}/[redacted]`; }
    catch { return '[redacted-url]'; }
  }).slice(0, 500);
}
function confined(root, file) {
  const actual = realpathSync(file), rel = relative(realpathSync(root), actual);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Recording is outside project directory');
  return actual;
}
export function validateRunGate(root, env) {
  const work = env.MONGO_WORK_DB?.trim();
  if (!work || ['lkb', 'global_university_db'].includes(work)) throw new Error('MONGO_WORK_DB must identify an isolated work database; production writes refused');
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
export function createPipelineDeps(env = process.env) {
  const api = (env.LKB_API_URL ?? 'http://localhost:3300').replace(/\/$/, '');
  const log = (text) => console.log(safeText(text));
  let channel, channelInitialized = false;
  return {
    root: ROOT, stateDir: join(ROOT, 'data/webinar-release'), env, log,
    now: () => new Date().toISOString(),
    validateTenant: async () => {
      if (!env.LKB_TENANT_ID || !env.LKB_API_KEY) throw new Error('Explicit lane owner and API key required');
      const response = await fetch(`${api}/webinar-operations`, { headers: { authorization: `Bearer ${env.LKB_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      try {
        if (!response.ok || response.headers.get('x-lkb-tenant') !== env.LKB_TENANT_ID) throw new Error('Connected API owner does not match the configured capture lane');
      } finally { await response.body?.cancel(); }
    },
    loadCalendarEvents: createHttpCalendarLoader(api, env.LKB_API_KEY),
    loadCalendarAcquisition: createHttpCalendarLoader(api, env.LKB_API_KEY, undefined, {tenantId: env.LKB_TENANT_ID}),
    loadCandidates: async (refresh = false) => {
      if (refresh) {
        const headers = {authorization: `Bearer ${env.LKB_API_KEY}`};
        const preflight = await fetch(`${api}/meeting-candidates`, {headers, redirect: 'error', signal: AbortSignal.timeout(30000)});
        try {
          if (!preflight.ok || !env.MONGO_WORK_DB || preflight.headers.get('x-lkb-work-db') !== env.MONGO_WORK_DB || ['lkb', 'global_university_db'].includes(env.MONGO_WORK_DB)) throw new Error('Connected Gmail work database not bound');
        } finally { await preflight.body?.cancel(); }
        const scanned = await fetch(`${api}/gmail/scan`, {method: 'POST', headers: {...headers, 'X-LKB-Work-DB': env.MONGO_WORK_DB}, redirect: 'error', signal: AbortSignal.timeout(30000)});
        if (!scanned.ok) { await scanned.body?.cancel(); throw new Error('Gmail discovery unavailable'); }
        const result = await scanned.json();
        if (!result || !Number.isInteger(result.created) || result.created < 0 || !Number.isInteger(result.autoApproved) || result.autoApproved < 0 || result.autoApproved > result.created) throw new Error('Invalid Gmail scan result');
      }
      // Preserve legacy mapping while refusing failed discovery in this runner.
      let failure = false;
      const loader = createHttpCandidateLoader(api, env.LKB_API_KEY,
        (message) => { log(message); if (/skipping|fetch failed/i.test(message)) failure = true; }, true);
      const rows = await loader();
      if (failure) throw new Error('Gmail candidate discovery unavailable');
      return rows;
    },
    launch: (args, childEnv, onLine, onControl) => launchControlledRecording(ROOT, args, childEnv, onLine, onControl),
    notifyOperation: async ({sessionId, status, reason, feed}) => {
      if (!channelInitialized) {
        channel = createTelegramChannel({token: env.TELEGRAM_BOT_TOKEN ?? '', chatId: env.TELEGRAM_CHAT_ID ?? '', log});
        channelInitialized = true;
      }
      if (!channel) return 'disabled';
      await channel.send(feed ? `Webinar discovery ${feed}: ${status}. Check the operations view for coverage.` :
        `Webinar ${sessionId}: ${status}${reason ? ` (${reason})` : ''}. Check the operations view for details.`);
      return 'sent';
    },
  };
}
export async function runPipelineTick(deps, run = false) {
  const {root, stateDir, env, now, log} = deps;
  const tenantId = env.LKB_TENANT_ID;
  if (run && (!tenantId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId))) throw new Error('LKB_TENANT_ID must explicitly identify this capture lane owner');
  const work = run ? validateRunGate(root, env) : undefined;
  const statePath = join(stateDir, 'operations.json');
  const state = readWebinarOperationState(statePath, tenantId, new Date(now()).toISOString());
  if (run) { if (typeof deps.validateTenant !== 'function') throw new Error('Connected API ownership validation required'); await deps.validateTenant(); }
  let calendarEvents, candidates, preview;
  const reconsider = (row) => row?.status === 'action_required' &&
    ['needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link'].includes(row.reason);
  const select = () => selectAutoRecordItems({calendarEvents, candidates, now: now(), leadMinutes: 5,
    trustedSenders: loadTrustedSenderConfig(env), alreadyScheduled: Object.entries(state.operations).filter(([, row]) =>
      ['ready', 'recording', 'processing', 'action_required'].includes(row.status) && !reconsider(row)).map(([id]) => id), everyWebinar: true});
  const projection = selection => ({status: run ? 'running' : 'preview', toRecord: selection.toSchedule.map(({meetingUrl: _secret, ...item}) => item), skipped: selection.skipped});
  if (!run) {
    const loaded = await loadWebinarSourcesWithHealth(deps, now());
    if (loaded.failed) throw new Error('Webinar discovery unavailable');
    ({calendarEvents, candidates} = loaded); preview = projection(select());
    log(`Preview: ${preview.toRecord.length} due webinar(s), ${preview.skipped.length} skipped; no writes or captures`); return preview;
  }
  mkdirSync(stateDir, {recursive: true});
  const lock = join(stateDir, 'poller.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid poller lock; manual inspection required');
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (!alive) unlinkSync(lock);
  }
  let lockFd;
  try { lockFd = openSync(lock, 'wx'); } catch { throw new Error('Another poller owns this lane, or interrupted poller.lock needs inspection'); }
  writeFileSync(lockFd, String(process.pid)); closeSync(lockFd);
  if (existsSync(statePath)) {
    try {
      const latest = readWebinarOperationState(statePath, tenantId, new Date(now()).toISOString());
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, latest);
    } catch (error) { unlinkSync(lock); throw error; }
  }
  const save = () => writeWebinarOperationState(statePath, state);
  const notifications = createOperationNotifications({state, save, notifyOperation: deps.notifyOperation, log, now});
  const enqueueNotification = notifications.enqueue;
  const update = (id, changes) => {
    state.operations[id] = {...state.operations[id], ...changes, tenantId, updatedAt: now()};
    save(); log(`${id}: ${changes.status ?? state.operations[id].status}`);
    enqueueNotification(id);
  };
  const complete = (id) => {
    const marker = join(root, 'data/toc-migrated', id, 'pipeline-state.json');
    if (!existsSync(marker)) return false;
    const value = load(marker);
    try {
      const dir = join(root, 'data/toc-migrated', id);
      confined(root, join(dir, 'knowledge-turns.json'));
      const proof = validateIndexProof(dir, id);
      return value.status === 'done' && value.stage === 'index' && value.version === 2 && value.sessionId === id &&
        proof.tenantId === tenantId && value.tenantId === tenantId && value.inputHash === proof.inputHash &&
        value.generation === proof.generation && typeof proof.generation === 'string' && Boolean(proof.generation);
    } catch { return false; }
  };
  async function execute(id, args) {
    let recording = args[0] === 'record', settled = false, control, failure;
    const originalEnd = state.operations[id].endTime, wake = new AbortController();
    const child = Promise.resolve(deps.launch(args, {...env, MONGO_WORK_DB: work, LKB_CAPTURE_BACKEND: 'tab'}, (line) => {
      const artifact = /audio\/video recording started:\s*(.+)/.exec(line);
      if (artifact) {
        try { update(id, {artifact: confined(root, artifact[1].trim())}); } catch { /* untrusted line never becomes a file path */ }
      }
      if (/audio →|\[pipeline\] processing/.test(line)) { recording = false; wake.abort(); update(id, {status: 'processing'}); }
      if (control && line === '[bot] capture-control: controller-disconnected') update(id, {stopDisposition: {
        tenantId, sessionId: id, generation: control.generation, reason: 'controller-disconnected', requestedAt: new Date(now()).toISOString()}});
    }, handle => {control = handle;}));
    const closed = child.then(() => {settled = true; wake.abort();}, error => {failure ??= error; settled = true; wake.abort();});
    try { while (!settled && recording) {
      await (deps.captureWait ?? captureWait)(30000, wake.signal);
      if (settled || !recording) break;
      try {
        const prepared = await refresh();
        if (settled || !recording) break;
        const reason = activeWebinarStopReason(id, originalEnd, prepared);
        if (reason && control && !state.operations[id].stopDisposition) {
          update(id, {reason, stopDisposition: {tenantId, sessionId: id, generation: control.generation, reason, requestedAt: new Date(now()).toISOString()}});
          if (!settled && recording) {
            const acknowledged = await Promise.resolve().then(() => control.stop(reason)).catch(() => 'unavailable');
            update(id, {stopDisposition: {...state.operations[id].stopDisposition, acknowledged}});
          }
        }
        if (prepared.transitions.some(row => row.reason === 'unresolved' && row.aliases.includes(id))) monitoringGap(id, 'uncertain-source');
        for (const [otherId, row] of Object.entries(state.operations)) if (otherId !== id && row.status === 'queued' &&
          Date.parse(row.startTime) <= Date.parse(now()) + 5 * 60000 && Date.parse(row.startTime) < Date.parse(originalEnd) &&
          Date.parse(row.endTime) > Date.parse(state.operations[id].startTime)) update(otherId, {status: 'action_required', reason: 'overlap-lost'});
      } catch { monitoringGap(id, 'discovery-unavailable'); }
    }} catch (error) {failure ??= error;} finally {wake.abort(); await closed;}
    if (failure) throw failure;
    if (!complete(id)) throw new Error('Child exited without a completed index marker; session is not ready');
    finishOperation(id);
  }
  const monitoringGap = (id, reason) => update(id, {reason: state.operations[id].stopDisposition?.reason ?? 'coverage-review',
    monitorGap: {tenantId, sessionId: id, reason, checkedAt: new Date(now()).toISOString()}});
  const finishOperation = id => update(id, webinarCompletionState(join(root, 'data/toc-migrated', id, 'source.json'), tenantId, id, state.operations[id], now()));
  async function refresh() {
    await deps.validateTenant();
    const previous = state.discovery;
    const checkedAt = new Date(now()).toISOString();
    const loaded = await loadWebinarSourcesWithHealth(deps, checkedAt, previous, true, {syncToken: state.source?.coverage.calendarSyncToken});
    state.discovery = loaded.health; save();
    for (const feed of ['calendar', 'gmail']) {
      const row = state.discovery[feed];
      if (row.status === 'failed' || previous?.[feed]?.status === 'failed' ||
        (row.status === 'healthy' && row.notification && row.notification.acknowledged !== 'healthy:')) enqueueNotification(feed, true);
    }
    if (loaded.failed) throw Object.assign(new Error('Webinar discovery unavailable; coverage requires attention'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});
    await notifications.wait();
    try {
      const prepared = prepareWebinarSourceState(state, loaded.calendarAcquisition, loaded.candidates, checkedAt);
      writeWebinarOperationState(statePath, prepared.state);
      Object.assign(state, prepared.state);
      ({calendarEvents, candidates} = prepared);
      return prepared;
    } catch {
      state.discovery.calendar.status = 'failed'; save(); enqueueNotification('calendar', true);
      throw Object.assign(new Error('Webinar acquisition validation failed; prior source checkpoint retained'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});
    }
  }
  try {
    await refresh();
    let selection = select(); preview = projection(selection);
    // Retry delivery independently of recording transitions; all owner gates and lane locking have completed.
    for (const id of Object.keys(state.operations)) {
      if (!ID.test(id)) throw new Error('Unsafe operation id in persisted state');
      enqueueNotification(id);
    }
    // Recover artifacts before fetching another capture into the single active lane.
    for (const [id, row] of Object.entries(state.operations)) {
      if (!ID.test(id)) throw new Error('Unsafe operation id in persisted state');
      if (!['recording', 'processing', 'failed'].includes(row.status)) continue;
      if (complete(id)) { finishOperation(id); continue; }
      if ((row.attempts ?? 0) >= 3) { update(id, {status: 'action_required', reason: 'retry-limit'}); continue; }
      let artifact = row.artifact;
      const sourcePath = join(root, 'data/toc-migrated', id, 'source.json');
      if (!artifact && existsSync(sourcePath)) artifact = resolve(root, load(sourcePath).path ?? '');
      if (!artifact || !existsSync(artifact)) { update(id, {status: 'action_required', reason: 'interrupted-no-recording-artifact'}); continue; }
      artifact = confined(root, artifact);
      update(id, {status: 'processing', attempts: (row.attempts ?? 0) + 1});
      try { await execute(id, ['finalize', '--video', artifact, '--session-id', id, '--title', row.title ?? 'Webinar', '--transcribe', '--process-video', '--index']); }
      catch (error) { update(id, {status: 'failed', reason: safeText(error.message)}); }
    }
    for (const initial of selection.toSchedule) {
      const item = select().toSchedule.find(current => current.sessionKey === initial.sessionKey);
      if (!item) continue;
      const id = item.sessionKey;
      if (!ID.test(id)) throw new Error('Unsafe canonical webinar session id');
      if (state.operations[id] && ['ready', 'action_required', 'failed'].includes(state.operations[id].status) && !reconsider(state.operations[id])) continue;
      if (Date.parse(item.endTime) <= Date.parse(now())) { update(id, {status: 'action_required', reason: 'missed-while-processing', title: item.title}); continue; }
      update(id, {status: 'queued', reason: undefined, title: item.title, startTime: item.startTime, endTime: item.endTime, attempts: (state.operations[id]?.attempts ?? 0) + 1});
      update(id, {status: 'recording'});
      try { await execute(id, ['record', item.meetingUrl, '--backend', 'tab', '--until', item.endTime,
        '--session-id', id, '--title', item.title, '--transcribe', '--process-video', '--index']); }
      catch (error) { update(id, {status: 'failed', reason: safeText(error.message)}); }
    }
    for (const skipped of [...selection.skipped, ...select().skipped]) {
      if (['cancelled', 'past'].includes(skipped.reason) && state.operations[skipped.sessionKey]?.status === 'queued') {
        update(skipped.sessionKey, {status: 'action_required', reason: skipped.reason === 'past' ? 'missed-coverage' : 'cancelled'});
      }
      if (['overlap-lost', 'needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link'].includes(skipped.reason)) {
        if (ID.test(skipped.sessionKey) && (!state.operations[skipped.sessionKey] || state.operations[skipped.sessionKey].status === 'queued')) update(skipped.sessionKey,
          {status: 'action_required', reason: skipped.reason, title: skipped.title});
        else log(`Skipped: ${skipped.reason}`);
      }
    }
    return {...preview, operations: state.operations};
  } finally { try { await notifications.wait(); } finally { unlinkSync(lock); } }
}
export async function runPipelineWatch({run = false, watch = false} = {}, deps = {}) {
  if (watch && !run) throw new Error('--watch requires --run; preview is a single read-only tick');
  const tick = deps.tick ?? (() => runPipelineTick(createPipelineDeps(), run)), wait = deps.wait ?? sleep, log = deps.log ?? console.log;
  do {
    try { log(JSON.stringify(await tick(), null, 2)); }
    catch (error) {
      if (!watch || error?.code !== 'WEBINAR_DISCOVERY_UNAVAILABLE') throw error;
      log('Webinar discovery unavailable; retrying next tick; coverage requires attention');
    }
    if (watch) await wait(60000);
  } while (watch);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
    const run = process.argv.includes('--run') && !process.argv.includes('--dry-run');
    const watch = process.argv.includes('--watch');
    await runPipelineWatch({run, watch});
  } catch (error) { console.error(safeText(error.message)); process.exitCode = 1; }
}
