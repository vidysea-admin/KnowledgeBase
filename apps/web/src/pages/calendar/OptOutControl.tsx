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
import { getJoinRules, looksStored, putRuleSet, type LoadedRules, classify, MESSAGES, postPending } from "../join-rules/joinRulesClient.js";
import { JOIN_RULES_ENFORCED, LINK_NOT_NEW_NOTE, UNRECOGNISED_LINK_NOTE, optOutCopy } from "../join-rules/enforcement.js";
import { ApiError } from "../../api/client.js";
import type { MeetingCandidate } from "../../api/types.js";
import { normalizeDomain, normalizeEmail, validateRuleSetClient, type Rule } from "../join-rules/joinRulesModel.js";
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

/** A deliberately selected, reusable deny class; server CAS keeps live opt-outs and approvals. */
export function GmailPatternControl({apiKey,candidate,onSaved}: {apiKey:string;candidate:Pick<MeetingCandidate,"senderEmail"|"senderDomain"|"subject">;onSaved:()=>void|Promise<void>}): React.ReactElement {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState<LoadedRules|null>(null);
  const [kind,setKind]=useState<"sender"|"domain"|"title">("sender"),[phrase,setPhrase]=useState(candidate.subject.slice(0,180)),[subdomains,setSubdomains]=useState(false);
  const [error,setError]=useState<string|null>(null),[note,setNote]=useState<string|null>(null);
  const identity=JSON.stringify([apiKey,candidate.senderEmail,candidate.senderDomain,candidate.subject]), current=useRef(identity),inFlight=useRef(false);
  current.current=identity;
  useEffect(()=>{setOpen(false);setLoaded(null);setError(null);setNote(null);setBusy(false);inFlight.current=false;setKind("sender");setSubdomains(false);setPhrase(candidate.subject.slice(0,180));return()=>{current.current="";};},[identity]);
  const sender=normalizeEmail(candidate.senderEmail),domain=normalizeDomain(candidate.senderDomain);
  const value=kind === "sender"?sender:kind === "domain"?domain:phrase.trim().replace(/\s+/g," ");
  const valid=Boolean(value && value.length<=(kind === "title"?180:kind === "domain"?253:320) && !/[\u0000-\u001f]/.test(value));
  const versionOK=Boolean(loaded && (loaded.etag ? /^"[^"\r\n]+"$/.test(loaded.etag) : !looksStored(loaded.view)));
  async function load():Promise<void>{
    if(inFlight.current)return; const request=identity;inFlight.current=true;setOpen(true);setBusy(true);setError(null);setLoaded(null);
    try{const result=await getJoinRules(apiKey);if(current.current!==request)return;setLoaded(result);if(result.etag ? !/^"[^"\r\n]+"$/.test(result.etag) : looksStored(result.view))setError(MESSAGES.noEtag);}
    catch(e){if(current.current===request)setError(e instanceof ApiError && e.status===403?MESSAGES.readForbidden:MESSAGES.loadFailed);}
    finally{if(current.current===request){inFlight.current=false;setBusy(false);}}
  }
  async function save():Promise<void>{
    if(inFlight.current || !loaded || !versionOK || !valid)return;const request=identity;inFlight.current=true;setBusy(true);setError(null);
    try{
      const match:Rule["match"]=kind === "sender"?{email:value!}:kind === "domain"?{domain:value!,subdomains}:{titleIncludes:[value!]};
      const ids=new Set(loaded.view.ruleSet.rules.map(r=>r.id));let n=1;while(ids.has("gmail-skip-"+n))n++;
      const ruleSet={...loaded.view.ruleSet,rules:[...loaded.view.ruleSet.rules,{id:"gmail-skip-"+n,effect:"deny" as const,match}]};
      if(validateRuleSetClient(ruleSet).length){setError("Choose a valid bounded sender, domain or literal title phrase.");return;}
      await putRuleSet(apiKey,ruleSet,loaded.etag);if(current.current!==request)return;setOpen(false);setNote("Skip rule saved for current and future matching invitations.");
      try{await onSaved();}catch{if(current.current===request)setError("Rule saved. The invitation list could not refresh; reload it to see the matches.");}
    }catch(e){if(current.current===request){const status=e instanceof ApiError?e.status:0;setError(status===412?MESSAGES.stale:status===428?MESSAGES.preconditionRequired:status===403?MESSAGES.readOnly:status===401?MESSAGES.unauthorized:status===503?MESSAGES.unavailable:MESSAGES.writeFailed);}}
    finally{if(current.current===request){inFlight.current=false;setBusy(false);}}
  }
  return <div data-testid="gmail-pattern-control">
    {!open && <button type="button" disabled={busy} onClick={()=>void load()}>Ignore similar</button>}
    {note && <p role="status">{note}</p>}{error && <p role="alert">{error}</p>}
    {open && <div role="alertdialog" aria-label="Ignore similar invitations" className="card">
      <label>Skip invitations matching <select aria-label="Skip invitations matching" value={kind} disabled={busy} onChange={e=>setKind(e.target.value as typeof kind)}><option value="sender">This sender</option><option value="domain">This domain</option><option value="title">A literal title phrase</option></select></label>
      {kind === "domain" && <label><input type="checkbox" checked={subdomains} disabled={busy} onChange={e=>setSubdomains(e.target.checked)}/>Include true subdomains</label>}
      {kind === "title" && <label>Literal title phrase <input aria-label="Literal title phrase" maxLength={180} value={phrase} disabled={busy} onChange={e=>setPhrase(e.target.value)}/></label>}
      <p>{kind === "sender"?"Sender "+(value??"invalid sender"):kind === "domain"?(subdomains?"Domain and true subdomains ":"Exact domain ")+(value??"invalid domain"):"Literal title phrase “"+value+"” (case-insensitive, not a regular expression)"} — skip current and future matching invitations. This affects a class of invitations; unrelated rules stay in place.</p>
      <button type="button" disabled={busy || !valid || !versionOK} onClick={()=>void save()}>Save skip rule</button>
      <button type="button" disabled={busy} onClick={()=>{setOpen(false);setError(null);}}>Cancel</button>
      {!busy && <button type="button" onClick={()=>void load()}>Reload latest rules</button>}
    </div>}
  </div>;
}
