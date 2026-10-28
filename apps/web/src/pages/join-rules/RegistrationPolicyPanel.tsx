import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "../../api/client.js";

interface Policy {
  version: 1; operator: {firstName: string; lastName: string; email: string; organization?: string};
  form: {mode: "native-html"; formSelector: string; submitSelector: string; fields: {firstName: string; lastName: string; email: string; organization?: string}};
  scope: {organizers: string[]; domains: string[]; platforms: string[]; allowedHosts: string[]};
  relevance: {includeTerms: string[]; excludeTerms: string[]};
}
interface View {policy: Policy | null; approved: boolean; revision: string}
const blank = (): Policy => ({version: 1, operator: {firstName: "", lastName: "", email: ""},
  form: {mode: "native-html", formSelector: "", submitSelector: "", fields: {firstName: "", lastName: "", email: ""}},
  scope: {organizers: [], domains: [], platforms: [], allowedHosts: []}, relevance: {includeTerms: [], excludeTerms: []}});
const base = "/calendar/join-rules/registration-policy";
const asList = (value: string) => value.split(",").map(s => s.trim()).filter(Boolean);
function validView(v: View): boolean {
  if (!v || typeof v.approved !== "boolean" || typeof v.revision !== "string" || !/^(absent|[0-9a-f]{64})$/.test(v.revision)) return false;
  if (v.policy === null) return !v.approved && v.revision === "absent";
  if (v.revision === "absent") return false;
  const p = v.policy;
  return p.version === 1 && !!p.operator && [p.operator.firstName, p.operator.lastName, p.operator.email].every(x => typeof x === "string") &&
    !!p.form && p.form.mode === "native-html" && !!p.form.fields && [p.form.formSelector, p.form.submitSelector,
      p.form.fields.firstName, p.form.fields.lastName, p.form.fields.email].every(x => typeof x === "string") &&
    !!p.scope && !!p.relevance && [p.scope.organizers, p.scope.domains, p.scope.platforms, p.scope.allowedHosts,
      p.relevance.includeTerms, p.relevance.excludeTerms].every(x => Array.isArray(x) && x.every(y => typeof y === "string"));
}

