/** Bounded canonical operations/discovery producer for the existing durable email/dashboard sink. */
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {register} from 'tsx/esm/api';
register();
const {ALERT_KINDS, cleanBotText} = await import('../../../packages/meeting-bot/src/autojoin/bot-events.ts');
const {readCaptureTags} = await import('../../../packages/meeting-bot/src/autojoin/capture-tags.ts');
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REASONS = new Set(['capacity-full', 'capture-slot-unavailable', 'missed-coverage', 'missed-while-processing', 'retry-limit',
  'cancelled', 'rescheduled', 'coverage-review', 'controller-disconnected', 'privacy-controller-unavailable',
  'interrupted-no-recording-artifact', 'rule-denied', 'opted-out', 'rules-unevaluable', 'needs-registration', 'needs-review']);
const LIMIT = 50, REPLAY = 25, LOOKBACK = 2 * 24 * 60 * 60 * 1000;
const HANDOFF = new Set(['sent', 'duplicate', 'disabled', 'digest-queued', 'skipped-test-data', 'created', 'updated', 'skipped-no-times', 'superseded']);

export function canonicalOperationAlert(id, row, tags = {}, event) {
  if (!ID.test(id)) return;
  const kind = event === 'capture-started' ? event : row.status === 'ready' ? 'capture-done'
    : row.status === 'failed' ? 'capture-failed' : row.status === 'action_required' ? row.stopDisposition ? 'capture-stopped-early' : 'capture-failed'
    : row.status === 'queued' && ['capacity-full', 'capture-slot-unavailable'].includes(row.reason) ? 'coverage-deferred' : undefined;
  if (!kind) return;
  const careerGuidance = typeof tags.careerGuidance === 'boolean' ? tags.careerGuidance : row.careerGuidance === true;
  const testData = typeof tags.testData === 'boolean' ? tags.testData : typeof row.testData === 'boolean' ? row.testData : !careerGuidance;
  return {kind, sessionKey: id, title: typeof row.title === 'string' ? row.title : 'Webinar',
    startTime: row.startTime, endTime: row.endTime,
    careerGuidance, testData,
    ...(kind === 'capture-done' ? {outputPath: `data/toc-migrated/${id}`} : {}),
    ...(row.reason ? {detail: REASONS.has(row.reason) ? `Coverage: ${row.reason}.` : 'Coverage requires review.'} : {})};
}

