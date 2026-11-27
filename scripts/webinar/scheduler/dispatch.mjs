/** Canonical durable operations: recovery, rule-controlled selection and capture dispatch. */
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const REFUSAL_REASONS = ['overlap-lost', 'needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link', 'rule-denied', 'opted-out', 'rules-unevaluable'];
const ATTEMPT_LIMIT = 3;
const PRELAUNCH_TRANSIENT_LIMIT = 5;

/**
 * A network blip in the pre-launch steps (live 2026-11-27: `fetch failed` on /webinar-operations, attempts 0). Deliberately narrow: a bare
 * TypeError 'fetch failed', an abort/timeout, or a socket-level `cause.code`. Anything else keeps the ordinary failure path.
 */
export function isTransientNetworkError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  if (error instanceof TypeError && error.message === 'fetch failed') return true;
  const code = error.cause?.code ?? error.cause?.cause?.code;
  return typeof code === 'string' && (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code) || code.startsWith('UND_ERR_'));
}

/**
 * H1 (recorder-self-heal-rejoin): what became of a capture whose owner is gone. `undefined` means "not an interruption" and the older recovery paths decide.
 * recording row (the process died mid-capture): attempt limit reached -> 'stopped'; meeting ended -> 'ended' (a surviving file is finalized as before);
 * meeting still running -> 'rejoining'. [ASSUMPTION, D-244] a capture that failed with its own error, never with a recording file, is rejoined like a
 * crash; a host refusing the bot (`admission_denied`) never is; a failed row with no launched attempt is not a crash; `previous < attempts` stops a
 * rejoin that never launched from looping, because every launch writes its attempt first.
 */
function interruptionOutcome(c, row, locate, indexed) {
  const attempts = row.attempts ?? 0, previous = row.interruption?.n ?? 0, end = Date.parse(row.endTime);
  // A stop request on the row (cancel, reschedule, controller disconnect) is never rejoined: capture-stop.mjs:7 and run-pipeline.mjs:171 skip a new stop while one is on the row, so a rejoin could not be stopped again (D-245).
  if (!Number.isFinite(end) || row.stopDisposition) return undefined;
  const running = end > Date.parse(c.now());
  if (row.status === 'recording') {
    if (attempts >= ATTEMPT_LIMIT || (previous > 0 && previous >= attempts)) return 'stopped';
    return running ? 'rejoining' : locate() ? undefined : 'ended';
  }
  return row.status === 'failed' && running && attempts >= 1 && attempts < ATTEMPT_LIMIT && previous < attempts && !indexed &&
    !/^admission_denied(?![A-Za-z0-9_])/.test(String(row.reason ?? '')) && !locate() ? 'rejoining' : undefined;
}

