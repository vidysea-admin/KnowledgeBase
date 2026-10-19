/** Live-time window extraction for Google Cloud event mails: prefers a matching calendar event, else parses the mail text. */
import type { CalendarEvent } from "../calendar-client.js";
import { canonicalOnairEvent } from "./onair-link-resolver.js";

export interface OnairWindow { startTime: string; endTime: string }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Fixed offsets in minutes; PT/ET/CT/MT follow US daylight saving by date. */
const FIXED: Record<string, number> = { PST: -480, PDT: -420, MST: -420, MDT: -360, CST: -360, CDT: -300, EST: -300, EDT: -240,
  UTC: 0, GMT: 0, IST: 330, CET: 60, CEST: 120, BST: 60 };
const US_ZONE: Record<string, [number, number]> = { PT: [-480, -420], MT: [-420, -360], CT: [-360, -300], ET: [-300, -240] };

function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}
function usDst(y: number, m: number, d: number): boolean {
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2)), end = Date.UTC(y, 10, nthSunday(y, 10, 1)), day = Date.UTC(y, m, d);
  return day >= start && day < end;
}
export function zoneOffsetMinutes(zone: string, y: number, m: number, d: number): number | undefined {
  const z = zone.toUpperCase();
  if (z in FIXED) return FIXED[z];
  const us = US_ZONE[z];
  return us ? us[usDst(y, m, d) ? 1 : 0] : undefined;
}
function hour24(h: number, mer: string): number | undefined {
  if (h < 1 || h > 12) return undefined;
  const pm = mer.toLowerCase() === "p";
  return (h % 12) + (pm ? 12 : 0);
}

const WINDOW = new RegExp(
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?" +
  "[^\\d]{1,25}?(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?" +
  "(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?)?" +
  "\\s*\\(?([A-Za-z]{2,4})\\)?", "i");

/** Parses the first "<Month> <day>[, year] ... <h[:mm]> AM[ - <h[:mm]> PM] <ZONE>" in the text. A missing or unknown zone yields nothing. */
export function parseMailWindow(text: string, mailDate: string): OnairWindow | undefined {
  const m = WINDOW.exec(text);
  const ref = Date.parse(mailDate);
  if (!m || !Number.isFinite(ref)) return undefined;
  const mon = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()), day = Number(m[2]);
  let year = m[3] ? Number(m[3]) : new Date(ref).getUTCFullYear();
  const startH = hour24(Number(m[4]), m[6]!);
  if (mon < 0 || startH === undefined || day < 1 || day > 31) return undefined;
  const at = (y: number, h: number, min: number) => {
    const off = zoneOffsetMinutes(m[10]!, y, mon, day);
    return off === undefined ? undefined : Date.UTC(y, mon, day, h, min) - off * 60000;
  };
  let start = at(year, startH, Number(m[5] ?? 0));
  if (start === undefined) return undefined;
  if (!m[3] && start < ref - 2 * 86400000) { year += 1; start = at(year, startH, Number(m[5] ?? 0)); }
  if (start === undefined) return undefined;
  let end = start + 60 * 60000; // no end in the mail: assume one hour
  if (m[7] && m[9]) {
    const endH = hour24(Number(m[7]), m[9]);
    const e = endH === undefined ? undefined : at(year, endH, Number(m[8] ?? 0));
    if (e !== undefined && e > start && e - start <= 12 * 3600000) end = e;
  }
  return { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
}

/** A non-cancelled calendar event whose meeting URL is this OnAir event wins over mail text. */
export function calendarWindow(slug: string, events: CalendarEvent[] | undefined): (OnairWindow & { title: string }) | undefined {
  for (const e of events ?? []) {
    if (e.cancelled || !e.meetingUrl || canonicalOnairEvent(e.meetingUrl)?.slug !== slug) continue;
    if (Number.isFinite(Date.parse(e.startTime)) && Number.isFinite(Date.parse(e.endTime)))
      return { startTime: new Date(e.startTime).toISOString(), endTime: new Date(e.endTime).toISOString(), title: e.title };
  }
  return undefined;
}
