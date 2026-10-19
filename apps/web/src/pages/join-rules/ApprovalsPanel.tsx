import { useState } from "react";
import { checkMeetingUrl, checkPendingValue, confirmationText, type Pending, type PendingKind, type RuleState } from "./joinRulesModel.js";

interface Props { state: RuleState; disabled: boolean; busy: boolean; onConfirm: (p: Pending) => void }

function List({ title, items, empty }: { title: string; items: readonly string[]; empty: string }) {
  return <section aria-label={title}>
    <h3 className="section-title">{title}</h3>
    {items.length === 0 ? <p className="empty-note">{empty}</p> : <ul>{items.map(v => <li key={v}>{v}</li>)}</ul>}
  </section>;
}

/** Current approvals / opt-outs plus the three add forms. Nothing is sent until the inline confirmation is accepted. */
export function ApprovalsPanel({ state, disabled, busy, onConfirm }: Props): React.ReactElement {
  const [inputs, setInputs] = useState<Record<PendingKind, string>>({ sender: "", domain: "", optout: "" });
  const [meetingUrl, setMeetingUrl] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = (kind: PendingKind) => {
    const r = checkPendingValue(kind, inputs[kind]);
    if ("error" in r) { setError(r.error); setPending(null); return; }
    const link = kind === "optout" ? checkMeetingUrl(meetingUrl) : {};
    if ("error" in link) { setError(link.error); setPending(null); return; }
    setError(null); setUnderstood(false); setPending({ kind, value: r.value, ...(link.url ? { hints: { meetingUrl: link.url } } : {}) });
  };
  const adder = (kind: PendingKind, label: string, placeholder: string, button: string) => <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
    <label style={{ flex: "1 1 14rem" }}>{label}
      <input aria-label={label} style={{ width: "100%" }} disabled={disabled} value={inputs[kind]} placeholder={placeholder} onChange={e => setInputs({ ...inputs, [kind]: e.target.value })} />
    </label>
    <button type="button" disabled={disabled || busy} onClick={() => ask(kind)} style={{ alignSelf: "flex-end" }}>{button}</button>
  </div>;
  const domain = pending?.kind === "domain";
  return <>
    <List title="Approved senders" items={state.approvedSenders} empty="No sender is approved." />
    <List title="Approved domains" items={state.approvedDomains} empty="No domain is approved." />
    <List title="Opted-out events" items={state.optedOutEventIds} empty="No event is opted out." />
    <h3 className="section-title">Add</h3>
    {adder("sender", "Sender to approve", "speaker@example.com", "Approve sender…")}
    {adder("domain", "Domain to approve", "example.com", "Approve domain…")}
    <label style={{ display: "block", marginBottom: "0.4rem" }}>Meeting link for the opt-out (optional)
      <input aria-label="Meeting link for the opt-out (optional)" style={{ width: "100%" }} disabled={disabled} value={meetingUrl} placeholder="https://meet.example.com/abc" onChange={e => setMeetingUrl(e.target.value)} />
    </label>
    {adder("optout", "Event id to opt out of", "calendar event id", "Opt out of event…")}
    {error && <p role="alert" className="error-note">{error}</p>}
    {pending && <div role="alertdialog" aria-label="Confirm change" className="card" style={{ borderLeft: `4px solid ${domain ? "var(--bad)" : "var(--warn)"}` }}>
      <p><strong>{domain ? "Warning: this trusts a whole domain." : "Please confirm."}</strong></p>
      <p style={domain ? { color: "var(--bad)" } : undefined}>{confirmationText(pending)}</p>
      {domain && <label><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} /> I understand that everyone at {pending.value} will be trusted.</label>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="button" disabled={busy || (domain && !understood)} onClick={() => { onConfirm(pending); setPending(null); }}>
          {pending.kind === "optout" ? "Confirm opt-out" : "Confirm approval"}
        </button>
        <button type="button" onClick={() => setPending(null)}>Cancel</button>
      </div>
    </div>}
  </>;
}