export function createCanonicalAlerts({state, tenantId, autojoin, flush, assertOwned, save, enqueueNotification, log, now}) {
  let tail = Promise.resolve(), cursor = 0;
  let overflow = false;
  const pending = new Set(), unsupported = new Set(), kinds = new Set(ALERT_KINDS);
  const carrier = (collection, id) => state[collection]?.[id];
  const enqueue = (key, body) => {
    if (pending.has(key)) return;
    if (pending.size >= LIMIT) {if (!overflow) {overflow = true; log('Scheduler alert queue full; durable events await replay');} return;}
    pending.add(key);
    const next = tail.then(async () => {assertOwned(); await body();}).catch(() => log('Scheduler alert unavailable; durable operation state retained'))
      .finally(() => {pending.delete(key); if (pending.size < LIMIT) overflow = false;});
    tail = next;
  };
  const prepare = (input, collection, id) => {
    if (!input) return;
    if (!kinds.has(input.kind)) {
      if (!unsupported.has(input.kind)) {unsupported.add(input.kind); log('Scheduler alert kind is not wired to the configured sink');}
      return;
    }
    const row = carrier(collection, id); if (!row || state.tenantId !== undefined && state.tenantId !== tenantId) return;
    if (collection === 'operations' && (row.tenantId !== tenantId || input.sessionKey !== id) ||
      collection === 'discovery' && !new RegExp(`^discovery-${id}-[a-f0-9]{24}$`).test(input.sessionKey)) return;
    const snapshot = {kind: input.kind, sessionKey: cleanBotText(input.sessionKey, 120), title: cleanBotText(input.title, 200),
      ...(typeof input.startTime === 'string' ? {startTime: input.startTime.slice(0, 40)} : {}),
      ...(typeof input.endTime === 'string' ? {endTime: input.endTime.slice(0, 40)} : {}),
      ...(typeof input.careerGuidance === 'boolean' ? {careerGuidance: input.careerGuidance} : {}),
      ...(typeof input.testData === 'boolean' ? {testData: input.testData} : {}),
      ...(typeof input.detail === 'string' ? {detail: cleanBotText(input.detail, 300)} : {}),
      ...(typeof input.outputPath === 'string' ? {outputPath: cleanBotText(input.outputPath, 260)} : {})};
    const key = `${snapshot.sessionKey}:${snapshot.kind}`;
    const outbox = Array.isArray(row.schedulerAlertOutbox) ? row.schedulerAlertOutbox : [];
    const changed = !outbox.some(saved => saved?.sessionKey === snapshot.sessionKey && saved?.kind === snapshot.kind);
    if (changed) {
      if (outbox.length >= 8) {log('Scheduler durable alert backlog full; coverage requires review'); throw new Error('Scheduler alert outbox capacity reached');}
      assertOwned(); row.schedulerAlertOutbox = [...outbox, snapshot];
    }
    return {changed, dispatch: () => enqueue(key, async () => {
      const result = await autojoin()?.raise?.(snapshot);
      if (!result || !['email', 'dashboard', 'calendar'].every(channel => HANDOFF.has(result[channel]))) return;
      assertOwned(); const latest = carrier(collection, id);
      if (!latest || collection === 'operations' && latest.tenantId !== tenantId) return;
      latest.schedulerAlertOutbox = (latest.schedulerAlertOutbox ?? []).filter(saved => `${saved.sessionKey}:${saved.kind}` !== key);
      save();
    })};
  };
  const raise = (input, collection, id) => {
    const prepared = prepare(input, collection, id);
    if (prepared?.changed) save();
    prepared?.dispatch();
  };
  const operationInput = (id, event) => {
    const row = state.operations[id];
    if (!row || row.tenantId !== tenantId) return;
    let tags = {}; try {const dir = autojoin()?.tagsDir; if (dir) tags = readCaptureTags(dirname(dir), id);} catch { /* unknown classification cannot be promoted to career */ }
    return canonicalOperationAlert(id, row, tags, event);
  };
  const operation = (id, event) => raise(operationInput(id, event), 'operations', id);
  const discoveryInput = (feed, previous, current) => {
    if (!['calendar', 'gmail'].includes(feed)) return;
    const failed = current.status === 'failed';
    if (!failed && previous?.status !== 'failed') return;
    const boundary = failed ? current.lastSuccessAt : previous?.lastSuccessAt;
    const outage = createHash('sha256').update(JSON.stringify([tenantId, feed, boundary ?? 'no-success'])).digest('hex').slice(0, 24);
    return {kind: failed ? 'discovery-degraded' : 'discovery-recovered', sessionKey: `discovery-${feed}-${outage}`,
      title: `Webinar discovery ${feed}`, detail: failed ? 'Discovery unavailable; coverage requires attention.' : 'Connected discovery recovered.'};
  };
  return {
    operation,
    preserveDiscovery(previous, current) {
      for (const feed of ['calendar', 'gmail']) if (Array.isArray(previous?.[feed]?.schedulerAlertOutbox))
        current[feed].schedulerAlertOutbox = [...previous[feed].schedulerAlertOutbox];
      return current;
    },
    update(id, changes, event) {
      assertOwned();
      state.operations[id] = {...state.operations[id], ...changes, tenantId, updatedAt: now()};
      const prepared = prepare(operationInput(id, event), 'operations', id);
      save(); log(`${id}: ${changes.status ?? state.operations[id].status}`);
      prepared?.dispatch(); enqueueNotification(id);
    },
    acquireDiscovery(current) {
      assertOwned();
      const previous = state.discovery;
      for (const feed of ['calendar', 'gmail']) if (Array.isArray(previous?.[feed]?.schedulerAlertOutbox))
        current[feed].schedulerAlertOutbox = [...previous[feed].schedulerAlertOutbox];
      state.discovery = current;
      const prepared = ['calendar', 'gmail'].map(feed => prepare(discoveryInput(feed, previous?.[feed], current[feed]), 'discovery', feed));
      save();
      for (const event of prepared) event?.dispatch();
    },
    discovery(feed, previous, current) {
      if (!['calendar', 'gmail'].includes(feed)) return;
      if (previous?.schedulerAlertOutbox?.length && !current.schedulerAlertOutbox) {
        assertOwned(); current.schedulerAlertOutbox = previous.schedulerAlertOutbox; save();
      }
      raise(discoveryInput(feed, previous, current), 'discovery', feed);
    },
    tick() {
      const ids = Object.keys(state.operations);
      for (let n = 0; n < Math.min(REPLAY, ids.length); n++) {
        const id = ids[cursor++ % ids.length], row = state.operations[id], age = Date.parse(now()) - Date.parse(row.updatedAt);
        if (row.tenantId === tenantId && Array.isArray(row.schedulerAlertOutbox)) for (const input of row.schedulerAlertOutbox) raise(input, 'operations', id);
        if (Number.isFinite(age) && age >= 0 && age <= LOOKBACK) operation(id);
      }
      for (const feed of ['calendar', 'gmail']) {
        const outbox = state.discovery?.[feed]?.schedulerAlertOutbox;
        if (Array.isArray(outbox)) for (const input of outbox) raise(input, 'discovery', feed);
      }
      if (flush) enqueue('flush', flush);
    },
    async wait() {await tail;},
  };
}
