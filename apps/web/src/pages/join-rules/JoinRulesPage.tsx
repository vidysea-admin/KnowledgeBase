import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ApprovalsPanel } from "./ApprovalsPanel.js";
import { RegistrationPolicyPanel } from "./RegistrationPolicyPanel.js";
import { JOIN_RULES_ENFORCED, pageCopy } from "./enforcement.js";
import { RuleSetEditor } from "./RuleSetEditor.js";
import { MESSAGES, classify, getJoinRules, looksStored, postPending, putRuleSet, type Problem } from "./joinRulesClient.js";
import {
  draftFromRuleSet, newRuleDraft, ruleSetFromDraft, validateRuleSetClient,
  type DraftSet, type JoinRulesView, type Pending, type RuleSet,
} from "./joinRulesModel.js";

type Phase = { name: "loading" } | { name: "ready" } | { name: "blocked"; text: string; retry: boolean; waitSeconds: number };

/** Longest Retry-After the page will honour as a delay (a hostile or buggy header must not disable the control for long). */
const MAX_RETRY_WAIT_SECONDS = 60;

/** Retry control. `waitSeconds` is the server's Retry-After used as a MINIMUM delay before the button works; never auto-retries. */
function RetryButton({ waitSeconds, onRetry }: { waitSeconds: number; onRetry: () => void }): React.ReactElement {
  const [waiting, setWaiting] = useState(waitSeconds > 0);
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const t = setTimeout(() => setWaiting(false), waitSeconds * 1000);
    return () => clearTimeout(t);
  }, [waitSeconds]);
  return <button type="button" disabled={waiting} onClick={onRetry}>Retry</button>;
}
/** `etag` is the validator the server sent with the rule set, kept exactly as received (quotes included); null when none was sent. */
interface Loaded { view: JoinRulesView; etag: string | null; draftJson: string }
type Notice = { kind: "error" | "ok"; text: string } | null;

/** Text for a failed READ (GET, also the fresh GET before a save). */
function readText(p: Problem): string {
  return p.failure === "unauthorized" ? MESSAGES.unauthorized : p.failure === "forbidden" ? MESSAGES.readForbidden : p.failure === "unavailable" ? MESSAGES.unavailable : p.failure === "busy" ? MESSAGES.busy : MESSAGES.loadFailed;
}

