import { useAuth } from "../auth/AuthContext.js";
import { listWebinarOperations, listSessions } from "../api/sessions.js";
import { listUpcomingMeetings } from "../api/calendar.js";
import { useLoad } from "./meeting-bot/useLoad.js";
import { UpcomingSection } from "./meeting-bot/UpcomingSection.js";
import { PastSection } from "./meeting-bot/PastSection.js";
import { OperationsSections } from "./meeting-bot/OperationsSections.js";
import { DiscoveryStatus } from "./meeting-bot/DiscoveryStatus.js";
import { SendNowForm } from "./meeting-bot/SendNowForm.js";

/**
 * /meeting-bot: upcoming calendar meetings, live/in-progress operations, operations history and past recordings.
 * Three requests per load, one per endpoint (calendar/upcoming, webinar-operations [polled], sessions); each section has its own
 * loading/error/retry state so one failing endpoint never blanks the others. Wording is descriptive only: this page does not
 * evaluate bot mode, trust, join rules or overlap, so it never promises that a listed meeting will be joined.
 */
export function MeetingBotPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const ops = useLoad(apiKey, listWebinarOperations, 10000);
  const upcoming = useLoad(apiKey, listUpcomingMeetings);
  const sessions = useLoad(apiKey, listSessions);
  return <>
    <div className="page-header"><h1>Meeting bot</h1>
      <p>Upcoming meetings, capture in progress, webinar operations and past recordings.</p></div>
    <SendNowForm apiKey={apiKey} />
    <UpcomingSection state={upcoming} />
    <DiscoveryStatus state={ops} />
    <OperationsSections state={ops} />
    <PastSection state={sessions} />
    <div className="card"><p>Portable audio/video capture is undergoing local validation. Unattended recording requires a verified real webinar on this machine. Windows OBS remains the fallback; Ubuntu support requires independent capture and restart proof.</p></div>
  </>;
}
