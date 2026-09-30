/**
 * packages/meeting-bot/src/calendar/calendar-client.ts — T-025 C1. The `CalendarClient` seam —
 * no implementation shipped here. No Google Cloud project / OAuth client exists yet (`.env` has
 * no Calendar credentials); that is a human/ops setup step, not something this file can resolve.
 * A real Google Calendar adapter implements this interface once credentials exist, same
 * "interface first, real vendor wiring later" precedent as T-019's AI providers and T-020's
 * ingestion sources.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime. */
  startTime: string;
  /** ISO datetime. */
  endTime: string;
  /** Absent when the event has no video-call link (nothing to auto-join). */
  meetingUrl?: string;
  organizer?: string;
  cancelled?: boolean;
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  providerUpdated?: string;
}

export interface CalendarClient {
  /** Events starting within the next `windowMinutes` (or already in progress). */
  listUpcomingEvents(windowMinutes: number): Promise<CalendarEvent[]>;
}
