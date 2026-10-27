/** Fresh provider account/attendance proof around the existing native Calendar transport. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync, existsSync, statSync, mkdirSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync} from 'node:fs';
import {join, resolve, isAbsolute, delimiter} from 'node:path';
import {ATTENDANCE_ACCOUNT, attendanceFingerprint, attendanceSessionKey, rawAttendanceObservation, selectVerifiedCalendarMeetings} from './calendar-attendance-policy.mjs';
import {randomUUID, createHash} from 'node:crypto';
const {webinarIdentity} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {acquireLock, lockStillOwned, releaseLock} = await import('../../packages/meeting-bot/src/calendar/join-rules/join-rules-store-lock.ts');
const execute = promisify(execFile);
const parse = output => {
  const lines = String(output).split('\n'), index = lines.findIndex(line => line.trim().startsWith('{'));
  if (index < 0) throw new Error('Calendar provider returned no structured result');
  const value = JSON.parse(lines.slice(index).join('\n'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.error) throw new Error('Calendar provider acquisition failed');
  return value;
};

export function createCalendarAttendanceSource({account, tenantId, run, acquire, validateAcquisition, now}) {
  if (account !== ATTENDANCE_ACCOUNT || typeof tenantId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(tenantId)) throw new Error('Invalid explicit attendance account or tenant');
  let observations = new Map(), generationValid = false, attendanceMode;
  const clear = () => { observations = new Map(); generationValid = false; };
  const verifyAccount = async () => {
    try {
      const value = parse(await run(['calendar', 'calendars', 'get', '--params', JSON.stringify({calendarId: 'primary'}), '--format', 'json']));
      if (value.kind !== 'calendar#calendar' || value.id !== account) throw new Error('Connected Calendar account mismatch or missing provider proof');
      if (value.timeZone !== undefined && (typeof value.timeZone !== 'string' || value.timeZone.length > 100)) throw new Error('Invalid Calendar account timezone');
      return value.timeZone;
    } catch { clear(); throw new Error('Connected Calendar account mismatch or missing provider proof'); }
  };
  async function load(syncToken, requestStartedAt = new Date(now()).toISOString()) {
    clear(); const observed = [];
    try {
      const timeZone = await verifyAccount();
      const result = await acquire(14, async args => {
        const output = await run(args), value = parse(output);
        if (args[0] !== 'calendar' || args[1] !== 'events') throw new Error('Unexpected attendance acquisition command');
        if (args[2] === 'list') { if (value.items !== undefined && !Array.isArray(value.items)) throw new Error('Invalid Calendar observations'); observed.push(...(value.items ?? [])); }
        else if (args[2] === 'get') observed.push(value);
        else throw new Error('Unexpected attendance acquisition command');
        return output;
      }, undefined, {syncToken}, {timeZone});
      if (await verifyAccount() !== timeZone) throw new Error('Calendar timezone changed during acquisition');
      const value = {...result, tenantId}; validateAcquisition(value, tenantId, syncToken, requestStartedAt);
      const next = new Map();
      for (const raw of observed) {
        const observation = rawAttendanceObservation(raw), prior = next.get(observation.fingerprint);
        next.set(observation.fingerprint, prior && prior.approval !== observation.approval ? {...observation, approval: 'needs-review'} : observation);
      }
      observations = next; generationValid = true; return value;
    } catch { clear(); throw new Error('Attendance Calendar account or acquisition could not be verified'); }
  }
  const observationFor = event => generationValid ? observations.get(attendanceFingerprint(event)) : undefined;
  return {verifyAccount, load,
    assertOwner: value => {if (value !== tenantId) {clear(); throw new Error('Attendance tenant binding changed');}},
    select: (input, {trustedRuleSet} = {}) => {
      attendanceMode = input.attendanceMode; if (!generationValid) throw new Error('Current attendance acquisition proof is required');
      const selected = selectVerifiedCalendarMeetings(input, observationFor, trustedRuleSet);
      const refused = new Set(input.candidates.filter(row => row.evidenceIssue !== undefined).map(row => row.meetingUrl && row.startTime && webinarIdentity(row.meetingUrl, row.startTime)).filter(Boolean));
      selected.toSchedule = selected.toSchedule.filter(row => {if (!refused.has(webinarIdentity(row.meetingUrl, row.startTime))) return true;
        const {sessionKey, source, sourceId, title} = row; selected.skipped.push({sessionKey, source, sourceId, title, reason: 'needs-review'}); return false;});
      return selected;
    },
    assertAcquisition: loaded => { if (!generationValid || loaded.failed || (loaded.calendarAcquisition && loaded.calendarAcquisition.tenantId !== tenantId)) throw new Error('Attendance acquisition owner proof is required before writes'); },
    activeStopReason: (id, prepared) => {
      const event = prepared.calendarEvents.find(row => attendanceSessionKey(row) === id), observation = event && observationFor(event);
      if (event && prepared.candidates?.some(row => row.evidenceIssue !== undefined && row.meetingUrl && row.startTime && webinarIdentity(row.meetingUrl, row.startTime) === webinarIdentity(event.meetingUrl, event.startTime))) return 'cancelled';
      return observation && observation.approval !== 'accepted' && !(attendanceMode === 'all' && observation.approval === 'unanswered') ? 'cancelled' : undefined;
    },
  };
}

export async function configureCalendarAttendance(deps, account, dependencies = {}) {
  const {runGws, listUpcomingGwsMeetings} = dependencies.transport ?? await import('../../apps/api/src/gws/gws-calendar.ts');
  const {validateWebinarCalendarAcquisition, readWebinarOperationState} = dependencies.state ?? await import('../../packages/meeting-bot/src/calendar/state/schedule-state.ts');
  const binary = dependencies.transport ? deps.env.LKB_GWS_PATH ?? process.execPath : resolveAttendanceExecutable('gws', deps.env.LKB_GWS_PATH, deps.env);
  if (!isAbsolute(binary)) throw new Error('Attendance GWS executable must be an absolute path');
  const nativeRun = args => runGws(args, (_file, nativeArgs, options, callback) => execFile(binary,
    process.platform === 'win32' ? nativeArgs.slice(2) : nativeArgs, {...options, windowsHide: true}, callback));
  const source = createCalendarAttendanceSource({account, tenantId: deps.env.LKB_TENANT_ID, run: nativeRun,
    acquire: listUpcomingGwsMeetings, validateAcquisition: validateWebinarCalendarAcquisition, now: deps.now});
  const gmail = dependencies.gmail ?? await import('../../apps/api/src/gws/gws-gmail.ts');
  let gmailSnapshot, gmailSummary;
  const loadCandidates = async () => {
    gmailSnapshot = undefined; gmailSummary = undefined;
    const profile = parse(await nativeRun(['gmail', 'users', 'getProfile', '--params', JSON.stringify({userId: 'me'}), '--format', 'json']));
    if (profile.emailAddress !== account) throw new Error('Connected Gmail account mismatch');
    const rows = await gmail.scanGmailForMeetingCandidates(500, nativeRun, {aliases: deps.env.LKB_GMAIL_ALIASES, labelIds: deps.env.LKB_GMAIL_LABEL_IDS,
      ownDomains: [account.slice(account.lastIndexOf('@') + 1).toLowerCase()], onSummary: value => { gmailSummary = value; }});
    const after = parse(await nativeRun(['gmail', 'users', 'getProfile', '--params', JSON.stringify({userId: 'me'}), '--format', 'json']));
    if (after.emailAddress !== account || !Array.isArray(rows) || rows.length > 500) throw new Error('Gmail account changed or acquisition exceeded coverage budget');
    // Provenance hints are local diagnostics, not fields of the version-1 worker wire.
    gmailSnapshot = rows.map(({timeProvenance: _time, canonicalEventIdentity: _identity, ...candidate}) => candidate);
    // Only the hosted operator state grants approvals/rejections; a fresh mail scan grants none.
    const remote = await deps.loadCandidates(false), merged = new Map(remote.map(row => [row.messageId ?? row.id, row]));
    for (const row of rows) {
      const prior = merged.get(row.messageId), {subject, recordingUrl: _recording, timeProvenance: _time, canonicalEventIdentity: _identity, ...candidate} = row;
      merged.set(row.messageId, {...candidate, id: prior?.id ?? row.messageId, title: subject, status: prior?.status ?? 'pending'});
    }
    return [...merged.values()];
  };
  const hostId = deps.env.LKB_CALENDAR_WORKER_HOST_ID;
  const publisher = hostId ? createCalendarWorkerPublisher({stateDir: deps.stateDir, account, hostId, tenantId: deps.env.LKB_TENANT_ID,
    apiUrl: deps.env.LKB_API_URL, apiKey: deps.env.LKB_API_KEY, fetch: dependencies.fetch, now: deps.now}) : undefined;
  source.checkReady = (configured, gate) => checkCalendarAttendanceReady(configured, gate, dependencies.probe);
  source.publishDiscovery = async () => {
    if (!publisher) throw new Error('Discovery-only mode requires an authenticated hosted worker binding');
    try {
      source.assertOwner(deps.env.LKB_TENANT_ID);
      await loadCandidates();
      const calendar = await source.load();
      const state = readWebinarOperationState(join(deps.stateDir, 'operations.json'), deps.env.LKB_TENANT_ID, calendar.checkedAt);
      await publisher.publish({checkedAt: calendar.checkedAt, complete: true, sourceEvents: calendar.sourceEvents, meetings: calendar.meetings, candidates: gmailSnapshot, gmailSummary, operations: state.operations});
      return {status: 'running', toRecord: [], skipped: [], operations: {}, discovery: {calendar: {status: 'healthy'}, gmail: {status: 'healthy'}}};
    } catch {
      await publisher.publish({checkedAt: new Date(deps.now()).toISOString(), complete: false, sourceEvents: [], meetings: [], candidates: [], operations: {}}).catch(() => {});
      throw Object.assign(new Error('Calendar worker discovery unavailable'), {code: 'WEBINAR_DISCOVERY_UNAVAILABLE'});
    }
  };
  return {...deps, calendarAttendance: source,
    loadCalendarEvents: async () => (await source.load()).meetings,
    loadCalendarAcquisition: source.load,
    // Gmail discovery and operation/dashboard notifications remain enabled.
    loadCandidates,
    ...(publisher ? {publishWorkerState: input => {
      if (input.complete && !gmailSnapshot) throw new Error('Complete native Gmail acquisition required for worker publication');
      return publisher.publish({...input, candidates: gmailSnapshot ?? [], gmailSummary});
    }} : {}),
  };
}

export async function checkCalendarAttendanceReady(deps, validateRunGate, probe = async (file, env) => {
  const binary = resolveAttendanceExecutable('ffprobe', env.LKB_FFPROBE, env);
  if (!isAbsolute(binary)) throw new Error('Attendance media executable must be an absolute path');
  const {stdout} = await execute(binary, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true});
  return JSON.parse(stdout);
}) {
  deps.calendarAttendance.assertOwner(deps.env.LKB_TENANT_ID);
  validateRunGate(deps.root, deps.env);
  await deps.validateTenant(); await deps.calendarAttendance.verifyAccount();
  if (Array.isArray(deps.captureSlots)) {
    if (!deps.env.LKB_CALENDAR_WORKER_HOST_ID || !deps.env.LKB_API_URL) throw new Error('Explicit hosted worker account/host binding is required before unattended activation');
    await deps.validateCaptureSlots(deps.captureSlots);
  }
  const proof = JSON.parse(readFileSync(join(deps.root, 'data/webinar-release/live-proof.json'), 'utf8'));
  const media = await probe(resolve(deps.root, proof.recording), deps.env);
  if (!Array.isArray(media?.streams) || !media.streams.some(row => row.codec_type === 'audio' && row.channels > 0) ||
    !media.streams.some(row => row.codec_type === 'video' && row.width > 0 && row.height > 0) || !(Number(media.format?.duration) > 0)) throw new Error('Attendance proof media lacks verifiable audio/video streams');
}

/** Resolve an explicit installed executable or the operator's PATH, never a guessed version directory. */
export function resolveAttendanceExecutable(name, override, env = process.env) {
  const explicit = override !== undefined;
  const paths = explicit ? [override] : (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)
    .map(dir => join(dir, name + (process.platform === 'win32' ? '.exe' : '')));
  for (const file of paths) {
    if (typeof file !== 'string' || !isAbsolute(file) || /^[\\/]{2}/.test(file) || /[\x00-\x1f\x7f]/.test(file)) continue;
    try { if (existsSync(file) && statSync(file).isFile() && statSync(file).size > 0) return resolve(file); } catch {}
  }
  throw new Error('Attendance runtime prerequisite is missing: ' + name);
}

