import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../../../api/client.js";

type Status = "suggested" | "accepted" | "rejected" | "revoked";
type RelationType = "agrees_with" | "contradicts" | "supersedes";
type Decision = "accept" | "reject" | "revoke";
export interface RelationEvidence { sessionId: string; turnId: string; quote: string }
export interface ReviewRelationship {
  id: string; revision: number; status: Status; type: RelationType;
  from: { claimId: string; personId: string }; to: { claimId: string; personId: string };
  sourceRevisionDigest: string; evidence: RelationEvidence[];
}
/** Supplied only by an authenticated server response. Absence grants no authority. */
export interface SpeakerRelationAuthority {
  personId: string; canPropose: boolean; canReview: boolean; reviewerKind: "human" | "automation";
  sourceRevisionDigest?: string;
  claims?: Array<{ id: string; text: string; evidence: Array<RelationEvidence & { transcriptHash: string }> }>;
}
export interface SpeakerRelationWorkbenchProps {
  apiKey: string; personId: string; authSession: number; authority?: SpeakerRelationAuthority | null;
  onChanged?: () => void;
}
const statuses: Status[] = ["suggested", "accepted", "rejected", "revoked"];
const types: RelationType[] = ["agrees_with", "contradicts", "supersedes"];
const label = (type: RelationType) => ({ agrees_with: "Agrees with", contradicts: "Contradicts", supersedes: "Supersedes" })[type];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function validRow(v: unknown, personId: string, status: Status): v is ReviewRelationship {
  return object(v) && identifier(v.id) && Number.isSafeInteger(v.revision) && Number(v.revision) >= 1 && v.status === status &&
    types.includes(v.type as RelationType) && object(v.from) && object(v.to) && v.from.personId === personId && v.to.personId === personId &&
    identifier(v.from.claimId) && identifier(v.to.claimId) && v.from.claimId !== v.to.claimId && digest(v.sourceRevisionDigest) &&
    Array.isArray(v.evidence) && v.evidence.length > 0 && v.evidence.length <= 20 && v.evidence.every(e => object(e) && identifier(e.sessionId) && identifier(e.turnId) && typeof e.quote === "string" && !!e.quote.trim() && e.quote.length <= 12000);
}
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Revision conflict. Refresh relationships and inspect the current evidence before deciding again.";
    if (error.status === 403) return "The server refused this action. Review requires an authorized human; automation cannot approve relationships.";
    if (error.status === 503) return "Relationship evidence or authority is unavailable or stale. Refresh the source view before retrying.";
    if (error.status === 401) return "Sign in again to access relationships.";
  }
  return "Relationships could not be loaded or saved. Refresh before retrying.";
}
function Evidence({ values }: { values: RelationEvidence[] }): React.ReactElement {
  return <ul>{values.map((e, i) => <li key={i}><blockquote>{e.quote}</blockquote><Link to={`/sessions/${encodeURIComponent(e.sessionId)}#turn-${encodeURIComponent(e.turnId)}`}>Open source turn {e.turnId}</Link></li>)}</ul>;
}

