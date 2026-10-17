/**
 * apps/api/src/routes/pages.ts — real browser UI over the real read routes in `routes/brain.ts`
 * (`GET /sessions`, `GET /sessions/:id`, `GET /gaps`): `GET /` (index), `GET /sessions-ui`
 * (list), `GET /sessions-ui/:id` (detail — summary + claims + turn-level transcript), `GET
 * /dashboard-ui` (knowledge-health/gaps). Same shape as `compete-page.ts`: plain HTML template +
 * `ui-shell.ts`'s shared CSS + inline vanilla JS that fetches the real JSON routes client-side
 * and renders via `textContent`/DOM methods (never `innerHTML` with server/LLM-derived text —
 * the same XSS guard `compete-page.ts` was flagged on applies here).
 */
import { Router, type Request, type Response } from "express";
import { renderPage, CLIENT_AUTH_JS, escapeHtmlAttr } from "./ui-shell.js";
import { STUB_ROUTES } from "./stubs.js";

interface RealRoute { label: string; scope: string; status?: string; qualification?: string; }
const REAL_ROUTES: RealRoute[] = [
  { label: "POST /ask", scope: "ask" },
  { label: "POST /compete/start", scope: "compete" },
  { label: "POST /compete/:id/score", scope: "compete" },
  { label: "GET /sessions", scope: "sessions" },
  { label: "GET /sessions/:id", scope: "sessions" },
  { label: "GET /sources", scope: "sources" },
  { label: "GET /gaps", scope: "gaps" },
  { label: "GET /graph", scope: "graph" },
  { label: "GET /calendar/upcoming", scope: "calendar" },
  { label: "POST /gmail/scan", scope: "gmail" },
  { label: "GET /meeting-candidates", scope: "gmail" },
  { label: "POST /meeting-candidates/:id/approve", scope: "gmail" },
  { label: "POST /meeting-candidates/:id/reject", scope: "gmail" },
  { label: "GET /whatsapp/groups", scope: "whatsapp" },
  { label: "POST /whatsapp/ingest", scope: "whatsapp" },
  { label: "POST /webhooks/register", scope: "hosting + webhooks", status: "201 configured; 503 unavailable",
    qualification: "Requires an admin or owner hosting role, configured private hosting storage, and an allowed public destination. Registration does not dispatch a delivery." },
];

