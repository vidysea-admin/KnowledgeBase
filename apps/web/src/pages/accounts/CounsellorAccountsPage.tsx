import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { accounts, identities, createAccount, updateAccount, accountRole, accountStatus, accountAudit, hostingAudit, type Account, type Audit } from "./client.js";

function AccountRow({ account, disabled, run }: { account: Account; disabled: boolean; run: (work: () => Promise<unknown>) => void }) {
  const { apiKey } = useAuth();
  const [name, setName] = useState(account.displayName), [email, setEmail] = useState(account.email), [role, setRole] = useState(account.role ?? "none");
  useEffect(() => { setName(account.displayName); setEmail(account.email); setRole(account.role ?? "none"); }, [account]);
  return <article className="card">
    <h2>{account.displayName}</h2><p>{account.status} · Current access: {account.role ?? "no role"} · Revision {account.revision}</p>
    <p>Identity: <code>{account.keyId}</code></p>
    <form onSubmit={e => { e.preventDefault(); run(() => updateAccount(apiKey, account, name, email)); }}>
      <label>Name <input aria-label={`Name for ${account.displayName}`} value={name} maxLength={160} required onChange={e => setName(e.target.value)} disabled={disabled} /></label>
      <label>Email <input aria-label={`Email for ${account.displayName}`} value={email} type="email" maxLength={254} required onChange={e => setEmail(e.target.value)} disabled={disabled} /></label>
      <button disabled={disabled}>Save profile</button>
    </form>
    <label>Role <select aria-label={`Role for ${account.displayName}`} value={role} onChange={e => setRole(e.target.value)} disabled={disabled || account.status !== "active" || account.role === "owner"}>
      <option value="none">No role</option><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>{account.role === "owner" && <option value="owner">Owner (operator configured)</option>}
    </select></label>
    <button disabled={disabled || account.status !== "active" || account.role === "owner"} onClick={() => run(() => accountRole(apiKey, account, role === "none" ? null : role))}>Apply access</button>
    <button className="secondary" disabled={disabled || account.role === "owner"} onClick={() => run(() => accountStatus(apiKey, account, account.status === "active" ? "deactivate" : "activate"))}>{account.status === "active" ? "Deactivate and revoke access" : "Reactivate profile"}</button>
    <button className="secondary" disabled={disabled || account.role === "owner"} onClick={() => run(() => accountStatus(apiKey, account, "delete"))}>Remove account and revoke access</button>
  </article>;
}

export function CounsellorAccountsPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [rows, setRows] = useState<Account[]>([]), [keyIds, setKeyIds] = useState<string[]>([]), [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [keyId, setKeyId] = useState("");
  const generation = useRef(0);
  async function load(token: number) {
    const result = await accounts(apiKey);
    if (token !== generation.current) return;
    setRows(result.accounts); setLoaded(true);
    // Read-only roles can inspect accounts; administrative controls require live eligibility lookup.
    try { const ids = await identities(apiKey); if (token === generation.current) setKeyIds(ids.keyIds); }
    catch (err) { if (!(err instanceof ApiError && err.status === 403)) throw err; }
  }
  useEffect(() => {
    const token = ++generation.current; setRows([]); setKeyIds([]); setAudit([]); setError(null); setNotice(""); setLoaded(false); setBusy(false); setName(""); setEmail(""); setKeyId("");
    void load(token).catch(err => { if (token === generation.current) setError(err instanceof ApiError ? (err.code ?? err.message) : "Unable to load accounts"); });
    return () => { ++generation.current; };
  }, [apiKey]);
  async function run(work: () => Promise<unknown>) {
    const token = generation.current; setBusy(true); setError(null); setNotice("");
    try { await work(); if (token === generation.current) { setNotice("Change saved."); await load(token); } }
    catch (err) { if (token === generation.current) setError(err instanceof ApiError ? (err.code ?? err.message) : "Change was not confirmed; refresh before retrying."); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function create(e: FormEvent) {
    e.preventDefault(); const token = generation.current;
    void run(async () => { await createAccount(apiKey, { keyId, displayName: name, email }); if (token === generation.current) { setName(""); setEmail(""); } });
  }
  return <>
    <div className="page-header"><h1>Counsellor accounts</h1><p>Link counsellors to existing API key identities. Grant access after creating a profile. Hosting and account access requires a fresh role grant.</p></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{!loaded && !error && <p>Loading accounts…</p>}
    <button className="secondary" disabled={busy} onClick={() => void run(() => load(generation.current))}>Refresh accounts</button>
    {keyIds.length > 0 && <section className="card"><h2>Create account</h2><form onSubmit={create}>
      <label>Name <input required maxLength={160} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
      <label>Email <input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
      <label>Existing identity <select required value={keyId} onChange={e => setKeyId(e.target.value)} disabled={busy}><option value="">Select identity</option>{keyIds.filter(id => !rows.some(a => a.keyId === id)).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <button disabled={busy}>Create account</button>
    </form></section>}
    {loaded && rows.length === 0 && <p>No counsellor accounts for this tenant.</p>}
    {rows.map(account => <AccountRow key={account.id} account={account} disabled={busy || keyIds.length === 0} run={work => void run(work)} />)}
    <section className="card"><h2>Audit</h2><button disabled={busy} onClick={() => { const token = generation.current; void run(async () => {
      const profiles = await accountAudit(apiKey), grants = await hostingAudit(apiKey);
      if (token === generation.current) setAudit([...profiles.audit, ...grants.records.filter(row => row.operation.startsWith("role.") || row.operation === "account.complete")]);
    }); }}>Load profile and access audit</button>
      <ul>{audit.map((row, i) => <li key={`${row.operation}-${row.sequence}-${i}`}>{row.at} · {row.actorId} · {row.operation} · {row.target} · {row.outcome}</li>)}</ul>
    </section>
  </>;
}
export default CounsellorAccountsPage;
