import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { deleteSavedCollection, getCollectionMembers, getSavedCollections, savedMemberHref, writeSavedCollection, type MemberChoice, type SavedCollection, type SavedMember } from "./collectionsClient.js";
type Data = { key: string; authSession: number; generation: number; collections: SavedCollection[]; members: MemberChoice[]; truncated: boolean; error?: string };
const memberKey = (m: SavedMember) => JSON.stringify([m.kind, m.id]);
export function CuratedCollections(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const [generation, refresh] = useState(0); const [data, setData] = useState<Data | null>(null);
  const [editing, edit] = useState<SavedCollection | null>(null); const [title, setTitle] = useState(""); const [selected, select] = useState<string[]>([]);
  const draftId = useRef(crypto.randomUUID());
  const [action, setAction] = useState<{ key: string; authSession: number; error?: string; busy: boolean } | null>(null);
  const viewRef = useRef(""); viewRef.current = JSON.stringify([apiKey, sessionVersion, generation]);
  const cur = data?.key === apiKey && data.authSession === sessionVersion && data.generation === generation ? data : null;
  useEffect(() => {
    let cancelled = false; setData(null); edit(null); select([]); setTitle(""); setAction(null); draftId.current = crypto.randomUUID();
    if (apiKey) Promise.all([getSavedCollections(apiKey), getCollectionMembers(apiKey)]).then(([c, m]) => {
      if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, generation, collections: c.collections, members: m.members, truncated: c.truncated || m.truncated });
    }).catch(e => { if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, generation, collections: [], members: [], truncated: false, error: e instanceof Error ? e.message : "Collections unavailable." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionVersion, generation]);
  const run = async (fn: () => Promise<unknown>) => {
    if (!apiKey) return; const key = apiKey, view = viewRef.current; setAction({ key, authSession: sessionVersion, busy: true });
    try { await fn(); if (viewRef.current === view) refresh(n => n + 1); }
    catch (e) { if (viewRef.current === view) setAction({ key, authSession: sessionVersion, busy: false, error: e instanceof Error ? e.message : "The collection could not be saved." }); }
  };
  const busy = action?.key === apiKey && action.authSession === sessionVersion && action.busy;
  const memberChoices: MemberChoice[] = [...(cur?.members ?? [])];
  // The bounded chooser is not the saved membership authority. Keep available saved
  // members editable even when they fall outside its returned window.
  for (const m of editing?.members ?? []) {
    if (m.available === true && !memberChoices.some(choice => memberKey(choice) === memberKey(m))) memberChoices.push({ ...m, title: m.id });
  }
  const choices = new Map(memberChoices.map(m => [memberKey(m), m]));
  const selectedMembers = selected.map(k => choices.get(k)).filter((m): m is MemberChoice => Boolean(m));
  return <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><h1>Saved curated collections</h1><p>Choose the exact tenant-owned records to keep together. Saved membership is separate from derived month and topic filters.</p>
    {!apiKey ? <p>Sign in to view collections.</p> : <>
      <button type="button" onClick={() => refresh(n => n + 1)}>Reload saved collections</button>
      {!cur && <p role="status">Loading collections…</p>}{cur?.error && <p role="alert">{cur.error}</p>}
      {action?.key === apiKey && action.authSession === sessionVersion && (action.error ? <p role="alert">{action.error}</p> : action.busy ? <p role="status">Saving collection…</p> : null)}
      {cur && !cur.error && <>
        {cur.truncated && <p>Collections and membership choices are bounded; additional records may not be shown.</p>}
        {!cur.collections.length && <p>No saved collections yet.</p>}
        {cur.collections.map(c => <article className="card" key={c.id}><h2>{c.title}</h2><p>Saved revision {c.revision}</p>
          {c.unavailableMembers && <p>Some saved records are unavailable. Refresh before editing this collection.</p>}
          <ul>{c.members.map(m => { const href = savedMemberHref(m); const label = choices.get(memberKey(m))?.title ?? m.id;
            return <li key={memberKey(m)}>{href ? <Link to={href}>{label}</Link> : <span>{label}</span>} · {m.kind}{!m.available ? " · Record unavailable" : !href ? " · Profile mapping unavailable" : ""}</li>; })}</ul>
          <button type="button" disabled={busy || c.unavailableMembers} onClick={() => { edit(c); setTitle(c.title); select(c.members.filter(m => m.available).map(memberKey)); }}>Edit collection</button>
          <button type="button" disabled={busy} onClick={() => void run(() => deleteSavedCollection(apiKey, c))}>Delete collection</button>
        </article>)}
        <form onSubmit={e => { e.preventDefault(); if (selectedMembers.length !== selected.length) return; const id = editing?.id ?? draftId.current; void run(() => writeSavedCollection(apiKey, id, title.trim(), selectedMembers, editing?.revision ?? 0)); }}>
          <h2>{editing ? `Edit ${editing.title}` : "Create a collection"}</h2>
          {editing && editing.members.some(m => m.available === true && !cur.members.some(choice => memberKey(choice) === memberKey(m))) && <p role="status">Some saved members are outside the returned choices. They remain selected unless you remove them.</p>}
          <label>Collection title <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: "100%" }} /></label>
          <fieldset><legend>Members (up to 100)</legend>{memberChoices.map(m => <label key={memberKey(m)} style={{ display: "block" }}>
            <input type="checkbox" checked={selected.includes(memberKey(m))} disabled={busy || (!selected.includes(memberKey(m)) && selected.length >= 100)} onChange={e => select(s => e.target.checked ? [...s, memberKey(m)] : s.filter(k => k !== memberKey(m)))} />{m.title} · {m.kind}</label>)}</fieldset>
          <button disabled={busy || !title.trim() || selected.length > 100}>Save collection</button>
          {editing && <button type="button" onClick={() => { edit(null); setTitle(""); select([]); draftId.current = crypto.randomUUID(); }}>Cancel edit</button>}
        </form>
      </>}
    </>}
  </div>;
}
