import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { createChampionship, loadChampionship, freezeChampionshipBank, importChampionshipTrial, startChampionshipTrial, scoreChampionshipTrial, type ChampionshipView } from "./client.js";
import { ChampionshipPlanForm } from "./ChampionshipPlanForm.js";

export function ChampionshipPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const epoch = useRef(0), lock = useRef(false);
  const owner = useRef<{ key: string; version: number } | null>(null);
  const inputOwner = useRef({ key: apiKey, version: sessionVersion });
  const [view, setView] = useState<ChampionshipView | null>(null), [eventId, setEventId] = useState("");
  const [questionId, setQuestionId] = useState(""), [counsellorId, setCounsellorId] = useState("");
  const [recoveryRunId, setRecoveryRunId] = useState("");
  const [trial, setTrial] = useState<{ evalRunId: string; aiAnswer: { text: string; sources?: unknown }; questionId: string; counsellorId: string; eventId: string; scoreSaved?: boolean } | null>(null);
  const [answer, setAnswer] = useState(""), [aiScore, setAiScore] = useState(""), [humanScore, setHumanScore] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = owner.current?.key === apiKey && owner.current?.version === sessionVersion ? view : null;
  const sameInputSession = inputOwner.current.key === apiKey && inputOwner.current.version === sessionVersion;
  useEffect(() => { epoch.current++; lock.current = false; setView(null); setEventId(""); setTrial(null);
    inputOwner.current = { key: apiKey, version: sessionVersion };
    setQuestionId(""); setCounsellorId(""); setRecoveryRunId(""); setAnswer(""); setAiScore(""); setHumanScore(""); setError(""); setBusy(false);
    return () => { epoch.current++; }; }, [apiKey, sessionVersion]);
  async function perform(work: (generation: number) => Promise<void>) {
    if (!apiKey || lock.current) return;
    const generation = ++epoch.current; lock.current = true; setBusy(true); setError("");
    try { await work(generation); } catch (e) { if (generation === epoch.current) setError(e instanceof Error ? e.message : "Operation failed"); }
    finally { if (generation === epoch.current) { lock.current = false; setBusy(false); } }
  }
  function accept(next: ChampionshipView, generation: number) {
    if (generation !== epoch.current) return; setView(next); setEventId(next.event._id);
    owner.current = { key: apiKey!, version: sessionVersion };
    setTrial(previous => previous?.eventId === next.event._id && !next.report.trials.some(row => row && typeof row === "object" && (row as {evalRunId?: unknown}).evalRunId === previous.evalRunId) ? previous : null);
    setQuestionId(previous => next.event.questions.some(q => q.id === previous) ? previous : next.event.questions[0]?.id ?? "");
    setCounsellorId(previous => next.event.counsellors.some(c => c.id === previous) ? previous : next.event.counsellors[0]?.id ?? "");
  }
  async function start(generation: number) {
    if (!active?.event.frozenAt) throw new Error("Freeze the exact bank first");
    const q = active.event.questions.find(x => x.id === questionId), c = active.event.counsellors.find(x => x.id === counsellorId);
    if (!q || !c) throw new Error("Select a scheduled question and counsellor");
    const result = await startChampionshipTrial(apiKey!, q.text, c.name);
    if (generation === epoch.current) { setTrial({ ...result, questionId: q.id, counsellorId: c.id, eventId: active.event._id }); setAnswer(""); setAiScore(""); setHumanScore(""); }
  }
  async function save(generation: number) {
    if (!trial || !active) return;
    if (trial.eventId !== active.event._id) throw new Error("Reload the event that owns this retained trial");
    if (!trial.scoreSaved) {
      const ai = Number(aiScore), human = Number(humanScore);
      if (!answer.trim() || !aiScore.trim() || !humanScore.trim() || !Number.isFinite(ai) || !Number.isFinite(human) || ai < 1 || ai > 5 || human < 1 || human > 5) throw new Error("Supply the original human answer and scores from 1 to 5");
      await scoreChampionshipTrial(apiKey!, trial.evalRunId, answer, ai, human);
      if (generation !== epoch.current) return;
      setTrial(previous => previous?.evalRunId === trial.evalRunId ? { ...previous, scoreSaved: true } : previous);
    }
    // Score persistence and evidence import are separate; a CAS conflict leaves the run ID visible for retry.
    const result = await importChampionshipTrial(apiKey!, active.event, trial.questionId, trial.counsellorId, trial.evalRunId);
    accept(result, generation); if (generation === epoch.current) setTrial(null);
  }
  return <main><h1>Championship preparation</h1><p>Use the existing Compete workflow to retain matched internal evidence. A real public championship still requires Umesh's roster, independent panel, reviewed bank and real event proof.</p>
    <label>Event ID <input aria-label="Event ID" value={sameInputSession ? eventId : ""} onChange={e => { setEventId(e.target.value); setView(null); }} disabled={busy} /></label>
    <button disabled={!apiKey || busy || !eventId} onClick={() => void perform(async g => { accept(await loadChampionship(apiKey!, eventId), g); })}>Reload event</button>
    <details><summary>Create an event plan</summary>{sameInputSession && <ChampionshipPlanForm key={sessionVersion} disabled={!apiKey || busy}
      onSubmit={plan => void perform(async g => { accept(await createChampionship(apiKey!, plan), g); if (g === epoch.current) setTrial(null); })} />}</details>
    {sameInputSession && error && <p role="alert">{error}</p>}
    {active && <section><h2>Internal evidence</h2><p>Bank SHA256: <code>{active.event.bankDigest}</code></p>
      <p>{active.report.notice}</p><p>{active.report.status}: {active.report.recordedPairs} of {active.report.plannedPairs} scheduled pairs recorded.</p>
      <button disabled={busy || !!active.event.frozenAt} onClick={() => void perform(async g => accept(await freezeChampionshipBank(apiKey!, active.event), g))}>Freeze this exact question bank</button>
      <label>Question <select value={questionId} disabled={busy || !!trial} onChange={e => setQuestionId(e.target.value)}>{active.event.questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}</select></label>
      <label>Counsellor <select value={counsellorId} disabled={busy || !!trial} onChange={e => setCounsellorId(e.target.value)}>{active.event.counsellors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button disabled={busy || !active.event.frozenAt || !!trial} onClick={() => void perform(start)}>Start matched Compete trial</button>
      <p>After a browser restart or uncertain import receipt, reload the event and use the retained evaluation ID to attach its existing score without rewriting it.</p>
      <label>Existing scored Compete evaluation ID <input value={recoveryRunId} disabled={busy} onChange={e => setRecoveryRunId(e.target.value)} /></label>
      <button disabled={busy || !active.event.frozenAt || !recoveryRunId.trim()} onClick={() => void perform(async g => {
        const result = await importChampionshipTrial(apiKey!, active.event, questionId, counsellorId, recoveryRunId);
        accept(result, g); if (g === epoch.current) setRecoveryRunId("");
      })}>Retain existing scored trial</button>
      {trial && <section><p>Retained evaluation ID: <code>{trial.evalRunId}</code>. If import fails after scoring, retry retains its existing original score. After restart, use the recovery field.</p><h3>AI response</h3><p>{trial.aiAnswer.text}</p><pre>{JSON.stringify(trial.aiAnswer.sources, null, 2)}</pre>
        <label>Original counsellor answer <textarea value={answer} disabled={busy || trial.scoreSaved} onChange={e => setAnswer(e.target.value)} /></label>
        <label>AI score <input type="number" min={1} max={5} value={aiScore} disabled={busy || trial.scoreSaved} onChange={e => setAiScore(e.target.value)} /></label>
        <label>Counsellor score <input type="number" min={1} max={5} value={humanScore} disabled={busy || trial.scoreSaved} onChange={e => setHumanScore(e.target.value)} /></label>
        <button disabled={busy} onClick={() => void perform(save)}>Save internal score and retain trial</button></section>}
      <h3>Remaining real championship gates</h3><ul>{active.report.unresolvedGates.map(g => <li key={g}>{g}</li>)}</ul>
      <details><summary>Retained report and answer evidence</summary><pre>{JSON.stringify(active.report, null, 2)}</pre></details></section>}
  </main>;
}