export async function runSchedulerCycle(c) {
  const {state, pool, now, update, select, complete, finishOperation, execute, root, env, work, deps} = c;
  const stopped = () => c.signal?.aborted === true;
  if (stopped()) return;
  if (pool && await deps.refreshSchedulerPolicy() !== true) return;
  if (stopped()) return;
  const acquired = await c.refresh();
  if (stopped()) return;
  if (pool && await deps.refreshSchedulerPolicy() !== true) return;
  if (stopped()) return;
  await c.register(acquired);
  if (stopped()) return;
  let selection = select();
  // Also call on empty selections: rule degradation/recovery must remain visible.
  if (deps.applyJoinRules) selection = await deps.applyJoinRules(selection, {readOnly: false, now: now(), selectWithRules: select, remote: Boolean(deps.calendarAttendance)});
  if (stopped()) return;
  c.setPreview(selection);
  for (const id of Object.keys(state.operations)) c.notify(id);

  const rejoined = new Set();
  for (const [id, row] of Object.entries(state.operations)) {
    if (stopped()) return;
    if (pool?.has(id) || !['recording', 'processing', 'failed'].includes(row.status)) continue;
    if (['recording', 'failed'].includes(row.status) && row.tenantId !== c.tenantId) continue; // H1-I5: another tenant's row is left exactly as found
    const indexed = complete(id);
    // An index marker may precede the queue acknowledgement. Graph recovery must
    // reopen the durable graph and receive its complete outcome before finishing.
    if (indexed && !c.graphEnabled(env)) { finishOperation(id); continue; }
    if (pool && !c.slots.includes(row.captureSlot)) {
      update(id, {status: 'action_required', reason: 'capture-slot-unavailable'}); continue;
    }
    let artifact = row.artifact;
    const sourcePath = join(root, 'data/toc-migrated', id, 'source.json');
    const locate = () => {
      if (!artifact && existsSync(sourcePath)) artifact = resolve(root, JSON.parse(readFileSync(sourcePath, 'utf8')).path ?? '');
      return Boolean(artifact) && existsSync(artifact);
    };
    // H1: a capture whose owner is gone while its meeting is still running is rejoined, not abandoned (decision in `interruptionOutcome`).
    const outcome = interruptionOutcome(c, row, locate, indexed);
    if (outcome) {
      const hasFile = locate();
      const n = (row.interruption?.n ?? 0) + 1, interruption = {n, outcome};
      if (outcome === 'rejoining') {
        // The old file is neither finalized nor deleted (H1-C8); it stays findable on the row. The new capture writes its own `artifact`.
        update(id, {status: 'queued', reason: 'interrupted-rejoining', interruption, artifact: undefined, monitorGap: undefined, ...(hasFile ? {interruptedArtifact: artifact} : {})});
        rejoined.add(id);
      } else update(id, {status: 'action_required', reason: outcome === 'ended' ? 'interrupted-ended' : 'retry-limit', interruption});
      continue;
    }
    if ((row.attempts ?? 0) >= 3) { update(id, {status: 'action_required', reason: 'retry-limit',
      ...(row.interruption && row.status === 'failed' ? {interruption: {n: row.interruption.n + 1, outcome: 'stopped'}} : {})}); continue; }
    if (!locate()) {
      if (!(indexed && c.graphEnabled(env) && row.graphSourceFingerprint)) {
        update(id, {status: 'action_required', reason: 'interrupted-no-recording-artifact'}); continue;
      }
      artifact = undefined;
    } else artifact = c.confined(root, artifact);
    const slot = pool?.slot(row.captureSlot);
    if (pool && slot === undefined) {
      if (row.captureSlot && !c.slots.includes(row.captureSlot)) update(id, {status: 'action_required', reason: 'capture-slot-unavailable'});
      continue;
    }
    const recover = async actualSlot => {
      if (stopped()) return;
      update(id, {status: 'processing', attempts: (row.attempts ?? 0) + 1, ...(pool ? {captureSlot: actualSlot} : {})});
      try {
        if (c.graphEnabled(env)) {
          await (deps.runSessionGraph ?? c.runSessionGraph)({deps: c.graphDeps(actualSlot), tenantId: c.tenantId, id, title: row.title ?? 'Webinar', artifact,
            sourceFingerprint: row.graphSourceFingerprint,
            env: {...env, MONGO_WORK_DB: work, LKB_CAPTURE_BACKEND: 'tab'}, validateIndexProof: c.validateIndexProof, runScript: deps.runScript});
          if (!complete(id)) throw new Error('Pipeline graph finished without a completed index marker; session is not ready');
          finishOperation(id);
        } else await execute(id, ['finalize', '--video', artifact, '--session-id', id, '--title', row.title ?? 'Webinar',
          '--tenant', c.tenantId, ...(actualSlot ? ['--capture-slot', actualSlot] : []), '--transcribe', '--process-video', '--index']);
      } catch (error) { update(id, {status: 'failed', reason: c.safeText(error.message)}); }
    };
    if (pool) pool.start(id, slot, recover); else await recover(row.captureSlot);
  }

  if (rejoined.size) {
    // The first selection ran while these rows were still `recording`; schedule the rejoins in THIS cycle, never in a later interval (H1-C2).
    // A rejoin is a join (H1-C7): the capture below re-runs validateTenant, applyJoinRules, opt-out and prepareCapture before it launches, exactly as for a first join.
    const fresh = select(), listed = new Set(selection.toSchedule.map(item => item.sessionKey));
    selection = {...selection, toSchedule: [...selection.toSchedule, ...fresh.toSchedule.filter(item => rejoined.has(item.sessionKey) && !listed.has(item.sessionKey))]};
    const decided = new Set([...fresh.toSchedule.map(item => item.sessionKey),
      ...fresh.skipped.filter(skipped => ['cancelled', 'past', ...REFUSAL_REASONS].includes(skipped.reason)).map(skipped => skipped.sessionKey)]);
    // A meeting that vanished from the selection (rescheduled, link no longer usable) cannot be rejoined: say so instead of leaving a "rejoining" row.
    for (const id of rejoined) if (!decided.has(id) && state.operations[id]?.status === 'queued') update(id, {status: 'action_required', reason: 'coverage-review'});
  }

  const ordered = [...selection.toSchedule].sort((a, b) => (c.priority(b) - c.priority(a)) ||
    Date.parse(a.startTime) - Date.parse(b.startTime) || a.sessionKey.localeCompare(b.sessionKey));
  for (const initial of ordered) {
    if (stopped()) return;
    const item = select().toSchedule.find(current => current.sessionKey === initial.sessionKey);
    if (!item || pool?.has(item.sessionKey)) continue;
    const id = item.sessionKey, prior = state.operations[id];
    const classification = c.tagsForItem?.(item) ?? {};
    const topic = {careerGuidance: classification.careerGuidance, testData: classification.testData};
    if (!c.validId(id)) throw new Error('Unsafe canonical webinar session id');
    if (prior && ['ready', 'action_required', 'failed'].includes(prior.status) && !c.reconsider(prior)) continue;
    if (Date.parse(item.endTime) <= Date.parse(now())) { update(id, {status: 'action_required', reason: 'missed-while-processing', title: item.title}); continue; }
    const supports = slot => deps.captureSlotSupports(slot, item) === true;
    const slot = pool?.slot(undefined, supports);
    if (pool && slot === undefined) {
      const reason = c.slots.some(supports) ? 'capacity-full' : 'capture-slot-unavailable';
      if (prior?.status !== 'queued' || prior.reason !== reason) update(id, {
        status: 'queued', reason, title: item.title, startTime: item.startTime, endTime: item.endTime, ...topic});
      continue;
    }
    // Pre-launch transient: stay re-dispatchable while the meeting runs (bounded), then surface as action_required so it alerts.
    const prelaunchTransient = id => {
      const retries = (state.operations[id]?.prelaunchRetries ?? 0) + 1;
      return retries > PRELAUNCH_TRANSIENT_LIMIT ? {status: 'action_required', reason: 'prelaunch-transient-limit'}
        : {status: 'queued', reason: 'prelaunch-transient', prelaunchRetries: retries};
    };
    const capture = async () => {
      const priorAttempts = state.operations[id]?.attempts ?? 0;
      let launching = false; // true once the row is written `recording`; before that a failure has launched nothing
      try {
        if (stopped()) return;
        await deps.validateTenant();
        if (stopped()) return;
        const ruled = deps.applyJoinRules ? await deps.applyJoinRules({toSchedule: [item], skipped: []}, {readOnly: false, now: now(), remote: Boolean(deps.calendarAttendance)})
          : {toSchedule: [item], skipped: []};
        if (stopped()) return;
        if (!ruled.toSchedule.some(current => current.sessionKey === id)) {
          update(id, {status: 'action_required', reason: ruled.skipped[0]?.reason ?? 'rules-unevaluable'}); return;
        }
        if (pool && await deps.refreshSchedulerPolicy() !== true) return;
        if (stopped()) return;
        await c.prepareCapture(item);
        if (stopped()) return;
        if (Date.parse(item.endTime) <= Date.parse(now())) { update(id, {status: 'action_required', reason: 'missed-coverage'}); return; }
        await deps.validateTenant();
        if (stopped()) return;
        if (pool) await deps.validateCaptureSlot(slot, item);
        if (stopped()) return;
        launching = true;
        update(id, {status: 'recording', reason: undefined, title: item.title, startTime: item.startTime, endTime: item.endTime,
          ...(state.operations[id]?.prelaunchRetries ? {prelaunchRetries: undefined} : {}), ...(pool ? {captureSlot: slot} : {}), attempts: (state.operations[id]?.attempts ?? 0) + 1});
        const args = ['record', item.meetingUrl, '--backend', 'tab', '--until', item.endTime,
          '--session-id', id, '--title', item.title, '--tenant', c.tenantId, ...(pool ? ['--capture-slot', slot] : [])];
        if (c.graphEnabled(env)) {
          const fingerprint = c.sourceFingerprint(item);
          update(id, {graphSourceFingerprint: fingerprint});
          await (deps.runFreshSessionGraph ?? c.runFreshSessionGraph)({deps: c.graphDeps(slot), tenantId: c.tenantId,
            id, title: item.title, sourceFingerprint: fingerprint, env: {...env, MONGO_WORK_DB: work, LKB_CAPTURE_BACKEND: 'tab'},
            validateIndexProof: c.validateIndexProof, runScript: deps.runScript,
            capture: ctx => execute(id, args, item, {captureOnly: true, signal: ctx.signal})});
          if (!complete(id)) throw new Error('Fresh pipeline graph finished without a completed index marker; session is not ready');
          finishOperation(id);
        } else await execute(id, [...args, '--transcribe', '--process-video', '--index'], item);
      } catch (error) { update(id, error?.code === 'SCHEDULER_STOPPED' ? {status: 'queued', reason: 'service-stopped', attempts: priorAttempts}
        : error?.code === 'SCHEDULER_PRIVACY_UNAVAILABLE' ? {status: 'action_required', reason: 'privacy-controller-unavailable'}
        : error?.code === 'SCHEDULER_OWNERSHIP_UNVERIFIED' ? {status: 'action_required', reason: 'coverage-review'}
        : !launching && isTransientNetworkError(error) && Date.parse(item.endTime) > Date.parse(now()) ? prelaunchTransient(id)
        : {status: 'failed', reason: c.safeText(error.message)}); }
    };
    update(id, {status: 'queued', reason: undefined, title: item.title, startTime: item.startTime, endTime: item.endTime, ...topic});
    if (pool) pool.start(id, slot, capture); else await capture();
  }
  for (const skipped of [...selection.skipped, ...select().skipped]) {
    if (['cancelled', 'past'].includes(skipped.reason) && state.operations[skipped.sessionKey]?.status === 'queued')
      update(skipped.sessionKey, {status: 'action_required', reason: skipped.reason === 'past' ? 'missed-coverage' : 'cancelled'});
    if (REFUSAL_REASONS.includes(skipped.reason)) {
      if (c.validId(skipped.sessionKey) && (!state.operations[skipped.sessionKey] || state.operations[skipped.sessionKey].status === 'queued'))
        update(skipped.sessionKey, {status: 'action_required', reason: skipped.reason, title: skipped.title});
      else c.log(`Skipped: ${skipped.reason}`);
    }
  }
}
