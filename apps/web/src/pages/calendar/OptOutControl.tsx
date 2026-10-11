/**
 * apps/web/src/pages/calendar/OptOutControl.tsx - "do not send the bot to THIS meeting".
 *
 * Calls the existing join-rules client (`postPending`), which builds the body: `{ eventId }` plus
 * `meetingUrl` only when the meeting has one. The URL is passed exactly as the API returned it
 * (the server derives the meeting identity), goes in the JSON body only, and is never logged or
 * put in a query string. `sessionKey` is not available to the web and is never sent.
 * There is deliberately NO undo here: the route for it is not merged yet, and the confirm text says so.
 */
import { useRef, useState } from "react";
import { classify, MESSAGES, postPending } from "../join-rules/joinRulesClient.js";

export interface OptOutControlProps {
  apiKey: string;
  /** The raw `UpcomingMeeting.id` (the calendar event id the join-rules engine matches), not the page's `meeting:` prefixed id. */
  eventId: string;
  meetingUrl?: string;
  optedOut: boolean;
  onOptedOut(eventId: string): void;
}

export const FORBIDDEN_TEXT = "This API key lacks the join-rules write scope, so it cannot opt out of meetings. Ask the key's owner for a key with that scope.";
const FAILURE_TEXT = {
  unauthorized: MESSAGES.unauthorized,
  forbidden: FORBIDDEN_TEXT,
  "bad-request": "The server rejected this opt-out as invalid. Nothing was changed.",
  unavailable: MESSAGES.unavailable,
  busy: "Join rules are busy, try again in a few seconds.",
  failed: "The opt-out could not be saved. Nothing was changed; you can try again.",
} as const;

export function OptOutControl(props: OptOutControlProps): React.ReactElement {
  const { apiKey, eventId, meetingUrl, optedOut, onOptedOut } = props;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirm(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await postPending(apiKey, "optout", eventId, meetingUrl ? { meetingUrl } : undefined);
      setConfirming(false);
      onOptedOut(eventId);
    } catch (e) {
      setError(FAILURE_TEXT[classify(e).failure]);
      setConfirming(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (optedOut) {
    return <div className="row-meta" data-testid="opt-out-done" style={{ marginTop: "0.5rem" }}>Opted out: the bot will not join this meeting.</div>;
  }
  return (
    <div data-testid="opt-out-control" style={{ marginTop: "0.5rem" }}>
      {error && <p role="alert" className="error-note" data-testid="opt-out-error">{error}</p>}
      {!confirming && (
        <button type="button" disabled={busy} onClick={() => { setError(null); setConfirming(true); }}>Opt out of this meeting</button>
      )}
      {confirming && (
        <div role="alertdialog" aria-label="Confirm opt-out" className="card" style={{ borderLeft: "4px solid var(--warn)" }}>
          <p><strong>Please confirm.</strong></p>
          <p>
            The bot will not join this meeting, even if a rule or an approval would otherwise allow it.
            Undoing an opt-out is not available in this page yet.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm opt-out</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
