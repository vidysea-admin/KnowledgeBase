/**
 * apps/web/src/pages/calendar/OptOutControl.tsx - "record that the bot should not join THIS meeting".
 *
 * Calls the existing join-rules client (`postPending`), which builds the body: `{ eventId }` plus
 * `meetingUrl` only when the meeting has one. The URL is passed exactly as the API returned it
 * (the server derives the meeting identity), goes in the JSON body only, and is never logged or
 * put in a query string. `sessionKey` is not available to the web and is never sent.
 * Wording is truthful about enforcement: see JOIN_RULES_ENFORCED (the scheduler does not apply join rules yet).
 * There is deliberately NO undo here yet (the server route exists; the control is the next unit), and the confirm text says so.
 */
import { useEffect, useRef, useState } from "react";
import { classify, MESSAGES, postPending } from "../join-rules/joinRulesClient.js";
import { JOIN_RULES_ENFORCED, LINK_NOT_NEW_NOTE, UNRECOGNISED_LINK_NOTE, optOutCopy } from "../join-rules/enforcement.js";
import { linkOutcome } from "./optOutOutcome.js";

export interface OptOutControlProps {
  apiKey: string;
  /** The raw `UpcomingMeeting.id` (the calendar event id the join-rules engine matches), not the page's `meeting:` prefixed id. */
  eventId: string;
  /** Shown in the confirm dialog as plain text so the person confirms the right meeting. */
  title?: string;
  meetingUrl?: string;
  optedOut: boolean;
  /** Count of stored `url:` identities seen on the page's GET, or null when unknown. */
  linkCount?: number | null;
  onOptedOut(eventId: string, response?: unknown): void;
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
  const { apiKey, eventId, title, meetingUrl, optedOut, linkCount = null, onOptedOut } = props;
  const copy = optOutCopy(JOIN_RULES_ENFORCED);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inFlight = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const wasConfirming = useRef(false);

  // Return keyboard focus to where the person was once the dialog closes (the button, or the result line after success).
  useEffect(() => {
    if (confirming) { wasConfirming.current = true; return; }
    if (!wasConfirming.current) return;
    wasConfirming.current = false;
    (opener.current ?? done.current)?.focus();
  }, [confirming, optedOut]);

  async function confirm(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await postPending(apiKey, "optout", eventId, meetingUrl ? { meetingUrl } : undefined);
      const outcome = linkOutcome(response, Boolean(meetingUrl), linkCount);
      setNote(outcome === "unrecognised" ? UNRECOGNISED_LINK_NOTE : outcome === "not-new" ? LINK_NOT_NEW_NOTE : null);
      setConfirming(false);
      onOptedOut(eventId, response);
    } catch (e) {
      setError(FAILURE_TEXT[classify(e).failure]);
      setConfirming(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (optedOut) {
    return (
      <div className="row-meta" data-testid="opt-out-done" tabIndex={-1} ref={done} style={{ marginTop: "0.5rem" }}>
        <div>{copy.done}</div>
        {note && <div data-testid="opt-out-link-note">{note}</div>}
      </div>
    );
  }
  return (
    <div data-testid="opt-out-control" style={{ marginTop: "0.5rem" }}>
      {error && <p role="alert" className="error-note" data-testid="opt-out-error">{error}</p>}
      {!confirming && (
        <button type="button" ref={opener} disabled={busy} onClick={() => { setError(null); setConfirming(true); }}>Opt out of this meeting</button>
      )}
      {confirming && (
        <div role="alertdialog" aria-label="Confirm opt-out" className="card" style={{ borderLeft: "4px solid var(--warn)" }}>
          <p><strong>Please confirm.</strong></p>
          {title && <p data-testid="opt-out-title">Meeting: {title}</p>}
          <p>{copy.confirm}</p>
          {meetingUrl && <p data-testid="opt-out-shared-link">{copy.sharedLink}</p>}
          <p>{copy.undo}</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm opt-out</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
