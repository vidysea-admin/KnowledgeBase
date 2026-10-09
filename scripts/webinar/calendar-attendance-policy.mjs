/** Explicit account attendance; source observations are supplied by the current acquisition. */
import {register} from 'tsx/esm/api';
register();
const {isDirectWebinarJoin, webinarIdentity, webinarSessionKey} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
export const ATTENDANCE_ACCOUNT = 'umeshsugara@vidysea.com';
const email = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value) ? value.toLowerCase() : undefined;
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const original = value => value?.dateTime ? {dateTime: stamp(value.dateTime)} : value?.date ? {date: value.date} : undefined;

export function attendanceFingerprint(event) {
  return JSON.stringify([event.id, event.title, stamp(event.startTime), stamp(event.endTime), event.meetingUrl,
    event.organizer, Boolean(event.cancelled), stamp(event.providerUpdated), event.recurringEventId, original(event.originalStartTime)]);
}
export function attendanceSessionKey(event) {
  const identity = event.meetingUrl && event.startTime && webinarIdentity(event.meetingUrl, event.startTime);
  return webinarSessionKey(identity || `calendar-review|${event.id}`);
}
export function rawAttendanceObservation(raw) {
  const meetingUrl = raw.hangoutLink ?? raw.conferenceData?.entryPoints?.find(row => row.entryPointType === 'video')?.uri;
  const event = {id: raw.id, title: raw.summary ?? '(untitled)', startTime: raw.start?.dateTime ?? raw.start?.date ?? '',
    endTime: raw.end?.dateTime ?? raw.end?.date ?? '', meetingUrl, organizer: raw.organizer?.email,
    cancelled: raw.status === 'cancelled', providerUpdated: raw.updated, recurringEventId: raw.recurringEventId,
    originalStartTime: raw.originalStartTime};
  let reason;
  if (raw.status === 'cancelled') reason = 'cancelled';
  else if (raw.status !== 'confirmed' || (raw.attendeesOmitted !== undefined && raw.attendeesOmitted !== false)) reason = 'needs-review';
  const attendees = raw.attendees ?? [];
  if (!Array.isArray(attendees) || attendees.length > 20000 || attendees.some(row => !row || typeof row !== 'object' ||
    !email(row.email) || (row.self !== undefined && typeof row.self !== 'boolean') ||
    !['accepted', 'declined', 'tentative', 'needsAction'].includes(row.responseStatus))) reason = 'needs-review';
  const rows = Array.isArray(attendees) ? attendees.filter(row => row && (row.self === true || email(row.email) === ATTENDANCE_ACCOUNT)) : [];
  if (rows.some(row => row.responseStatus === 'declined')) reason = 'rejected';
  else if (rows.length > 1 || rows.some(row => row.self !== true || email(row.email) !== ATTENDANCE_ACCOUNT || row.responseStatus !== 'accepted')) reason = 'needs-review';
  const organizer = raw.organizer;
  if (organizer !== undefined && (!organizer || typeof organizer !== 'object' || !email(organizer.email) ||
    (organizer.self !== undefined && typeof organizer.self !== 'boolean'))) reason = 'needs-review';
  if (organizer?.self === true && email(organizer.email) !== ATTENDANCE_ACCOUNT) reason = 'needs-review';
  if (!reason && !(rows.length === 1 || (organizer?.self === true && email(organizer.email) === ATTENDANCE_ACCOUNT))) reason = 'needs-review';
  return {event, fingerprint: attendanceFingerprint(event), approval: reason ?? 'accepted'};
}

export function selectVerifiedCalendarMeetings(input, observationFor) {
  const now = Date.parse(input.now), lead = input.leadMinutes * 60000;
  if (!Number.isFinite(now) || !Number.isFinite(lead) || lead < 0 || lead > 15 * 60000) throw new Error('Invalid attendance timing');
  const scheduled = new Set(input.alreadyScheduled), barriers = new Map(), skipped = [], eligible = [], seen = new Set();
  for (const candidate of input.candidates) {
    const identity = candidate.meetingUrl && candidate.startTime && webinarIdentity(candidate.meetingUrl, candidate.startTime);
    if (identity && (candidate.status === 'rejected' || candidate.cancelled || candidate.registrationOnly)) barriers.set(identity,
      candidate.status === 'rejected' ? 'rejected' : candidate.cancelled ? 'cancelled' : 'needs-registration');
  }
  for (const event of input.calendarEvents) {
    const identity = event.meetingUrl && event.startTime && webinarIdentity(event.meetingUrl, event.startTime);
    const sessionKey = attendanceSessionKey(event);
    const base = {sessionKey, source: 'calendar', sourceId: event.id, title: event.title};
    const observation = observationFor(event);
    let reason = event.cancelled ? 'cancelled' : !observation ? 'needs-review' : observation.approval !== 'accepted' ? observation.approval : undefined;
    reason ??= identity && barriers.get(identity);
    if (!reason && (!isDirectWebinarJoin(event.meetingUrl, event.startTime) || !identity)) reason = 'unsafe-join-link';
    const start = Date.parse(event.startTime), end = Date.parse(event.endTime);
    if (!reason && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)) reason = 'invalid-time';
    if (!reason && now >= end) reason = 'past';
    if (!reason && (scheduled.has(sessionKey) || seen.has(identity))) reason = 'duplicate-session';
    if (reason) { skipped.push({...base, reason}); continue; }
    if (now < start - lead) continue;
    seen.add(identity); eligible.push({...base, startTime: event.startTime, endTime: event.endTime, meetingUrl: event.meetingUrl, sender: event.organizer});
  }
  eligible.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || Date.parse(b.endTime) - Date.parse(a.endTime));
  const toSchedule = []; let occupiedUntil = -Infinity;
  for (const item of eligible) {
    if (Date.parse(item.startTime) < occupiedUntil) {
      skipped.push({sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title, reason: 'overlap-lost'});
      occupiedUntil = Math.max(occupiedUntil, Date.parse(item.endTime));
    } else { toSchedule.push(item); occupiedUntil = Date.parse(item.endTime); }
  }
  return {toSchedule, skipped};
}
