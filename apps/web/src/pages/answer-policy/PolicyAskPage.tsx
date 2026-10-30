import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { WriteScope } from "../../auth/WriteScope.js";
import { ApiError } from "../../api/client.js";
import { useAskHandoff } from "../search/AskHandoff.js";
import { AnswerSources } from "./AnswerSources.js";
import { AiUsageSummary } from "../../components/AiUsageSummary.js";
import { normalizePolicyQuestion } from "./question.js";
import { answerHistory, answerSuggestions, directAnswer, askWithPolicy, listPolicies, reportAnswerConflict, saveAnswerFeedback,
  type AppliedAnswer, type HistoryItem, type SavedPolicy } from "./client.js";

function askErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sign in to ask a question.";
    if (error.status === 403) return "This API key needs ask access.";
    if (error.code === "policy_conflict") return "Resolve conflicting saved policies by editing or retiring them before asking.";
    if (error.code === "version_conflict") return "The saved policy changed. Reload policies and select its current revision.";
    if (["bad_request", "invalid_policy", "policy_cannot_override_evidence"].includes(error.code ?? "")) return "Check the question, source filters and saved policy. Citations cannot be relaxed.";
    if (["evidence_unavailable", "source_context_unavailable"].includes(error.code ?? "")) return "Bounded source evidence is unavailable. Check indexing and source access.";
    if (error.code === "stale_answer") return "Source evidence or policy changed. Ask again with current sources.";
    if (error.status === 404) return "The selected policy or knowledge source is unavailable. Check saved policies and indexing.";
    if (error.status === 502) return "The saved-answer response is unavailable. Check API integration.";
    if (error.status === 0) return "Unable to reach the knowledge API.";
  }
  return "Ask is unavailable. Try again.";
}

