/** Fresh provider account/attendance proof around the existing native Calendar transport. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {join, resolve, isAbsolute} from 'node:path';
import {ATTENDANCE_ACCOUNT, attendanceFingerprint, attendanceSessionKey, rawAttendanceObservation, selectVerifiedCalendarMeetings} from './calendar-attendance-policy.mjs';
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
  let observations = new Map(), generationValid = false;
  const clear = () => { observations = new Map(); generationValid = false; };
  const verifyAccount = async () => {
    try {
      const value = parse(await run(['calendar', 'calendars', 'get', '--params', JSON.stringify({calendarId: 'primary'}), '--format', 'json']));
      if (value.kind !== 'calendar#calendar' || value.id !== account) throw new Error('Connected Calendar account mismatch or missing provider proof');
    } catch { clear(); throw new Error('Connected Calendar account mismatch or missing provider proof'); }
  };
  async function load(syncToken, requestStartedAt = new Date(now()).toISOString()) {
    clear(); const observed = [];
    try {
      await verifyAccount();
      const result = await acquire(14, async args => {
        const output = await run(args), value = parse(output);
        if (args[0] !== 'calendar' || args[1] !== 'events') throw new Error('Unexpected attendance acquisition command');
        if (args[2] === 'list') { if (value.items !== undefined && !Array.isArray(value.items)) throw new Error('Invalid Calendar observations'); observed.push(...(value.items ?? [])); }
        else if (args[2] === 'get') observed.push(value);
        else throw new Error('Unexpected attendance acquisition command');
        return output;
      }, undefined, {syncToken});
      await verifyAccount();
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
    select: input => { if (!generationValid) throw new Error('Current attendance acquisition proof is required'); return selectVerifiedCalendarMeetings(input, observationFor); },
    assertAcquisition: loaded => { if (!generationValid || loaded.failed || (loaded.calendarAcquisition && loaded.calendarAcquisition.tenantId !== tenantId)) throw new Error('Attendance acquisition owner proof is required before writes'); },
    activeStopReason: (id, prepared) => {
      const event = prepared.calendarEvents.find(row => attendanceSessionKey(row) === id), observation = event && observationFor(event);
      return observation && observation.approval !== 'accepted' ? 'cancelled' : undefined;
    },
  };
}

export async function configureCalendarAttendance(deps, account, dependencies = {}) {
  const {runGws, listUpcomingGwsMeetings} = dependencies.transport ?? await import('../../apps/api/src/gws-calendar.ts');
  const {validateWebinarCalendarAcquisition} = dependencies.state ?? await import('../../packages/meeting-bot/src/calendar/schedule-state.ts');
  const binary = deps.env.LKB_GWS_PATH ?? join(deps.root, '.cache/tools/gws-0.22.5/gws.exe');
  if (!isAbsolute(binary)) throw new Error('Attendance GWS executable must be an absolute path');
  const nativeRun = args => runGws(args, (_file, nativeArgs, options, callback) => execFile(binary,
    process.platform === 'win32' ? nativeArgs.slice(2) : nativeArgs, {...options, windowsHide: true}, callback));
  const source = createCalendarAttendanceSource({account, tenantId: deps.env.LKB_TENANT_ID, run: nativeRun,
    acquire: listUpcomingGwsMeetings, validateAcquisition: validateWebinarCalendarAcquisition, now: deps.now});
  source.checkReady = (configured, gate) => checkCalendarAttendanceReady(configured, gate, dependencies.probe);
  return {...deps, calendarAttendance: source,
    loadCalendarEvents: async () => (await source.load()).meetings,
    loadCalendarAcquisition: source.load,
    loadCandidates: async () => [],
    notifyOperation: async () => 'disabled',
  };
}

export async function checkCalendarAttendanceReady(deps, validateRunGate, probe = async (file, env) => {
  const binary = env.LKB_FFPROBE ?? join(deps.root, '.cache/tools/ffmpeg-9.0.2/bin/ffprobe.exe');
  if (!isAbsolute(binary)) throw new Error('Attendance media executable must be an absolute path');
  const {stdout} = await execute(binary, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true});
  return JSON.parse(stdout);
}) {
  deps.calendarAttendance.assertOwner(deps.env.LKB_TENANT_ID);
  validateRunGate(deps.root, deps.env);
  await deps.validateTenant(); await deps.calendarAttendance.verifyAccount();
  const proof = JSON.parse(readFileSync(join(deps.root, 'data/webinar-release/live-proof.json'), 'utf8'));
  const media = await probe(resolve(deps.root, proof.recording), deps.env);
  if (!Array.isArray(media?.streams) || !media.streams.some(row => row.codec_type === 'audio' && row.channels > 0) ||
    !media.streams.some(row => row.codec_type === 'video' && row.width > 0 && row.height > 0) || !(Number(media.format?.duration) > 0)) throw new Error('Attendance proof media lacks verifiable audio/video streams');
}
