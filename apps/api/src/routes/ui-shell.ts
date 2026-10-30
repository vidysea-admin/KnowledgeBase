/**
 * apps/api/src/routes/ui-shell.ts — shared page chrome for every `*-page.ts` route (the visual
 * design `compete-page.ts` proved out first, extracted here so `pages.ts`'s several small pages
 * don't each re-declare the same ~60-line CSS block). `compete-page.ts` itself is left as-is
 * (already checker-PASSed, working) rather than risk a refactor of it — new pages adopt the
 * shared shell, the existing one keeps its own copy.
 */
/** HTML-attribute-escapes a route-param or other request-derived string before it's embedded in
 * an HTML attribute value (e.g. `data-*`). Never use this for values placed directly in JS
 * source position (inside a `<script>` body) -- that needs its own escaping (see pages.ts's
 * session-detail route for why: a route param went through `JSON.stringify` there, which does
 * NOT escape `</script>` or U+2028/U+2029, a real XSS finding). The safe pattern is: escape with
 * this function into an HTML attribute, then read it back client-side via `.dataset`, never
 * interpolate a request-derived value into JS source text at all. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SHARED_CSS = `
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
  .shell { max-width: 900px; margin: 0 auto; }
  header { margin-bottom: 1.75rem; }
  header .eyebrow { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  header h1 { margin: 0.2rem 0 0.35rem; font-size: 1.7rem; }
  header p { margin: 0; color: var(--muted); font-size: 0.92rem; line-height: 1.5; }
  nav.top-nav { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
  nav.top-nav a { font-size: 0.82rem; color: var(--accent); text-decoration: none; padding: 0.3rem 0.7rem; border: 1px solid var(--line); border-radius: 999px; background: #fff; }
  nav.top-nav a.active { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 1.5rem; box-shadow: 0 1px 2px rgba(20,24,31,0.03); }
  .card + .card { margin-top: 1.25rem; }
  label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--ink); margin-top: 1rem; }
  label:first-of-type { margin-top: 0; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 0.6rem 0.7rem; margin-top: 0.35rem;
    border: 1px solid var(--line); border-radius: 8px; font: inherit; font-size: 0.92rem; background: #fff; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  button { padding: 0.55rem 1.1rem; border: none; border-radius: 8px;
    background: var(--accent); color: var(--accent-ink); font-weight: 600; font-size: 0.88rem; cursor: pointer; }
  button.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
  #status { margin-top: 0.6rem; font-size: 0.85rem; color: var(--bad); min-height: 1.1em; }
  #status.ok { color: var(--good); }
  .section-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin: 1.1rem 0 0.5rem; }
  .section-title:first-child { margin-top: 0; }
  .badge { display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
  .badge-good { background: var(--good-bg); color: var(--good); }
  .badge-warn { background: var(--warn-bg); color: var(--warn); }
  .badge-bad { background: var(--bad-bg); color: var(--bad); }
  .row-card { border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem 0.9rem; margin-top: 0.55rem; background: #fbfbfc; cursor: pointer; }
  .row-card:hover { border-color: var(--accent); }
  .row-card .row-title { font-weight: 600; font-size: 0.92rem; }
  .row-card .row-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.15rem; }
  .empty-note { color: var(--muted); font-size: 0.88rem; font-style: italic; }
  table.data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  table.data-table th, table.data-table td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--line); }
  table.data-table th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.03em; }
  code.inline { background: #eef0f4; padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
  .footer-note { margin-top: 1.5rem; font-size: 0.78rem; color: var(--muted); text-align: center; }
`;

/** Path from the page the browser is on back to the API root, as a relative prefix ("./", "../",
 * "../../"). Every internal link, script fetch and form target in the API-served HTML is built
 * from this instead of a root-absolute "/x": behind the web proxy the API lives at
 * `<APP_BASE_PATH>/api/` (e.g. `/knowledgebase/api/`), the proxy strips that prefix before the
 * request reaches us, so the server never learns it (nginx sends no X-Forwarded-Prefix) and a
 * "/sessions" fetch would hit the SPA host root instead of the API. Relative refs resolve against
 * whatever prefix the browser used. The depth comes from the raw request path, trailing slash
 * included: `/x` and `/x/` have different base directories. */
export function relRoot(req: { originalUrl?: string; url?: string }): string {
  const pathname = (req.originalUrl ?? req.url ?? "/").split(/[?#]/, 1)[0] ?? "/";
  const segments = pathname.split("/").filter(Boolean).length;
  const depth = pathname.endsWith("/") ? segments : Math.max(segments - 1, 0);
  return depth === 0 ? "./" : "../".repeat(depth);
}

/** Relative target for a root-based route path (`/sessions-ui`) given the page's `relRoot`. */
export function relHref(rootRel: string, path: string): string {
  return rootRel + path.replace(/^\/+/, "");
}

// Only pages that actually exist today. `/ingest-ui` and `/meeting-bot-ui` land in a separate
// unit (real write path + honest empty-state, higher-risk than these read-only pages) — add
// their nav entries in that unit, not before, so no link here is ever dead.
const NAV_ITEMS: { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/sessions-ui", label: "Sessions" },
  { path: "/dashboard-ui", label: "Dashboard" },
  { path: "/docs-ui", label: "API Docs" },
  { path: "/compete", label: "Compete" },
];

function renderNav(activePath: string, rootRel: string): string {
  return NAV_ITEMS.map((item) =>
    `<a href="${relHref(rootRel, item.path)}"${item.path === activePath ? ' class="active"' : ""}>${item.label}</a>`,
  ).join("\n    ");
}

export interface PageOptions {
  activePath: string;
  title: string;
  eyebrow?: string;
  heading: string;
  description: string;
  bodyHtml: string;
  scriptJs?: string;
  /** `relRoot(req)` of the request being rendered; defaults to "./" (a page served at the root). */
  rootRel?: string;
}

export function renderPage(opts: PageOptions): string {
  const rootRel = opts.rootRel ?? "./";
  if (!/^(\.\/|(\.\.\/)+)$/.test(rootRel)) throw new Error("rootRel must be ./ or a chain of ../");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="shell">
  <header>
    <div class="eyebrow">${opts.eyebrow ?? "Vidysea &middot; Living Knowledge Base"}</div>
    <h1>${opts.heading}</h1>
    <p>${opts.description}</p>
    <nav class="top-nav">
    ${renderNav(opts.activePath, rootRel)}
    </nav>
  </header>
  ${opts.bodyHtml}
  <div class="footer-note">Internal preview build &middot; running against the real seeded TOC knowledge base</div>
</div>
${opts.scriptJs ? `<script>const API_ROOT = ${JSON.stringify(rootRel)};
${opts.scriptJs}</script>` : ""}
</body>
</html>
`;
}

/** Shared client-side fetch helper every page's inline script reuses: reads/stores the API key
 * in localStorage (same mechanism `compete-page.ts` uses) and attaches it as a Bearer header. */
export const CLIENT_AUTH_JS = `
function apiKey() {
  const stored = localStorage.getItem("lkbApiKey");
  const input = document.getElementById("apiKey");
  if (input && input.value) { localStorage.setItem("lkbApiKey", input.value); return input.value; }
  return stored || "";
}
function apiUrl(path) { return API_ROOT + String(path).replace(/^\\/+/, ""); }
async function apiFetch(path) {
  const res = await fetch(apiUrl(path), { headers: { authorization: "Bearer " + apiKey() } });
  if (!res.ok) throw new Error("HTTP " + res.status + " on /" + String(path).replace(/^\\/+/, ""));
  return res.json();
}
function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
`;
