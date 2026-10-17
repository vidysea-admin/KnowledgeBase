import { useState } from "react";

interface DraftQuestion { id: string; text: string; source: { kind: string; reference: string }; }
interface DraftPerson { id: string; name: string; evidenceReference: string; }
export function ChampionshipPlanForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (plan: unknown) => void }): React.ReactElement {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ id: "q1", text: "", source: { kind: "toc", reference: "" } }]);
  const [counsellors, setCounsellors] = useState<DraftPerson[]>([{ id: "c1", name: "", evidenceReference: "" }]);
  const [judges, setJudges] = useState<DraftPerson[]>([]);
  const [rubricVersion, setRubricVersion] = useState("draft"), [rubricReference, setRubricReference] = useState("");
  const [reviewReference, setReviewReference] = useState("");
  function updatePerson(items: DraftPerson[], index: number, field: "name" | "evidenceReference", value: string) {
    return items.map((person, i) => i === index ? { ...person, [field]: value } : person);
  }
  return <form onSubmit={e => { e.preventDefault(); if (!disabled) onSubmit({ title, questions, counsellors, judges,
    rubric: { version: rubricVersion, reference: rubricReference }, reviewReference }); }}>
    <p>Prepare source-cited questions and a proposed roster. References remain unverified assertions. Do not include student identifiers. Enter an explicit pending reference when approval evidence is unavailable.</p>
    <label>Event title <input required value={title} disabled={disabled} onChange={e => setTitle(e.target.value)} /></label>
    <h3>Source-cited question bank</h3>
    {questions.map((q, i) => <fieldset key={q.id} disabled={disabled}><legend>Question {i + 1}</legend>
      <label>Question text {i + 1}<textarea required value={q.text} onChange={e => setQuestions(items => items.map((x, n) => n === i ? { ...x, text: e.target.value } : x))} /></label>
      <label>Question source {i + 1}<select value={q.source.kind} onChange={e => setQuestions(items => items.map((x, n) => n === i ? { ...x, source: { ...x.source, kind: e.target.value } } : x))}>
        <option value="toc">TOC/webinar Q&amp;A</option><option value="pathlynks">Anonymised Pathlynks question</option><option value="counsellor">Counsellor-submitted question</option></select></label>
      <label>Source evidence reference {i + 1}<input required value={q.source.reference} onChange={e => setQuestions(items => items.map((x, n) => n === i ? { ...x, source: { ...x.source, reference: e.target.value } } : x))} /></label>
    </fieldset>)}
    <button type="button" disabled={disabled || questions.length >= 1000} onClick={() => setQuestions(items => [...items, { id: `q${items.length + 1}`, text: "", source: { kind: "toc", reference: "" } }])}>Add question</button>
    <h3>Proposed counsellors</h3>
    {counsellors.map((c, i) => <fieldset key={c.id} disabled={disabled}><legend>Counsellor {i + 1}</legend>
      <label>Counsellor name {i + 1}<input required value={c.name} onChange={e => setCounsellors(items => updatePerson(items, i, "name", e.target.value))} /></label>
      <label>Participation evidence reference {i + 1}<input required value={c.evidenceReference} onChange={e => setCounsellors(items => updatePerson(items, i, "evidenceReference", e.target.value))} /></label>
    </fieldset>)}
    <button type="button" disabled={disabled || counsellors.length >= 100} onClick={() => setCounsellors(items => [...items, { id: `c${items.length + 1}`, name: "", evidenceReference: "" }])}>Add counsellor</button>
    <h3>Proposed judges</h3><p>Adding a name does not establish independent judging or approve Q3.</p>
    {judges.map((j, i) => <fieldset key={j.id} disabled={disabled}><legend>Judge {i + 1}</legend>
      <label>Judge name {i + 1}<input required value={j.name} onChange={e => setJudges(items => updatePerson(items, i, "name", e.target.value))} /></label>
      <label>Judge evidence reference {i + 1}<input required value={j.evidenceReference} onChange={e => setJudges(items => updatePerson(items, i, "evidenceReference", e.target.value))} /></label>
    </fieldset>)}
    <button type="button" disabled={disabled || judges.length >= 100} onClick={() => setJudges(items => [...items, { id: `j${items.length + 1}`, name: "", evidenceReference: "" }])}>Add proposed judge</button>
    <label>Rubric version <input required value={rubricVersion} disabled={disabled} onChange={e => setRubricVersion(e.target.value)} /></label>
    <label>Panel rubric reference <input required value={rubricReference} disabled={disabled} onChange={e => setRubricReference(e.target.value)} /></label>
    <label>Human bank-review evidence reference <input required value={reviewReference} disabled={disabled} onChange={e => setReviewReference(e.target.value)} /></label>
    <button disabled={disabled} type="submit">Save proposed event plan</button>
  </form>;
}
