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
  'interrupted-no-recording-artifact', 'rule-denied', 'opted-out', 'rules-unevaluable', 'needs-registration', 'needs-review', 'admission_denied',
  'interrupted-rejoining', 'interrupted-ended']);
/** D-236 A3: a reason is a listed name, or starts with one followed by an ASCII character that is not a letter, digit or underscore (`name: text`, `name - text`). A hyphen glued to the name is not a delimiter (`rescheduled-completed` is a different value). */
const reasonName = reason => typeof reason === 'string' ? [...REASONS].find(name => reason === name ||
  reason.startsWith(name) && /[\x00-\x2c\x2e\x2f\x3a-\x40\x5b-\x5e\x60\x7b-\x7f]/.test(reason[name.length])) : undefined;
/** H1: an interruption outcome is mailed only while the row still shows the state that outcome produced (a stale marker never relabels a later failure). */
const INTERRUPTION_STATE = {rejoining: ['queued', 'interrupted-rejoining'], ended: ['action_required', 'interrupted-ended'], stopped: ['action_required', 'retry-limit']};
const interruptionOf = row => {
  const {n, outcome} = row.interruption ?? {}, [status, reason] = INTERRUPTION_STATE[outcome] ?? [];
  return Number.isSafeInteger(n) && n > 0 && row.status === status && row.reason === reason ? {n, outcome} : undefined;
};
/** Identity of one alert in the durable outbox: an interruption is told apart by its number, every other alert by session and kind alone. */
const alertKey = alert => `${alert.sessionKey}:${alert.kind}${alert.interruption ? `#${alert.interruption.n}` : ''}`;
/** Alert delivery must never stop capture: a full per-carrier outbox sheds the least valuable entry instead of throwing. Flapping discovery alerts go first; capture-failed alerts last. */
const OUTBOX_MAX = 8, FLAPPING = new Set(['discovery-degraded', 'discovery-recovered']);
const LIMIT = 50, REPLAY = 25, LOOKBACK = 2 * 24 * 60 * 60 * 1000;
const HANDOFF = new Set(['sent', 'duplicate', 'disabled', 'digest-queued', 'skipped-test-data', 'created', 'updated', 'skipped-no-times', 'superseded']);

export function canonicalOperationAlert(id, row, tags = {}, event) {
  if (!ID.test(id)) return;
  const interruption = interruptionOf(row);
  const kind = event === 'capture-started' ? event : interruption ? 'capture-failed' : row.status === 'ready' ? 'capture-done'
    : row.status === 'failed' ? 'capture-failed' : row.status === 'action_required' ? row.stopDisposition ? 'capture-stopped-early' : 'capture-failed'
    : row.status === 'queued' && ['capacity-full', 'capture-slot-unavailable'].includes(row.reason) ? 'coverage-deferred' : undefined;
  if (!kind) return;
  const careerGuidance = typeof tags.careerGuidance === 'boolean' ? tags.careerGuidance : row.careerGuidance === true;
  const testData = typeof tags.testData === 'boolean' ? tags.testData : typeof row.testData === 'boolean' ? row.testData : !careerGuidance;
  return {kind, sessionKey: id, title: typeof row.title === 'string' ? row.title : 'Webinar',
    startTime: row.startTime, endTime: row.endTime,
    careerGuidance, testData,
    ...(kind === 'capture-done' ? {outputPath: `data/toc-migrated/${id}`} : {}),
    ...(interruption && kind === 'capture-failed' ? {interruption} : {}),
    ...(row.reason || row.reason === '' ? {detail: reasonName(row.reason) ? `Coverage: ${reasonName(row.reason)}.` : 'Coverage requires review.'} : {})};
}

export function createCanonicalAlerts({state, tenantId, autojoin, flush, assertOwned, save, enqueueNotification, log, now}) {
  let tail = Promise.resolve(), cursor = 0;
  let overflow = false;
  const dropNoted = new Set();
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
      ...(typeof input.outputPath === 'string' ? {outputPath: cleanBotText(input.outputPath, 260)} : {}),
      ...(input.interruption ? {interruption: input.interruption} : {})};
    const key = alertKey(snapshot);
    const outbox = Array.isArray(row.schedulerAlertOutbox) ? row.schedulerAlertOutbox : [];
    let changed = !outbox.some(saved => saved && alertKey(saved) === key);
    if (changed) {
      assertOwned();
      // A newer flapping alert replaces the pending one of its kind: only the latest discovery state is worth telling.
      const next = FLAPPING.has(snapshot.kind) ? outbox.filter(saved => saved?.kind !== snapshot.kind) : [...outbox];
      let dropped = 0, keep = true;
      while (next.length >= OUTBOX_MAX) {
        const flapping = next.findIndex(saved => FLAPPING.has(saved?.kind));
        if (flapping >= 0) next.splice(flapping, 1);
        else if (FLAPPING.has(snapshot.kind)) {keep = false; dropped++; break;}
        else {
          const other = next.findIndex(saved => saved?.kind !== 'capture-failed');
          // Review 2026-11-27: a lower-value newcomer never pushes out a capture-failed alert; it is dropped (and counted) instead.
          if (other < 0 && snapshot.kind !== 'capture-failed') {keep = false; dropped++; break;}
          next.splice(other >= 0 ? other : 0, 1);
        }
        dropped++;
      }
      if (keep) next.push(snapshot);
      if (dropped) {
        row.schedulerAlertsDropped = (Number.isSafeInteger(row.schedulerAlertsDropped) ? row.schedulerAlertsDropped : 0) + dropped;
        const tag = `${collection}:${id}`;
        if (!dropNoted.has(tag)) {dropNoted.add(tag); log(`Scheduler durable alert backlog full for ${tag}; oldest low-value alert dropped and counted, capture continues`);}
      }
      if (dropped || keep) row.schedulerAlertOutbox = next; else changed = false;
      changed = changed || dropped > 0;
    }
    return {changed, dispatch: () => enqueue(key, async () => {
      const result = await autojoin()?.raise?.(snapshot);
      if (!result || !['email', 'dashboard', 'calendar'].every(channel => HANDOFF.has(result[channel]))) return;
      assertOwned(); const latest = carrier(collection, id);
      if (!latest || collection === 'operations' && latest.tenantId !== tenantId) return;
      latest.schedulerAlertOutbox = (latest.schedulerAlertOutbox ?? []).filter(saved => alertKey(saved) !== key);
      save();
    })};
  };
  const raise = (input, collection, id) => {
    const prepared = prepare(input, collection, id);
    if (prepared?.changed) save();
    prepared?.dispatch();
  };
  const keepOutbox = (from, to) => {
    to.schedulerAlertOutbox = [...from.schedulerAlertOutbox];
    if (Number.isSafeInteger(from.schedulerAlertsDropped)) to.schedulerAlertsDropped = from.schedulerAlertsDropped;
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
        keepOutbox(previous[feed], current[feed]);
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
        keepOutbox(previous[feed], current[feed]);
      state.discovery = current;
      const prepared = ['calendar', 'gmail'].map(feed => prepare(discoveryInput(feed, previous?.[feed], current[feed]), 'discovery', feed));
      save();
      for (const event of prepared) event?.dispatch();
    },
    discovery(feed, previous, current) {
      if (!['calendar', 'gmail'].includes(feed)) return;
      if (previous?.schedulerAlertOutbox?.length && !current.schedulerAlertOutbox) {
        assertOwned(); keepOutbox(previous, current); save();
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
