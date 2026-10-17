import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ask } from "../../api/ask.js";
import { ApiError } from "../../api/client.js";
import type { AskResponse } from "../../api/types.js";
import { safeHttpUrl } from "../../safe-url.js";
import { Avatar } from "./Avatar.js";
import { BrowserVoice, type VoiceState } from "./voice.js";
import { coverageNote, sessionRef, sourceQuotes, spokenAnswer } from "./provenance.js";

type ConversationSession = { owner: string; language: string };

export function CounsellorPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  const identity = `${sessionVersion}:${apiKey ?? ""}`;
  const owner = useRef(identity); owner.current = identity;
  const generation = useRef(0);
  const voice = useRef<BrowserVoice | null>(null);
  const conversationSession = useRef<ConversationSession | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [conversation, setConversation] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ owner: string; value: AskResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewOwner, setViewOwner] = useState(identity);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const sentOwner = identity;
    const adapter = new BrowserVoice((state, detail) => {
      if (!mounted.current || owner.current !== sentOwner) return;
      setVoiceState(state); if (detail) setError(detail);
      if (state === "error") { conversationSession.current = null; setConversation(false); }
    });
    voice.current = adapter;
    setViewOwner(sentOwner);
    setQuestion(""); setResult(null); setPending(false); setError(null); setVoiceState("idle"); setConversation(false);
    return () => { mounted.current = false; generation.current++; conversationSession.current = null; adapter.stop(); voice.current = null; };
  }, [identity]);
  function stop(): void {
    generation.current++; conversationSession.current = null; voice.current?.stop(); setPending(false); setConversation(false);
  }
  async function submit(text: string, readback = false, session?: ConversationSession): Promise<void> {
    const query = text.trim();
    if (!query || !apiKey || pending) return;
    if (!session) conversationSession.current = null;
    voice.current?.stop();
    const sentOwner = identity;
    const sentGeneration = ++generation.current;
    setQuestion(query); setPending(true); setResult(null); setError(null);
    const current = (): boolean => mounted.current && owner.current === sentOwner && generation.current === sentGeneration;
    try {
      const response = await ask(apiKey, query);
      if (!current()) return;
      setResult({ owner: sentOwner, value: response }); setPending(false);
      if (readback) voice.current?.speak(spokenAnswer(response), language, session ? () => {
        if (current() && conversationSession.current === session) listen(session);
      } : undefined);
    } catch (failure) {
      if (!current()) return;
      conversationSession.current = null; setConversation(false); setPending(false); setVoiceState("error");
      setError(failure instanceof ApiError ? failure.message : "The knowledge service could not answer. Try again.");
    }
  }
  function listen(existingSession?: ConversationSession): void {
    if (!apiKey || (!existingSession && pending)) return;
    if (existingSession && (conversationSession.current !== existingSession || existingSession.owner !== owner.current)) return;
    const session = existingSession ?? (conversation ? { owner: identity, language } : undefined);
    conversationSession.current = session ?? null;
    setError(null); setResult(null);
    const sentOwner = identity;
    const sentGeneration = ++generation.current;
    voice.current?.listen((text) => {
      if (!mounted.current || owner.current !== sentOwner || generation.current !== sentGeneration) return;
      setQuestion(text);
      if (session && conversationSession.current === session) void submit(text, true, session);
    }, session?.language ?? language);
  }
  const answer = result?.owner === identity ? result.value : null;
  const ownsView = viewOwner === identity;
  return <>
    <div className="page-header"><h1>AI counsellor</h1><p>Ask the knowledge base by voice or text. Check the cited sources before making a decision.</p></div>
    <section className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem" }}>
      <Avatar state={!ownsView ? "idle" : pending ? "thinking" : voiceState} />
      <div>
        {!apiKey && <p role="alert">Connect your API key to ask the counsellor.</p>}
        <p>Microphone recognition is provided by your browser and may send audio to its speech service. Press the microphone only when you are ready. Spoken output uses the browser's available voices.</p>
        <label htmlFor="counsellor-language">Voice language</label>{" "}
        <select id="counsellor-language" value={language} onChange={(event) => { stop(); setLanguage(event.target.value); }}>
          <option value="en-IN">English (India)</option><option value="en-US">English (US)</option><option value="hi-IN">Hindi (India)</option>
        </select>
        <p><label><input type="checkbox" checked={conversation} onChange={(event) => { stop(); setConversation(event.target.checked); }} /> Voice conversation: send each spoken question and read its answer automatically</label></p>
        <button type="button" disabled={!apiKey || pending || voiceState === "listening"} onClick={() => listen()}>{conversation ? "Ask by voice" : "Dictate question"}</button>{" "}
        <button type="button" onClick={stop}>Stop voice and cancel answer</button>
        <form onSubmit={(event) => { event.preventDefault(); void submit(question, conversation); }}>
          <p><label htmlFor="counsellor-question">Your question</label></p>
          <textarea id="counsellor-question" value={ownsView ? question : ""} disabled={!apiKey || pending} onChange={(event) => setQuestion(event.target.value)} rows={4} style={{ width: "100%", font: "inherit" }} />
          <button type="submit" disabled={!apiKey || pending || !question.trim()}>{pending ? "Finding an answer…" : "Ask counsellor"}</button>
        </form>
        <p>Dictation lets you edit the transcript before sending. In conversation mode, press Ask by voice once; listening resumes after each spoken answer finishes. Stop ends the conversation and ignores any pending answer.</p>
      </div>
    </section>
    {ownsView && error && <div className="card error-note" role="alert">{error}</div>}
    {answer && <>
      <section className="card"><h2>Answer</h2><p style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</p>
        {coverageNote(answer) && <p role="status">{coverageNote(answer)}</p>}
        <p>Coverage verdict: {answer.verdict}{answer.reason ? ` — ${answer.reason}` : ""}</p>
        <button type="button" onClick={() => { stop(); setError(null); voice.current?.speak(spokenAnswer(answer), language); }}>Read answer aloud</button>
      </section>
      <section className="card"><h2>Internal sources ({answer.sources.internal.length})</h2>
        {!answer.sources.internal.length && <p>No internal sources returned.</p>}
        <ul>{answer.sources.internal.map((source, index) => {
          const session = sessionRef(source), quotes = sourceQuotes(source);
          return <li key={`${source.node_id}-${index}`}>
            {session ? <Link to={`/sessions/${encodeURIComponent(session)}`}>{source.node_id}</Link> : <span>{source.node_id} — session provenance unavailable</span>}
            {quotes.map((quote, quoteIndex) => <div key={`${quote.id}-${quoteIndex}`}>
              {session ? <Link to={`/sessions/${encodeURIComponent(session)}#turn-${encodeURIComponent(quote.turnId)}`}>{quote.speakerRef} · {quote.tStart}–{quote.tEnd}s</Link>
                : <span>{quote.speakerRef} · {quote.tStart}–{quote.tEnd}s</span>}
              <blockquote>{quote.quote}</blockquote><small>Source label: {quote.speakerRef}; {quote.origin}. Speaker identity is not independently verified.</small>
            </div>)}
            {!quotes.length && <p>Speaker, timestamp and quoted evidence were not returned for this source.</p>}
          </li>;
        })}</ul>
      </section>
      <section className="card"><h2>Web sources ({answer.sources.web.length})</h2>
        {!answer.sources.web.length && <p>No web sources returned.</p>}
        <ul>{answer.sources.web.map((source, index) => { const url = safeHttpUrl(source.url); const title = typeof source.title === "string" ? source.title : url ?? "Web source";
          return <li key={index}>{url ? <a href={url} target="_blank" rel="noreferrer">{title}</a> : <span>{title} — link unavailable</span>}</li>;
        })}</ul>
      </section>
    </>}
  </>;
}
