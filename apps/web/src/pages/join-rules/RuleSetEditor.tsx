import { JOIN_RULES_ENFORCED, pageCopy } from "./enforcement.js";
import { PLATFORMS, type DraftSet, type RuleDraft } from "./joinRulesModel.js";

const row: React.CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.4rem" };
const field: React.CSSProperties = { flex: "1 1 12rem", minWidth: 0 };

interface Props { draft: DraftSet; disabled: boolean; onChange: (next: DraftSet) => void; onAdd: () => void }

/** Form mirroring the rule-set shape. Every value is controlled text; nothing is ever rendered as HTML. */
export function RuleSetEditor({ draft, disabled, onChange, onAdd }: Props): React.ReactElement {
  const copy = pageCopy(JOIN_RULES_ENFORCED);
  const patch = (key: number, p: Partial<RuleDraft>) => onChange({ ...draft, rules: draft.rules.map(r => r.key === key ? { ...r, ...p } : r) });
  const remove = (key: number) => onChange({ ...draft, rules: draft.rules.filter(r => r.key !== key) });
  return <>
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
  </>;
}
