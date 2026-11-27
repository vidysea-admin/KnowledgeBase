/** Explicit account attendance; source observations are supplied by the current acquisition. */
import {register} from 'tsx/esm/api';
register();
const {isDirectWebinarJoin, webinarIdentity, webinarSessionKey} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
const {parseStrictEmail, validateJoinRuleSet} = await import('../../packages/ingest/src/join-policy/join-rules.ts');
export const ATTENDANCE_ACCOUNT = 'umeshsugara@vidysea.com';
const email = value => parseStrictEmail(value)?.email;
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const original = value => value?.dateTime ? {dateTime: stamp(value.dateTime)} : value?.date ? {date: value.date} : undefined;

/** D-261: one meeting, whatever the link text: Meet code, Zoom number (any subdomain, /j or /w), Teams meetup path. */
export const MAIL_SAME_MEETING_MS = 3 * 3600000;
export function meetingKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return undefined;
    const meet = u.hostname === 'meet.google.com' && /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/.exec(u.pathname);
    if (meet) return 'meet:' + meet[1];
    const zoom = (u.hostname === 'zoom.us' || u.hostname.endsWith('.zoom.us')) && /^\/(?:j|w)\/(\d+)\/?$/.exec(u.pathname);
    if (zoom) return 'zoom:' + zoom[1];
    if (u.hostname === 'teams.microsoft.com' && u.pathname.startsWith('/l/meetup-join/')) return 'teams:' + decodeURIComponent(u.pathname).toLowerCase().replace(/\/+$/, '');
  } catch { /* not a URL */ }
  return undefined;
}
/** A mail session uses the reconciler's key for that mail row, so state rows and stop transitions line up. */
export function mailSessionKey(url, startTime) {
  const identity = meetingKey(url) && stamp(startTime) && webinarIdentity(url, startTime);
  return identity ? webinarSessionKey(identity) : undefined;
}
/** Longest meeting a mail link may hold a capture slot for (mail text can claim 12:01 AM - 11:59 PM). */
export const MAIL_MAX_MS = 8 * 3600000;
/** The one mail that stands for its meeting: the oldest received, then the smallest id, so it is stable across ticks. */
export const mailOrder = (a, b) => String(a.receivedAt ?? '').localeCompare(String(b.receivedAt ?? '')) || String(a.id).localeCompare(String(b.id));

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
  // D-261: a mail session already running for this meeting keeps it; the calendar item is a duplicate, not a second capture.
  const mailRunning = input.attendanceMode === 'all' ? input.candidates.filter(row => row.meetingUrl && scheduled.has(mailSessionKey(row.meetingUrl, row.startTime)))
    .map(row => ({key: meetingKey(row.meetingUrl), start: Date.parse(row.startTime)})) : [];
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
    if (!reason && mailRunning.some(row => row.key === meetingKey(event.meetingUrl) && Math.abs(row.start - start) <= MAIL_SAME_MEETING_MS)) reason = 'duplicate-session';
    if (reason) { skipped.push({...base, reason: reason === 'office-internal' ? 'rule-denied' : reason, ...(reason === 'office-internal' ? {detail: 'Skipped: office/internal'} : {})}); continue; }
    if (now < start - lead) continue;
    seen.add(identity); eligible.push({...base, startTime: event.startTime, endTime: event.endTime, meetingUrl: event.meetingUrl, sender: event.organizer, ...(event.description !== undefined ? {description: event.description} : {})});
  }
  // D-261: in attendance mode 'all', a direct join link that arrived by mail to the bot mailbox is attended too
  // (this replaces T-036's "free text is never attended" for mail only). The sender must be authenticated (SPF/DKIM)
  // and the link must be a direct join (Meet code, Zoom /j or /w, Teams meetup-join). Mails are matched to the calendar
  // and to each other by the MEETING (Meet code, Zoom number, Teams path) within MAIL_SAME_MEETING_MS, never by link
  // text: when the calendar holds the meeting, the calendar decides (a declined invite is never overridden by its mail),
  // and one meeting is scheduled once. Refused mails are not listed as skips: in attendance mode every skip becomes an
  // operation row and an alert, and most mail is not a meeting (the daily mail report is unit U6).
  if (input.attendanceMode === 'all') {
    const near = (a, b) => a.key === b.key && Math.abs(a.start - b.start) <= MAIL_SAME_MEETING_MS;
    const at = (url, startTime) => ({key: meetingKey(url), start: Date.parse(startTime)});
    const calendarMeetings = input.calendarEvents.map(event => at(event.meetingUrl, event.startTime)).filter(row => row.key && Number.isFinite(row.start));
    const blocked = input.candidates.filter(row => row.status === 'rejected' || row.cancelled || row.registrationOnly || row.evidenceIssue !== undefined || internal(row.senderEmail))
      .map(row => at(row.meetingUrl, row.startTime)).filter(row => row.key && Number.isFinite(row.start));
    const taken = eligible.map(row => at(row.meetingUrl, row.startTime)).filter(row => row.key);
    for (const candidate of [...input.candidates].sort(mailOrder)) {
      const meeting = at(candidate.meetingUrl, candidate.startTime), start = meeting.start, end = Date.parse(candidate.endTime);
      if (!meeting.key || !Number.isFinite(start) || !Number.isFinite(end) || !stamp(candidate.startTime) || !stamp(candidate.endTime) || end <= start || end - start > MAIL_MAX_MS || now >= end) continue;
      if (candidate.status === 'rejected' || candidate.cancelled || candidate.registrationOnly || candidate.evidenceIssue !== undefined) continue;
      if (internal(candidate.senderEmail) || candidate.senderAuthenticated !== true || !isDirectWebinarJoin(candidate.meetingUrl, candidate.startTime)) continue;
      if (mailRunning.some(row => near(row, meeting)) || calendarMeetings.some(row => near(row, meeting)) || blocked.some(row => near(row, meeting)) || taken.some(row => near(row, meeting))) continue;
      const sessionKey = mailSessionKey(candidate.meetingUrl, candidate.startTime);
      if (!sessionKey || scheduled.has(sessionKey) || now < start - lead) continue;
      taken.push(meeting);
      eligible.push({sessionKey, source: 'gmail', sourceId: candidate.id, title: candidate.title, startTime: candidate.startTime, endTime: candidate.endTime, meetingUrl: candidate.meetingUrl, sender: candidate.senderEmail});
    }
  }
  eligible.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || Date.parse(b.endTime) - Date.parse(a.endTime));
  // Capacity, priorities and overlaps belong to the actual capture pool.
  return {toSchedule: eligible, skipped};
}
