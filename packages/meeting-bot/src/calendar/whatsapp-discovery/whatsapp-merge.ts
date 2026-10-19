/**
 * whatsapp-merge.ts (w27-walinks). Dedup of WhatsApp rows against calendar and Gmail rows, keyed on the canonical meeting id
 * (zoom id or meet code; normalized URL when a provider has no stable id). Calendar and Gmail rows always win.
 */
import type { CalendarEvent } from "../calendar-client.js";
import type { AutoRecordCandidateInput } from "../auto-join.js";
import { canonicalMeetingId, normalizeUrl } from "./whatsapp-link-extractor.js";

const keyOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  const n = normalizeUrl(url);
  return n ? canonicalMeetingId(n) ?? n : undefined;
};

/** Drops WhatsApp rows already covered by a calendar/Gmail row (or by an earlier WhatsApp row for the same meeting). */
export function dedupeWhatsappCandidates<T extends AutoRecordCandidateInput>(wa: readonly T[], calendarEvents: readonly CalendarEvent[],
  candidates: readonly AutoRecordCandidateInput[]): T[] {
  const taken = new Set<string>();
  for (const e of calendarEvents) { const k = keyOf(e.meetingUrl); if (k) taken.add(k); }
  for (const c of candidates) { const k = keyOf(c.meetingUrl); if (k) taken.add(k); }
  const out: T[] = [];
  for (const row of [...wa].sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""))) {
    const k = keyOf(row.meetingUrl);
    if (k && taken.has(k)) continue;
    if (k) taken.add(k);
    out.push(row);
  }
  return out;
}

/** Tick hook body: Gmail candidates + deduped WhatsApp candidates. A loader failure never stops the tick (candidates returned unchanged). */
export async function mergeWhatsappCandidates(load: () => Promise<AutoRecordCandidateInput[]>, calendarEvents: CalendarEvent[],
  candidates: AutoRecordCandidateInput[], log: (msg: string) => void): Promise<AutoRecordCandidateInput[]> {
  try {
    const wa = dedupeWhatsappCandidates(await load(), calendarEvents, candidates);
    if (wa.length > 0) log(`wa-discovery: ${wa.length} WhatsApp candidate(s) (all need owner approval)`);
    return [...candidates, ...wa];
  } catch (err) {
    log(`wa-discovery: loader failed, continuing without it: ${err instanceof Error ? err.message : String(err)}`);
    return candidates;
  }
}