/** Durable Windows publisher. The server alone creates generations and fences replacement. */
export function createCalendarWorkerPublisher({stateDir, account, hostId, tenantId, apiUrl, apiKey, fetch: request = globalThis.fetch, now = () => new Date().toISOString()}) {
  if (account !== ATTENDANCE_ACCOUNT || typeof hostId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(hostId) ||
    typeof tenantId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(tenantId) || !apiKey) throw new Error('Explicit bound worker identity and API credential required');
  const api = new URL(apiUrl);
  if (api.username || api.password || api.search || api.hash || (api.protocol !== 'https:' &&
    !(api.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)))) throw new Error('Invalid worker API authority');
  const endpoint = api.href.replace(/\/$/, '') + '/calendar/worker-state';
  const file = join(stateDir, 'calendar-worker.json'), cap = 512 * 1024;
  const authority = createHash('sha256').update(JSON.stringify([endpoint, account, hostId, tenantId, apiKey])).digest('hex');
  const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  const generation = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
  async function call(method, suffix = '', body) {
    const response = await request(endpoint + suffix, {method, headers: {authorization: 'Bearer ' + apiKey, ...(body ? {'content-type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error', signal: AbortSignal.timeout(30000)});
    if (!response.ok || response.headers.get('x-lkb-tenant') !== tenantId || !response.body) {await response.body?.cancel(); throw Object.assign(new Error('Bound worker API refused publication or ownership'), {statusCode: response.status});}
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {for (;;) {const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) throw new Error('Worker response too large'); chunks.push(value);}}
    catch (e) {await reader.cancel().catch(() => {}); throw e;} finally {reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  function read() {
    if (!existsSync(file)) return undefined;
    const stat = lstatSync(file); if (!stat.isFile() || stat.size > cap + 8192) throw new Error('Worker retry state invalid');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.version !== 1 || state.authority !== authority || !generation(state.generation) || !Number.isSafeInteger(state.sequence) || state.sequence < 0 ||
      (state.pending && (state.pending.generation !== state.generation || state.pending.sequence !== state.sequence || state.pending.account !== account || state.pending.hostId !== hostId || Buffer.byteLength(JSON.stringify(state.pending)) > cap)))
      throw new Error('Worker retry state does not match configured owner');
    return state;
  }
  function save(state, lockToken) {
    if (!lockStillOwned(file + '.lock', lockToken)) throw new Error('Worker publication lock lost');
    const temp = file + '.' + randomUUID() + '.tmp';
    try {const fd = openSync(temp, 'wx', 0o600); try {writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd);} finally {closeSync(fd);} renameSync(temp, file);}
    finally {try {unlinkSync(temp);} catch {}}
  }
  async function publishOnce(input) {
    if (!input || typeof input.complete !== 'boolean' || !timestamp(input.checkedAt) || !Array.isArray(input.sourceEvents) || !Array.isArray(input.meetings) || !Array.isArray(input.candidates) ||
      input.sourceEvents.length > 20000 || input.meetings.length > 2000 || input.candidates.length > 500 || (input.complete && (Date.parse(now()) - Date.parse(input.checkedAt) < 0 || Date.parse(now()) - Date.parse(input.checkedAt) >= 600000)))
      throw new Error('Worker scan incomplete, stale or over its coverage budget');
    if (input.gmailSummary !== undefined) {
      const keys = ['listed', 'fetched', 'candidates', 'excludedNonMeeting', 'excludedInternal', 'refusedSender', 'incompleteMessages'];
      const summary = input.gmailSummary;
      if (!summary || typeof summary !== 'object' || Array.isArray(summary) || Object.keys(summary).length !== keys.length + 1 ||
        Object.keys(summary).some(key => ![...keys, 'complete'].includes(key)) || typeof summary.complete !== 'boolean' ||
        keys.some(key => !Number.isSafeInteger(summary[key]) || summary[key] < 0 || summary[key] > 10000)) throw new Error('Invalid Gmail summary');
    }
    const {projectWebinarOperations} = await import('../../apps/api/src/routes/brain.ts');
    const operations = projectWebinarOperations({operations: Object.entries(input.operations ?? {}).map(([id, row]) => ({...row, id})), omitted: 0});
    mkdirSync(stateDir, {recursive: true});
    const lockToken = acquireLock(file + '.lock', {waitMs: 0});
    try {
      let state = read();
      if (!state) {
        const current = await call('GET');
        if (!(current.generation === null || generation(current.generation)) || !Number.isSafeInteger(current.sequence) || current.sequence < 0 ||
          !['fresh', 'stale', 'unavailable'].includes(current.worker?.status) || current.worker.status === 'fresh') throw new Error('Worker generation is active or unavailable for safe recovery');
        const acquired = await call('POST', '/generation', {account, hostId, expectedGeneration: current.generation});
        if (!generation(acquired.generation) || acquired.sequence !== 0) throw new Error('Invalid server worker generation');
        state = {version: 1, authority, generation: acquired.generation, sequence: 0}; save(state, lockToken);
      }
      const sendPending = async () => {
        const pending = state.pending, acknowledgement = await call('PUT', '', pending);
        if (acknowledgement.generation !== pending.generation || acknowledgement.sequence !== pending.sequence || acknowledgement.digest !== digest(pending) ||
          acknowledgement.complete !== pending.complete || !timestamp(acknowledgement.receivedAt)) throw new Error('Worker acknowledgement does not identify the submitted snapshot');
        state = {...state, pending: undefined, lastAck: acknowledgement, lastCheckedAt: pending.checkedAt, lastComplete: pending.complete}; save(state, lockToken);
      };
      if (state.pending) {
        try {await sendPending();} // Lost acknowledgements retry exact bytes and retain the server's original receipt.
        catch (error) {
          if (error.statusCode !== 422 || !state.pending.complete || Date.parse(now()) - Date.parse(state.pending.checkedAt) < 600000) throw error;
          const current = await call('GET');
          // A stale payload that never committed may be abandoned only after reading the same generation's lower fence.
          if (current.generation !== state.generation || !Number.isSafeInteger(current.sequence) || current.sequence >= state.pending.sequence || current.sequence < 0) throw error;
          state = {...state, pending: undefined}; save(state, lockToken);
        }
      }
      if (state.lastCheckedAt === input.checkedAt && state.lastComplete === input.complete) return state.lastAck;
      if (input.complete && state.lastCheckedAt && Date.parse(input.checkedAt) <= Date.parse(state.lastCheckedAt)) throw new Error('Worker scan did not advance');
      const body = {version: 1, account, hostId, generation: state.generation, sequence: state.sequence + 1, checkedAt: input.checkedAt,
        complete: input.complete, sourceEvents: input.complete ? input.sourceEvents : [], meetings: input.complete ? input.meetings : [],
        candidates: input.complete ? input.candidates : [], ...(input.complete && input.gmailSummary ? {gmailSummary: input.gmailSummary} : {}), operations};
      if (!Number.isSafeInteger(body.sequence) || Buffer.byteLength(JSON.stringify(body)) > cap) throw new Error('Worker snapshot exceeds coverage budget');
      state = {...state, sequence: body.sequence, pending: body}; save(state, lockToken);
      await sendPending(); return state.lastAck;
    } finally {releaseLock(file + '.lock', lockToken);}
  }
  let tail = Promise.resolve();
  return {publish(input) {const next = tail.then(() => publishOnce(input)); tail = next.catch(() => {}); return next;}};
}
