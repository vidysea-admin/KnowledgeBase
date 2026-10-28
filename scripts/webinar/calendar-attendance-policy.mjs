/** Explicit account attendance; source observations are supplied by the current acquisition. */
import {register} from 'tsx/esm/api';
register();
const {isDirectWebinarJoin, webinarIdentity, webinarSessionKey} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {parseStrictEmail, validateJoinRuleSet} = await import('../../packages/ingest/src/join-policy/join-rules.ts');
export const ATTENDANCE_ACCOUNT = 'umeshsugara@vidysea.com';
const email = value => parseStrictEmail(value)?.email;
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const original = value => value?.dateTime ? {dateTime: stamp(value.dateTime)} : value?.date ? {date: value.date} : undefined;

export function attendanceFingerprint(event) {
  return JSON.stringify([event.id, event.title, event.description, stamp(event.startTime), stamp(event.endTime), event.meetingUrl,
    event.organizer, Boolean(event.cancelled), stamp(event.providerUpdated), event.recurringEventId, original(event.originalStartTime)]);
}
export function attendanceSessionKey(event) {
  const identity = event.meetingUrl && event.startTime && webinarIdentity(event.meetingUrl, event.startTime);
  return webinarSessionKey(identity || `calendar-review|${event.id}`);
}
export function rawAttendanceObservation(raw) {
  const meetingUrl = raw.hangoutLink ?? raw.conferenceData?.entryPoints?.find(row => row.entryPointType === 'video')?.uri;
  const event = {id: raw.id, title: raw.summary ?? '(untitled)', ...(raw.description !== undefined ? {description: raw.description} : {}), startTime: raw.start?.dateTime ?? raw.start?.date ?? '',
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
  else if (rows.length > 1 || rows.some(row => row.self !== true || email(row.email) !== ATTENDANCE_ACCOUNT || !['accepted', 'needsAction'].includes(row.responseStatus))) reason = 'needs-review';
  const organizer = raw.organizer;
  if (organizer !== undefined && (!organizer || typeof organizer !== 'object' || !email(organizer.email) ||
    (organizer.self !== undefined && typeof organizer.self !== 'boolean'))) reason = 'needs-review';
  if (organizer?.self === true && email(organizer.email) !== ATTENDANCE_ACCOUNT) reason = 'needs-review';
  if (!reason && !(rows.length === 1 || (organizer?.self === true && email(organizer.email) === ATTENDANCE_ACCOUNT))) reason = 'needs-review';
  // The fixed account is verified by the acquiring source; attendee domains never establish office scope.
  const domain = parseStrictEmail(event.organizer)?.domain, own = ATTENDANCE_ACCOUNT.split('@')[1];
  if (!reason && domain && (domain === own || domain.endsWith('.' + own))) reason = 'office-internal';
  return {event, fingerprint: attendanceFingerprint(event), approval: reason ?? (rows[0]?.responseStatus === 'needsAction' ? 'unanswered' : 'accepted')};
}

export function selectVerifiedCalendarMeetings(input, observationFor, trustedRuleSet) {
  // Third argument is server-authenticated policy only; input/source ownDomains is never authority.
  const ownDomains = [ATTENDANCE_ACCOUNT.split('@')[1], ...(trustedRuleSet === undefined ? [] : validateJoinRuleSet(trustedRuleSet).ownDomains)];
  const internal = sender => { const domain = parseStrictEmail(sender)?.domain; return domain !== undefined && ownDomains.some(own => domain === own || domain.endsWith('.' + own)); };
  const now = Date.parse(input.now), lead = input.leadMinutes * 60000;
  if (!Number.isFinite(now) || !Number.isFinite(lead) || lead < 0 || lead > 15 * 60000) throw new Error('Invalid attendance timing');
  const scheduled = new Set(input.alreadyScheduled), barriers = new Map(), skipped = [], eligible = [], seen = new Set();
  for (const candidate of input.candidates) {
    const identity = candidate.meetingUrl && candidate.startTime && webinarIdentity(candidate.meetingUrl, candidate.startTime);
    const office = internal(candidate.senderEmail);
    if (identity && (candidate.status === 'rejected' || candidate.cancelled || candidate.registrationOnly || candidate.evidenceIssue !== undefined || office)) barriers.set(identity,
      candidate.status === 'rejected' ? 'rejected' : candidate.cancelled ? 'cancelled' : candidate.registrationOnly ? 'needs-registration' : candidate.evidenceIssue !== undefined ? 'needs-review' : 'office-internal');
    if (office) skipped.push({sessionKey: identity ? webinarSessionKey(identity) : webinarSessionKey('gmail-review|' + candidate.id), source: 'gmail', sourceId: candidate.id, title: candidate.title, reason: 'rule-denied', detail: 'Skipped: office/internal'});
  }
  for (const event of input.calendarEvents) {
    const identity = event.meetingUrl && event.startTime && webinarIdentity(event.meetingUrl, event.startTime);
    const sessionKey = attendanceSessionKey(event);
    const base = {sessionKey, source: 'calendar', sourceId: event.id, title: event.title};
    const observation = observationFor(event);
    let reason = event.cancelled ? 'cancelled' : !observation ? 'needs-review' : observation.approval !== 'accepted' && !(input.attendanceMode === 'all' && observation.approval === 'unanswered') ? (observation.approval === 'unanswered' ? 'needs-review' : observation.approval) : undefined;
    reason ??= internal(event.organizer) ? 'office-internal' : undefined;
    reason ??= identity && barriers.get(identity);
    // T-036: a link read from the invite's free text (any source but absent or "conference") is never attended automatically.
    if (!reason && event.meetingUrlSource !== undefined && event.meetingUrlSource !== 'conference') reason = 'unverified-link-source';
    if (!reason && (!isDirectWebinarJoin(event.meetingUrl, event.startTime) || !identity)) reason = 'unsafe-join-link';
    const start = Date.parse(event.startTime), end = Date.parse(event.endTime);
    if (!reason && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)) reason = 'invalid-time';
    if (!reason && now >= end) reason = 'past';
    if (!reason && (scheduled.has(sessionKey) || seen.has(identity))) reason = 'duplicate-session';
    if (reason) { skipped.push({...base, reason: reason === 'office-internal' ? 'rule-denied' : reason, ...(reason === 'office-internal' ? {detail: 'Skipped: office/internal'} : {})}); continue; }
    if (now < start - lead) continue;
    seen.add(identity); eligible.push({...base, startTime: event.startTime, endTime: event.endTime, meetingUrl: event.meetingUrl, sender: event.organizer, ...(event.description !== undefined ? {description: event.description} : {})});
  }
  eligible.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || Date.parse(b.endTime) - Date.parse(a.endTime));
  // Capacity, priorities and overlaps belong to the actual capture pool.
  return {toSchedule: eligible, skipped};
}
