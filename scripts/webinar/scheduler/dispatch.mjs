/** Canonical durable operations: recovery, rule-controlled selection and capture dispatch. */
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

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
  if (deps.applyJoinRules) selection = await deps.applyJoinRules(selection, {readOnly: false, now: now()});
  if (stopped()) return;
  c.setPreview(selection);
  for (const id of Object.keys(state.operations)) c.notify(id);

  for (const [id, row] of Object.entries(state.operations)) {
    if (stopped()) return;
    if (pool?.has(id) || !['recording', 'processing', 'failed'].includes(row.status)) continue;
    const indexed = complete(id);
    // An index marker may precede the queue acknowledgement. Graph recovery must
    // reopen the durable graph and receive its complete outcome before finishing.
    if (indexed && !c.graphEnabled(env)) { finishOperation(id); continue; }
    if (pool && !c.slots.includes(row.captureSlot)) {
      update(id, {status: 'action_required', reason: 'capture-slot-unavailable'}); continue;
    }
    if ((row.attempts ?? 0) >= 3) { update(id, {status: 'action_required', reason: 'retry-limit'}); continue; }
    let artifact = row.artifact;
    const sourcePath = join(root, 'data/toc-migrated', id, 'source.json');
    if (!artifact && existsSync(sourcePath)) artifact = resolve(root, JSON.parse(readFileSync(sourcePath, 'utf8')).path ?? '');
    if (!artifact || !existsSync(artifact)) {
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
    const capture = async () => {
      const priorAttempts = state.operations[id]?.attempts ?? 0;
      try {
        if (stopped()) return;
        await deps.validateTenant();
        if (stopped()) return;
        const ruled = deps.applyJoinRules ? await deps.applyJoinRules({toSchedule: [item], skipped: []}, {readOnly: false, now: now()})
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
        update(id, {status: 'recording', reason: undefined, title: item.title, startTime: item.startTime, endTime: item.endTime,
          ...(pool ? {captureSlot: slot} : {}), attempts: (state.operations[id]?.attempts ?? 0) + 1});
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
        : {status: 'failed', reason: c.safeText(error.message)}); }
    };
    update(id, {status: 'queued', reason: undefined, title: item.title, startTime: item.startTime, endTime: item.endTime, ...topic});
    if (pool) pool.start(id, slot, capture); else await capture();
  }
  for (const skipped of [...selection.skipped, ...select().skipped]) {
    if (['cancelled', 'past'].includes(skipped.reason) && state.operations[skipped.sessionKey]?.status === 'queued')
      update(skipped.sessionKey, {status: 'action_required', reason: skipped.reason === 'past' ? 'missed-coverage' : 'cancelled'});
    if (['overlap-lost', 'needs-registration', 'needs-review', 'invalid-time', 'unsafe-join-link',
      'rule-denied', 'opted-out', 'rules-unevaluable'].includes(skipped.reason)) {
      if (c.validId(skipped.sessionKey) && (!state.operations[skipped.sessionKey] || state.operations[skipped.sessionKey].status === 'queued'))
        update(skipped.sessionKey, {status: 'action_required', reason: skipped.reason, title: skipped.title});
      else c.log(`Skipped: ${skipped.reason}`);
    }
  }
}