export function JoinRulesPage(): React.ReactElement {
  const copy = pageCopy(JOIN_RULES_ENFORCED);
  const { apiKey } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<DraftSet>({ ownDomains: "", rules: [] });
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [problems, setProblems] = useState<string[]>([]);
  /** True after a 412: someone else changed the rules since this editor loaded them. The draft is kept; nothing is retried. */
  const [stale, setStale] = useState(false);
  const nextKey = useRef(0);
  const keyRef = useRef(apiKey);
  keyRef.current = apiKey;

  /** Adopting the rule set also adopts its ETag. When the draft is kept (approvals changed only) the old ETag stays with the old rule set. */
  const adopt = useCallback((view: JoinRulesView, etag: string | null, resetDraft: boolean) => {
    const d = draftFromRuleSet(view.ruleSet);

    setLoaded(prev => resetDraft || !prev ? { view, etag, draftJson: JSON.stringify(d) } : { ...prev, view: { ...prev.view, state: view.state } });
    if (resetDraft) { nextKey.current = d.rules.length; setDraft(d); }
  }, []);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setPhase({ name: "loading" }); setNotice(null); setProblems([]); setStale(false); setReadOnly(false);
    try {
      const { view, etag } = await getJoinRules(apiKey);
      if (keyRef.current !== apiKey) return;
      adopt(view, etag, true); setPhase({ name: "ready" });
    } catch (e) {
      if (keyRef.current !== apiKey) return;
      const p = classify(e);
      setLoaded(null); setPhase({ name: "blocked", text: readText(p), retry: p.failure === "failed" || p.failure === "busy", waitSeconds: p.failure === "busy" ? Math.min(p.retryAfterSeconds ?? 0, MAX_RETRY_WAIT_SECONDS) : 0 });
    }
  }, [apiKey, adopt]);
  useEffect(() => { void load(); }, [load]);

  /** A stored rule set whose load carried no ETag: saving would have to be unconditional, so it is refused instead. */
  const saveUnavailable = loaded !== null && loaded.etag === null && looksStored(loaded.view);
  const dirty = loaded !== null && JSON.stringify(draft) !== loaded.draftJson;

  /** A failed WRITE: 403 means a key without the join-rules scope, so the page becomes read-only. */
  const writeProblem = (e: unknown) => {
    const p = classify(e);
    if (p.failure === "forbidden") { setReadOnly(true); setNotice({ kind: "error", text: MESSAGES.readOnly }); }
    else if (p.failure === "bad-request") setNotice({ kind: "error", text: `The server rejected this change: ${p.serverMessage}` });
    else if (p.status === 412) { setStale(true); setNotice(null); }
    else if (p.status === 428) setNotice({ kind: "error", text: MESSAGES.preconditionRequired });
    else if (p.failure === "unauthorized") setNotice({ kind: "error", text: MESSAGES.unauthorized });
    else if (p.failure === "unavailable") setNotice({ kind: "error", text: MESSAGES.unavailable });
    else if (p.failure === "busy") setNotice({ kind: "error", text: MESSAGES.busy });
    else setNotice({ kind: "error", text: `${MESSAGES.writeFailed} (${p.status === 0 ? "network error" : `HTTP ${p.status}`})` });
  };

  async function doPut(ruleSet: RuleSet, etag: string | null) {
    if (!apiKey) return;
    setBusy(true); setNotice(null); setStale(false);
    let putEtag: string | null;
    try {
      putEtag = await putRuleSet(apiKey, ruleSet, etag);
    } catch (e) { writeProblem(e); setBusy(false); return; }
    try {
      // Re-fetch to show the server's answer. The PUT response's ETag is the one adopted; only when it carried none is the re-fetched one used.
      const fresh = await getJoinRules(apiKey);
      adopt(fresh.view, putEtag ?? fresh.etag, true);
      setNotice({ kind: "ok", text: "Saved. The rules shown are the server's current answer." });
    } catch {
      setNotice({ kind: "error", text: "The rules were sent, but reloading the server's answer failed. What is shown may be out of date; reload the page before editing further." });
    }
    setBusy(false);
  }

  async function save() {
    if (!apiKey || !loaded || saveUnavailable) return;
    const ruleSet = ruleSetFromDraft(draft);
    const errors = validateRuleSetClient(ruleSet);
    setProblems(errors); setNotice(null);
    if (errors.length > 0) return;
    await doPut(ruleSet, loaded.etag);
  }

  /** The explicit way out of a 412: fetch the latest rules and ETag, discarding the unsaved edits. Never automatic. */
  async function reloadLatest() {
    if (!apiKey) return;
    setBusy(true); setNotice(null);
    try {
      const fresh = await getJoinRules(apiKey);
      adopt(fresh.view, fresh.etag, true); setStale(false); setProblems([]);
    } catch (e) { setNotice({ kind: "error", text: readText(classify(e)) }); }
    setBusy(false);
  }

  async function confirmPending(p: Pending) {
    if (!apiKey) return;
    setBusy(true); setNotice(null);
    try { await postPending(apiKey, p.kind, p.value, p.hints); }
    catch (e) { writeProblem(e); setBusy(false); return; }
    try {
      const fresh = await getJoinRules(apiKey);
      adopt(fresh.view, fresh.etag, !dirty);
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
    <div className="page-header"><h1>Join rules</h1><p>{copy.subtitle}</p></div>
    {apiKey && <RegistrationPolicyPanel apiKey={apiKey} />}
    {!apiKey ? <p className="card empty-note">Sign in with an API key to view join rules.</p>
      : phase.name === "loading" ? <p role="status">Loading join rules…</p>
      : phase.name === "blocked" ? <div className="card">
        <p role="alert" className="error-note">{phase.text}</p>
        {phase.retry && <RetryButton waitSeconds={phase.waitSeconds} onRetry={() => void load()} />}
      </div>
      : loaded && <>
        {readOnly && <p role="alert" className="card error-note">{MESSAGES.readOnly}</p>}
        {notice && <p role={notice.kind === "ok" ? "status" : "alert"} className={notice.kind === "ok" ? "card" : "card error-note"}>{notice.text}{notice.kind === "ok" && <span>{copy.noticeSuffix}</span>}</p>}
        <section className="card" aria-label="Rule set">
          <h2 className="section-title">Rules</h2>
          <RuleSetEditor state={loaded.view.state} draft={draft} disabled={readOnly || busy} onChange={next => { setDraft(next); setProblems([]); }} onAdd={addRule} />
          {problems.length > 0 && <ul role="alert" className="error-note" aria-label="Problems with the rules">{problems.map(m => <li key={m}>{m}</li>)}</ul>}
          {stale && <div role="alertdialog" aria-label="Rules changed on the server" className="card" style={{ borderLeft: "4px solid var(--warn)" }}>
            <p><strong>{MESSAGES.stale}</strong></p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" disabled={busy} onClick={() => void reloadLatest()}>Reload latest rules (discards my edits)</button>
              <button type="button" onClick={() => setStale(false)}>Keep editing</button>
            </div>
          </div>}
          {saveUnavailable && <p role="alert" className="error-note">{MESSAGES.noEtag}</p>}
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" disabled={readOnly || busy || !dirty || saveUnavailable} onClick={() => void save()}>Save rules</button>
            <span className="row-meta"> {dirty ? "You have unsaved changes. Saving replaces the rules only; approvals and opt-outs are kept." : "No unsaved changes."}</span>
          </div>
        </section>
        <section className="card" aria-label="Approvals and opt-outs">
          <h2 className="section-title">Approvals and opt-outs</h2>
          <p className="row-meta">{copy.approvalsNote}</p>
          {loaded.view.ruleSet.attendanceMode === "rules" && <p className="row-meta">Stored sender and domain approvals apply in legacy mode. Rules mode requires a matching allow rule. Meeting opt-outs apply in every mode.</p>}
          <ApprovalsPanel state={loaded.view.state} disabled={readOnly} busy={busy} onConfirm={p => void confirmPending(p)} />
        </section>
      </>}
  </>;
}