/** Saving and approving are separate actions; any saved edit revokes the previous approval. */
export function RegistrationPolicyPanel({apiKey}: {apiKey: string}): React.ReactElement {
  return <RegistrationPolicySession key={apiKey} apiKey={apiKey} />;
}
/** Keyed session boundary hides prior tenant PII before passive effects and discards stale request state. */
function RegistrationPolicySession({apiKey}: {apiKey: string}): React.ReactElement {
  const [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<Policy>(blank);
  const [busy, setBusy] = useState(false), [readOnly, setReadOnly] = useState(false), [message, setMessage] = useState("");
  const keyRef = useRef(apiKey); keyRef.current = apiKey;
  const dirty = view !== null && JSON.stringify(draft) !== JSON.stringify(view.policy ?? blank());
  function failure(e: unknown) {
    if (e instanceof ApiError && e.status === 403) { setReadOnly(true); setMessage("This key needs the join-rules scope to view or approve a registration profile."); }
    else setMessage(e instanceof ApiError && e.status === 412 ? "The profile changed. Reload before approving or saving again." :
      e instanceof ApiError && e.status === 400 ? "Check the profile, exact organizer and host, relevance terms, and form fields." : "Registration policy is unavailable. No registration is authorized.");
  }
  async function load() {
    setBusy(true); setMessage("");
    try { const next = await apiFetch<View>(base, apiKey); if (keyRef.current !== apiKey) return;
      if (!validView(next)) throw new Error("Malformed registration policy");
      setView(next); setDraft(next.policy ?? blank()); setReadOnly(false);
    } catch (e) { if (keyRef.current === apiKey) { setView(null); failure(e); } }
    finally { if (keyRef.current === apiKey) setBusy(false); }
  }
  useEffect(() => { setView(null); setDraft(blank()); setReadOnly(false); setMessage(""); setBusy(false); }, [apiKey]);
  async function write(action: "save" | "approve" | "revoke") {
    if (!view) return;
    setBusy(true); setMessage("");
    try {
      const next = await apiFetch<View>(action === "save" ? base : `${base}/${action}`, apiKey, {
        method: action === "save" ? "PUT" : "POST", body: {expectedRevision: view.revision, ...(action === "save" ? {policy: draft} : {})},
      });
      if (keyRef.current !== apiKey) return;
      if (!validView(next)) throw new Error("Malformed registration policy");
      setView(next); setDraft(next.policy ?? blank());
      setMessage(action === "save" ? "Profile saved. Review and explicitly approve it before automatic registration." : action === "approve" ?
        "Profile and scope approved. Each source still needs approval and registration confirmation." : "Registration approval revoked.");
    } catch (e) { if (keyRef.current === apiKey) failure(e); }
    finally { if (keyRef.current === apiKey) setBusy(false); }
  }
  const input = (label: string, value: string, change: (value: string) => void) => <label style={{display: "block", marginBottom: ".5rem"}}>
    {label}<input aria-label={label} value={value} disabled={busy || readOnly || !view} onChange={e => change(e.target.value)} /></label>;
  const operator = (key: "firstName" | "lastName" | "email", label: string) => input(label, draft.operator[key], v => setDraft({...draft, operator: {...draft.operator, [key]: v}}));
  const scope = (key: keyof Policy["scope"], label: string) => input(label, draft.scope[key].join(", "), v => setDraft({...draft, scope: {...draft.scope, [key]: asList(v)}}));
  const selector = (key: "firstName" | "lastName" | "email", label: string) => input(label, draft.form.fields[key], v => setDraft({...draft, form: {...draft.form, fields: {...draft.form.fields, [key]: v}}}));
  const changeOrganization = (value: string) => {
    const operator = {...draft.operator}, fields = {...draft.form.fields};
    if (value.trim()) operator.organization = value;
    else { delete operator.organization; delete fields.organization; }
    setDraft({...draft, operator, form: {...draft.form, fields}});
  };
  return <section className="card" aria-label="Registration profile and approval">
    <h2 className="section-title">Registration profile and approval</h2>
    <p>Allow automatic registration only for the named organizers, platforms, form hosts and relevant titles. Saving any change removes approval. Approval permits an attempt; it does not mean registration succeeded.</p>
    {message && <p role="status">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>{view ? "Reload registration policy" : "Load registration policy"}</button>
    {view && <>
      <p>{view.approved ? "Approved for registration within this scope." : "Not approved for automatic registration."}</p>
      {operator("firstName", "First name")}{operator("lastName", "Last name")}{operator("email", "Registration email")}
      {input("Organization (optional)", draft.operator.organization ?? "", changeOrganization)}
      {scope("organizers", "Organizer emails (comma separated)")}{scope("domains", "Exact organizer domains (comma separated)")}
      {scope("platforms", "Platforms (meet, teams, zoom, webex, zoho, cloudonair, unknown)")}{scope("allowedHosts", "Exact HTTPS form hosts (comma separated)")}
      {input("Relevant title terms (comma separated)", draft.relevance.includeTerms.join(", "), v => setDraft({...draft, relevance: {...draft.relevance, includeTerms: asList(v)}}))}
      {input("Excluded title terms (comma separated)", draft.relevance.excludeTerms.join(", "), v => setDraft({...draft, relevance: {...draft.relevance, excludeTerms: asList(v)}}))}
      <details><summary>Approved form fields</summary><p>Provide the exact form and field selectors verified by the operator. Only name, email and optional organization are supported.</p>
        {input("Form selector", draft.form.formSelector, v => setDraft({...draft, form: {...draft.form, formSelector: v}}))}
        {input("Submit selector", draft.form.submitSelector, v => setDraft({...draft, form: {...draft.form, submitSelector: v}}))}
        {selector("firstName", "First name field selector")}{selector("lastName", "Last name field selector")}{selector("email", "Email field selector")}
        {draft.operator.organization !== undefined && input("Organization field selector", draft.form.fields.organization ?? "", v => setDraft({...draft,
          form: {...draft.form, fields: {...draft.form.fields, organization: v}}}))}
      </details>
      <button type="button" disabled={busy || readOnly || !dirty} onClick={() => void write("save")}>Save profile and scope</button>
      <button type="button" disabled={busy || readOnly || dirty || !view.policy || view.approved} onClick={() => void write("approve")}>Approve this saved profile and scope</button>
      <button type="button" disabled={busy || readOnly || !view.approved} onClick={() => void write("revoke")}>Revoke registration approval</button>
    </>}
  </section>;
}