export function PolicyAskPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const [params] = useSearchParams();
  const authOwner = JSON.stringify([apiKey, sessionVersion]);
  const [viewKey, setViewKey] = useState(authOwner);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [policyValues, setPolicies] = useState<SavedPolicy[]>([]), [historyValues, setHistory] = useState<HistoryItem[]>([]), [suggestionValues, setSuggestions] = useState<string[]>([]);
  const policies = viewKey === authOwner ? policyValues : [], history = viewKey === authOwner ? historyValues : [], suggestions = viewKey === authOwner ? suggestionValues : [];
  const [policyId, setPolicyId] = useState(""), [questionClass, setClass] = useState("general"), [sessionIds, setSessionIds] = useState("");
  const [sources, setSources] = useState<"all" | "internal">("all"), [evidenceMode, setEvidenceMode] = useState(true);
  const [graphSelection, setGraphSelection] = useState<Pick<HistoryItem["filters"], "speakerRefs" | "topicRefs">>({});
  const [operationBusy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [policyError, setPolicyError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(""), [notice, setNotice] = useState<string | null>(null);
  const [conflictA, setConflictA] = useState(""), [conflictB, setConflictB] = useState(""), [conflictNote, setConflictNote] = useState("");
  const generation = useRef(0);
  const loadingGeneration = useRef(0), activeKey = useRef(authOwner); activeKey.current = authOwner;
  const selected = policies.find((p) => p.policyId === policyId);
  const contextKey = JSON.stringify([selected?.policyId, selected?.version, questionClass, sessionIds, sources, graphSelection]);
  const handoff = useAskHandoff<AppliedAnswer>({ contextKey, normalizeDraft: normalizePolicyQuestion, errorMessage: askErrorMessage, execute: (key, question) => {
    if (policyId && !selected) return Promise.reject(new ApiError(409, "Selected policy is retired or unavailable; select a current revision."));
    return askWithPolicy(key, { query: question, questionClass: selected?.questionClass ?? questionClass,
      ...(selected ? { policyId: selected.policyId, policyVersion: selected.version } : {}), evidenceMode,
      filters: { sessionIds: sessionIds.split(",").map((s) => s.trim()).filter(Boolean), sources, ...graphSelection } });
  } });
  const { query, setQuery, result, loading } = handoff;
  const busy = operationBusy || loading;
  const [pendingHistory, setPendingHistory] = useState<HistoryItem | null>(null);
  const activeOwner = useRef(""); const owner = JSON.stringify([authOwner, contextKey, query]); activeOwner.current = owner;
  useEffect(() => { generation.current++; setBusy(false); setError(null); return () => { generation.current++; }; }, [owner]);
  useEffect(() => {
    generation.current++; const token = ++loadingGeneration.current; setViewKey(authOwner); setLoadedOwner(null); setHistory([]); setPolicies([]); setSuggestions([]); setPolicyId(""); setClass("general"); setSessionIds(""); setSources("all"); setGraphSelection({}); setPendingHistory(null);
    setError(null); setPolicyError(null); setBusy(false); setFeedback(""); setNotice(null); setConflictA(""); setConflictB(""); setConflictNote("");
    Promise.allSettled([listPolicies(apiKey), answerHistory(apiKey), answerSuggestions(apiKey)]).then(([p, h, s]) => {
      if (token !== loadingGeneration.current || activeKey.current !== authOwner) return;
      if (p.status === "fulfilled") setPolicies(p.value.policies.filter((x) => !x.retired)); else setPolicyError(p.reason instanceof ApiError ? p.reason.message : "Saved policies unavailable.");
      if (h.status === "fulfilled") setHistory(h.value.history); else setError(h.reason instanceof ApiError ? h.reason.message : "History unavailable.");
      if (s.status === "fulfilled") setSuggestions(s.value.questions);
      setLoadedOwner(authOwner);
    });
    return () => { generation.current++; loadingGeneration.current++; };
  }, [apiKey, authOwner]);
  function setResult(reply: AppliedAnswer | null): void { if (reply) handoff.restore(query, reply); else handoff.setQuery(query); }
  const requestedRun = params.get("run");
  useEffect(() => {
    if (!apiKey || !requestedRun || loadedOwner !== authOwner) return;
    let cancelled = false;
    const startedOwner = activeOwner.current;
    directAnswer(apiKey, requestedRun).then(item => {
      if (cancelled || activeKey.current !== authOwner || activeOwner.current !== startedOwner) return;
      selectHistory(item);
    }).catch((e: unknown) => {
      if (!cancelled && activeKey.current === authOwner && activeOwner.current === startedOwner)
        setError(e instanceof ApiError ? e.message : "Saved answer unavailable. Return to history or ask a new question.");
    });
    return () => { cancelled = true; };
  }, [requestedRun, apiKey, authOwner, loadedOwner]);
  function selectHistory(item: HistoryItem): void {
    setClass(item.questionClass); setPolicyId(item.result.policy?.policyId ?? ""); setSessionIds(item.filters.sessionIds.join(",")); setSources(item.filters.sources); setEvidenceMode(item.evidenceMode);
    setGraphSelection({ ...(item.filters.speakerRefs !== undefined ? { speakerRefs: item.filters.speakerRefs } : {}), ...(item.filters.topicRefs !== undefined ? { topicRefs: item.filters.topicRefs } : {}) }); setPendingHistory(item);
  }
  useEffect(() => { if (pendingHistory && viewKey === authOwner) { handoff.restore(pendingHistory.query, pendingHistory.result); setPendingHistory(null); } }, [pendingHistory, contextKey, viewKey, authOwner]);
  useEffect(() => {
    if (!result) return; const token = ++loadingGeneration.current;
    setFeedback(""); setNotice(null); setConflictA(""); setConflictB(""); setConflictNote("");
    answerHistory(apiKey).then((h) => { if (token === loadingGeneration.current && activeKey.current === authOwner) setHistory(h.history); })
      .catch((e: unknown) => { if (token === loadingGeneration.current) setError(e instanceof ApiError ? e.message : "History unavailable."); });
  }, [result?.runId, apiKey, authOwner]);
  function display(reply: AppliedAnswer): void { setResult(reply); setFeedback(""); setNotice(null); setConflictA(""); setConflictB(""); setConflictNote(""); }
  async function perform(work: (token: number) => Promise<void>): Promise<void> {
    if (busy) return; const token = ++generation.current; setBusy(true); setError(null); setNotice(null);
    try { await work(token); } catch (e) { if (token === generation.current && activeOwner.current === owner) setError(e instanceof ApiError ? e.message : "Ask operation failed."); }
    finally { if (token === generation.current) setBusy(false); }
  }
  if (viewKey !== authOwner) return <div className="page-header"><h1>Ask</h1><p>Loading this sign-in session…</p></div>;
  return <><div className="page-header"><h1>Ask</h1><p>Ask from cited internal knowledge, with separately attributed web fallback when permitted.</p>
    <Link to="/answer-policy">Manage answer policies</Link>{" · "}<Link to="/answer-review">Review candidate answers and evidence conflicts</Link></div>
    <form className="card" onSubmit={handoff.handleSubmit}>
      <label htmlFor="policy-ask-query">Question</label><input id="policy-ask-query" value={query} maxLength={4000} style={{ width: "100%" }} onChange={(e) => setQuery(e.target.value)} />
      <label htmlFor="ask-saved-policy">Saved policy</label><select id="ask-saved-policy" disabled={busy} value={policyId} onChange={(e) => { generation.current++; setPolicyId(e.target.value); setResult(null); }}>
        <option value="">Match by question class, or conservative default</option>{policies.map((p) => <option key={p.policyId} value={p.policyId}>{p.policyId} v{p.version} ({p.questionClass})</option>)}
      </select>{policyError && <p>{policyError}</p>}
      {policyId && !selected && <p role="alert">The selected saved policy is no longer active. Select a current revision or explicitly choose the conservative default.</p>}
      <label htmlFor="ask-question-class">Question class</label><input id="ask-question-class" value={selected?.questionClass ?? questionClass} disabled={busy || !!selected} maxLength={80} onChange={(e) => { generation.current++; setClass(e.target.value); setResult(null); }} />
      <label htmlFor="ask-source-filter">Source filter</label><select id="ask-source-filter" value={sources} disabled={busy} onChange={(e) => { generation.current++; setSources(e.target.value as "all" | "internal"); setResult(null); }}>
        <option value="all">Internal and policy-permitted web</option><option value="internal">Internal only</option></select>
      <label htmlFor="ask-session-filter">Limit to session IDs (comma-separated)</label><input id="ask-session-filter" value={sessionIds} disabled={busy} onChange={(e) => { generation.current++; setSessionIds(e.target.value); setResult(null); }} />
      <label><input type="checkbox" checked={evidenceMode} onChange={(e) => setEvidenceMode(e.target.checked)} /> Show original evidence excerpts and moments</label>
      <p>Filters constrain retrieved context. Original citations remain required with either evidence display setting.</p>
      {(graphSelection.speakerRefs !== undefined || graphSelection.topicRefs !== undefined) && <p>Saved graph filters retained: speakers {graphSelection.speakerRefs?.join(", ") || "none"}; topics {graphSelection.topicRefs?.join(", ") || "none"}. <button type="button" disabled={busy} onClick={() => { setGraphSelection({}); setResult(null); }}>Clear saved graph filters</button></p>}
      <button disabled={busy || !query.trim() || (!!policyId && !selected)}>{busy ? "Working…" : "Ask"}</button>
    </form>
    <section className="card"><h2>Suggested questions</h2><p>{suggestions.length ? "From your tenant's saved question history." : "Example prompts; they do not assert corpus coverage."}</p>
      {(suggestions.length ? suggestions : ["Which cited sources discuss career options?", "What limitations do the sources describe?"]).map((q) => <button key={q} disabled={busy} onClick={() => setQuery(q)}>{q}</button>)}</section>
    {(error || handoff.error) && <div className="card" role="alert">{error ?? handoff.error}</div>}{notice && <p role="status">{notice}</p>}
    {result && <><section className="card" role="status"><h2>Answer status: {result.state}</h2>
      <p>{result.policy ? `Applied ${result.policy.policyId} v${result.policy.version}: ${result.policy.mode}, ${result.policy.style}, ${result.policy.onInsufficient}.` : "No matching saved policy; conservative citations-required default."}</p>
      <p>Retrieval verdict: {result.verdict}. Coverage: {result.insufficient_coverage ? "insufficient" : "supported by retrieved context"}.</p>
      <p>Retrieval confidence: {result.confidence.score === null ? "unavailable" : result.confidence.score.toFixed(3)} ({result.confidence.basis}; uncalibrated, not factual certainty).</p>
      <p>{result.web_used ? "Web fallback used." : result.auditLog.some((a) => a.step.startsWith("web_fallback_unavailable")) ? "Web fallback unavailable." : "Web fallback not used."}</p>
      <AiUsageSummary entries={result.auditLog} />
      {result.answer ? <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p> : <p>Candidate withheld: {result.state}. Authorized review or a new query with supported evidence is required.</p>}
    </section><AnswerSources answer={result} excerpts={evidenceMode} />
      <section className="card"><h2>Follow-up questions</h2>{result.followUps.map((q) => <button key={q} disabled={busy} onClick={() => setQuery(q)}>{q}</button>)}</section>
      <WriteScope><section className="card"><h2>Feedback for this answer</h2><label htmlFor="answer-feedback">Feedback note</label><input id="answer-feedback" maxLength={500} value={feedback} disabled={busy} onChange={(e) => setFeedback(e.target.value)} />
        {(["helpful", "unhelpful"] as const).map((rating) => <button key={rating} disabled={busy || !feedback.trim()} onClick={() => { const current = result; void perform(async (token) => { await saveAnswerFeedback(apiKey, current.runId, rating, feedback); if (token === generation.current) setNotice("Feedback saved for this answer revision."); }); }}>{rating}</button>)}
      </section></WriteScope>
      <WriteScope><section className="card"><h2>Report conflicting evidence</h2><p>Select two cited sources with opposing statements. Reporting withholds this answer until a reviewed resolution produces a new answer.</p>
        <label htmlFor="evidence-conflict-a">First source</label><select id="evidence-conflict-a" value={conflictA} disabled={busy} onChange={(e) => setConflictA(e.target.value)}><option value="">Select source</option>{result.sourceEvidence.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
        <label htmlFor="evidence-conflict-b">Opposing source</label><select id="evidence-conflict-b" value={conflictB} disabled={busy} onChange={(e) => setConflictB(e.target.value)}><option value="">Select source</option>{result.sourceEvidence.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
        <label htmlFor="evidence-conflict-note">Explain the contradiction</label><input id="evidence-conflict-note" maxLength={500} value={conflictNote} disabled={busy} onChange={(e) => setConflictNote(e.target.value)} />
        <button disabled={busy || !conflictA || !conflictB || conflictA === conflictB || !conflictNote.trim()} onClick={() => { const current = result; void perform(async (token) => {
          await reportAnswerConflict(apiKey, current.runId, conflictA, conflictB, conflictNote); const h = await answerHistory(apiKey);
          if (token === generation.current) { setHistory(h.history); display(h.history.find((i) => i.id === current.runId)?.result ?? { ...current, answer: "", state: "conflicted" }); setNotice("Evidence conflict recorded; candidate withheld."); }
        }); }}>Report evidence conflict</button>
      </section></WriteScope></>}
    <section className="card"><h2>Saved question history</h2><p>The 100 most recent saved answers for this tenant.</p>{!history.length && <p>No saved answers for this tenant.</p>}
      <ul>{history.map((item) => <li key={item.id}><button disabled={operationBusy} onClick={() => selectHistory(item)}>{item.query}</button> · {item.createdAt} · {item.result.state}</li>)}</ul>
    </section>
  </>;
}