export function createPagesRouter(): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.type("html").send(renderPage({
      activePath: "/",
      title: "Vidysea Living Knowledge Base",
      heading: "Living Knowledge Base",
      description: "Internal preview build. Pick a view above — each page reads real data from the real API, no mocked content anywhere.",
      bodyHtml: `<div class="card">
        <div class="section-title">Where things stand</div>
        <p>Sessions and Dashboard show real data from the 23 ingested TOC sessions. API Docs
        lists implemented endpoints, scopes and runtime prerequisites. Compete lets you ask the AI a real question and see a cited
        answer.</p>
      </div>`,
    }));
  });

  router.get("/sessions-ui", (_req: Request, res: Response) => {
    res.type("html").send(renderPage({
      activePath: "/sessions-ui",
      title: "Sessions — Living Knowledge Base",
      heading: "Sessions",
      description: "Every real ingested session. Click one for its summary, claims, and turn-level transcript.",
      bodyHtml: `
        <div class="card">
          <label>API key<input id="apiKey" type="password" placeholder="paste your API key" /></label>
          <button id="loadBtn">Load sessions</button>
          <div id="status"></div>
        </div>
        <div id="list"></div>
      `,
      scriptJs: `${CLIENT_AUTH_JS}
        function sessionCard(s) {
          const div = document.createElement("a");
          div.className = "row-card";
          div.href = "/sessions-ui/" + encodeURIComponent(s._id);
          div.style.display = "block";
          div.style.textDecoration = "none";
          div.style.color = "inherit";
          const title = document.createElement("div");
          title.className = "row-title";
          title.textContent = s.title;
          const meta = document.createElement("div");
          meta.className = "row-meta";
          meta.textContent = s.date + (s.org ? " \\u00b7 " + s.org : "") + " \\u00b7 index: " + (s.status && s.status.index || "unknown");
          div.appendChild(title);
          div.appendChild(meta);
          return div;
        }
        async function load() {
          const statusEl = document.getElementById("status");
          statusEl.textContent = "";
          try {
            const data = await apiFetch("/sessions");
            const list = document.getElementById("list");
            clearChildren(list);
            if (!data.sessions || data.sessions.length === 0) {
              const empty = document.createElement("div");
              empty.className = "card empty-note";
              empty.textContent = "No sessions found for this tenant.";
              list.appendChild(empty);
              return;
            }
            const card = document.createElement("div");
            card.className = "card";
            for (const s of data.sessions) card.appendChild(sessionCard(s));
            list.appendChild(card);
            statusEl.textContent = data.sessions.length + " session(s) loaded";
            statusEl.className = "ok";
          } catch (err) {
            statusEl.textContent = err.message;
          }
        }
        document.getElementById("loadBtn").addEventListener("click", load);
        if (localStorage.getItem("lkbApiKey")) load();
      `,
    }));
  });

  router.get("/sessions-ui/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;
    res.type("html").send(renderPage({
      activePath: "/sessions-ui",
      title: "Session detail — Living Knowledge Base",
      heading: "Session detail",
      description: `Real summary, claims, and transcript for one session.`,
      bodyHtml: `
        <div class="card">
          <label>API key<input id="apiKey" type="password" placeholder="paste your API key" /></label>
          <button id="loadBtn">Load</button>
          <div id="status"></div>
        </div>
        <div id="detail" data-session-id="${escapeHtmlAttr(id)}"></div>
      `,
      // The route param is attacker-controlled (a crafted URL an operator might click) --
      // real XSS finding, caught live 2026-09-04: JSON.stringify() does NOT escape "</script>"
      // or U+2028/U+2029, so interpolating it straight into an inline <script> body let a
      // session id like "</script><script>alert(1)</script>" break out of the script context
      // regardless of JS-string quoting. Fixed by never putting the id in JS-source position at
      // all -- it travels via an HTML-escaped data attribute (escapeHtmlAttr above) and the
      // script reads it back through .dataset, staying in HTML-attribute context throughout.
      scriptJs: `${CLIENT_AUTH_JS}
        const sessionId = document.getElementById("detail").dataset.sessionId;
        function el(tag, className, text) {
          const e = document.createElement(tag);
          if (className) e.className = className;
          if (text !== undefined) e.textContent = text;
          return e;
        }
        async function load() {
          const statusEl = document.getElementById("status");
          statusEl.textContent = "";
          try {
            const data = await apiFetch("/sessions/" + encodeURIComponent(sessionId));
            const detail = document.getElementById("detail");
            clearChildren(detail);

            const overview = el("div", "card");
            overview.appendChild(el("div", "section-title", "Overview"));
            overview.appendChild(el("div", null, data.session.title));
            overview.appendChild(el("div", "row-meta", data.session.date + (data.session.org ? " \\u00b7 " + data.session.org : "")));
            overview.appendChild(el("p", null, data.page ? data.page.summary : "(no summary yet)"));
            detail.appendChild(overview);

            const claimsCard = el("div", "card");
            claimsCard.appendChild(el("div", "section-title", "Claims (" + data.claims.length + ")"));
            if (data.claims.length === 0) claimsCard.appendChild(el("div", "empty-note", "No claims extracted yet."));
            for (const c of data.claims) {
              const row = el("div", "row-card");
              row.appendChild(el("div", "row-title", c.text));
              row.appendChild(el("div", "row-meta", "status: " + c.status));
              claimsCard.appendChild(row);
            }
            detail.appendChild(claimsCard);

            const turnsCard = el("div", "card");
            turnsCard.appendChild(el("div", "section-title", "Transcript (" + data.turns.length + " turns)"));
            if (data.turns.length === 0) turnsCard.appendChild(el("div", "empty-note", "No turns for this session."));
            for (const t of data.turns.slice(0, 200)) {
              const row = el("div", "row-card");
              row.appendChild(el("div", "row-title", t.speakerRef + " \\u00b7 " + t.tStart + "s\\u2013" + t.tEnd + "s"));
              row.appendChild(el("div", null, t.text));
              turnsCard.appendChild(row);
            }
            if (data.turns.length > 200) turnsCard.appendChild(el("div", "empty-note", "\\u2026 and " + (data.turns.length - 200) + " more turns (truncated for this view)."));
            detail.appendChild(turnsCard);

            statusEl.textContent = "loaded";
            statusEl.className = "ok";
          } catch (err) {
            statusEl.textContent = err.message;
          }
        }
        document.getElementById("loadBtn").addEventListener("click", load);
        if (localStorage.getItem("lkbApiKey")) load();
      `,
    }));
  });

  router.get("/dashboard-ui", (_req: Request, res: Response) => {
    res.type("html").send(renderPage({
      activePath: "/dashboard-ui",
      title: "Dashboard — Living Knowledge Base",
      heading: "Knowledge health",
      description: "Open gaps the system knows about — real data, may be genuinely empty today.",
      bodyHtml: `
        <div class="card">
          <label>API key<input id="apiKey" type="password" placeholder="paste your API key" /></label>
          <button id="loadBtn">Load gaps</button>
          <div id="status"></div>
        </div>
        <div id="list"></div>
      `,
      scriptJs: `${CLIENT_AUTH_JS}
        function badgeClass(status) {
          if (status === "open") return "badge badge-warn";
          if (status === "received") return "badge badge-good";
          return "badge badge-bad";
        }
        async function load() {
          const statusEl = document.getElementById("status");
          statusEl.textContent = "";
          try {
            const data = await apiFetch("/gaps");
            const list = document.getElementById("list");
            clearChildren(list);
            if (!data.gaps || data.gaps.length === 0) {
              const empty = document.createElement("div");
              empty.className = "card empty-note";
              empty.textContent = "No gaps recorded for this tenant \\u2014 either everything is covered, or gap-tracking hasn't logged anything yet.";
              list.appendChild(empty);
              statusEl.textContent = "0 gaps";
              statusEl.className = "ok";
              return;
            }
            const card = document.createElement("div");
            card.className = "card";
            for (const g of data.gaps) {
              const row = document.createElement("div");
              row.className = "row-card";
              const title = document.createElement("div");
              title.className = "row-title";
              title.textContent = g.kind;
              const badge = document.createElement("span");
              badge.className = badgeClass(g.status);
              badge.textContent = g.status;
              badge.style.marginLeft = "0.5rem";
              title.appendChild(badge);
              const meta = document.createElement("div");
              meta.className = "row-meta";
              meta.textContent = g.description || "(no description)";
              row.appendChild(title);
              row.appendChild(meta);
              card.appendChild(row);
            }
            list.appendChild(card);
            statusEl.textContent = data.gaps.length + " gap(s) loaded";
            statusEl.className = "ok";
          } catch (err) {
            statusEl.textContent = err.message;
          }
        }
        document.getElementById("loadBtn").addEventListener("click", load);
        if (localStorage.getItem("lkbApiKey")) load();
      `,
    }));
  });

  router.get("/docs-ui", (_req: Request, res: Response) => {
    const realRows = REAL_ROUTES.map((r) =>
      `<tr><td><code class="inline">${r.label}</code></td><td><span class="badge badge-good">${r.status ?? "live"}</span>${r.qualification ? `<p>${r.qualification}</p>` : ""}</td><td>${r.scope}</td></tr>`,
    ).join("\n");
    const stubRows = STUB_ROUTES.map((r) =>
      `<tr><td><code class="inline">${r.label}</code></td><td><span class="badge badge-warn">501 not_implemented</span></td><td>${r.scope}</td></tr>`,
    ).join("\n");
    res.type("html").send(renderPage({
      activePath: "/docs-ui",
      title: "API Docs — Living Knowledge Base",
      heading: "Developer API",
      description: "API requests carry an Authorization: Bearer header with your API key. Required scopes, hosting roles and runtime configuration apply before an endpoint can complete.",
      bodyHtml: `
        <div class="card">
          <div class="section-title">Live today</div>
          <table class="data-table"><thead><tr><th>Route</th><th>Status</th><th>Required scope</th></tr></thead>
          <tbody>${realRows}</tbody></table>
        </div>
        <div class="card">
          <div class="section-title">Planned, not yet built</div>
          <table class="data-table"><thead><tr><th>Route</th><th>Status</th><th>Required scope</th></tr></thead>
          <tbody>${stubRows || '<tr><td colspan="3">No unimplemented stub routes.</td></tr>'}</tbody></table>
        </div>
      `,
    }));
  });

  return router;
}
