import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApprovalsPanel } from "./ApprovalsPanel.js";
import { RuleSetEditor } from "./RuleSetEditor.js";
import { MESSAGES, classify, getJoinRules, postPending, putRuleSet, type Problem } from "./joinRulesClient.js";
import {
  canonicalRuleSet, draftFromRuleSet, newRuleDraft, ruleSetFromDraft, validateRuleSetClient,
  type DraftSet, type JoinRulesView, type Pending, type RuleSet,
} from "./joinRulesModel.js";

type Phase = { name: "loading" } | { name: "ready" } | { name: "blocked"; text: string; retry: boolean };
interface Loaded { view: JoinRulesView; raw: string; draftJson: string }
type Notice = { kind: "error" | "ok"; text: string } | null;

/** Text for a failed READ (GET, also the fresh GET before a save). */
function readText(p: Problem): string {
  return p.failure === "unauthorized" ? MESSAGES.unauthorized : p.failure === "forbidden" ? MESSAGES.readForbidden : p.failure === "unavailable" ? MESSAGES.unavailable : MESSAGES.loadFailed;
}

export function JoinRulesPage(): React.ReactElement {
  const { apiKey } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<DraftSet>({ ownDomains: "", rules: [] });
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [conflict, setConflict] = useState<JoinRulesView | null>(null);
  const nextKey = useRef(0);
  const keyRef = useRef(apiKey);
  keyRef.current = apiKey;

  const adopt = useCallback((view: JoinRulesView, resetDraft: boolean) => {
    const d = draftFromRuleSet(view.ruleSet);

    setLoaded(prev => resetDraft || !prev ? { view, raw: canonicalRuleSet(view.ruleSet), draftJson: JSON.stringify(d) } : { ...prev, view: { ...prev.view, state: view.state } });
    if (resetDraft) { nextKey.current = d.rules.length; setDraft(d); }
  }, []);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setPhase({ name: "loading" }); setNotice(null); setProblems([]); setConflict(null); setReadOnly(false);
    try {
      const view = await getJoinRules(apiKey);
      if (keyRef.current !== apiKey) return;
      adopt(view, true); setPhase({ name: "ready" });
    } catch (e) {
      if (keyRef.current !== apiKey) return;
      const p = classify(e);
      setLoaded(null); setPhase({ name: "blocked", text: readText(p), retry: p.failure === "failed" });
    }
  }, [apiKey, adopt]);
  useEffect(() => { void load(); }, [load]);

  const dirty = loaded !== null && JSON.stringify(draft) !== loaded.draftJson;

  /** A failed WRITE: 403 means a key without the join-rules scope, so the page becomes read-only. */
  const writeProblem = (e: unknown) => {
    const p = classify(e);
    if (p.failure === "forbidden") { setReadOnly(true); setNotice({ kind: "error", text: MESSAGES.readOnly }); }
    else if (p.failure === "bad-request") setNotice({ kind: "error", text: `The server rejected this change: ${p.serverMessage}` });
    else if (p.failure === "unauthorized") setNotice({ kind: "error", text: MESSAGES.unauthorized });
    else if (p.failure === "unavailable") setNotice({ kind: "error", text: MESSAGES.unavailable });
    else setNotice({ kind: "error", text: `${MESSAGES.writeFailed} (${p.status === 0 ? "network error" : `HTTP ${p.status}`})` });
  };

  async function doPut(ruleSet: RuleSet) {
    if (!apiKey) return;
    setBusy(true); setNotice(null); setConflict(null);
    try {
      await putRuleSet(apiKey, ruleSet);
    } catch (e) { writeProblem(e); setBusy(false); return; }
    try {
      adopt(await getJoinRules(apiKey), true);
      setNotice({ kind: "ok", text: "Saved. The rules shown are the server's current answer." });
    } catch {
      setNotice({ kind: "error", text: "The rules were sent, but reloading the server's answer failed. What is shown may be out of date; reload the page before editing further." });
    }
    setBusy(false);
  }

  async function save() {
    if (!apiKey || !loaded) return;
    const ruleSet = ruleSetFromDraft(draft);
    const errors = validateRuleSetClient(ruleSet);
    setProblems(errors); setNotice(null);
    if (errors.length > 0) return;
    setBusy(true);
    let fresh: JoinRulesView;
    try { fresh = await getJoinRules(apiKey); }
    catch (e) { setNotice({ kind: "error", text: readText(classify(e)) }); setBusy(false); return; }
    setBusy(false);
    // Best-effort and racy: the API has no version/ETag, so a change landing between this GET and the PUT is not caught.
    if (canonicalRuleSet(fresh.ruleSet) !== loaded.raw) { setConflict(fresh); return; }
    await doPut(ruleSet);
  }

  async function confirmPending(p: Pending) {
    if (!apiKey) return;
    setBusy(true); setNotice(null);
    try { await postPending(apiKey, p.kind, p.value); }
    catch (e) { writeProblem(e); setBusy(false); return; }
    try {
      adopt(await getJoinRules(apiKey), !dirty);
      setNotice({ kind: "ok", text: p.kind === "optout" ? `Opted out of event ${p.value}.` : `Approved ${p.value}.` });
    } catch {
      setNotice({ kind: "error", text: "The change was sent, but reloading the server's answer failed. What is shown may be out of date." });
    }
    setBusy(false);
  }

  const addRule = () => {
    const ids = new Set(draft.rules.map(r => r.id));
    let n = draft.rules.length + 1;
    while (ids.has(`rule-${n}`)) n++;
    setDraft({ ...draft, rules: [...draft.rules, newRuleDraft(nextKey.current++, n)] });
  };

  return <>
    <div className="page-header"><h1>Join rules</h1><p>Decide which meetings the bot may join without a human click.</p></div>
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view join rules.</p>
      : phase.name === "loading" ? <p role="status">Loading join rules…</p>
      : phase.name === "blocked" ? <div className="card">
        <p role="alert" className="error-note">{phase.text}</p>
        {phase.retry && <button type="button" onClick={() => void load()}>Retry</button>}
      </div>
      : loaded && <>
        {readOnly && <p role="alert" className="card error-note">{MESSAGES.readOnly}</p>}
        {notice && <p role={notice.kind === "ok" ? "status" : "alert"} className={notice.kind === "ok" ? "card" : "card error-note"}>{notice.text}</p>}
        <section className="card" aria-label="Rule set">
          <h2 className="section-title">Rules</h2>
          <RuleSetEditor draft={draft} disabled={readOnly || busy} onChange={next => { setDraft(next); setProblems([]); }} onAdd={addRule} />
          {problems.length > 0 && <ul role="alert" className="error-note" aria-label="Problems with the rules">{problems.map(m => <li key={m}>{m}</li>)}</ul>}
          {conflict && <div role="alertdialog" aria-label="Rules changed on the server" className="card" style={{ borderLeft: "4px solid var(--warn)" }}>
            <p><strong>The rules changed on the server after you loaded them.</strong> Saving now replaces those newer rules with your version.</p>
            <p className="row-meta">This check is best effort: a change made at the same moment as your save can still be overwritten.</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" disabled={busy} onClick={() => void doPut(ruleSetFromDraft(draft))}>Overwrite with my version</button>
              <button type="button" disabled={busy} onClick={() => { adopt(conflict, true); setConflict(null); setProblems([]); }}>Discard my edits and load the server's rules</button>
              <button type="button" onClick={() => setConflict(null)}>Cancel</button>
            </div>
          </div>}
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" disabled={readOnly || busy || !dirty} onClick={() => void save()}>Save rules</button>
            <span className="row-meta"> {dirty ? "You have unsaved changes. Saving replaces the rules only; approvals and opt-outs are kept." : "No unsaved changes."}</span>
          </div>
        </section>
        <section className="card" aria-label="Approvals and opt-outs">
          <h2 className="section-title">Approvals and opt-outs</h2>
          <p className="row-meta">An approval makes the bot join future meetings from that sender or domain with no human click.</p>
          <ApprovalsPanel state={loaded.view.state} disabled={readOnly} busy={busy} onConfirm={p => void confirmPending(p)} />
        </section>
      </>}
  </>;
}