/** The keyed inner component discards all inventories, drafts and late requests on identity changes. */
export function SpeakerRelationWorkbench(props: SpeakerRelationWorkbenchProps): React.ReactElement {
  return <Workbench key={JSON.stringify([props.apiKey, props.authSession, props.personId])} {...props} />;
}
function Workbench({ apiKey, personId, authority, onChanged }: SpeakerRelationWorkbenchProps): React.ReactElement {
  const [generation, refresh] = useState(0);
  const [inventory, setInventory] = useState<Record<Status, ReviewRelationship[]> | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false);
  const [choice, setChoice] = useState<{ row: ReviewRelationship; decision: Decision } | null>(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [type, setType] = useState<RelationType>("agrees_with");
  const [selected, setSelected] = useState<string[]>([]);
  const mounted = useRef(true); const mutation = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const a = authority?.personId === personId ? authority : null;
  const canReview = a?.canReview === true && a.reviewerKind === "human";
  const claims = a?.claims ?? [];
  const fromClaim = claims.find(c => c.id === from), toClaim = claims.find(c => c.id === to);
  const candidates = [...(fromClaim?.evidence ?? []), ...(toClaim?.evidence ?? [])].filter((e, i, all) => all.findIndex(x => x.sessionId === e.sessionId && x.turnId === e.turnId) === i);
  const sourceReady = digest(a?.sourceRevisionDigest) && claims.length >= 2;
  const canPropose = a?.canPropose === true && sourceReady;
  const key = (e: RelationEvidence) => JSON.stringify([e.sessionId, e.turnId]);
  // Fail closed only when one defined digest is replaced by a different one; first settle (undefined -> value) keeps the user's picks.
  const lastDigest = useRef<string | undefined>(undefined);
  useEffect(() => {
    const next = a?.sourceRevisionDigest, prev = lastDigest.current;
    if (next === undefined) return;
    lastDigest.current = next;
    if (prev !== undefined && prev !== next) { setFrom(""); setTo(""); setSelected([]); setChoice(null); }
  }, [a?.sourceRevisionDigest]);
  useEffect(() => {
    let cancelled = false; setInventory(null); setError(""); setChoice(null); setBlocked(false);
    if (!apiKey) return;
    Promise.all(statuses.map(async status => {
      const value = await apiFetch<unknown>(`/speaker-relations?personId=${encodeURIComponent(personId)}&status=${status}`, apiKey);
      if (!object(value) || !Array.isArray(value.relationships) || value.relationships.length > 100 || !value.relationships.every(r => validRow(r, personId, status)) || new Set(value.relationships.map(r => r.id)).size !== value.relationships.length) throw new ApiError(503, "Invalid relationship inventory");
      return [status, value.relationships] as const;
    })).then(entries => { if (!cancelled) setInventory(Object.fromEntries(entries) as Record<Status, ReviewRelationship[]>); })
      .catch(e => { if (!cancelled) setError(message(e)); });
    return () => { cancelled = true; };
  }, [apiKey, personId, generation]);
  async function save(path: string, body: unknown, expected: Status, reviewed?: ReviewRelationship): Promise<void> {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const value = await apiFetch<unknown>(path, apiKey, { method: "POST", body });
      if (!object(value) || !object(value.relationship) || !identifier(value.relationship.id) || !Number.isSafeInteger(value.relationship.revision) || Number(value.relationship.revision) < 1 || value.relationship.status !== expected || typeof value.relationship.replayed !== "boolean" || (reviewed && (value.relationship.id !== reviewed.id || value.relationship.revision !== reviewed.revision + 1))) throw new ApiError(503, "Invalid relationship receipt");
      if (!mounted.current) return;
      setChoice(null); setSelected([]); setNotice(expected === "suggested" ? "Proposal saved for human review. It is not an accepted relationship." : `Server recorded relationship as ${expected}.`);
      refresh(n => n + 1); onChanged?.();
    } catch (e) { if (mounted.current) { setError(message(e)); setBlocked(true); setChoice(null); } }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  function propose(): void {
    if (!canPropose || busy || blocked || !inventory || !from || !to || from === to) return;
    const evidence = candidates.filter(e => selected.includes(key(e)));
    if (!evidence.length || evidence.length > 20 || evidence.some(e => !digest(e.transcriptHash))) return;
    void save("/speaker-relations", { id: `proposal:${crypto.randomUUID()}`, personId, fromClaimId: from, toClaimId: to, type, evidence, sourceRevisionDigest: a!.sourceRevisionDigest }, "suggested");
  }
  return <section aria-label="Speaker relationship workbench"><h3>Speaker relationships</h3>
    <p>Proposals remain pending until an authorized human accepts them. A relationship decision does not confirm speaker identity.</p>
    <button type="button" disabled={busy} onClick={() => { setNotice(""); refresh(n => n + 1); }}>Refresh relationships</button>
    {!apiKey ? <p>Sign in to view relationships.</p> : !inventory && !error && <p role="status">Loading relationships…</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!canReview && <p>Human review unavailable: the server has not granted human review authority{a?.reviewerKind === "automation" ? "; automation cannot accept, reject or revoke relationships" : ""}.</p>}
    {inventory && statuses.map(status => <section key={status} aria-label={`${status} relationships`}><h4>{status === "suggested" ? "Pending proposals" : `${status[0]!.toUpperCase()}${status.slice(1)} relationships`}</h4>
      {!inventory[status].length && <p>No {status === "suggested" ? "pending proposals" : `${status} relationships`} in the current source view.</p>}
      {inventory[status].map(row => { const stale = !!a?.sourceRevisionDigest && a.sourceRevisionDigest !== row.sourceRevisionDigest; return <article className="card" key={row.id}>
        <p>{row.from.claimId} → {label(row.type)} → {row.to.claimId}</p><p>Status: {row.status} · revision {row.revision}</p><Evidence values={row.evidence} />
        {stale && <p>Stale evidence: refresh the source view before reviewing.</p>}
        {canReview && (status === "suggested" || status === "accepted") && <div>{(status === "suggested" ? ["accept", "reject"] as const : ["revoke"] as const).map(decision => <button type="button" key={decision} disabled={busy || blocked || stale} onClick={() => setChoice({ row, decision })}>{decision[0]!.toUpperCase() + decision.slice(1)} relationship</button>)}</div>}
      </article>; })}
    </section>)}
    {choice && <div role="group" aria-label="Confirm human relationship decision"><p>Confirm {choice.decision} for {choice.row.id} at revision {choice.row.revision} after inspecting the source evidence.</p>
      <button type="button" disabled={busy || blocked || !canReview || (!!a?.sourceRevisionDigest && a.sourceRevisionDigest !== choice.row.sourceRevisionDigest)} onClick={() => { if (!canReview || busy || blocked || (!!a?.sourceRevisionDigest && a.sourceRevisionDigest !== choice.row.sourceRevisionDigest)) return; void save(`/speaker-relations/${encodeURIComponent(choice.row.id)}/review`, { baseRevision: choice.row.revision, requestId: `review:${crypto.randomUUID()}`, decision: choice.decision }, ({ accept: "accepted", reject: "rejected", revoke: "revoked" } as const)[choice.decision], choice.row); }}>Confirm {choice.decision}</button>
      <button type="button" disabled={busy} onClick={() => setChoice(null)}>Cancel decision</button></div>}
    <h4>Propose a relationship</h4>
    {!canPropose ? <p>Proposal unavailable: server proposal authority and current hashed source evidence are required.</p> : <form onSubmit={e => { e.preventDefault(); propose(); }}>
      <label>From claim <select value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setSelected([]); }}><option value="">Choose claim</option>{claims.map(c => <option key={c.id} value={c.id}>{c.text}</option>)}</select></label>
      <label>Relationship <select value={type} disabled={busy} onChange={e => setType(e.target.value as RelationType)}>{types.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></label>
      <label>To claim <select value={to} disabled={busy} onChange={e => { setTo(e.target.value); setSelected([]); }}><option value="">Choose a different claim</option>{claims.filter(c => c.id !== from).map(c => <option key={c.id} value={c.id}>{c.text}</option>)}</select></label>
      <fieldset disabled={busy}><legend>Exact source evidence (select 1–20)</legend>{candidates.map(e => <label key={key(e)}><input type="checkbox" checked={selected.includes(key(e))} onChange={event => setSelected(values => event.target.checked ? [...values, key(e)] : values.filter(v => v !== key(e)))} />{e.quote}</label>)}</fieldset>
      <button type="submit" disabled={busy || blocked || !inventory || !from || !to || from === to || !selected.length || selected.length > 20}>Submit proposal for human review</button>
    </form>}
  </section>;
}
