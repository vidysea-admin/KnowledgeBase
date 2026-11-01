/**
 * apps/web/src/pages/whatsapp-links/ChoosePage.tsx -- unit wa-web (W10; R-15..R-22, outcome 2). The owner marks which groups are
 * captured and, per group, which people. Names and counts only: no message text is fetched or shown (R-22). An administrator
 * opening the same route gets the server's read-only marked-groups view (`canEdit:false`) and no editing controls.
 * Choosing people goes through `restrictToPeople` (ISS-WASEL-002): trackAllSenders:false first, then the people, then the
 * capture mode read back from the answer and shown, so a restriction that did not take effect is visible.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { describeLinkError, listGroups, listPeople, restrictToPeople, setGroup, type Capture, type GroupList, type GroupView, type PersonView } from "../../api/whatsapp-links.js";
import { useAuth } from "../../auth/AuthContext.js";

const CAPTURE_TEXT: Record<Capture, string> = { all: "everyone in the group", selected: "only the chosen people", none: "nobody" };

export function ChoosePage(): ReactNode {
  const { apiKey, sessionVersion } = useAuth();
  const { id = "" } = useParams<{ id: string }>();
  return <ChooseState key={`${sessionVersion}:${apiKey}:${id}`} apiKey={apiKey} id={id} />;
}

function ChooseState({ apiKey, id }: { apiKey: string | null; id: string }): ReactNode {
  const [list, setList] = useState<GroupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ group: GroupView; people: PersonView[]; chosen: Set<string> } | null>(null);
  const [capture, setCapture] = useState<Record<string, Capture>>({});

  const load = useCallback(async () => {
    try { setList(await listGroups(apiKey, id)); setError(null); } catch (e) { setError(describeLinkError(e)); }
  }, [apiKey, id]);
  useEffect(() => { void load(); }, [load]);

  async function guard(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setError(null); setNote(null);
    try { await fn(); } catch (e) { setError(describeLinkError(e)); } finally { setBusy(false); }
  }

  const mark = (g: GroupView, marked: boolean, trackAllSenders?: boolean): Promise<void> => guard(async () => {
    const r = await setGroup(apiKey, id, g.jid, { marked, ...(trackAllSenders === undefined ? {} : { trackAllSenders }) });
    if (r.capture) setCapture((c) => ({ ...c, [g.jid]: r.capture as Capture }));
    if (!marked && open?.group.jid === g.jid) setOpen(null);
    await load();
  });

  const openPeople = (g: GroupView): Promise<void> => guard(async () => {
    const r = await listPeople(apiKey, id, g.jid);
    setOpen({ group: g, people: r.people, chosen: new Set(r.people.filter((p) => p.selected).map((p) => p.personId)) });
  });

  const savePeople = (): Promise<void> => guard(async () => {
    if (!open) return;
    const ids = [...open.chosen];
    const r = await restrictToPeople(apiKey, id, open.group, ids);
    setCapture((c) => ({ ...c, [open.group.jid]: r.capture }));
    setNote(r.capture === "selected" || ids.length === 0 ? `Saved. This group now captures ${CAPTURE_TEXT[r.capture]}.` : `Saved, but WhatsApp reports this group still captures ${CAPTURE_TEXT[r.capture]}.`);
    setOpen(null);
    await load();
  });

  const toggle = (personId: string): void => setOpen((o) => {
    if (!o) return o;
    const chosen = new Set(o.chosen);
    if (chosen.has(personId)) chosen.delete(personId); else chosen.add(personId);
    return { ...o, chosen };
  });

  const canEdit = list?.canEdit === true;
  return (
    <div>
      <div className="page-header"><h1>Groups and people</h1><p>{canEdit ? "Only the groups you mark are captured. Unmarked groups are never read." : "These are the groups the owner marked for capture. Only the owner can change them."}</p></div>
      {error && <p role="alert" className="error-note">{error}</p>}
      {note && <p role="status">{note}</p>}
      <section className="card">
        {list === null && !error && <p className="empty-note">Loading…</p>}
        {list && <div className="row-meta">{list.markedCount} of {list.groupCount} groups marked{list.truncated ? " · list truncated" : ""}{list.refreshedAt ? ` · refreshed ${new Date(list.refreshedAt).toLocaleString()}` : ""}</div>}
        {list?.groups.length === 0 && <p className="empty-note">{canEdit ? "No groups found on this WhatsApp account yet." : "No groups are marked."}</p>}
        {list?.groups.map((g) => (
          <div key={g.jid} className="row-card">
            <div className="row-title">{g.subject || "Unnamed group"}</div>
            <div className="row-meta">{g.participantCount} participants{g.marked ? ` · captures ${CAPTURE_TEXT[capture[g.jid] ?? (g.trackAllSenders ? "all" : "selected")]}` : ""}</div>
            {canEdit && (
              <div>
                <label>
                  <input type="checkbox" checked={g.marked} disabled={busy} onChange={(e) => void mark(g, e.target.checked)} /> Capture this group
                </label>{" "}
                {g.marked && !g.trackAllSenders && <button type="button" disabled={busy} onClick={() => void mark(g, true, true)}>Capture everyone</button>}{" "}
                {g.marked && <button type="button" disabled={busy} onClick={() => void openPeople(g)}>Choose people</button>}
              </div>
            )}
            {open?.group.jid === g.jid && (
              <fieldset>
                <legend>People in {g.subject || "this group"}</legend>
                {open.people.length === 0 && <p className="empty-note">No people listed for this group.</p>}
                {open.people.map((p) => (
                  <label key={p.personId} style={{ display: "block" }}>
                    <input type="checkbox" checked={open.chosen.has(p.personId)} onChange={() => toggle(p.personId)} /> {p.label}
                  </label>
                ))}
                <button type="button" disabled={busy} onClick={() => void savePeople()}>Save people</button>{" "}
                <button type="button" onClick={() => setOpen(null)}>Cancel</button>
              </fieldset>
            )}
          </div>
        ))}
      </section>
      <p><Link to={`/whatsapp/links/${encodeURIComponent(id)}`}>Back to the link</Link></p>
    </div>
  );
}
