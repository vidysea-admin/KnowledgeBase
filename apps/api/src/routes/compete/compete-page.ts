/**
 * apps/api/src/routes/compete-page.ts — T-012 C4. `GET /compete`, a single plain HTML + vanilla
 * JS page (no new frontend framework/dependency, per the contract: "dont take it too much").
 * Served inline (no static-file dir needed for one page) alongside `compete.ts`'s two POST
 * routes in the same T-009 Express app. The page asks for an API key once (stored in
 * localStorage only, never sent anywhere but this tenant's own `Authorization` header) because
 * `server.ts` requires auth on every route including this one — no special-cased public page.
 */
import { Router, type Request, type Response } from "express";

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vidysea Living Knowledge Base — Compete</title>
<style>
  :root {
    --ink: #14181f; --muted: #5b6472; --line: #e4e7ec; --bg: #f7f8fa; --card: #ffffff;
    --accent: #2554ff; --accent-ink: #ffffff; --good: #0b8a5c; --good-bg: #e8f7f0;
    --warn: #b7791f; --warn-bg: #fdf3df; --bad: #c0362c; --bad-bg: #fbe9e7;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--ink); margin: 0; padding: 2.5rem 1.25rem 4rem;
  }
  .shell { max-width: 760px; margin: 0 auto; }
  header { margin-bottom: 1.75rem; }
  header .eyebrow { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  header h1 { margin: 0.2rem 0 0.35rem; font-size: 1.7rem; }
  header p { margin: 0; color: var(--muted); font-size: 0.92rem; line-height: 1.5; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 1.5rem; box-shadow: 0 1px 2px rgba(20,24,31,0.03); }
  .card + .card { margin-top: 1.25rem; }
  label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--ink); margin-top: 1rem; }
  label:first-of-type { margin-top: 0; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 0.6rem 0.7rem; margin-top: 0.35rem;
    border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 0.92rem; background: #fff; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  textarea { resize: vertical; }
  button { margin-top: 1.1rem; padding: 0.6rem 1.2rem; border: none; border-radius: 8px;
    background: var(--accent); color: var(--accent-ink); font-weight: 600; font-size: 0.9rem; cursor: pointer; }
  button:hover { filter: brightness(1.06); }
  button:disabled { opacity: 0.55; cursor: default; }
  button.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
  #status { margin-top: 0.6rem; font-size: 0.85rem; color: var(--bad); min-height: 1.1em; }
  #status.ok { color: var(--good); }
  #result, #scoreForm { display: none; margin-top: 1.25rem; }
  .verdict-badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .verdict-correct { background: var(--good-bg); color: var(--good); }
  .verdict-ambiguous { background: var(--warn-bg); color: var(--warn); }
  .verdict-incorrect { background: var(--bad-bg); color: var(--bad); }
  .section-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin: 1.1rem 0 0.5rem; }
  .section-title:first-child { margin-top: 0; }
  .answer-text { font-size: 1.02rem; line-height: 1.6; margin: 0.3rem 0 0; }
  .source-card { border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem 0.9rem; margin-top: 0.55rem; background: #fbfbfc; }
  .source-card .source-title { font-weight: 600; font-size: 0.9rem; }
  .source-card .source-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.15rem; }
  .source-card .source-reason { font-size: 0.85rem; color: var(--ink); margin-top: 0.4rem; line-height: 1.4; }
  .score-pill { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--good-bg); color: var(--good); margin-left: 0.4rem; }
  .empty-note { color: var(--muted); font-size: 0.88rem; font-style: italic; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
  .footer-note { margin-top: 1.5rem; font-size: 0.78rem; color: var(--muted); text-align: center; }
  code.inline { background: #eef0f4; padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
</style>
</head>
<body>
<div class="shell">
  <header>
    <div class="eyebrow">Vidysea &middot; Living Knowledge Base</div>
    <h1>Ask &amp; Compete</h1>
    <p>Ask the AI counsellor a real question against the ingested knowledge base. Every answer is
    grounded in cited internal sessions (or falls back to the web, kept clearly separate) — nothing
    is answered without a traceable source.</p>
  </header>

  <div class="card">
    <label>API key<input id="apiKey" type="password" placeholder="paste your API key" /></label>
    <div class="grid-2">
      <label>Counsellor name<input id="counsellorName" placeholder="e.g. Umesh" /></label>
      <label>Org (optional)<input id="counsellorOrg" placeholder="e.g. Vidysea" /></label>
    </div>
    <label>Question<textarea id="question" rows="3" placeholder="e.g. What did students learn about NZ post-study work visas?"></textarea></label>
    <button id="startBtn">Ask</button>
    <div id="status"></div>
  </div>

  <div class="card" id="result">
    <span id="verdictBadge" class="verdict-badge"></span>
    <div class="section-title">AI answer</div>
    <p class="answer-text" id="aiAnswerText"></p>
    <div class="section-title">Cited sources</div>
    <div id="aiSources"></div>
  </div>

  <div class="card" id="scoreForm">
    <div class="section-title">Score this answer</div>
    <label>Counsellor's own answer<textarea id="counsellorAnswer" rows="3"></textarea></label>
    <div class="grid-2">
      <label>AI score (1-5)<input id="aiScore" type="number" min="1" max="5" /></label>
      <label>Counsellor score (1-5)<input id="counsellorScore" type="number" min="1" max="5" /></label>
    </div>
    <label>Notes (optional)<input id="notes" /></label>
    <button id="saveBtn" class="secondary">Save score</button>
  </div>

  <div class="footer-note">Internal preview build &middot; running against the real seeded TOC knowledge base</div>
</div>

<script>
  let evalRunId = null;

  function key() {
    const stored = localStorage.getItem("competeApiKey");
    const input = document.getElementById("apiKey");
    if (input.value) { localStorage.setItem("competeApiKey", input.value); return input.value; }
    if (stored) { input.value = stored; return stored; }
    return "";
  }

  function setStatus(msg, ok) {
    const el = document.getElementById("status");
    el.textContent = msg || "";
    el.className = ok ? "ok" : "";
  }

  function sessionTitleFromNodeId(nodeId) {
    const m = /session:([^/]+)$/.exec(nodeId || "");
    return m ? m[1] : (nodeId || "unknown session");
  }

  // Every field rendered below (session title, node_id, judge reason) is transcript- or
  // LLM-derived text -- untrusted content, never raw markup -- so this builds DOM nodes with
  // textContent throughout rather than innerHTML (flagged by the repo's XSS guard on the first
  // draft, which used innerHTML string-concat here).
  function renderSources(scored, sources) {
    const box = document.getElementById("aiSources");
    while (box.firstChild) box.removeChild(box.firstChild);
    const cited = (scored || []).filter((s) => s.score >= 0.7);
    const list = cited.length > 0 ? cited : (scored || []);
    if (list.length === 0 && (!sources || (sources.internal || []).length === 0)) {
      const empty = document.createElement("div");
      empty.className = "empty-note";
      empty.textContent = "No internal source cleared the relevance bar for this question — the answer above may be incomplete or web-sourced.";
      box.appendChild(empty);
      return;
    }
    for (const s of list) {
      const node = s.node || {};
      const card = document.createElement("div");
      card.className = "source-card";

      const titleRow = document.createElement("div");
      titleRow.className = "source-title";
      titleRow.appendChild(document.createTextNode(node.title || sessionTitleFromNodeId(node.node_id)));
      if (typeof s.score === "number") {
        const pill = document.createElement("span");
        pill.className = "score-pill";
        pill.textContent = Math.round(s.score * 100) + "% relevant";
        titleRow.appendChild(pill);
      }
      card.appendChild(titleRow);

      const meta = document.createElement("div");
      meta.className = "source-meta";
      meta.appendChild(document.createTextNode((node.level || "node") + " · "));
      const codeEl = document.createElement("code");
      codeEl.className = "inline";
      codeEl.textContent = node.node_id || "";
      meta.appendChild(codeEl);
      card.appendChild(meta);

      if (s.reason) {
        const reason = document.createElement("div");
        reason.className = "source-reason";
        reason.textContent = s.reason;
        card.appendChild(reason);
      }

      box.appendChild(card);
    }
  }

  document.getElementById("startBtn").addEventListener("click", async () => {
    setStatus("");
    const btn = document.getElementById("startBtn");
    const question = document.getElementById("question").value;
    if (!question.trim()) { setStatus("enter a question first"); return; }
    btn.disabled = true; btn.textContent = "Asking...";
    try {
      const body = {
        question,
        counsellor: {
          name: document.getElementById("counsellorName").value || "Anonymous",
          org: document.getElementById("counsellorOrg").value || undefined,
        },
      };
      const res = await fetch("/compete/start", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key() },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setStatus("request failed: HTTP " + res.status); return; }
      const data = await res.json();
      evalRunId = data.evalRunId;
      document.getElementById("aiAnswerText").textContent = data.aiAnswer.text || "(no answer text)";
      const badge = document.getElementById("verdictBadge");
      const verdict = data.aiAnswer.verdict || (((data.aiAnswer.sources || {}).internal || []).length > 0 ? "correct" : "incorrect");
      badge.textContent = verdict;
      badge.className = "verdict-badge verdict-" + verdict;
      renderSources(data.aiAnswer.scored, data.aiAnswer.sources);
      document.getElementById("result").style.display = "block";
      document.getElementById("scoreForm").style.display = "block";
      setStatus("done", true);
    } catch (err) {
      setStatus("request error: " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = "Ask";
    }
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    setStatus("");
    if (!evalRunId) { setStatus("ask a question first"); return; }
    const body = {
      counsellorAnswer: { text: document.getElementById("counsellorAnswer").value },
      score: {
        ai: Number(document.getElementById("aiScore").value),
        counsellor: Number(document.getElementById("counsellorScore").value),
      },
      notes: document.getElementById("notes").value || undefined,
    };
    const res = await fetch("/compete/" + evalRunId + "/score", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key() },
      body: JSON.stringify(body),
    });
    setStatus(res.ok ? "score saved" : "save failed: HTTP " + res.status, res.ok);
  });

  key();
</script>
</body>
</html>
`;

export function createCompetePageRouter(): Router {
  const router = Router();
  router.get("/compete", (_req: Request, res: Response) => {
    res.type("html").send(PAGE);
  });
  return router;
}
