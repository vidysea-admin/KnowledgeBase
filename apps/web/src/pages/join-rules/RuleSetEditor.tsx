import { useState } from "react";
import { evaluateJoinRules, EMPTY_JOIN_RULE_STATE } from "../../../../../packages/ingest/src/join-policy/join-rules.js";
import { JOIN_RULES_ENFORCED, pageCopy } from "./enforcement.js";
import { PLATFORMS, type DraftSet, type RuleDraft, type RuleState, ruleSetFromDraft } from "./joinRulesModel.js";

const row: React.CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.4rem" };
const field: React.CSSProperties = { flex: "1 1 12rem", minWidth: 0 };

interface Props { state?: RuleState; draft: DraftSet; disabled: boolean; onChange: (next: DraftSet) => void; onAdd: () => void }

/** Form mirroring the rule-set shape. Every value is controlled text; nothing is ever rendered as HTML. */
export function RuleSetEditor({ draft, state, disabled, onChange, onAdd }: Props): React.ReactElement {
  const [sample, setSample] = useState({id:"", organizer:"", meetingUrl:"", title:"", description:""});
  const preview = evaluateJoinRules(sample, ruleSetFromDraft(draft), state ?? EMPTY_JOIN_RULE_STATE);
  const groups = draft.purposeGroups ?? [];
  const copy = pageCopy(JOIN_RULES_ENFORCED);
  const patch = (key: number, p: Partial<RuleDraft>) => onChange({ ...draft, rules: draft.rules.map(r => r.key === key ? { ...r, ...p } : r) });
  const remove = (key: number) => onChange({ ...draft, rules: draft.rules.filter(r => r.key !== key) });
  return <>
    <label>Attendance mode
      <select aria-label="Attendance mode" disabled={disabled} value={draft.attendanceMode ?? ""}
        onChange={e => onChange({...draft, attendanceMode:e.target.value === "all" ? "all" : e.target.value === "rules" ? "rules" : ""})}>
        <option value="">Legacy rules and approvals</option>
        <option value="all">All eligible meetings (validation)</option>
        <option value="rules">Only meetings matching an allow rule</option>
      </select>
    </label>
    <p className="row-meta">All mode includes unanswered invitations. Deny rules and meeting opt-outs always win. Rules mode requires a matching allow rule; unmatched meetings stay skipped without a required approval click. Declined, cancelled, unsafe or stale meetings cannot be scheduled.</p>
    <h3 className="section-title">Purpose groups</h3>
    <p className="row-meta">Name reusable groups of title or description phrases. A group matches any phrase in either field. Use one literal phrase per line (up to 20 per field, 160 characters each); letter case and repeated spaces are ignored.</p>
    {groups.map((g, i) => <div className="card" key={g.key}>
      <label>Purpose id
        <input aria-label={`Purpose ${i + 1} id`} disabled={disabled} maxLength={64} value={g.id}
          onChange={e => onChange({...draft, purposeGroups:groups.map(x => x.key === g.key ? {...x,id:e.target.value} : x)})} />
      </label>
      {(["titleIncludes", "descriptionIncludes"] as const).map(field => <label key={field} style={{display:"block"}}>
        {field === "titleIncludes" ? "Title phrases" : "Description phrases"}
        <textarea aria-label={`Purpose ${i + 1} ${field === "titleIncludes" ? "title" : "description"} phrases`} disabled={disabled} value={g[field]} rows={2} maxLength={3400}
          onChange={e => onChange({...draft,purposeGroups:groups.map(x => x.key === g.key ? {...x,[field]:e.target.value} : x)})} />
      </label>)}
      <button type="button" disabled={disabled} aria-label={`Remove purpose ${i + 1}`} onClick={() => onChange({...draft,purposeGroups:groups.filter(x => x.key !== g.key)})}>Remove purpose group</button>
    </div>)}
    <button type="button" disabled={disabled || groups.length >= 50} onClick={() => onChange({...draft,purposeGroups:[...groups,
      {key:Math.max(-1,...groups.map(g=>g.key))+1,id:"",titleIncludes:"",descriptionIncludes:""}]})}>Add purpose group</button>
    <label>Own domains (one per line; used by the internal / external matcher)
      <textarea aria-label="Own domains" rows={3} style={{ width: "100%" }} disabled={disabled} value={draft.ownDomains}
        onChange={e => onChange({ ...draft, ownDomains: e.target.value })} />
    </label>
    <h3 className="section-title">Rules</h3>
    <p className="row-meta">Rules are checked top to bottom. A matching deny rule always wins over an allow rule. All matchers filled in on one rule must match together.</p>
    {draft.rules.length === 0 && <p className="empty-note">{copy.noRules}</p>}
    <ol style={{ listStyle: "none", padding: 0 }}>
      {draft.rules.map((r, i) => <li key={r.key} className="card" aria-label={`Rule ${i + 1}`}>
        <div style={row}>
          <label style={field}>Rule name
            <input aria-label={`Rule ${i + 1} name`} style={{ width: "100%" }} disabled={disabled} value={r.id} onChange={e => patch(r.key, { id: e.target.value })} />
          </label>
          <label>Effect
            <select aria-label={`Rule ${i + 1} effect`} disabled={disabled} value={r.effect} onChange={e => patch(r.key, { effect: e.target.value === "deny" ? "deny" : "allow" })}>
              <option value="allow">{copy.allow}</option>
              <option value="deny">{copy.deny}</option>
            </select>
          </label>
          <button type="button" disabled={disabled} aria-label={`Remove rule ${i + 1}`} onClick={() => remove(r.key)}>Remove</button>
        </div>
        <div style={row}>
          <label style={field}>Sender email
            <input aria-label={`Rule ${i + 1} sender`} style={{ width: "100%" }} disabled={disabled} value={r.email} placeholder="speaker@example.com" onChange={e => patch(r.key, { email: e.target.value })} />
          </label>
          <label style={field}>Domain
            <input aria-label={`Rule ${i + 1} domain`} style={{ width: "100%" }} disabled={disabled} value={r.domain} placeholder="example.com (no wildcard)" onChange={e => patch(r.key, { domain: e.target.value })} />
          </label>
          <label>
            <input type="checkbox" aria-label={`Rule ${i + 1} include subdomains`} disabled={disabled || r.domain.trim() === ""} checked={r.subdomains} onChange={e => patch(r.key, { subdomains: e.target.checked })} /> include subdomains
          </label>
        </div>
        <div style={row}>
          {(["titleIncludes", "descriptionIncludes", "purposeAny"] as const).map(field => <label key={field} style={field === "purposeAny" ? undefined : {flex:"1 1 15rem"}}>
            {field === "titleIncludes" ? "Title phrases" : field === "descriptionIncludes" ? "Description phrases" : "Purpose group ids"}
            <textarea aria-label={`Rule ${i + 1} ${field === "titleIncludes" ? "title phrases" : field === "descriptionIncludes" ? "description phrases" : "purposes"}`} disabled={disabled} rows={2} maxLength={3400} value={r[field] ?? ""}
              onChange={e => patch(r.key,{[field]:e.target.value})} />
          </label>)}
        </div>
        <div style={row}>
          <label>Platform
            <select aria-label={`Rule ${i + 1} platform`} disabled={disabled} value={r.platform} onChange={e => patch(r.key, { platform: PLATFORMS.find(p => p === e.target.value) ?? "" })}>
              <option value="">any</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>Organiser
            <select aria-label={`Rule ${i + 1} scope`} disabled={disabled} value={r.scope} onChange={e => patch(r.key, { scope: e.target.value === "internal" ? "internal" : e.target.value === "external" ? "external" : "" })}>
              <option value="">any</option>
              <option value="internal">internal (own domains)</option>
              <option value="external">external</option>
            </select>
          </label>
        </div>
      </li>)}
    </ol>
    <button type="button" disabled={disabled} onClick={onAdd}>Add rule</button>
    <h3 className="section-title">Try a sample meeting</h3>
    <p className="row-meta">This local preview checks unsaved rules only. Scheduling also checks invitation status, trusted links, timing and source freshness. Nothing is sent or scheduled by this preview.</p>
    {(["id", "organizer", "meetingUrl", "title", "description"] as const).map(field => <label key={field} style={{display:"block"}}>
      {field === "id" ? "Event id (for opt-outs)" : field === "organizer" ? "Sender" : field === "meetingUrl" ? "Meeting link" : field === "title" ? "Title" : "Description"}
      <input aria-label={`Preview ${field === "id" ? "event id" : field === "organizer" ? "sender" : field === "meetingUrl" ? "meeting link" : field}`} maxLength={field === "description" ? 20000 : 2048} value={sample[field]}
        onChange={e => setSample({...sample,[field]:e.target.value})} />
    </label>)}
    <p aria-label="Join rule preview">{preview.action}: {preview.reason} ({preview.ruleId})</p>
  </>;
}
